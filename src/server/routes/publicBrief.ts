import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import {
  AttemptLimiter,
  BRIEF_PIN_COOKIE_PREFIX,
  hashPin,
  isBriefPinUnlocked,
  signTokenPayload,
  timingSafeEqualStr,
} from '../auth.js';
import type { BriefDatabase } from '../db.js';
import type { AppConfig } from '../config.js';
import type { PublicBriefPayload } from '../../shared/types.js';

function decodeMultipartFilename(rawName: string): string {
  try {
    // Multer busboy decodes multipart headers as latin1; convert back to utf8 if Cyrillic mojibake detected
    if (/[\u0080-\u00ff]/.test(rawName) && !/[\u0400-\u04ff]/.test(rawName)) {
      const converted = Buffer.from(rawName, 'latin1').toString('utf8');
      if (!converted.includes('\ufffd')) {
        return converted;
      }
    }
  } catch {
    // keep rawName
  }
  return rawName;
}

export function createPublicBriefRouter(
  db: BriefDatabase,
  config: AppConfig
): Router {
  const router = Router();
  const pinLimiter = new AttemptLimiter(10, 5 * 60 * 1000);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(db.uploadsDir, { recursive: true });
      cb(null, db.uploadsDir);
    },
    filename: (_req, file, cb) => {
      const safeExt = path
        .extname(decodeMultipartFilename(file.originalname))
        .replace(/[^a-zA-Z0-9.]/g, '')
        .slice(0, 12);
      cb(null, `${Date.now()}-${nanoid(14)}${safeExt}`);
    },
  });

  const upload = multer({
    storage,
    limits: {
      fileSize: config.maxUploadMb * 1024 * 1024,
      files: 10,
    },
  });

  // Never leak secret brief URLs in Referer headers or search engine indexes
  router.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });

  router.get('/brand', (_req, res) => {
    res.json({ brand: db.getBrandSettings() });
  });

  router.get('/briefs/:token', (req, res) => {
    const found = db.getBriefRowByToken(req.params.token);
    if (!found) {
      res.status(404).json({
        error: 'not_found',
        message: 'Бриф не найден или ссылка была обновлена администратором.',
      });
      return;
    }

    const { brief, pinHash } = found;
    const brand = db.getBrandSettings();

    if (!isBriefPinUnlocked(req, brief.id, pinHash, config.sessionSecret)) {
      res.json({
        requiresPin: true,
        id: brief.id,
        title: brief.title,
        companyName: brief.intake.companyName,
        pinHint: brief.pinHint,
        brand,
      });
      return;
    }

    const payload: PublicBriefPayload = {
      id: brief.id,
      title: brief.title,
      companyName: brief.intake.companyName,
      clientWelcomeNote: brief.clientWelcomeNote,
      estimatedMinutes: brief.estimatedMinutes,
      status: brief.status,
      sections: brief.sections,
      questions: brief.questions,
      answers: brief.answers,
      attachments: brief.attachments,
      respondentName: brief.respondentName,
      respondentRole: brief.respondentRole,
      respondentContact: brief.respondentContact,
      updatedAt: brief.updatedAt,
      submittedAt: brief.submittedAt,
      brand,
    };

    res.json({ requiresPin: false, brief: payload });
  });

  router.post('/briefs/:token/unlock', (req, res) => {
    const found = db.getBriefRowByToken(req.params.token);
    if (!found) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }

    const { brief, pinHash } = found;
    if (!pinHash) {
      res.json({ ok: true });
      return;
    }

    const rateKey = `${req.ip}:${brief.id}`;
    const limitCheck = pinLimiter.check(rateKey);
    if (!limitCheck.allowed) {
      res.status(429).json({
        error: 'too_many_attempts',
        message: `Слишком много попыток. Повторите через ${limitCheck.retryAfterSec} сек.`,
      });
      return;
    }

    const providedPin = String(req.body?.pin || '').trim();
    const candidateHash = hashPin(providedPin, config.sessionSecret);

    if (!timingSafeEqualStr(candidateHash, pinHash)) {
      res.status(403).json({
        error: 'invalid_pin',
        message: 'Неверный код доступа. Проверьте код у менеджера МСДИС.',
      });
      return;
    }

    pinLimiter.reset(rateKey);
    const signed = signTokenPayload(
      {
        briefId: brief.id,
        pinHash,
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      },
      config.sessionSecret
    );

    res.cookie(`${BRIEF_PIN_COOKIE_PREFIX}${brief.id}`, signed, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, pinSessionToken: signed });
  });

  router.patch('/briefs/:token/answers', (req, res) => {
    const found = db.getBriefRowByToken(req.params.token);
    if (!found) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }

    const { brief, pinHash } = found;
    if (!isBriefPinUnlocked(req, brief.id, pinHash, config.sessionSecret)) {
      res.status(403).json({
        error: 'pin_required',
        message: 'Требуется код доступа к брифу',
      });
      return;
    }

    if (brief.status === 'locked') {
      res.status(423).json({
        error: 'brief_locked',
        message:
          'Редактирование брифа зафиксировано архитектором МСДИС. Свяжитесь с вашим менеджером, если нужно внести дополнения.',
      });
      return;
    }

    const updated = db.patchClientAnswers(brief.id, {
      answers: req.body?.answers,
      respondentName: req.body?.respondentName,
      respondentRole: req.body?.respondentRole,
      respondentContact: req.body?.respondentContact,
      markSubmitted: Boolean(req.body?.markSubmitted),
    });

    res.json({
      ok: true,
      status: updated?.status,
      answers: updated?.answers,
      updatedAt: updated?.updatedAt,
      submittedAt: updated?.submittedAt,
    });
  });

  router.post(
    '/briefs/:token/files',
    upload.array('files', 10),
    (req, res) => {
      const token = String(req.params.token);
      const found = db.getBriefRowByToken(token);
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];

      const cleanupTemp = () => {
        for (const f of uploadedFiles) {
          try {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
          } catch {
            // ignore
          }
        }
      };

      if (!found) {
        cleanupTemp();
        res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
        return;
      }

      const { brief, pinHash } = found;
      if (!isBriefPinUnlocked(req, brief.id, pinHash, config.sessionSecret)) {
        cleanupTemp();
        res.status(403).json({
          error: 'pin_required',
          message: 'Требуется код доступа к брифу',
        });
        return;
      }

      if (brief.status === 'locked') {
        cleanupTemp();
        res.status(423).json({
          error: 'brief_locked',
          message: 'Бриф закрыт для изменений',
        });
        return;
      }

      const questionId = String(req.body?.questionId || 'general');
      const saved = uploadedFiles.map((f) => {
        const stored = db.addAttachment({
          briefId: brief.id,
          questionId,
          originalName: decodeMultipartFilename(f.originalname),
          storedFilename: f.filename,
          mimeType: f.mimetype || 'application/octet-stream',
          sizeBytes: f.size,
        });
        const { storedFilename: _sf, ...meta } = stored;
        return meta;
      });

      res.status(201).json({ ok: true, attachments: saved });
    }
  );

  router.get('/briefs/:token/files/:fileId', (req, res) => {
    const found = db.getBriefRowByToken(req.params.token);
    if (!found) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }
    const { brief, pinHash } = found;
    if (!isBriefPinUnlocked(req, brief.id, pinHash, config.sessionSecret)) {
      res.status(403).json({ error: 'pin_required' });
      return;
    }

    const att = db.getAttachment(brief.id, req.params.fileId);
    if (!att) {
      res.status(404).json({ error: 'file_not_found' });
      return;
    }

    const filePath = path.join(db.uploadsDir, att.storedFilename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'file_missing_on_disk' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`
    );
    fs.createReadStream(filePath).pipe(res);
  });

  router.delete('/briefs/:token/files/:fileId', (req, res) => {
    const found = db.getBriefRowByToken(req.params.token);
    if (!found) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const { brief, pinHash } = found;
    if (!isBriefPinUnlocked(req, brief.id, pinHash, config.sessionSecret)) {
      res.status(403).json({ error: 'pin_required' });
      return;
    }
    if (brief.status === 'locked') {
      res.status(423).json({ error: 'brief_locked' });
      return;
    }

    const deleted = db.deleteAttachment(brief.id, req.params.fileId);
    res.json({ ok: deleted });
  });

  return router;
}

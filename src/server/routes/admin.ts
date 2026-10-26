import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import {
  ADMIN_COOKIE_NAME,
  AttemptLimiter,
  isAdminAuthenticated,
  requireAdmin,
  signTokenPayload,
  timingSafeEqualStr,
} from '../auth.js';
import { extractBrandColorsFromPdf } from '../services/pdfColors.js';
import type { BriefDatabase } from '../db.js';
import type { AppConfig } from '../config.js';
import type { CloseRouterClient } from '../services/closerouter.js';
import type { BriefGeneratorService } from '../services/briefGenerator.js';
import type { BriefClientIntake, BriefRecord } from '../../shared/types.js';

function formatBriefAsMarkdown(brief: BriefRecord): string {
  const lines: string[] = [];
  lines.push(`# ${brief.title}`);
  lines.push('');
  lines.push(`- **Клиент:** ${brief.intake.companyName}`);
  if (brief.intake.industry)
    lines.push(`- **Отрасль:** ${brief.intake.industry}`);
  if (brief.respondentName || brief.respondentRole) {
    lines.push(
      `- **Заполнил:** ${[brief.respondentName, brief.respondentRole, brief.respondentContact].filter(Boolean).join(' · ')}`
    );
  }
  lines.push(`- **Статус:** ${brief.status}`);
  lines.push(`- **Обновлено:** ${brief.updatedAt}`);
  lines.push('');

  if (brief.researchDossier) {
    lines.push('## ИИ-досье предпроектного исследования');
    lines.push(brief.researchDossier.companySummary);
    lines.push('');
    if (brief.researchDossier.industryInsights.length > 0) {
      lines.push('### Отраслевые факторы');
      for (const item of brief.researchDossier.industryInsights) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }
  }

  lines.push('## Ответы клиента по архитектурным блокам');
  lines.push('');

  for (const sec of brief.sections) {
    lines.push(`### ${sec.title}`);
    const secQuestions = brief.questions.filter((q) => q.sectionId === sec.id);
    for (const q of secQuestions) {
      lines.push(`#### ${q.title}`);
      lines.push(`*Влияние на архитектуру:* ${q.architectureImpact}`);
      const ans = brief.answers[q.id];
      const files = brief.attachments.filter((a) => a.questionId === q.id);

      if (!ans && files.length === 0) {
        lines.push('- *Ответ не заполнен (пропущено)*');
      } else {
        if (ans?.selectedOptionId && q.options) {
          const opt = q.options.find((o) => o.id === ans.selectedOptionId);
          lines.push(`- **Выбор:** ${opt ? opt.label : ans.selectedOptionId}`);
        }
        if (ans?.selectedOptionIds && ans.selectedOptionIds.length > 0) {
          const labels = ans.selectedOptionIds.map(
            (id) => q.options?.find((o) => o.id === id)?.label || id
          );
          lines.push(`- **Выбрано:** ${labels.join('; ')}`);
        }
        if (ans?.customOptions && ans.customOptions.length > 0) {
          lines.push(`- **Свои варианты:** ${ans.customOptions.join('; ')}`);
        }
        if (typeof ans?.spectrumValue === 'number' && q.spectrum) {
          lines.push(
            `- **Шкала (1..5):** ${ans.spectrumValue}/5 («${q.spectrum.leftTitle}» ↔ «${q.spectrum.rightTitle}»)`
          );
        }
        if (ans?.statementVotes && q.statements) {
          for (const st of q.statements) {
            const v = ans.statementVotes[st.id];
            if (v) {
              const label =
                v === 'yes'
                  ? 'Да, в точку'
                  : v === 'partial'
                    ? 'Частично'
                    : 'Нет';
              lines.push(`  - [${label}] ${st.text}`);
            }
          }
        }
        if (ans?.bucketAssignments && q.items && q.buckets) {
          for (const it of q.items) {
            const bId = ans.bucketAssignments[it.id];
            if (bId) {
              const bLabel =
                q.buckets.find((b) => b.id === bId)?.label || bId;
              lines.push(`  - **${bLabel}:** ${it.label}`);
            }
          }
        }
        if (ans?.text) {
          lines.push(`- **Ответ:** ${ans.text}`);
        }
        if (ans?.comment) {
          lines.push(`- **Комментарий клиента:** ${ans.comment}`);
        }
        if (files.length > 0) {
          lines.push(
            `- **Прикреплённые файлы:** ${files.map((f) => f.originalName).join(', ')}`
          );
        }
      }
      lines.push('');
    }
  }

  if (brief.architectureBlueprint) {
    const bp = brief.architectureBlueprint;
    lines.push('## Архитектурное резюме МСДИС (AI Presale Blueprint)');
    lines.push(bp.executiveSummary);
    lines.push('');
    lines.push(`**Рекомендуемая архитектура:** ${bp.recommendedArchitecture}`);
    lines.push('');
    lines.push(`**Оценка масштаба:** ${bp.estimatedComplexity}`);
    lines.push('');
    if (bp.suggestedTechStack.length > 0) {
      lines.push('### Предлагаемый стек');
      bp.suggestedTechStack.forEach((s) => lines.push(`- ${s}`));
      lines.push('');
    }
    if (bp.mvpScope.length > 0) {
      lines.push('### Состав MVP (1-я очередь)');
      bp.mvpScope.forEach((s) => lines.push(`- ${s}`));
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function createAdminRouter(
  db: BriefDatabase,
  config: AppConfig,
  aiClient: CloseRouterClient,
  briefGenerator: BriefGeneratorService
): Router {
  const router = Router();
  const loginLimiter = new AttemptLimiter(12, 5 * 60 * 1000);
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  router.get('/session', (req, res) => {
    res.json({
      authenticated: isAdminAuthenticated(req, config.sessionSecret),
      brand: db.getBrandSettings(),
      configuredModel: aiClient.getEffectiveModel(),
      hasApiKey: aiClient.isConfigured(),
    });
  });

  router.post('/login', (req, res) => {
    const ipKey = `admin:${req.ip}`;
    const lim = loginLimiter.check(ipKey);
    if (!lim.allowed) {
      res.status(429).json({
        error: 'too_many_attempts',
        message: `Слишком много попыток входа. Подождите ${lim.retryAfterSec} сек.`,
      });
      return;
    }

    const login = String(req.body?.login || 'admin').trim();
    const password = String(req.body?.password || '');

    const loginOk = timingSafeEqualStr(login, config.adminLogin);
    const passOk = timingSafeEqualStr(password, config.adminPassword);

    if (!loginOk || !passOk) {
      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Неверный логин или пароль администратора',
      });
      return;
    }

    loginLimiter.reset(ipKey);
    const token = signTokenPayload(
      {
        role: 'admin',
        login,
        exp: Date.now() + 14 * 24 * 60 * 60 * 1000,
      },
      config.sessionSecret
    );

    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({ ok: true, adminToken: token });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // Protected Admin Endpoints
  router.use(requireAdmin(config.sessionSecret));

  router.get('/ai-status', async (_req, res) => {
    const status = await aiClient.checkStatus();
    res.json(status);
  });

  router.put('/ai-settings', (req, res) => {
    const apiKey =
      typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : undefined;
    const model =
      typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;

    const patch: { apiKey?: string; model?: string } = {};
    if (apiKey !== undefined) patch.apiKey = apiKey;
    if (model !== undefined) patch.model = model;

    db.saveRuntimeAiOverrides(patch);
    res.json({
      ok: true,
      activeModel: aiClient.getEffectiveModel(),
      configured: aiClient.isConfigured(),
    });
  });

  router.get('/brand', (_req, res) => {
    res.json({ brand: db.getBrandSettings() });
  });

  router.put('/brand', (req, res) => {
    const allowedHex = /^#[0-9A-Fa-f]{6}$/;
    const patch: Record<string, unknown> = {};
    for (const key of [
      'primaryColor',
      'secondaryColor',
      'navyColor',
      'darkColor',
      'surfaceColor',
    ]) {
      const val = req.body?.[key];
      if (typeof val === 'string' && allowedHex.test(val.trim())) {
        patch[key] = val.trim().toUpperCase();
      }
    }
    if (typeof req.body?.companyName === 'string') {
      patch.companyName = req.body.companyName.trim().slice(0, 80);
    }
    if (typeof req.body?.tagline === 'string') {
      patch.tagline = req.body.tagline.trim().slice(0, 200);
    }
    const updated = db.saveBrandSettings(patch);
    res.json({ ok: true, brand: updated });
  });

  router.post(
    '/brand/extract-pdf',
    memoryUpload.single('pdf'),
    (req, res) => {
      if (!req.file) {
        res.status(400).json({
          error: 'missing_pdf',
          message: 'Прикрепите PDF-файл брендбука или презентации МСДИС',
        });
        return;
      }

      const extracted = extractBrandColorsFromPdf(req.file.buffer);
      const applyImmediately = req.body?.apply !== 'false';

      const updated = applyImmediately
        ? db.saveBrandSettings({
            primaryColor: extracted.suggestedPrimary,
            secondaryColor: extracted.suggestedSecondary,
            navyColor: extracted.suggestedNavy,
            darkColor: extracted.suggestedDark,
            extractedPalette: extracted.palette,
            sourcePdfName: req.file.originalname,
          })
        : db.getBrandSettings();

      res.json({
        ok: true,
        extracted,
        brand: updated,
      });
    }
  );

  router.get('/briefs', (_req, res) => {
    res.json({
      briefs: db.listBriefSummaries(),
      publicBaseUrl: config.publicBaseUrl,
    });
  });

  router.post('/briefs/generate', async (req, res) => {
    const body = req.body || {};
    const companyName = String(body.companyName || '').trim();
    const projectContext = String(body.projectContext || '').trim();

    if (!companyName || !projectContext) {
      res.status(400).json({
        error: 'validation_error',
        message:
          'Укажите название компании клиента и известную информацию о запросе.',
      });
      return;
    }

    const intake: BriefClientIntake = {
      companyName,
      companyWebsite: body.companyWebsite
        ? String(body.companyWebsite).trim()
        : undefined,
      industry: body.industry ? String(body.industry).trim() : undefined,
      contactName: body.contactName
        ? String(body.contactName).trim()
        : undefined,
      contactRole: body.contactRole
        ? String(body.contactRole).trim()
        : undefined,
      knownSystems: body.knownSystems
        ? String(body.knownSystems).trim()
        : undefined,
      projectContext,
      constraintsAndDeadlines: body.constraintsAndDeadlines
        ? String(body.constraintsAndDeadlines).trim()
        : undefined,
      intakeDocumentText: body.intakeDocumentText
        ? String(body.intakeDocumentText).slice(0, 15000)
        : undefined,
      depth:
        body.depth === 'compact' || body.depth === 'deep'
          ? body.depth
          : 'standard',
      enableWebSearch: body.enableWebSearch !== false,
    };

    const generated = await briefGenerator.generateBrief(intake);

    const created = db.createBrief({
      title: body.customTitle?.trim() || generated.title,
      clientWelcomeNote: generated.clientWelcomeNote,
      estimatedMinutes: generated.estimatedMinutes,
      intake,
      sections: generated.sections,
      questions: generated.questions,
      researchDossier: generated.researchDossier,
      pinCode: body.pinCode ? String(body.pinCode).trim() : undefined,
      pinHint: body.pinHint ? String(body.pinHint).trim() : undefined,
    });

    res.status(201).json({ ok: true, brief: created });
  });

  router.get('/briefs/:id', (req, res) => {
    const brief = db.getBriefById(req.params.id);
    if (!brief) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }
    res.json({ brief, publicBaseUrl: config.publicBaseUrl });
  });

  router.patch('/briefs/:id', (req, res) => {
    const updated = db.updateBriefStructure(req.params.id, {
      title: req.body?.title,
      clientWelcomeNote: req.body?.clientWelcomeNote,
      estimatedMinutes: req.body?.estimatedMinutes,
      status: req.body?.status,
      sections: req.body?.sections,
      questions: req.body?.questions,
      pinCode: req.body?.pinCode,
      pinHint: req.body?.pinHint,
      regenerateToken: Boolean(req.body?.regenerateToken),
    });

    if (!updated) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }
    res.json({ ok: true, brief: updated });
  });

  router.post('/briefs/:id/more-questions', async (req, res) => {
    const brief = db.getBriefById(req.params.id);
    if (!brief) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }

    const topic = String(
      req.body?.topic || 'Дополнительные архитектурные развилки и интеграции'
    ).trim();
    const extraQuestions = await briefGenerator.generateMoreQuestions(
      brief,
      topic
    );

    const updated = db.updateBriefStructure(brief.id, {
      questions: [...brief.questions, ...extraQuestions],
    });

    res.json({
      ok: true,
      addedCount: extraQuestions.length,
      brief: updated,
    });
  });

  router.post('/briefs/:id/blueprint', async (req, res) => {
    const brief = db.getBriefById(req.params.id);
    if (!brief) {
      res.status(404).json({ error: 'not_found', message: 'Бриф не найден' });
      return;
    }

    const blueprint = await briefGenerator.generateArchitectureBlueprint(brief);
    const updated = db.updateBriefStructure(brief.id, {
      architectureBlueprint: blueprint,
    });

    res.json({ ok: true, blueprint, brief: updated });
  });

  router.get('/briefs/:id/export-md', (req, res) => {
    const brief = db.getBriefById(req.params.id);
    if (!brief) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const md = formatBriefAsMarkdown(brief);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(
        `MSDIS_Brief_${brief.intake.companyName.replace(/[^\wа-яА-ЯёЁ-]+/g, '_')}.md`
      )}`
    );
    res.send(md);
  });

  router.get('/briefs/:id/files/:fileId', (req, res) => {
    const att = db.getAttachment(req.params.id, req.params.fileId);
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
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`
    );
    fs.createReadStream(filePath).pipe(res);
  });

  router.delete('/briefs/:id', (req, res) => {
    const deleted = db.deleteBrief(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppBundle, type ServerBundle } from '../src/server/app.js';

describe('Non-mandatory Questions, Instant Auto-Save, Resume Later & File Attachments', () => {
  let tmpDir: string;
  let bundle: ServerBundle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msdis-autosave-test-'));
    bundle = createAppBundle(
      {
        dataDir: tmpDir,
        adminLogin: 'admin',
        adminPassword: 'secret',
        closerouterApiKey: '',
        aiWebSearchEnabled: false,
      },
      { seedDemo: false }
    );
  });

  afterEach(() => {
    bundle.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists partial answers across sessions, supports Cyrillic file attachments, and allows updates after submit', async () => {
    const adminAgent = request.agent(bundle.app);
    await adminAgent
      .post('/api/admin/login')
      .send({ login: 'admin', password: 'secret' });

    const genRes = await adminAgent.post('/api/admin/briefs/generate').send({
      companyName: 'ООО ПромХимАвтоматика',
      industry: 'Химическая промышленность',
      knownSystems: '1С:ERP, SCADA Trace Mode',
      projectContext:
        'Автоматизация рецептурного дозирования, складского учёта сырья и паспортов качества партий.',
      enableWebSearch: false,
    });
    expect(genRes.status).toBe(201);
    const brief = genRes.body.brief;
    const token = brief.accessToken;
    const q1 = brief.questions[0];
    const q2 = brief.questions[1];
    const fileQ =
      brief.questions.find((q: { type: string }) => q.type === 'file_upload') ||
      brief.questions[2];

    // Session 1: Client answers ONLY Question 1 and skips Question 2 (all others untouched)
    const patch1 = await request(bundle.app)
      .patch(`/api/public/briefs/${token}/answers`)
      .send({
        answers: {
          [q1.id]: {
            statementVotes: { h1: 'yes', h2: 'partial' },
            comment: 'Сведение смен занимает 1.5 часа',
          },
          [q2.id]: {
            skipped: true,
          },
        },
      });
    expect(patch1.status).toBe(200);
    expect(patch1.body.status).toBe('in_progress');

    // Session 2 (days later, fresh request): Client reopens link -> Q1 answer is intact, Q2 can now be answered!
    const reopen1 = await request(bundle.app).get(`/api/public/briefs/${token}`);
    expect(reopen1.status).toBe(200);
    expect(reopen1.body.brief.answers[q1.id].comment).toBe(
      'Сведение смен занимает 1.5 часа'
    );

    // Client now answers Q2 without overwriting Q1!
    const patch2 = await request(bundle.app)
      .patch(`/api/public/briefs/${token}/answers`)
      .send({
        answers: {
          [q2.id]: {
            spectrumValue: 4,
            skipped: false,
          },
        },
      });
    expect(patch2.status).toBe(200);
    expect(patch2.body.answers[q1.id].statementVotes.h1).toBe('yes');
    expect(patch2.body.answers[q2.id].spectrumValue).toBe(4);

    // Client attaches 2 files to fileQ (including Cyrillic filename)
    const sampleContent = Buffer.from(
      'Цех №2;Смена А;Реактор 4;Партия 9012\n',
      'utf8'
    );
    const uploadRes = await request(bundle.app)
      .post(`/api/public/briefs/${token}/files`)
      .field('questionId', fileQ.id)
      .attach('files', sampleContent, {
        filename: 'Шаблон_сменного_рапорта_Цех2.csv',
        contentType: 'text/csv',
      })
      .attach('files', Buffer.from('PDF-SCHEME-MOCK'), {
        filename: 'architecture-scheme.pdf',
        contentType: 'application/pdf',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.attachments).toHaveLength(2);
    const firstFile = uploadRes.body.attachments[0];
    expect(firstFile.originalName).toBe('Шаблон_сменного_рапорта_Цех2.csv');

    // Client downloads their uploaded file to verify integrity
    const dlClient = await request(bundle.app).get(
      `/api/public/briefs/${token}/files/${firstFile.id}`
    );
    expect(dlClient.status).toBe(200);
    expect(dlClient.text).toBe(sampleContent.toString('utf8'));

    // Client deletes second file by choice
    const secondFileId = uploadRes.body.attachments[1].id;
    const delFile = await request(bundle.app).delete(
      `/api/public/briefs/${token}/files/${secondFileId}`
    );
    expect(delFile.body.ok).toBe(true);

    // Client submits brief with only 3 questions answered (zero mandatory!)
    const submitRes = await request(bundle.app)
      .patch(`/api/public/briefs/${token}/answers`)
      .send({
        respondentName: 'Сергей Петров',
        respondentRole: 'Главный технолог',
        markSubmitted: true,
      });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe('submitted');

    // Even after submitting, client can return and add another comment!
    const postSubmitPatch = await request(bundle.app)
      .patch(`/api/public/briefs/${token}/answers`)
      .send({
        answers: {
          [q2.id]: {
            spectrumValue: 4,
            comment: 'Дополнение после совещания с ИТ-директором',
          },
        },
      });
    expect(postSubmitPatch.status).toBe(200);
    expect(postSubmitPatch.body.status).toBe('submitted');

    // Admin sees accurate progress, respondent, attachments, and exports Markdown
    const adminList = await adminAgent.get('/api/admin/briefs');
    expect(adminList.status).toBe(200);
    const summary = adminList.body.briefs[0];
    expect(summary.answeredQuestions).toBe(3); // q1, q2, fileQ (via attachment)
    expect(summary.attachmentsCount).toBe(1);
    expect(summary.status).toBe('submitted');

    const mdExport = await adminAgent.get(
      `/api/admin/briefs/${brief.id}/export-md`
    );
    expect(mdExport.status).toBe(200);
    expect(mdExport.text).toContain('ООО ПромХимАвтоматика');
    expect(mdExport.text).toContain('Сергей Петров');
    expect(mdExport.text).toContain('Шаблон_сменного_рапорта_Цех2.csv');
  });
});

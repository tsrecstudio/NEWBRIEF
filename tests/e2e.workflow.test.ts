import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppBundle, type ServerBundle } from '../src/server/app.js';

describe('Full End-to-End Presale Lifecycle (Admin + AI Extra Questions + Blueprint + Brand + Cleanup)', () => {
  let tmpDir: string;
  let bundle: ServerBundle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msdis-e2e-test-'));
    bundle = createAppBundle(
      {
        dataDir: tmpDir,
        adminLogin: 'admin',
        adminPassword: 'mcdis-password',
        closerouterApiKey: '',
        aiWebSearchEnabled: false,
      },
      { seedDemo: true }
    );
  });

  afterEach(() => {
    bundle.db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('seeds realistic demo brief, generates extra questions & presale blueprint, updates brand, and cleans disk on delete', async () => {
    const admin = request.agent(bundle.app);
    await admin
      .post('/api/admin/login')
      .send({ login: 'admin', password: 'mcdis-password' });

    // 1. Verify seeded demo brief exists with pre-populated sample answers
    const listRes = await admin.get('/api/admin/briefs');
    expect(listRes.status).toBe(200);
    expect(listRes.body.briefs.length).toBe(1);
    const demoSummary = listRes.body.briefs[0];
    expect(demoSummary.isDemo).toBe(true);
    expect(demoSummary.answeredQuestions).toBeGreaterThanOrEqual(3);

    // 2. Ask AI to add targeted extra questions on 1C & offline TSD
    const initialCount = demoSummary.totalQuestions;
    const moreRes = await admin
      .post(`/api/admin/briefs/${demoSummary.id}/more-questions`)
      .send({ topic: 'Синхронизация 1С:ERP и офлайн-буфер ТСД на складе' });
    expect(moreRes.status).toBe(200);
    expect(moreRes.body.brief.questions.length).toBeGreaterThan(initialCount);

    // 3. Generate AI Presale Architecture Blueprint
    const bpRes = await admin.post(
      `/api/admin/briefs/${demoSummary.id}/blueprint`
    );
    expect(bpRes.status).toBe(200);
    expect(bpRes.body.blueprint.executiveSummary.length).toBeGreaterThan(20);
    expect(bpRes.body.blueprint.suggestedTechStack.length).toBeGreaterThan(2);
    expect(bpRes.body.blueprint.mvpScope.length).toBeGreaterThan(1);

    // 4. Upload a client file, then delete the whole brief and verify disk cleanup
    const detail = await admin.get(`/api/admin/briefs/${demoSummary.id}`);
    const token = detail.body.brief.accessToken;

    const up = await request(bundle.app)
      .post(`/api/public/briefs/${token}/files`)
      .field('questionId', 'q-artifacts')
      .attach('files', Buffer.from('test-excel-binary'), 'plan.xlsx');
    expect(up.status).toBe(201);
    expect(fs.readdirSync(bundle.db.uploadsDir).length).toBe(1);

    const delRes = await admin.delete(`/api/admin/briefs/${demoSummary.id}`);
    expect(delRes.status).toBe(200);
    expect(fs.readdirSync(bundle.db.uploadsDir).length).toBe(0);

    // 5. Update corporate brand settings and verify public brand endpoint reflects it
    const brandPut = await admin.put('/api/admin/brand').send({
      primaryColor: '#306DFA',
      secondaryColor: '#486ACC',
      navyColor: '#082A5E',
    });
    expect(brandPut.status).toBe(200);

    const pubBrand = await request(bundle.app).get('/api/public/brand');
    expect(pubBrand.body.brand.primaryColor).toBe('#306DFA');
    expect(pubBrand.body.brand.navyColor).toBe('#082A5E');
  });
});

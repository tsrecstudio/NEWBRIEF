import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppBundle, type ServerBundle } from '../src/server/app.js';
import {
  isPrivateOrReservedIp,
  validateSafePublicUrl,
} from '../src/server/services/webResearch.js';

describe('Security, Access Control, PIN Protection & SSRF Guards', () => {
  let tmpDir: string;
  let bundle: ServerBundle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msdis-sec-test-'));
    bundle = createAppBundle(
      {
        dataDir: tmpDir,
        adminLogin: 'architect',
        adminPassword: 'strong-secret-password',
        sessionSecret: 'test-hmac-secret-2026',
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

  it('exposes healthcheck with configured flagship CloseRouter model', async () => {
    const res = await request(bundle.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.model).toBe('anthropic/claude-opus-5.5');
  });

  it('blocks unauthenticated access to admin brief list and mutations', async () => {
    const listRes = await request(bundle.app).get('/api/admin/briefs');
    expect(listRes.status).toBe(401);

    const badLogin = await request(bundle.app)
      .post('/api/admin/login')
      .send({ login: 'architect', password: 'wrong-password' });
    expect(badLogin.status).toBe(401);
  });

  it('allows authenticated admin to see all briefs and manage PIN + token revocation + lock', async () => {
    const agent = request.agent(bundle.app);

    const loginRes = await agent
      .post('/api/admin/login')
      .send({ login: 'architect', password: 'strong-secret-password' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);

    // Create a PIN-protected brief
    const createRes = await agent.post('/api/admin/briefs/generate').send({
      companyName: 'АО Северсталь-Автоматика Тест',
      projectContext: 'Разработка MES диспетчеризации цеха и обмен с 1С:ERP',
      pinCode: '7391',
      pinHint: 'Код из письма',
      enableWebSearch: false,
    });
    expect(createRes.status).toBe(201);
    const created = createRes.body.brief;
    expect(created.hasPin).toBe(true);
    expect(created.accessToken.length).toBeGreaterThanOrEqual(28);

    // Random guessed token returns 404
    const guessed = await request(bundle.app).get(
      '/api/public/briefs/non-existent-random-token-12345'
    );
    expect(guessed.status).toBe(404);

    // Client visiting real link WITHOUT PIN receives requiresPin: true and NO questions leaked
    const lockedGet = await request(bundle.app).get(
      `/api/public/briefs/${created.accessToken}`
    );
    expect(lockedGet.status).toBe(200);
    expect(lockedGet.headers['referrer-policy']).toBe('no-referrer');
    expect(lockedGet.headers['x-robots-tag']).toContain('noindex');
    expect(lockedGet.body.requiresPin).toBe(true);
    expect(lockedGet.body.brief).toBeUndefined();

    // Client cannot patch answers without unlocking PIN
    const blockedPatch = await request(bundle.app)
      .patch(`/api/public/briefs/${created.accessToken}/answers`)
      .send({ answers: { q1: { text: 'hack' } } });
    expect(blockedPatch.status).toBe(403);

    // Wrong PIN fails
    const wrongPin = await request(bundle.app)
      .post(`/api/public/briefs/${created.accessToken}/unlock`)
      .send({ pin: '0000' });
    expect(wrongPin.status).toBe(403);

    // Correct PIN unlocks brief via cookie or header token
    const clientAgent = request.agent(bundle.app);
    const rightPin = await clientAgent
      .post(`/api/public/briefs/${created.accessToken}/unlock`)
      .send({ pin: '7391' });
    expect(rightPin.status).toBe(200);
    expect(rightPin.body.pinSessionToken).toBeTruthy();

    const unlockedGet = await clientAgent.get(
      `/api/public/briefs/${created.accessToken}`
    );
    expect(unlockedGet.status).toBe(200);
    expect(unlockedGet.body.requiresPin).toBe(false);
    expect(unlockedGet.body.brief.questions.length).toBeGreaterThan(5);
    // Internal research dossier must NOT leak to public client payload
    expect(unlockedGet.body.brief.researchDossier).toBeUndefined();

    // Admin locks brief -> client edits rejected with 423
    await agent
      .patch(`/api/admin/briefs/${created.id}`)
      .send({ status: 'locked' });

    const lockedPatch = await clientAgent
      .patch(`/api/public/briefs/${created.accessToken}/answers`)
      .send({ answers: { any: { text: 'late edit' } } });
    expect(lockedPatch.status).toBe(423);

    // Admin regenerates secret link -> old link immediately returns 404
    const regenRes = await agent
      .patch(`/api/admin/briefs/${created.id}`)
      .send({ status: 'active', regenerateToken: true });
    const newToken = regenRes.body.brief.accessToken;
    expect(newToken).not.toBe(created.accessToken);

    const oldLinkCheck = await clientAgent.get(
      `/api/public/briefs/${created.accessToken}`
    );
    expect(oldLinkCheck.status).toBe(404);
  });

  it('guards against SSRF on private, loopback, metadata and non-http URLs', async () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.24.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.10.2')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.100')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);

    expect(await validateSafePublicUrl('http://127.0.0.1:3000/admin', true)).toBeNull();
    expect(await validateSafePublicUrl('http://localhost:8080', true)).toBeNull();
    expect(await validateSafePublicUrl('http://169.254.169.254/latest/meta-data', true)).toBeNull();
    expect(await validateSafePublicUrl('file:///etc/passwd', true)).toBeNull();
    expect(
      (await validateSafePublicUrl('https://mcdis.ru/projects', true))?.hostname
    ).toBe('mcdis.ru');
  });
});

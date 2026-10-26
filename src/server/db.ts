import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { generateSecureToken, hashPin } from './auth.js';
import type {
  BriefRecord,
  BriefSummaryItem,
  BriefQuestion,
  BriefSection,
  QuestionAnswerValue,
  FileAttachmentMeta,
  ResearchDossier,
  ArchitectureBlueprint,
  BriefClientIntake,
  BriefStatus,
  BrandSettings,
} from '../shared/types.js';
import type { AppConfig } from './config.js';

export function isQuestionAnswered(
  q: BriefQuestion,
  ans: QuestionAnswerValue | undefined,
  attachmentsCountForQuestion: number
): boolean {
  if (attachmentsCountForQuestion > 0) return true;
  if (!ans) return false;
  if (ans.text && ans.text.trim().length > 0) return true;
  if (ans.selectedOptionId) return true;
  if (ans.selectedOptionIds && ans.selectedOptionIds.length > 0) return true;
  if (ans.customOptions && ans.customOptions.some((c) => c.trim().length > 0))
    return true;
  if (typeof ans.spectrumValue === 'number') return true;
  if (ans.statementVotes && Object.keys(ans.statementVotes).length > 0)
    return true;
  if (ans.bucketAssignments && Object.keys(ans.bucketAssignments).length > 0)
    return true;
  if (ans.comment && ans.comment.trim().length > 0) return true;
  return false;
}

export interface StoredAttachment extends FileAttachmentMeta {
  storedFilename: string;
}

export class BriefDatabase {
  public db: DatabaseSync;
  public uploadsDir: string;
  private config: AppConfig;

  constructor(config: AppConfig, options: { seedDemo?: boolean } = {}) {
    this.config = config;
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.uploadsDir = path.join(config.dataDir, 'uploads');
    fs.mkdirSync(this.uploadsDir, { recursive: true });

    const dbPath = path.join(config.dataDir, 'msdis_briefs.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS briefs (
        id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL UNIQUE,
        pin_hash TEXT,
        pin_plain TEXT,
        pin_hint TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        title TEXT NOT NULL,
        client_welcome_note TEXT NOT NULL,
        estimated_minutes INTEGER NOT NULL DEFAULT 8,
        intake_json TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        answers_json TEXT NOT NULL DEFAULT '{}',
        research_dossier_json TEXT,
        architecture_blueprint_json TEXT,
        respondent_name TEXT,
        respondent_role TEXT,
        respondent_contact TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_client_activity_at TEXT,
        submitted_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_briefs_token ON briefs(access_token);
      CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs(created_at DESC);

      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_brief ON attachments(brief_id);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    if (options.seedDemo !== false) {
      this.ensureDemoBriefIfEmpty();
    }
  }

  close(): void {
    this.db.close();
  }

  getBrandSettings(): BrandSettings {
    const row = this.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get('brand') as { value_json: string } | undefined;

    const defaults: BrandSettings = {
      companyName: 'МСДИС',
      tagline:
        'Заказная разработка ПО для автоматизации бизнес- и производственных процессов',
      primaryColor: this.config.brandDefaults.primaryColor,
      secondaryColor: this.config.brandDefaults.secondaryColor,
      navyColor: this.config.brandDefaults.navyColor,
      darkColor: this.config.brandDefaults.darkColor,
      surfaceColor: this.config.brandDefaults.surfaceColor,
    };

    if (!row) return defaults;
    try {
      return { ...defaults, ...JSON.parse(row.value_json) };
    } catch {
      return defaults;
    }
  }

  saveBrandSettings(patch: Partial<BrandSettings>): BrandSettings {
    const merged = { ...this.getBrandSettings(), ...patch };
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run('brand', JSON.stringify(merged), now);
    return merged;
  }

  getRuntimeAiOverrides(): { apiKey?: string; model?: string } {
    const row = this.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get('ai_overrides') as { value_json: string } | undefined;
    if (!row) return {};
    try {
      return JSON.parse(row.value_json);
    } catch {
      return {};
    }
  }

  saveRuntimeAiOverrides(overrides: { apiKey?: string; model?: string }): void {
    const current = this.getRuntimeAiOverrides();
    const merged = { ...current, ...overrides };
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run('ai_overrides', JSON.stringify(merged), now);
  }

  createBrief(input: {
    title: string;
    clientWelcomeNote: string;
    estimatedMinutes: number;
    intake: BriefClientIntake;
    sections: BriefSection[];
    questions: BriefQuestion[];
    researchDossier?: ResearchDossier;
    pinCode?: string;
    pinHint?: string;
    isDemo?: boolean;
  }): BriefRecord {
    const id = nanoid(12);
    const accessToken = generateSecureToken(24);
    const now = new Date().toISOString();
    const cleanPin = input.pinCode?.trim() || '';
    const pinHash = cleanPin
      ? hashPin(cleanPin, this.config.sessionSecret)
      : null;

    this.db
      .prepare(
        `INSERT INTO briefs (
          id, access_token, pin_hash, pin_plain, pin_hint, status,
          title, client_welcome_note, estimated_minutes,
          intake_json, sections_json, questions_json, answers_json,
          research_dossier_json, is_demo, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)`
      )
      .run(
        id,
        accessToken,
        pinHash,
        cleanPin || null,
        input.pinHint?.trim() || null,
        input.title,
        input.clientWelcomeNote,
        input.estimatedMinutes,
        JSON.stringify(input.intake),
        JSON.stringify(input.sections),
        JSON.stringify(input.questions),
        input.researchDossier ? JSON.stringify(input.researchDossier) : null,
        input.isDemo ? 1 : 0,
        now,
        now
      );

    return this.getBriefById(id)!;
  }

  private mapRowToBrief(row: Record<string, unknown>): BriefRecord {
    const id = String(row.id);
    const attachments = this.listAttachments(id).map(
      ({ storedFilename: _sf, ...meta }) => meta
    );
    return {
      id,
      accessToken: String(row.access_token),
      hasPin: Boolean(row.pin_hash),
      pinHint: row.pin_hint ? String(row.pin_hint) : undefined,
      pinCodePlainForAdmin: row.pin_plain ? String(row.pin_plain) : undefined,
      status: row.status as BriefStatus,
      title: String(row.title),
      clientWelcomeNote: String(row.client_welcome_note),
      estimatedMinutes: Number(row.estimated_minutes || 8),
      intake: JSON.parse(String(row.intake_json)),
      sections: JSON.parse(String(row.sections_json)),
      questions: JSON.parse(String(row.questions_json)),
      answers: JSON.parse(String(row.answers_json || '{}')),
      attachments,
      researchDossier: row.research_dossier_json
        ? JSON.parse(String(row.research_dossier_json))
        : undefined,
      architectureBlueprint: row.architecture_blueprint_json
        ? JSON.parse(String(row.architecture_blueprint_json))
        : undefined,
      respondentName: row.respondent_name
        ? String(row.respondent_name)
        : undefined,
      respondentRole: row.respondent_role
        ? String(row.respondent_role)
        : undefined,
      respondentContact: row.respondent_contact
        ? String(row.respondent_contact)
        : undefined,
      isDemo: Number(row.is_demo) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      lastClientActivityAt: row.last_client_activity_at
        ? String(row.last_client_activity_at)
        : undefined,
      submittedAt: row.submitted_at ? String(row.submitted_at) : undefined,
    };
  }

  getBriefById(id: string): BriefRecord | null {
    const row = this.db
      .prepare('SELECT * FROM briefs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapRowToBrief(row);
  }

  getBriefRowByToken(token: string): {
    brief: BriefRecord;
    pinHash: string | null;
  } | null {
    const row = this.db
      .prepare('SELECT * FROM briefs WHERE access_token = ?')
      .get(token) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      brief: this.mapRowToBrief(row),
      pinHash: row.pin_hash ? String(row.pin_hash) : null,
    };
  }

  listBriefSummaries(): BriefSummaryItem[] {
    const rows = this.db
      .prepare('SELECT * FROM briefs ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const brief = this.mapRowToBrief(row);
      const attachmentsByQ = new Map<string, number>();
      for (const att of brief.attachments) {
        attachmentsByQ.set(
          att.questionId,
          (attachmentsByQ.get(att.questionId) || 0) + 1
        );
      }
      const answeredCount = brief.questions.filter((q) =>
        isQuestionAnswered(
          q,
          brief.answers[q.id],
          attachmentsByQ.get(q.id) || 0
        )
      ).length;

      return {
        id: brief.id,
        accessToken: brief.accessToken,
        hasPin: brief.hasPin,
        pinCodePlainForAdmin: brief.pinCodePlainForAdmin,
        status: brief.status,
        title: brief.title,
        companyName: brief.intake.companyName,
        industry: brief.intake.industry,
        totalQuestions: brief.questions.length,
        answeredQuestions: answeredCount,
        attachmentsCount: brief.attachments.length,
        isDemo: brief.isDemo,
        aiModelUsed: brief.researchDossier?.aiModelUsed,
        createdAt: brief.createdAt,
        updatedAt: brief.updatedAt,
        lastClientActivityAt: brief.lastClientActivityAt,
        submittedAt: brief.submittedAt,
      };
    });
  }

  updateBriefStructure(
    id: string,
    patch: {
      title?: string;
      clientWelcomeNote?: string;
      estimatedMinutes?: number;
      status?: BriefStatus;
      sections?: BriefSection[];
      questions?: BriefQuestion[];
      researchDossier?: ResearchDossier;
      architectureBlueprint?: ArchitectureBlueprint;
      pinCode?: string | null;
      pinHint?: string | null;
      regenerateToken?: boolean;
    }
  ): BriefRecord | null {
    const existing = this.getBriefById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const newToken = patch.regenerateToken
      ? generateSecureToken(24)
      : existing.accessToken;

    let pinHashSql: string | null | undefined = undefined;
    let pinPlainSql: string | null | undefined = undefined;
    if (patch.pinCode !== undefined) {
      const clean = (patch.pinCode || '').trim();
      pinHashSql = clean ? hashPin(clean, this.config.sessionSecret) : null;
      pinPlainSql = clean || null;
    }

    const currentRow = this.db
      .prepare('SELECT pin_hash, pin_plain, pin_hint FROM briefs WHERE id = ?')
      .get(id) as {
      pin_hash: string | null;
      pin_plain: string | null;
      pin_hint: string | null;
    };

    this.db
      .prepare(
        `UPDATE briefs SET
          access_token = ?,
          pin_hash = ?,
          pin_plain = ?,
          pin_hint = ?,
          status = ?,
          title = ?,
          client_welcome_note = ?,
          estimated_minutes = ?,
          sections_json = ?,
          questions_json = ?,
          research_dossier_json = ?,
          architecture_blueprint_json = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(
        newToken,
        pinHashSql !== undefined ? pinHashSql : currentRow.pin_hash,
        pinPlainSql !== undefined ? pinPlainSql : currentRow.pin_plain,
        patch.pinHint !== undefined ? patch.pinHint : currentRow.pin_hint,
        patch.status ?? existing.status,
        patch.title ?? existing.title,
        patch.clientWelcomeNote ?? existing.clientWelcomeNote,
        patch.estimatedMinutes ?? existing.estimatedMinutes,
        JSON.stringify(patch.sections ?? existing.sections),
        JSON.stringify(patch.questions ?? existing.questions),
        patch.researchDossier
          ? JSON.stringify(patch.researchDossier)
          : existing.researchDossier
            ? JSON.stringify(existing.researchDossier)
            : null,
        patch.architectureBlueprint
          ? JSON.stringify(patch.architectureBlueprint)
          : existing.architectureBlueprint
            ? JSON.stringify(existing.architectureBlueprint)
            : null,
        now,
        id
      );

    return this.getBriefById(id);
  }

  patchClientAnswers(
    id: string,
    payload: {
      answers?: Record<string, QuestionAnswerValue>;
      respondentName?: string;
      respondentRole?: string;
      respondentContact?: string;
      markSubmitted?: boolean;
    }
  ): BriefRecord | null {
    const existing = this.getBriefById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const mergedAnswers: Record<string, QuestionAnswerValue> = {
      ...existing.answers,
    };

    if (payload.answers) {
      for (const [qId, val] of Object.entries(payload.answers)) {
        mergedAnswers[qId] = {
          ...(mergedAnswers[qId] || {}),
          ...val,
          updatedAt: now,
        };
      }
    }

    let nextStatus: BriefStatus = existing.status;
    if (payload.markSubmitted) {
      nextStatus = 'submitted';
    } else if (existing.status === 'active') {
      nextStatus = 'in_progress';
    }

    const submittedAt = payload.markSubmitted
      ? now
      : existing.submittedAt || null;

    this.db
      .prepare(
        `UPDATE briefs SET
          answers_json = ?,
          status = ?,
          respondent_name = ?,
          respondent_role = ?,
          respondent_contact = ?,
          updated_at = ?,
          last_client_activity_at = ?,
          submitted_at = ?
        WHERE id = ?`
      )
      .run(
        JSON.stringify(mergedAnswers),
        nextStatus,
        payload.respondentName !== undefined
          ? payload.respondentName
          : existing.respondentName || null,
        payload.respondentRole !== undefined
          ? payload.respondentRole
          : existing.respondentRole || null,
        payload.respondentContact !== undefined
          ? payload.respondentContact
          : existing.respondentContact || null,
        now,
        now,
        submittedAt,
        id
      );

    return this.getBriefById(id);
  }

  deleteBrief(id: string): boolean {
    const attachments = this.listAttachments(id);
    for (const att of attachments) {
      const fullPath = path.join(this.uploadsDir, att.storedFilename);
      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch {
        // ignore fs cleanup error
      }
    }
    const res = this.db.prepare('DELETE FROM briefs WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  addAttachment(input: {
    briefId: string;
    questionId: string;
    originalName: string;
    storedFilename: string;
    mimeType: string;
    sizeBytes: number;
  }): StoredAttachment {
    const id = nanoid(12);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO attachments (
          id, brief_id, question_id, original_name, stored_filename, mime_type, size_bytes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.briefId,
        input.questionId,
        input.originalName,
        input.storedFilename,
        input.mimeType,
        input.sizeBytes,
        now
      );

    // Touch brief activity & move status active -> in_progress if needed
    const brief = this.getBriefById(input.briefId);
    if (brief) {
      const nextStatus =
        brief.status === 'active' ? 'in_progress' : brief.status;
      this.db
        .prepare(
          'UPDATE briefs SET status = ?, updated_at = ?, last_client_activity_at = ? WHERE id = ?'
        )
        .run(nextStatus, now, now, input.briefId);
    }

    return {
      id,
      briefId: input.briefId,
      questionId: input.questionId,
      originalName: input.originalName,
      storedFilename: input.storedFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      createdAt: now,
    };
  }

  listAttachments(briefId: string): StoredAttachment[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM attachments WHERE brief_id = ? ORDER BY created_at ASC'
      )
      .all(briefId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      briefId: String(r.brief_id),
      questionId: String(r.question_id),
      originalName: String(r.original_name),
      storedFilename: String(r.stored_filename),
      mimeType: String(r.mime_type),
      sizeBytes: Number(r.size_bytes),
      createdAt: String(r.created_at),
    }));
  }

  getAttachment(briefId: string, attachmentId: string): StoredAttachment | null {
    const r = this.db
      .prepare('SELECT * FROM attachments WHERE id = ? AND brief_id = ?')
      .get(attachmentId, briefId) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      briefId: String(r.brief_id),
      questionId: String(r.question_id),
      originalName: String(r.original_name),
      storedFilename: String(r.stored_filename),
      mimeType: String(r.mime_type),
      sizeBytes: Number(r.size_bytes),
      createdAt: String(r.created_at),
    };
  }

  deleteAttachment(briefId: string, attachmentId: string): boolean {
    const att = this.getAttachment(briefId, attachmentId);
    if (!att) return false;
    const fullPath = path.join(this.uploadsDir, att.storedFilename);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // ignore
    }
    const res = this.db
      .prepare('DELETE FROM attachments WHERE id = ? AND brief_id = ?')
      .run(attachmentId, briefId);
    return Number(res.changes) > 0;
  }

  private ensureDemoBriefIfEmpty(): void {
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM briefs')
      .get() as { cnt: number };
    if (Number(countRow.cnt) > 0) return;

    const sections: BriefSection[] = [
      {
        id: 'sec-context',
        title: 'Производственный контур и текущие узкие места',
        description:
          'Сверяем гипотезы по процессам цехов, диспетчеризации и учёту выработки',
      },
      {
        id: 'sec-integrations',
        title: 'Интеграции, оборудование и ИТ-ландшафт',
        description:
          'Определяем шину данных, обмен с 1С:ERP, ПЛК/SCADA и терминалами в цехах',
      },
      {
        id: 'sec-infra',
        title: 'Архитектура развёртывания, офлайн-режим и ИБ',
        description:
          'Выбираем топологию серверов, отказоустойчивость и требования безопасности',
      },
      {
        id: 'sec-mvp',
        title: 'Приоритеты запуска и исходные артефакты',
        description:
          'Формируем границы первого релиза (MVP) и собираем примеры текущих таблиц/схем',
      },
    ];

    const questions: BriefQuestion[] = [
      {
        id: 'q-hypotheses',
        sectionId: 'sec-context',
        type: 'like_or_not',
        title: 'Насколько эти ситуации похожи на то, что сейчас происходит на производстве?',
        subtitle:
          'Отметьте в один клик — это поможет нам не тратить ваше время на очевидные вопросы.',
        architectureImpact:
          'Определяет точки сбора первичных данных (ручной ввод на постах vs автоматический съём телеметрии) и модель событий в реальном времени.',
        statements: [
          {
            id: 'st-1',
            text: 'Факт выполнения сменных заданий попадает в 1С с задержкой в несколько часов или в конце смены',
            context: 'Влияет на необходимость real-time шины оперативного учёта',
          },
          {
            id: 'st-2',
            text: 'Мастера участков ведут оперативное перепланирование и учёт простоев в Excel или бумажных рапортах',
            context: 'Определяет UX рабочего места мастера (АРМ цеха / планшет)',
          },
          {
            id: 'st-3',
            text: 'При поломке станка или нехватке комплектующих смежные участки узнают об этом слишком поздно',
            context: 'Требует событийного контура эскалаций и Andon-оповещений',
          },
          {
            id: 'st-4',
            text: 'В цехах и на складах есть «мёртвые зоны» без стабильного Wi‑Fi покрытия',
            context: 'Критично для выбора Offline-first архитектуры мобильных клиентов и ТСД',
          },
        ],
      },
      {
        id: 'q-spectrum-arch',
        sectionId: 'sec-context',
        type: 'spectrum',
        title: 'Какой вектор архитектуры ближе вашей стратегии запуска?',
        subtitle:
          'Передвиньте ползунок к тому полюсу, который точнее отражает ваши ожидания от проекта.',
        architectureImpact:
          'Напрямую влияет на выбор между модульным монолитом с быстрым выводом MVP и распределённой микросервисной платформой.',
        spectrum: {
          leftTitle: 'Быстрый пилот на 1–2 участках за 2–3 месяца',
          leftDescription:
            'Компактное модульное ядро, минимум кастомизаций на старте, проверка гипотез боем',
          rightTitle: 'Фундаментальная целевая платформа на все заводы',
          rightDescription:
            'Единая шина данных, высокая нагрузка, сложная ролевая матрица и мультифилиальность с первого дня',
        },
      },
      {
        id: 'q-systems',
        sectionId: 'sec-integrations',
        type: 'multi_choice',
        title: 'С какими системами и оборудованием потребуется двусторонний или односторонний обмен?',
        subtitle:
          'Выберите всё, что уже работает в контуре или планируется к подключению (можно добавить свои системы).',
        architectureImpact:
          'Формирует архитектуру интеграционного слоя (REST/gRPC API, очередь сообщений RabbitMQ/Kafka, адаптеры 1С, OPC UA шлюзы).',
        allowCustomOption: true,
        options: [
          {
            id: 'sys-1c-erp',
            label: '1С:ERP / 1С:КА / 1С:УПП',
            description: 'НСИ, спецификации, заказы на производство, списание материалов',
          },
          {
            id: 'sys-plc',
            label: 'Станки с ЧПУ / ПЛК / SCADA (OPC UA, Modbus)',
            description: 'Съём машинных состояний, счётчиков циклов и аварийных кодов',
          },
          {
            id: 'sys-tsd',
            label: 'ТСД, промышленные планшеты, сканеры штрихкодов / RFID',
            description: 'Маркировка тары, партионный учёт и прослеживаемость',
          },
          {
            id: 'sys-skud',
            label: 'СКУД и учёт рабочего времени (1С:ЗУП / Sigur / Болид)',
            description: 'Контроль допуска на посты и фактической выработки смен',
          },
          {
            id: 'sys-pdm',
            label: 'CAD / PDM / PLM (КОМПАС, Лоцман, Teamcenter)',
            description: 'Техпроцессы, чертежи и конструкторские спецификации на постах',
          },
          {
            id: 'sys-bi',
            label: 'BI-дашборды / видеостены диспетчерской',
            description: 'Визуализация OEE, загрузки линий и KPI в реальном времени',
          },
        ],
      },
      {
        id: 'q-deployment',
        sectionId: 'sec-infra',
        type: 'single_choice',
        title: 'Где должна разворачиваться и эксплуатироваться система?',
        subtitle:
          'Выберите целевой инфраструктурный контур с учётом политик вашей службы ИБ.',
        architectureImpact:
          'Определяет контейнеризацию (Docker / Kubernetes), совместимость с российскими ОС/СУБД (Astra Linux, Postgres Pro) и механизмы обновлений.',
        options: [
          {
            id: 'dep-onprem-closed',
            label: 'Закрытый On-Premise контур предприятия (без выхода в Интернет)',
            description: 'Собственные серверы завода, поставка обновлений через защищённые образы',
          },
          {
            id: 'dep-onprem-vpn',
            label: 'Собственные серверы (On-Premise) с доступом по VPN',
            description: 'Размещение в вашем ЦОД с регламентированным удалённым сопровождением',
          },
          {
            id: 'dep-ru-cloud',
            label: 'Российское облако (Yandex Cloud / Cloud.ru / Selectel — ФЗ-152)',
            description: 'Быстрое масштабирование и управляемые кластеры БД в РФ',
          },
          {
            id: 'dep-hybrid',
            label: 'Гибрид: локальные узлы в цехах (Edge) + центральный сервер',
            description: 'Цеха продолжают работать автономно даже при обрыве канала до ЦОД',
          },
        ],
      },
      {
        id: 'q-scale',
        sectionId: 'sec-infra',
        type: 'scale_chips',
        title: 'Оцените ориентировочный масштаб одновременной работы в системе на горизонте 1–2 лет',
        subtitle: 'Достаточно порядка цифр для расчёта нагрузки на БД и брокер событий.',
        architectureImpact:
          'Определяет пулы соединений, партиционирование таблиц телеметрии и требования к отказоустойчивости (Active-Passive vs кластер).',
        options: [
          {
            id: 'sc-small',
            label: 'До 50 активных постов / пользователей',
            description: '1 производственная площадка, сменный режим 8/5 или 12/7',
          },
          {
            id: 'sc-mid',
            label: '50 – 250 одновременных пользователей и терминалов',
            description: 'Несколько цехов и складов, работа 24/7, непрерывный поток операций',
          },
          {
            id: 'sc-large',
            label: '250 – 1 000+ пользователей / сотни единиц оборудования',
            description: 'Несколько заводов/филиалов, высокочастотная телеметрия, SLA 99.9%',
          },
        ],
      },
      {
        id: 'q-priority-mvp',
        sectionId: 'sec-mvp',
        type: 'priority_matrix',
        title: 'Распределите функциональные блоки по очерёдности запуска',
        subtitle:
          'Нажмите на нужную корзину напротив каждого модуля — это позволит точно очертить бюджет и сроки 1-го этапа.',
        architectureImpact:
          'Задаёт границы доменных сервисов первой очереди и контракты закладываемых точек расширения.',
        buckets: [
          { id: 'mvp', label: 'В ядро 1-го запуска (MVP)', tone: 'primary' },
          { id: 'phase2', label: 'Во 2-й этап развития', tone: 'secondary' },
          { id: 'skip', label: 'Пока не актуально', tone: 'muted' },
        ],
        items: [
          {
            id: 'mod-dispatch',
            label: 'Посменное планирование и выдача заданий на терминалы цеха',
          },
          {
            id: 'mod-trace',
            label: 'Штрихкодирование партий/деталей и сквозная прослеживаемость',
          },
          {
            id: 'mod-downtime',
            label: 'Фиксация простоев, брака и вызов ремонтных служб (ТОиР)',
          },
          {
            id: 'mod-1c-sync',
            label: 'Автоматическая синхронизация заказов и выработки с 1С:ERP',
          },
          {
            id: 'mod-oee',
            label: 'Аналитика OEE и экран руководителя / диспетчерской в реальном времени',
          },
        ],
      },
      {
        id: 'q-artifacts',
        sectionId: 'sec-mvp',
        type: 'file_upload',
        title: 'Примеры текущих таблиц планирования, сменных рапортов или схема ИТ-ландшафта',
        subtitle:
          'Если под рукой есть обезличенный шаблон Excel, фото бланка из цеха или черновик требований — прикрепите сюда (необязательно).',
        architectureImpact:
          'Позволяет архитекторам МСДИС сразу увидеть реальную структуру сущностей, атрибутов и печатных форм без лишних интервью.',
        allowFiles: true,
        filePrompt:
          'Перетащите файлы (Excel, PDF, DOCX, изображения схем или архив) — до 25 МБ на файл',
      },
      {
        id: 'q-pain-free',
        sectionId: 'sec-mvp',
        type: 'long_text',
        title: 'Какой главный измеримый результат через 6 месяцев сделает проект безусловно успешным для вас?',
        subtitle:
          'Можно своими словами или кликнуть по близким ориентирам ниже.',
        architectureImpact:
          'Фокусирует архитектурные метрики качества (производительность, прозрачность данных, скорость перепланирования) на главной бизнес-цели.',
        placeholder:
          'Например: уйти от ручного сведения смен в Excel, видеть реальную загрузку литейного и сборочного цехов онлайн и сократить простои из-за некомплекта на 20%...',
        quickHints: [
          'Прозрачная загрузка станков и смен в реальном времени',
          'Уход от ручного ввода в Excel и двойного учёта с 1С',
          'Прослеживаемость каждой партии и причин брака',
          'Импортозамещение и работа в закрытом контуре РФ',
        ],
        allowFiles: true,
      },
    ];

    const demoBrief = this.createBrief({
      title:
        '[ДЕМО] Автоматизация диспетчеризации цехов (MES) и сквозного учёта с 1С:ERP',
      clientWelcomeNote:
        'Коллеги, мы подготовили интерактивный архитектурный бриф специально под задачи вашего машиностроительного производства. В нём нет обязательных полей — отвечайте в удобном темпе только на то, что считаете важным. Все ответы сохраняются мгновенно: вы можете закрыть вкладку и вернуться позже или переслать ссылку главному инженеру и ИТ-директору.',
      estimatedMinutes: 7,
      intake: {
        companyName: 'АО «УралПромАгрегат» (Демо-пример)',
        companyWebsite: 'https://mcdis.ru',
        industry: 'Машиностроение и металлообработка (серийное и позаказное производство)',
        contactName: 'Алексей Викторович Соколов',
        contactRole: 'Директор по цифровизации и ИТ',
        knownSystems: '1С:ERP 2.5, КОМПАС-3D, сменные планы в Excel, 45 станков с ЧПУ',
        projectContext:
          'Клиент хочет уйти от котлового учёта и ручных Excel-рапортов в 4 цехах. Нужна кастомная система оперативного планирования и диспетчеризации (MES-контур), планшеты/терминалы у мастеров и операторов, прослеживаемость деталей по штрихкодам и обмен с 1С:ERP.',
        constraintsAndDeadlines:
          'Желателен запуск пилота на механосборочном цехе за 3.5 месяца. Размещение строго в контуре РФ.',
        depth: 'standard',
        enableWebSearch: true,
      },
      sections,
      questions,
      researchDossier: {
        companySummary:
          'Производственное предприятие машиностроительного профиля с позаказным и мелкосерийным циклом (механообработка, заготовительный и сборочный переделы). Характерна многономенклатурная спецификация изделий и высокая стоимость простоев оборудования с ЧПУ.',
        industryInsights: [
          'В позаказном машиностроении критична связка конструкторско-технологической подготовки (КОМПАС/PDM) с оперативным сменным заданием.',
          'Котловой учёт в 1С:ERP часто не даёт пооперационной картины по переделам в реальном времени.',
          'Цеховые металлоконструкции экранируют радиосигнал — мобильные АРМ и ТСД требуют локального буфера операций (Offline-first).',
        ],
        inferredTechLandscape: [
          '1С:ERP Управление предприятием 2.5 (контур НСИ, финансов и материального учёта)',
          'КОМПАС-3D / Лоцман:PLM (конструкторские спецификации и маршрутные карты)',
          'Стойки ЧПУ (Fanuc / Siemens / Балт-Систем) с возможностью съёма состояний по OPC UA / Modbus TCP',
        ],
        regulatoryAndSecurityFactors: [
          'Требования к размещению в закрытом или защищённом контуре предприятия на базе отечественного стека (Linux / PostgreSQL)',
          'Совместимость с реестром российского ПО Минцифры РФ',
        ],
        keyArchitecturalHypotheses: [
          'Гибридная архитектура с локальным Edge-кэшем цеха обеспечит бесперебойную работу терминалов при просадках сети',
          'Асинхронная шина обмена с 1С:ERP избавит от блокировок учётной базы в пиковые часы закрытия смен',
        ],
        searchQueriesExecuted: [
          'машиностроение позаказное производство MES интеграция 1С:ERP КОМПАС архитектура',
          'съем данных ЧПУ OPC UA Modbus диспетчеризация цеха офлайн терминалы',
        ],
        sources: [
          {
            title: 'МСДИС — Заказная разработка корпоративных платформ и автоматизация процессов',
            url: 'https://www.mcdis.ru/',
            snippet:
              'Проектирование и внедрение высоконагруженных систем, интеграция 1С, OPC UA, Modbus, Kubernetes и визуализация данных в реальном времени.',
            sourceType: 'website',
          },
        ],
        researchedAt: new Date().toISOString(),
        aiModelUsed: this.config.closerouterModel,
        usedFallbackEngine: false,
      },
      isDemo: true,
    });

    // Seed partial demo answers so Admin Dashboard shows live progress immediately
    this.patchClientAnswers(demoBrief.id, {
      respondentName: 'Алексей Соколов',
      respondentRole: 'ИТ-директор',
      answers: {
        'q-hypotheses': {
          statementVotes: {
            'st-1': 'yes',
            'st-2': 'yes',
            'st-3': 'partial',
            'st-4': 'yes',
          },
        },
        'q-spectrum-arch': {
          spectrumValue: 2,
          comment: 'Хотим запустить пилот на механосборочном цехе, но заложить ядро под масштабирование на ещё 3 цеха.',
        },
        'q-systems': {
          selectedOptionIds: ['sys-1c-erp', 'sys-plc', 'sys-tsd', 'sys-pdm'],
        },
      },
    });
  }
}

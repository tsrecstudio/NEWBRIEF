import { nanoid } from 'nanoid';
import { CloseRouterClient, extractJsonFromLlm } from './closerouter.js';
import { WebResearchService } from './webResearch.js';
import type {
  BriefClientIntake,
  BriefQuestion,
  BriefSection,
  BriefRecord,
  ResearchDossier,
  ArchitectureBlueprint,
  QuestionType,
} from '../../shared/types.js';
import type { AppConfig } from '../config.js';

interface RawGeneratedBrief {
  title?: string;
  clientWelcomeNote?: string;
  estimatedMinutes?: number;
  researchDossier?: {
    companySummary?: string;
    industryInsights?: string[];
    inferredTechLandscape?: string[];
    regulatoryAndSecurityFactors?: string[];
    keyArchitecturalHypotheses?: string[];
  };
  sections?: BriefSection[];
  questions?: BriefQuestion[];
}

const VALID_TYPES = new Set<QuestionType>([
  'like_or_not',
  'spectrum',
  'single_choice',
  'multi_choice',
  'priority_matrix',
  'scale_chips',
  'short_text',
  'long_text',
  'file_upload',
]);

export function sanitizeGeneratedStructure(raw: RawGeneratedBrief): {
  sections: BriefSection[];
  questions: BriefQuestion[];
} {
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  const sections: BriefSection[] =
    rawSections.length > 0
      ? rawSections.map((s, idx) => ({
          id: s.id || `sec-${idx + 1}-${nanoid(4)}`,
          title: String(s.title || `Блок ${idx + 1}`),
          description: String(
            s.description || 'Уточнение архитектурных параметров решения'
          ),
        }))
      : [
          {
            id: 'sec-main',
            title: 'Архитектура и контур решения',
            description: 'Ключевые развилки проектирования системы',
          },
        ];

  const validSectionIds = new Set(sections.map((s) => s.id));
  const defaultSecId = sections[0].id;

  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions: BriefQuestion[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const rq = rawQuestions[i];
    if (!rq || !rq.title) continue;

    let qType: QuestionType = VALID_TYPES.has(rq.type)
      ? rq.type
      : 'single_choice';

    const qId = rq.id || `q-${i + 1}-${nanoid(5)}`;
    const secId = validSectionIds.has(rq.sectionId)
      ? rq.sectionId
      : sections[i % sections.length]?.id || defaultSecId;

    const base: BriefQuestion = {
      id: qId,
      sectionId: secId,
      type: qType,
      title: String(rq.title).trim(),
      subtitle: rq.subtitle ? String(rq.subtitle).trim() : undefined,
      architectureImpact: String(
        rq.architectureImpact ||
          'Влияет на выбор архитектуры компонентов, интеграций и модели данных'
      ).trim(),
      allowFiles: Boolean(rq.allowFiles || qType === 'file_upload'),
      filePrompt: rq.filePrompt ? String(rq.filePrompt) : undefined,
    };

    if (
      qType === 'single_choice' ||
      qType === 'multi_choice' ||
      qType === 'scale_chips'
    ) {
      const opts = Array.isArray(rq.options) ? rq.options : [];
      if (opts.length < 2) {
        base.type = 'short_text';
      } else {
        base.options = opts.map((o, oi) => ({
          id: o.id || `${qId}-opt-${oi + 1}`,
          label: String(o.label || `Вариант ${oi + 1}`),
          description: o.description ? String(o.description) : undefined,
        }));
        base.allowCustomOption = rq.allowCustomOption ?? true;
      }
    } else if (qType === 'spectrum') {
      if (rq.spectrum?.leftTitle && rq.spectrum?.rightTitle) {
        base.spectrum = {
          leftTitle: String(rq.spectrum.leftTitle),
          leftDescription: rq.spectrum.leftDescription
            ? String(rq.spectrum.leftDescription)
            : undefined,
          rightTitle: String(rq.spectrum.rightTitle),
          rightDescription: rq.spectrum.rightDescription
            ? String(rq.spectrum.rightDescription)
            : undefined,
        };
      } else {
        base.type = 'short_text';
      }
    } else if (qType === 'like_or_not') {
      const sts = Array.isArray(rq.statements) ? rq.statements : [];
      if (sts.length === 0) {
        base.type = 'long_text';
      } else {
        base.statements = sts.map((st, si) => ({
          id: st.id || `${qId}-st-${si + 1}`,
          text: String(st.text),
          context: st.context ? String(st.context) : undefined,
        }));
      }
    } else if (qType === 'priority_matrix') {
      const items = Array.isArray(rq.items) ? rq.items : [];
      const buckets =
        Array.isArray(rq.buckets) && rq.buckets.length >= 2
          ? rq.buckets
          : [
              { id: 'mvp', label: 'В 1-й запуск (MVP)', tone: 'primary' as const },
              { id: 'phase2', label: 'Во 2-й этап', tone: 'secondary' as const },
              { id: 'skip', label: 'Не нужно', tone: 'muted' as const },
            ];
      if (items.length === 0) {
        base.type = 'long_text';
      } else {
        base.buckets = buckets.map((b, bi) => ({
          id: b.id || `b-${bi + 1}`,
          label: String(b.label),
          tone: b.tone || (bi === 0 ? 'primary' : bi === 1 ? 'secondary' : 'muted'),
        }));
        base.items = items.map((it, ii) => ({
          id: it.id || `${qId}-item-${ii + 1}`,
          label: String(it.label),
          description: it.description ? String(it.description) : undefined,
        }));
      }
    }

    if (base.type === 'short_text' || base.type === 'long_text') {
      base.placeholder = rq.placeholder
        ? String(rq.placeholder)
        : 'Напишите в свободной форме или выберите ориентиры ниже...';
      if (Array.isArray(rq.quickHints) && rq.quickHints.length > 0) {
        base.quickHints = rq.quickHints.map(String).slice(0, 6);
      }
    }

    questions.push(base);
  }

  return { sections, questions };
}

export class BriefGeneratorService {
  constructor(
    private config: AppConfig,
    private aiClient: CloseRouterClient,
    private webResearch: WebResearchService
  ) {}

  private buildDeterministicQueries(intake: BriefClientIntake): string[] {
    const queries: string[] = [];
    const comp = intake.companyName.trim();
    if (comp) {
      queries.push(
        `${comp} ${intake.industry || ''} официальный сайт продукция деятельность`.trim()
      );
      queries.push(`${comp} ИТ цифровизация автоматизация проекты`.trim());
    }
    if (intake.industry?.trim()) {
      queries.push(
        `автоматизация ${intake.industry.trim()} архитектура ПО интеграция 1С MES ERP`
      );
    }
    const ctxSnippet = intake.projectContext
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    if (ctxSnippet) {
      queries.push(`${ctxSnippet} архитектура внедрение`);
    }
    return queries.slice(0, 5);
  }

  async planSearchQueries(intake: BriefClientIntake): Promise<string[]> {
    const baseQueries = this.buildDeterministicQueries(intake);
    if (!this.aiClient.isConfigured()) {
      return baseQueries;
    }

    try {
      const resp = await this.aiClient.completeChat({
        maxTokens: 700,
        timeoutMs: 20000,
        messages: [
          {
            role: 'system',
            content:
              'Ты ведущий системный архитектор ИТ-компании МСДИС (заказная разработка ПО для автоматизации бизнес- и производственных процессов). Верни СТРОГО JSON вида {"queries": ["запрос 1", "запрос 2", ...]} из 4-5 точных поисковых запросов на русском языке, чтобы найти в интернете информацию о компании клиента, её отрасли, регуляторных требованиях РФ и типичном ИТ-ландшафте перед составлением архитектурного брифа.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              companyName: intake.companyName,
              companyWebsite: intake.companyWebsite,
              industry: intake.industry,
              knownSystems: intake.knownSystems,
              projectContext: intake.projectContext,
            }),
          },
        ],
      });
      const parsed = extractJsonFromLlm<{ queries?: string[] }>(resp.content);
      if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
        return parsed.queries.map(String).slice(0, 5);
      }
    } catch {
      // Fall back smoothly to deterministic search queries
    }
    return baseQueries;
  }

  async generateBrief(intake: BriefClientIntake): Promise<{
    title: string;
    clientWelcomeNote: string;
    estimatedMinutes: number;
    sections: BriefSection[];
    questions: BriefQuestion[];
    researchDossier: ResearchDossier;
  }> {
    const shouldSearch =
      this.config.aiWebSearchEnabled && intake.enableWebSearch !== false;

    let searchQueries: string[] = [];
    let webCorpus = '';
    let webSources: ResearchDossier['sources'] = [];

    if (shouldSearch) {
      searchQueries = await this.planSearchQueries(intake);
      const researchResult = await this.webResearch.runMultiSourceResearch({
        companyName: intake.companyName,
        companyWebsite: intake.companyWebsite,
        industry: intake.industry,
        queries: searchQueries,
      });
      webCorpus = researchResult.corpus;
      webSources = researchResult.sources;
      searchQueries = researchResult.executedQueries;
    }

    const targetCountRange =
      intake.depth === 'compact'
        ? '8–10'
        : intake.depth === 'deep'
          ? '16–20'
          : '12–15';

    if (this.aiClient.isConfigured()) {
      try {
        const systemPrompt = `Ты — Главный архитектор решений (Principal Solution Architect) российской ИТ-компании ООО «МСДИС» (mcdis.ru).
МСДИС специализируется на заказной разработке высоконагруженного ПО, автоматизации бизнес- и производственных процессов (MES, WMS, ERP-контуры, BPM, CRM, диспетчеризация, АСУ ТП / OPC UA / Modbus, интеграция с 1С, импортозамещение, ИИ-аналитика, веб- и мобильные платформы).

Твоя задача: на основе вводных от менеджера/архитектора МСДИС и найденных в Интернете данных о компании и отрасли клиента спроектировать ИДЕАЛЬНЫЙ ИНТЕРАКТИВНЫЙ БРИФ (${targetCountRange} вопросов в 4–5 смысловых секциях).

ЖЕЛЕЗНЫЕ ПРАВИЛА ПРОЕКТИРОВАНИЯ ВОПРОСОВ:
1. НИКАКОЙ ВОДЫ И ОБЩИХ ФРАЗ! Запрещены банальные вопросы вроде «Каковы цели вашего бизнеса?» или «Опишите все бизнес-процессы».
2. КАЖДЫЙ вопрос обязан напрямую влиять на АРХИТЕКТУРУ, ВЫБОР ТЕХНОЛОГИЧЕСКОГО РЕШЕНИЯ, ТОПОЛОГИЮ ДАННЫХ, ИНТЕГРАЦИИ, ОФЛАЙН-РАБОТУ, НАГРУЗКУ, ИБ ИЛИ ГРАНИЦЫ MVP. В поле "architectureImpact" чётко пиши, на какое архитектурное решение влияет ответ.
3. СДЕЛАЙ БРИФ УВЛЕКАТЕЛЬНЫМ: комбинируй разные интерактивные механики, чтобы клиенту хотелось кликать и отвечать самому:
   - "like_or_not" («Похоже на вашу ситуацию или нет?») — 3–5 точечных отраслевых гипотез об их текущих болях и процессах ("statements": [{"id":"s1","text":"...","context":"..."}]).
   - "spectrum" («Что ближе — что дальше?») — архитектурная развилка между двумя полюсами ("spectrum": {"leftTitle":"...","leftDescription":"...","rightTitle":"...","rightDescription":"..."}). Минимум 2 таких вопроса в брифе!
   - "multi_choice" — чекбоксы-карточки (например, конкретные системы для интеграции, роли, устройства, протоколы) с "allowCustomOption": true.
   - "single_choice" — выбор целевого контура развёртывания, критичности SLA, модели миграции.
   - "priority_matrix" — распределение конкретных модулей под запрос клиента по корзинам ("buckets": [{"id":"mvp","label":"В 1-й запуск (MVP)","tone":"primary"},{"id":"phase2","label":"Во 2-й этап","tone":"secondary"},{"id":"skip","label":"Не требуется","tone":"muted"}], "items": [...]).
   - "scale_chips" — быстрая оценка масштаба/нагрузки/числа объектов или пользователей через карточки диапазонов ("options": [...]).
   - "file_upload" — 1–2 уместных запроса реальных артефактов (примеры Excel-таблиц, схемы процессов, регламенты, скриншоты старой системы) с "allowFiles": true и понятным "filePrompt". Также ставь "allowFiles": true на тех вопросах, где клиенту удобно приложить схему или документ.
   - "short_text" / "long_text" — только там, где нужен свободный нюанс (не более 20% вопросов!), обязательно добавляй 3–4 кликабельных чипа-подсказки "quickHints".
4. Учитывай реальную специфику клиента из веб-исследования (отрасль, вероятные системы 1С/SAP/Bitrix/SCADA/WMS, ФЗ-152, КИИ, Честный ЗНАК и т.д.).

Верни СТРОГО валидный JSON без пояснений вокруг по следующей схеме:
{
  "title": "Точный заголовок проекта для клиента",
  "clientWelcomeNote": "Тёплое, уважительное и деловое обращение от команды МСДИС на 2-3 предложения (подчеркни, что обязательных вопросов нет, всё автосохраняется, можно переслать коллегам)",
  "estimatedMinutes": 7,
  "researchDossier": {
    "companySummary": "Краткая выжимка о компании клиента, её профиле и масштабе (на основе вводных и веб-поиска)",
    "industryInsights": ["Инсайт 1 об отрасли и процессах", "Инсайт 2"],
    "inferredTechLandscape": ["Предполагаемая система/протокол 1", "Система 2"],
    "regulatoryAndSecurityFactors": ["Фактор ИБ / регуляторики 1"],
    "keyArchitecturalHypotheses": ["Ключевая архитектурная развилка 1", "Развилка 2"]
  },
  "sections": [
    { "id": "sec-1", "title": "...", "description": "..." }
  ],
  "questions": [
    {
      "id": "q-1",
      "sectionId": "sec-1",
      "type": "like_or_not | spectrum | multi_choice | single_choice | priority_matrix | scale_chips | file_upload | short_text | long_text",
      "title": "...",
      "subtitle": "...",
      "architectureImpact": "...",
      "allowFiles": false,
      "filePrompt": "...",
      "options": [{ "id": "o1", "label": "...", "description": "..." }],
      "allowCustomOption": true,
      "spectrum": { "leftTitle": "...", "leftDescription": "...", "rightTitle": "...", "rightDescription": "..." },
      "statements": [{ "id": "st1", "text": "...", "context": "..." }],
      "buckets": [{ "id": "mvp", "label": "В ядро MVP", "tone": "primary" }, { "id": "phase2", "label": "2-й этап", "tone": "secondary" }, { "id": "skip", "label": "Не нужно", "tone": "muted" }],
      "items": [{ "id": "it1", "label": "...", "description": "..." }],
      "placeholder": "...",
      "quickHints": ["...", "..."]
    }
  ]
}`;

        const userPrompt = `ВВОДНЫЕ ДАННЫЕ О КЛИЕНТЕ И ЗАПРОСЕ ОТ МСДИС:
- Компания: ${intake.companyName}
- Сайт клиента: ${intake.companyWebsite || 'не указан'}
- Отрасль: ${intake.industry || 'определи по контексту и веб-поиску'}
- Контактное лицо и роль: ${[intake.contactName, intake.contactRole].filter(Boolean).join(', ') || 'не указаны'}
- Известные текущие системы: ${intake.knownSystems || 'не уточнены'}
- Суть запроса и известные детали:
${intake.projectContext}
${intake.constraintsAndDeadlines ? `\n- Известные ограничения и сроки:\n${intake.constraintsAndDeadlines}` : ''}
${intake.intakeDocumentText ? `\n- Текст приложенного вводного документа:\n${intake.intakeDocumentText.slice(0, 6000)}` : ''}

РЕЗУЛЬТАТЫ ПОИСКА В СЕТИ ИНТЕРНЕТ О КОМПАНИИ И ОТРАСЛИ:
${webCorpus ? webCorpus : 'Прямых страниц в открытой выдаче не найдено — опирайся на экспертные знания об этой компании/отрасли в РФ и вводный контекст.'}`;

        const completion = await this.aiClient.completeChat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          maxTokens: 7800,
          timeoutMs: 95000,
        });

        const parsed = extractJsonFromLlm<RawGeneratedBrief>(
          completion.content
        );
        const sanitized = sanitizeGeneratedStructure(parsed);

        if (sanitized.questions.length >= 4) {
          const dossier: ResearchDossier = {
            companySummary:
              parsed.researchDossier?.companySummary ||
              `Проведён предпроектный анализ компании ${intake.companyName} и профильного контура задачи.`,
            industryInsights: parsed.researchDossier?.industryInsights || [],
            inferredTechLandscape:
              parsed.researchDossier?.inferredTechLandscape || [],
            regulatoryAndSecurityFactors:
              parsed.researchDossier?.regulatoryAndSecurityFactors || [],
            keyArchitecturalHypotheses:
              parsed.researchDossier?.keyArchitecturalHypotheses || [],
            searchQueriesExecuted: searchQueries,
            sources: webSources,
            researchedAt: new Date().toISOString(),
            aiModelUsed: completion.modelUsed,
            usedFallbackEngine: false,
          };

          return {
            title:
              parsed.title ||
              `Архитектурный бриф: ${intake.companyName} — автоматизация процессов`,
            clientWelcomeNote:
              parsed.clientWelcomeNote ||
              `Уважаемые коллеги из ${intake.companyName}! Команда архитекторов МСДИС подготовила интерактивный бриф под вашу задачу. Обязательных вопросов нет — отвечайте только на релевантные пункты в любом порядке. Все ответы и прикреплённые файлы сохраняются автоматически.`,
            estimatedMinutes: Number(parsed.estimatedMinutes) || 8,
            sections: sanitized.sections,
            questions: sanitized.questions,
            researchDossier: dossier,
          };
        }
      } catch (err) {
        console.warn(
          '[BriefGenerator] CloseRouter call failed, falling back to Smart Domain Engine:',
          err instanceof Error ? err.message : err
        );
      }
    }

    // Context-aware Smart Domain Architectural Engine (used when API key not yet provided or offline)
    return this.buildSmartDomainBrief(intake, searchQueries, webSources);
  }

  async generateMoreQuestions(
    brief: BriefRecord,
    topicPrompt: string
  ): Promise<BriefQuestion[]> {
    const targetSecId =
      brief.sections[brief.sections.length - 1]?.id || 'sec-extra';

    if (this.aiClient.isConfigured()) {
      try {
        const completion = await this.aiClient.completeChat({
          maxTokens: 3200,
          timeoutMs: 60000,
          messages: [
            {
              role: 'system',
              content: `Ты главный системный архитектор МСДИС. Сгенерируй 3–4 дополнительных глубоких архитектурных вопроса для брифа клиента по запрошенной теме. Используй разнообразные интерактивные форматы ("like_or_not", "spectrum", "multi_choice", "single_choice", "priority_matrix", "short_text", "file_upload"). Верни СТРОГО JSON вида {"questions": [...]}. Используй существующие sectionId из списка секций брифа.`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                companyName: brief.intake.companyName,
                projectContext: brief.intake.projectContext,
                sections: brief.sections,
                existingQuestionTitles: brief.questions.map((q) => q.title),
                requestedTopic: topicPrompt,
              }),
            },
          ],
        });

        const parsed = extractJsonFromLlm<{ questions?: BriefQuestion[] }>(
          completion.content
        );
        const sanitized = sanitizeGeneratedStructure({
          sections: brief.sections,
          questions: parsed.questions || [],
        });
        if (sanitized.questions.length > 0) {
          return sanitized.questions;
        }
      } catch {
        // Fallback below
      }
    }

    return [
      {
        id: `q-extra-${nanoid(5)}`,
        sectionId: targetSecId,
        type: 'spectrum',
        title: `Уточнение по теме «${topicPrompt.slice(0, 70)}»: какой подход предпочтительнее?`,
        subtitle: 'Выберите позицию на шкале или оставьте комментарий с деталями.',
        architectureImpact: `Уточняет архитектурные ограничения по блоку: ${topicPrompt.slice(0, 90)}`,
        spectrum: {
          leftTitle: 'Максимальная простота и стандартные протоколы',
          leftDescription: 'Быстрая реализация с минимальными доработками смежных систем',
          rightTitle: 'Глубокая кастомная логика и строгий контроль',
          rightDescription: 'Полная автоматизация нестандартных сценариев и проверок',
        },
        allowFiles: true,
        filePrompt: 'При необходимости приложите схему или регламент по этому блоку',
      },
      {
        id: `q-extra-${nanoid(5)}`,
        sectionId: targetSecId,
        type: 'multi_choice',
        title: `Ключевые требования к контуру «${topicPrompt.slice(0, 60)}»`,
        subtitle: 'Отметьте все критичные факторы (можно вписать свой вариант).',
        architectureImpact:
          'Определяет нефункциональные требования, аудит операций и контракты обмена данными.',
        allowCustomOption: true,
        options: [
          {
            id: `opt-${nanoid(4)}`,
            label: 'Полное журналирование действий и истории изменений (Audit Log)',
          },
          {
            id: `opt-${nanoid(4)}`,
            label: 'Ролевое разграничение прав на уровне филиалов / подразделений',
          },
          {
            id: `opt-${nanoid(4)}`,
            label: 'Асинхронная очередь обмена с гарантией доставки без потерь',
          },
          {
            id: `opt-${nanoid(4)}`,
            label: 'Импорт исторических данных из текущих таблиц / старой БД',
          },
        ],
      },
    ];
  }

  async generateArchitectureBlueprint(
    brief: BriefRecord
  ): Promise<ArchitectureBlueprint> {
    const qaDigest = brief.questions.map((q) => {
      const ans = brief.answers[q.id];
      const files = brief.attachments
        .filter((a) => a.questionId === q.id)
        .map((a) => a.originalName);
      return {
        question: q.title,
        type: q.type,
        architectureImpact: q.architectureImpact,
        answer: ans || null,
        attachedFiles: files,
      };
    });

    if (this.aiClient.isConfigured()) {
      try {
        const completion = await this.aiClient.completeChat({
          maxTokens: 4500,
          timeoutMs: 80000,
          messages: [
            {
              role: 'system',
              content: `Ты — Главный архитектор решений ООО «МСДИС». Проанализируй вводные данные о клиенте, результаты веб-исследования и фактические ответы клиента в брифе. Сформируй экспертное предпроектное архитектурное резюме (Presale Architecture Blueprint) на русском языке.
Верни СТРОГО JSON по схеме:
{
  "executiveSummary": "Краткое резюме задачи и ключевого вектора решения (3-4 предложения)",
  "recommendedArchitecture": "Описание рекомендуемой архитектуры (модульный монолит / микросервисы / гибрид с Edge-узлами, паттерны интеграции и хранения данных)",
  "suggestedTechStack": ["Технология 1 с обоснованием", "Технология 2"],
  "integrationMap": ["Контур интеграции 1 (протокол, направление)", "Контур 2"],
  "mvpScope": ["Модуль 1 для быстрого запуска MVP", "Модуль 2"],
  "phaseTwoScope": ["Модуль 2-го этапа", "Развитие аналитики/ИИ"],
  "risksAndMitigations": [{"risk": "Риск 1", "mitigation": "Архитектурная мера снижения"}],
  "openQuestionsForCall": ["Точечный вопрос на установочный созвон с архитектором 1", "Вопрос 2"],
  "estimatedComplexity": "Оценка масштаба (например: Средний / Крупный Enterprise, ориентир MVP 3–4 мес., команда 6–8 специалистов)"
}`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                intake: brief.intake,
                researchDossier: brief.researchDossier,
                respondent: {
                  name: brief.respondentName,
                  role: brief.respondentRole,
                  contact: brief.respondentContact,
                },
                qaDigest,
              }),
            },
          ],
        });

        const parsed = extractJsonFromLlm<Partial<ArchitectureBlueprint>>(
          completion.content
        );
        return {
          executiveSummary:
            parsed.executiveSummary ||
            `Предпроектный синтез для ${brief.intake.companyName}.`,
          recommendedArchitecture:
            parsed.recommendedArchitecture ||
            'Модульная сервисно-ориентированная архитектура с выделенным шлюзом интеграций.',
          suggestedTechStack: parsed.suggestedTechStack || [],
          integrationMap: parsed.integrationMap || [],
          mvpScope: parsed.mvpScope || [],
          phaseTwoScope: parsed.phaseTwoScope || [],
          risksAndMitigations: parsed.risksAndMitigations || [],
          openQuestionsForCall: parsed.openQuestionsForCall || [],
          estimatedComplexity:
            parsed.estimatedComplexity || 'Средний Enterprise-проект (MVP 3–4 месяца)',
          generatedAt: new Date().toISOString(),
          modelUsed: completion.modelUsed,
        };
      } catch (err) {
        console.warn(
          '[BriefGenerator] Blueprint fallback used:',
          err instanceof Error ? err.message : err
        );
      }
    }

    // Deterministic architectural synthesis when offline / without key
    const answeredCount = Object.keys(brief.answers).length;
    return {
      executiveSummary: `На основе вводных по проекту «${brief.title}» (${brief.intake.companyName}) и ${answeredCount} заполненных блоков брифа рекомендуется поэтапная реализация кастомной платформы с выделенным интеграционным контуром и запуском пилота (MVP) на приоритетном участке.`,
      recommendedArchitecture:
        'Модульный монолит с чёткими доменными границами (DDD), асинхронной шиной обмена для интеграции с учётными системами (1С / ERP / оборудование), контейнеризацией в Docker и поддержкой отказоустойчивого локального кэширования для рабочих постов.',
      suggestedTechStack: [
        'Backend: TypeScript (NestJS / Node.js) или Go / C# (.NET 8) для высоконагруженных контуров',
        'СУБД: PostgreSQL / Postgres Pro + Redis (кэширование, очереди и блокировки)',
        'Интеграционная шина: RabbitMQ / Apache Kafka + REST/OData адаптеры к 1С',
        'Frontend и АРМ: React + TypeScript (PWA с поддержкой Offline-очереди для цехов/складов)',
        'Инфраструктура: Docker / Kubernetes, совместимость с Astra Linux / РЕД ОС',
      ],
      integrationMap: [
        `Двусторонний асинхронный обмен с учётным ядром (${brief.intake.knownSystems || '1С:ERP / корпоративные справочники'})`,
        'Единый контур авторизации (SSO / Active Directory / Keycloak / ALD Pro)',
        'Экспорт управленческой отчётности и событийного аудита',
      ],
      mvpScope: [
        'Ядро ролевой модели, справочников НСИ и ключевого операционного процесса',
        'Рабочие места основных ролей (веб-интерфейс + адаптивный терминальный режим)',
        'Базовая интеграция с главной учётной системой без двойного ручного ввода',
      ],
      phaseTwoScope: [
        'Предиктивная аналитика, расширенные дашборды руководителя и KPI в реальном времени',
        'Подключение вторичных смежных систем и автоматизация сложных исключений',
      ],
      risksAndMitigations: [
        {
          risk: 'Неоднородность исторических справочников НСИ и дубли в текущих таблицах',
          mitigation:
            'Заложить модуль валидации, маппинга и дедупликации данных на этапе импорта',
        },
        {
          risk: 'Пиковые блокировки учётной базы 1С при синхронном обмене',
          mitigation:
            'Использовать очередь сообщений с пакетной идемпотентной выгрузкой изменений',
        },
      ],
      openQuestionsForCall: [
        'Уточнить владельца мастер-данных (где заводятся новые позиции справочников — в 1С или в новой системе)',
        'Согласовать регламент ИБ по сетевым доступам между сегментами и тестовым стендом',
        'Подтвердить пилотный участок / подразделение для первого боевого запуска MVP',
      ],
      estimatedComplexity:
        'MVP: 3–4 месяца (команда МСДИС: системный архитектор, бизнес-аналитик, 2–3 разработчика, QA, DevOps)',
      generatedAt: new Date().toISOString(),
      modelUsed: `${this.aiClient.getEffectiveModel()} (локальный синтез — задайте CLOSEROUTER_API_KEY для облачной генерации)`,
    };
  }

  private buildSmartDomainBrief(
    intake: BriefClientIntake,
    searchQueries: string[],
    webSources: ResearchDossier['sources']
  ): {
    title: string;
    clientWelcomeNote: string;
    estimatedMinutes: number;
    sections: BriefSection[];
    questions: BriefQuestion[];
    researchDossier: ResearchDossier;
  } {
    const fullText = `${intake.industry || ''} ${intake.projectContext} ${intake.knownSystems || ''}`.toLowerCase();
    const isManufacturing =
      /производ|цех|завод|станк|чпу|mes|scada|плк|opc|оборудован|выработк|брак|тоир|лини/i.test(
        fullText
      );
    const isLogistics =
      /склад|логист|wms|тсд|маршрут|доставк|автопарк|перевоз|штрихкод|отгруз/i.test(
        fullText
      );

    const domainLabel = isManufacturing
      ? 'производственных и цеховых процессов'
      : isLogistics
        ? 'складской и транспортной логистики'
        : 'бизнес-процессов и корпоративного контура';

    const sections: BriefSection[] = [
      {
        id: 'sec-hypo',
        title: 'Бизнес-контур и проверка гипотез «Как есть»',
        description: `Быстрая сверка текущих узких мест в контуре ${intake.companyName}`,
      },
      {
        id: 'sec-arch',
        title: 'Интеграции и существующий ИТ-ландшафт',
        description: 'Системы обмена, мастер-данные, протоколы и устройства',
      },
      {
        id: 'sec-nfr',
        title: 'Инфраструктура, нагрузка и безопасность',
        description: 'Контур размещения, автономность работы, SLA и требования ИБ',
      },
      {
        id: 'sec-scope',
        title: 'Границы MVP и исходные материалы',
        description: 'Приоритизация первого этапа и прикрепление примеров документов/схем',
      },
    ];

    const questions: BriefQuestion[] = [
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-hypo',
        type: 'like_or_not',
        title: `Отметьте, какие из этих ситуаций сейчас характерны для процессов в ${intake.companyName}`,
        subtitle:
          'Достаточно кликнуть «В точку», «Частично» или «Не про нас» — это сразу задаст верный фокус архитектуры.',
        architectureImpact:
          'Определяет источники первичных событий, необходимость ухода от ручного Excel-сведения и критичность real-time контура.',
        statements: [
          {
            id: 'h1',
            text: isManufacturing
              ? 'Оперативные данные с участков и смен попадают в учётную систему с задержкой и ручными правками'
              : 'Часть ключевых операций ведётся в разрозненных Excel-таблицах, мессенджерах или разных базах с дублированием ввода',
            context: 'Влияет на проектирование единого источника правды (Single Source of Truth)',
          },
          {
            id: 'h2',
            text: 'При нестандартных ситуациях (срочный заказ, сбой, замена ресурса) перестроение процесса происходит вручную «на телефоне»',
            context: 'Определяет гибкость движка правил и статусной модели (Workflow / State Machine)',
          },
          {
            id: 'h3',
            text: isLogistics || isManufacturing
              ? 'Сотрудники «в полях» (в цехе, на складе или выезде) сталкиваются с нестабильной связью или неудобным мобильным вводом'
              : 'Согласования и передача задач между подразделениями теряют прозрачность на стыках ролей',
            context: 'Влияет на Offline-режим, мобильный/терминальный UX и систему SLA-эскалаций',
          },
          {
            id: 'h4',
            text: 'Руководству не хватает сквозной картины в реальном времени без ручной сборки отчётов аналитиками',
            context: 'Задаёт архитектуру аналитической витрины (OLAP / стриминг метрик)',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-hypo',
        type: 'spectrum',
        title: 'Что ближе вашей стратегии запуска первого релиза?',
        subtitle: 'Передвиньте ползунок между скоростью старта и глубиной охвата.',
        architectureImpact:
          'Выбор между компактным модульным ядром под быстрый пилот и распределённой платформой высокой готовности.',
        spectrum: {
          leftTitle: 'Быстрый боевой MVP за 2–3 месяца',
          leftDescription:
            'Закрыть самую острую боль на пилотном участке/процессе и масштабировать итерациями',
          rightTitle: 'Комплексная целевая система сразу',
          rightDescription:
            'Полная замена старого контура со всеми интеграциями и сложной ролевой моделью с 1-го релиза',
        },
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-hypo',
        type: 'spectrum',
        title: 'Баланс между жёстким регламентом и гибкостью ручных решений',
        subtitle: 'Как система должна вести себя при отклонениях от стандартного процесса?',
        architectureImpact:
          'Определяет жёсткость валидаций в доменном ядре и наличие конструктора маршрутов / прав на переопределение (override).',
        spectrum: {
          leftTitle: 'Жёсткий цифровой конвейер («шаг влево запрещён»)',
          leftDescription:
            'Система блокирует любые операции без полного комплекта данных и допусков',
          rightTitle: 'Адаптивный инструмент с правом ручной корректировки',
          rightDescription:
            'Ответственные роли могут проводить нестандартные кейсы с фиксацией причины в аудит-логе',
        },
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-arch',
        type: 'multi_choice',
        title: 'С какими системами и контурами необходимо интегрировать новое решение?',
        subtitle:
          'Отметьте всё актуальное или добавьте свои внутренние системы кнопкой ниже.',
        architectureImpact:
          'Определяет состав коннекторов, брокер сообщений (RabbitMQ/Kafka), формат обмена (REST, gRPC, OData, OPC UA) и мастер-систему для справочников.',
        allowCustomOption: true,
        options: [
          {
            id: 'int-1c',
            label: 'Контур 1С (1С:ERP, 1С:КА, 1С:УТ, 1С:ЗУП, 1С:Бухгалтерия)',
            description: 'Справочники НСИ, заказы, остатки, проводки, кадры',
          },
          {
            id: 'int-crm',
            label: 'CRM / Портал / ЭДО (Битрикс24, Диадок, СБИС, личный кабинет)',
            description: 'Клиентские заявки, договоры, статусы и электронные документы',
          },
          {
            id: 'int-hw',
            label: isManufacturing
              ? 'Промышленное оборудование, ПЛК, SCADA, ЧПУ, датчики (OPC UA / Modbus)'
              : 'ТСД, сканеры штрихкодов/QR, RFID, весовое или кассовое оборудование',
            description: 'Прямой аппаратный обмен и телеметрия без ручного ввода',
          },
          {
            id: 'int-sso',
            label: 'Корпоративный каталог и SSO (Active Directory / LDAP / Keycloak / ALD Pro)',
            description: 'Единый вход сотрудников и централизованный отзыв доступов',
          },
          {
            id: 'int-gov',
            label: 'Гос. системы и маркировка (Честный ЗНАК, ЕГАИС, Меркурий, ЭТрН)',
            description: 'Регуляторная отчётность и коды прослеживаемости',
          },
          {
            id: 'int-notify',
            label: 'Каналы оперативных уведомлений (Telegram-бот, корпоративный мессенджер, Email, SMS)',
            description: 'Мгновенные оповещения об инцидентах, задачах и просрочках SLA',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-arch',
        type: 'single_choice',
        title: 'Где сейчас живут основные справочники (номенклатура, контрагенты, структура подразделений) и в каком они состоянии?',
        architectureImpact:
          'Критично для выбора стратегии Master Data Management (MDM), очистки дублей и направления синхронизации.',
        options: [
          {
            id: 'mdm-1c',
            label: 'В 1С / ERP есть выверенные справочники — они останутся мастер-системой',
            description: 'Новая система получает НСИ из учётного ядра по расписанию или событиям',
          },
          {
            id: 'mdm-dirty',
            label: 'Данные распределены по нескольким базам и Excel, есть дубли и разночтения',
            description: 'Потребуется модуль нормализации, миграции и единого ведения НСИ',
          },
          {
            id: 'mdm-new',
            label: 'Планируем сделать новую платформу главной точкой ведения оперативных справочников',
            description: 'Новая система управляет мастер-данными и выгружает их в смежные контуры',
          },
        ],
        allowFiles: true,
        filePrompt: 'Если удобно, приложите пример выгрузки справочника или схему обмена',
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-arch',
        type: 'multi_choice',
        title: 'С каких устройств сотрудники будут работать в системе ежедневно?',
        architectureImpact:
          'Определяет адаптивность UI, необходимость нативного мобильного приложения / PWA с офлайн-кэшем или терминального сенсорного режима (Kiosk UI).',
        allowCustomOption: true,
        options: [
          {
            id: 'dev-desktop',
            label: 'Офисные ПК и ноутбуки (широкоформатный веб-интерфейс)',
          },
          {
            id: 'dev-tablet',
            label: 'Планшеты и смартфоны руководителей / выездных и цеховых сотрудников',
          },
          {
            id: 'dev-terminal',
            label: 'Сенсорные промышленные терминалы / киоски / ТСД с крупными кнопками',
          },
          {
            id: 'dev-tv',
            label: 'Большие экраны / видеостены мониторинга и диспетчеризации',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-nfr',
        type: 'single_choice',
        title: 'Целевой контур развёртывания и требования информационной безопасности',
        architectureImpact:
          'Напрямую задаёт инфраструктурную архитектуру, выбор СУБД/ОС (вкл. импортонезависимый стек) и CI/CD контур поставки.',
        options: [
          {
            id: 'inf-onprem-airgap',
            label: 'Закрытый внутренний контур (On-Premise) без прямого доступа в Интернет',
            description: 'Развёртывание на ваших серверах, автономные Docker-образы',
          },
          {
            id: 'inf-onprem',
            label: 'Ваши серверы / частное облако с защищённым доступом по VPN',
            description: 'Полный контроль данных внутри периметра компании',
          },
          {
            id: 'inf-cloud',
            label: 'Аттестованное российское облако (Yandex Cloud / Selectel / Cloud.ru, 152-ФЗ)',
            description: 'Минимальные затраты на собственное железо и быстрый старт',
          },
          {
            id: 'inf-undecided',
            label: 'Ждём рекомендации от архитекторов МСДИС с расчётом стоимости владения (TCO)',
            description: 'Сравним облачный и серверный варианты на предпроекте',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-nfr',
        type: 'scale_chips',
        title: 'Ориентировочный масштаб пользователей и режим непрерывности (SLA)',
        architectureImpact:
          'Определяет необходимость кластеризации БД, репликации без простоя (Zero-downtime deploy) и резервирования узлов.',
        options: [
          {
            id: 'sla-1',
            label: 'До 50 пользователей · Режим 8/5',
            description: 'Достаточно одного отказоустойчивого серверного узла с авто-бэкапами',
          },
          {
            id: 'sla-2',
            label: '50 – 300 пользователей · Сменный режим 12/7 или 24/7',
            description: 'Горизонтальное масштабирование сервисов и горячий резерв БД',
          },
          {
            id: 'sla-3',
            label: '300 – 2 000+ пользователей / высокая частота транзакций 24/7',
            description: 'Распределённый кластер высокой доступности (HA, SLA 99.9%+)',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-nfr',
        type: 'multi_choice',
        title: 'Есть ли специальные регуляторные или корпоративные ограничения к стеку?',
        architectureImpact:
          'Исключает несовместимые зарубежные библиотеки/сервисы уже на старте проектирования.',
        allowCustomOption: true,
        options: [
          {
            id: 'reg-reestr',
            label: 'Ориентация на стек, совместимый с Реестром российского ПО Минцифры',
          },
          {
            id: 'reg-os',
            label: 'Работа на российских ОС и СУБД (Astra Linux, РЕД ОС, Альт, Postgres Pro)',
          },
          {
            id: 'reg-152',
            label: 'Обработка персональных данных по 152-ФЗ / коммерческой тайны / КИИ (187-ФЗ)',
          },
          {
            id: 'reg-inhouse',
            label: 'У вас есть внутренняя ИТ-команда, которой важно в будущем развивать код на знакомом стеке',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-scope',
        type: 'priority_matrix',
        title: 'Распределите блоки функциональности по этапам внедрения',
        subtitle:
          'Отметьте, без чего нельзя запускать 1-ю очередь (MVP), а что разумно вынести во 2-й этап.',
        architectureImpact:
          'Позволяет спроектировать чистое расширяемое ядро и не раздувать сроки первого боевого запуска.',
        buckets: [
          { id: 'mvp', label: 'Обязательно в MVP (1 этап)', tone: 'primary' },
          { id: 'phase2', label: 'Во 2-й этап развития', tone: 'secondary' },
          { id: 'skip', label: 'Не требуется', tone: 'muted' },
        ],
        items: [
          {
            id: 'p-core',
            label: 'Операционное ядро процесса, статусы, роли и рабочие места сотрудников',
          },
          {
            id: 'p-sync',
            label: 'Автоматическая интеграция с основной учётной системой (1С / ERP)',
          },
          {
            id: 'p-mobile',
            label: 'Мобильный / терминальный интерфейс для работы «в полях» / цехе / на складе',
          },
          {
            id: 'p-analytics',
            label: 'Управленческие дашборды, план-факт аналитика и контроль узких мест',
          },
          {
            id: 'p-ai',
            label: 'Интеллектуальные подсказки, автопроверка аномалий или прогнозирование (AI/ML)',
          },
        ],
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-scope',
        type: 'file_upload',
        title: 'Прикрепите любые имеющиеся материалы, схемы, шаблоны Excel или наброски ТЗ',
        subtitle:
          'Даже черновая таблица, фото бланка или схема «от руки» сэкономят часы встреч и помогут архитекторам МСДИС дать точную оценку.',
        architectureImpact:
          'Даёт точную фактуру сущностей БД, бизнес-правил, расчётных формул и выходных форм.',
        allowFiles: true,
        filePrompt:
          'Перетащите сюда файлы (PDF, DOCX, XLSX, PNG/JPG, архивы схем) — можно несколько файлов',
      },
      {
        id: `q-${nanoid(5)}`,
        sectionId: 'sec-scope',
        type: 'long_text',
        title: 'Есть ли ключевые даты, внешние события или особые пожелания, о которых нам важно знать на берегу?',
        subtitle: 'Свободное поле — можно ответить в пару строк или пропустить.',
        architectureImpact:
          'Влияет на дорожную карту релизов, выделение команды и стратегию параллельного перехода со старых процессов.',
        placeholder:
          'Например: запуск нового цеха в сентябре, плановый отказ от зарубежной лицензии до конца года, пожелания по передаче исходного кода...',
        quickHints: [
          'Привязка к сезонности или запуску новой площадки',
          'Передача полных исключительных прав и исходного кода',
          'Совместная работа с нашей внутренней ИТ-службой',
          'Нужна предварительная вилка бюджета и сроков до защиты проекта',
        ],
        allowFiles: true,
      },
    ];

    const dossier: ResearchDossier = {
      companySummary: `Предпроектный профиль для «${intake.companyName}» (направление: автоматизация ${domainLabel}). Вводный контекст проанализирован архитектурным движком МСДИС.`,
      industryInsights: [
        `Для контура автоматизации ${domainLabel} ключевым фактором успеха является отделение быстрого операционного интерфейса от тяжёлых транзакций учётного ядра.`,
        'Раннее выявление мастер-системы справочников (НСИ) снижает риски интеграции на 40–50%.',
      ],
      inferredTechLandscape: intake.knownSystems
        ? intake.knownSystems.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
        : ['Контур 1С / корпоративного учёта', 'Табличные оперативные реестры (Excel)', 'Корпоративная почта и мессенджеры'],
      regulatoryAndSecurityFactors: [
        'Размещение данных на территории РФ (152-ФЗ)',
        'Возможность контейнеризированной поставки в контур заказчика (Docker)',
      ],
      keyArchitecturalHypotheses: [
        'Запуск модульного ядра на пилотном контуре с асинхронной шиной обмена позволит получить бизнес-эффект за 2.5–3.5 месяца',
      ],
      searchQueriesExecuted: searchQueries,
      sources: webSources,
      researchedAt: new Date().toISOString(),
      aiModelUsed: `${this.aiClient.getEffectiveModel()} (автономный доменный режим — укажите CLOSEROUTER_API_KEY для онлайн-генерации)`,
      usedFallbackEngine: true,
    };

    return {
      title: `Архитектурный бриф: ${intake.companyName} — автоматизация ${domainLabel}`,
      clientWelcomeNote: `Уважаемые коллеги из ${intake.companyName}! Команда архитекторов ООО «МСДИС» подготовила для вас персональный интерактивный бриф. Здесь нет обязательных вопросов — отвечайте только на то, что знаете и считаете важным, в любом удобном порядке. Все ответы и файлы сохраняются мгновенно: вы можете закрыть страницу и вернуться к ней позже или переслать ссылку профильным коллегам.`,
      estimatedMinutes: 7,
      sections,
      questions,
      researchDossier: dossier,
    };
  }
}

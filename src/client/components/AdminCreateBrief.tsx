import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  FileUp,
  Globe,
  KeyRound,
  Sparkles,
  Wand2,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import type { BriefRecord } from '../../shared/types';

interface AdminCreateBriefProps {
  configuredModel: string;
  onCancel: () => void;
  onCreated: (brief: BriefRecord) => void;
}

const PRESETS = [
  {
    label: 'Завод / MES + 1С:ERP',
    companyName: 'АО «ТехноСтальИнжиниринг»',
    companyWebsite: '',
    industry: 'Металлообработка и серийное машиностроение',
    contactName: 'Дмитрий Кравцов',
    contactRole: 'Директор по производству',
    knownSystems: '1С:ERP 2.5, 1С:ЗУП, КОМПАС-3D, сменные рапорты в Excel, 30 станков с ЧПУ',
    projectContext:
      'Клиент обратился за разработкой системы внутрицеховой диспетчеризации и оперативного учёта выработки на 3 производственных цехах. Сейчас мастера тратят по 2 часа в смену на ручное сведение таблиц, в 1С данные попадают с опозданием на сутки, нет прозрачности причин простоев и брака по партиям.',
    constraintsAndDeadlines:
      'Пилотный цех нужно запустить за 3–4 месяца. Размещение на собственных серверах предприятия (закрытый контур РФ).',
  },
  {
    label: 'Склад и логистика (WMS + ТСД)',
    companyName: 'ООО «СеверЛогистик Дистрибьюшн»',
    companyWebsite: '',
    industry: 'Оптовая дистрибуция и складская логистика 3PL',
    contactName: 'Елена Морозова',
    contactRole: 'Операционный директор',
    knownSystems: '1С:Управление торговлей 11, Битрикс24, ТСД Urovo на Android, Честный ЗНАК',
    projectContext:
      'Распределительный склад 18 000 кв.м и собственный автопарк 65 машин. Нужна кастомная система адресного хранения, волновой сборки заказов на ТСД с работой в зонах слабого Wi‑Fi, проверкой кодов маркировки Честный ЗНАК и маршрутизацией отгрузок.',
    constraintsAndDeadlines:
      'Переход должен пройти без остановки круглосуточных отгрузок 24/7 до высокого осеннего сезона.',
  },
  {
    label: 'Сервисная платформа и BPM-контур',
    companyName: 'ГК «ЭнергоСервисПроект»',
    companyWebsite: '',
    industry: 'Промышленный инжиниринг и выездное обслуживание объектов (ТОиР / FSM)',
    contactName: 'Игорь Савельев',
    contactRole: 'Руководитель департамента ИТ',
    knownSystems: '1С:КА, Active Directory, разрозненные реестры заявок в Excel и Telegram-чатах',
    projectContext:
      'Более 180 выездных инженеров обслуживают энергетическое оборудование заказчиков в 14 регионах. Требуется единая веб-платформа диспетчеризации заявок по SLA, мобильное приложение инженера с офлайн-чеклистами и фотофиксацией, а также личный кабинет корпоративного заказчика.',
    constraintsAndDeadlines:
      'Интеграция с Active Directory, соблюдение 152-ФЗ, возможность поэтапного вывода модулей.',
  },
];

const GENERATION_STEPS = [
  'Анализируем вводные данные о клиенте и известном контексте запроса...',
  'Формируем поисковые гипотезы и ищем информацию о компании и отрасли в сети Интернет...',
  'Изучаем веб-источники, ИТ-ландшафт и отраслевые архитектурные ограничения...',
  'Проектируем интерактивные вопросы без «воды» (шкалы, гипотезы, матрицы MVP, интеграции)...',
];

export const AdminCreateBrief: React.FC<AdminCreateBriefProps> = ({
  configuredModel,
  onCancel,
  onCreated,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [knownSystems, setKnownSystems] = useState('');
  const [projectContext, setProjectContext] = useState('');
  const [constraintsAndDeadlines, setConstraintsAndDeadlines] = useState('');
  const [intakeDocumentText, setIntakeDocumentText] = useState('');
  const [intakeDocName, setIntakeDocName] = useState('');
  const [depth, setDepth] = useState<'compact' | 'standard' | 'deep'>(
    'standard'
  );
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [pinCode, setPinCode] = useState('');
  const [pinHint, setPinHint] = useState('');

  const [generating, setGenerating] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) {
      setStepIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setStepIdx((prev) =>
        prev < GENERATION_STEPS.length - 1 ? prev + 1 : prev
      );
    }, 2600);
    return () => clearInterval(timer);
  }, [generating]);

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setCompanyName(p.companyName);
    setCompanyWebsite(p.companyWebsite);
    setIndustry(p.industry);
    setContactName(p.contactName);
    setContactRole(p.contactRole);
    setKnownSystems(p.knownSystems);
    setProjectContext(p.projectContext);
    setConstraintsAndDeadlines(p.constraintsAndDeadlines);
  };

  const handleIntakeFile = async (file: File) => {
    setIntakeDocName(file.name);
    const text = await file.text();
    setIntakeDocumentText(text.slice(0, 15000));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !projectContext.trim()) {
      setError('Укажите название компании и известную суть запроса.');
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const res = await adminApi.generateBrief({
        companyName,
        companyWebsite,
        industry,
        contactName,
        contactRole,
        knownSystems,
        projectContext,
        constraintsAndDeadlines,
        intakeDocumentText: intakeDocumentText || undefined,
        depth,
        enableWebSearch,
        pinCode: pinCode.trim() || undefined,
        pinHint: pinHint.trim() || undefined,
      });
      onCreated(res.brief);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ошибка при генерации брифа'
      );
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-sm space-y-6 my-8">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl brand-bg-primary text-white flex items-center justify-center shrink-0">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              ИИ МСДИС исследует контекст и собирает бриф
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Модель CloseRouter:{' '}
              <span className="font-semibold text-slate-700">
                {configuredModel}
              </span>{' '}
              · Клиент: {companyName}
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {GENERATION_STEPS.map((label, idx) => {
            const done = idx < stepIdx;
            const active = idx === stepIdx;
            return (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-sm transition-all ${
                  active
                    ? 'brand-soft-tint brand-border-primary font-semibold text-slate-900'
                    : done
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : 'bg-slate-50 border-slate-200/70 text-slate-400'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : active ? (
                  <Loader2 className="w-4 h-4 brand-text-primary animate-spin shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                )}
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />К списку брифов
        </button>

        <div className="text-xs text-slate-500">
          Активная ИИ-модель:{' '}
          <span className="font-semibold text-slate-800">{configuredModel}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold brand-soft-tint brand-text-primary mb-2">
            <Wand2 className="w-3.5 h-3.5" />
            Предпроектный генератор вопросов МСДИС
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Вводные данные о клиенте и его задаче
          </h1>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            Запишите всё, что уже известно после первого касания или звонка. ИИ
            дополнительно изучит компанию и отрасль в сети, чтобы не спрашивать
            банальностей и сгенерировать точные архитектурные вопросы.
          </p>

          {/* Quick Demo Templates */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">
              Быстрые шаблоны для теста:
            </span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Название компании / заказчика *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Например: АО «Завод Точного Машиностроения»"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Сайт клиента (ИИ просканирует страницы компании)
              </label>
              <input
                type="text"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://client-company.ru (или оставьте пустым — ИИ поищет сам)"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Отрасль / специфика бизнеса или производства
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Пищевое производство, машиностроение, логистика, стройка..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Известные текущие системы и оборудование
              </label>
              <input
                type="text"
                value={knownSystems}
                onChange={(e) => setKnownSystems(e.target.value)}
                placeholder="1С:ERP, Битрикс24, Excel, SCADA, ТСД, SAP..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Контактное лицо со стороны клиента
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Имя Отчество"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Роль / должность контакта
              </label>
              <input
                type="text"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                placeholder="ИТ-директор, Директор по производству, Главный инженер..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Всё, что известно о запросе, болях и задаче клиента *
            </label>
            <textarea
              rows={5}
              required
              value={projectContext}
              onChange={(e) => setProjectContext(e.target.value)}
              placeholder="Опишите своими словами заметки со звонка или переписки: что хотят автоматизировать, где сейчас узкие места, какие процессы буксуют, что уже обсуждали..."
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Известные ограничения, контур ИБ, ориентиры по срокам
              </label>
              <input
                type="text"
                value={constraintsAndDeadlines}
                onChange={(e) => setConstraintsAndDeadlines(e.target.value)}
                placeholder="Например: закрытый контур без интернета, пилот к ноябрю..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Вводный текстовый документ / заметки (.txt, .md, .csv, .json)
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 px-3.5 py-2.5 text-xs font-medium text-slate-600 cursor-pointer bg-slate-50/50">
                <FileUp className="w-4 h-4 brand-text-primary shrink-0" />
                <span className="truncate">
                  {intakeDocName
                    ? `Загружено: ${intakeDocName} (${intakeDocumentText.length} симв.)`
                    : 'Прикрепить текстовую расшифровку звонка / черновик'}
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.csv,.json,.xml,.log"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleIntakeFile(f);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Generation Options & Security */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            {/* Web Search Toggle */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60 flex items-start gap-3">
              <input
                id="toggle-web-search"
                type="checkbox"
                checked={enableWebSearch}
                onChange={(e) => setEnableWebSearch(e.target.checked)}
                className="mt-1 w-4 h-4 accent-blue-600 cursor-pointer"
              />
              <label
                htmlFor="toggle-web-search"
                className="cursor-pointer space-y-0.5"
              >
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 brand-text-primary" />
                  Поиск в сети Интернет (ИИ)
                </div>
                <div className="text-[11px] text-slate-500 leading-snug">
                  ИИ изучит сайт клиента, отраслевые стандарты и ИТ-контур для
                  повышения точности брифа
                </div>
              </label>
            </div>

            {/* Depth Selector */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60 space-y-1.5">
              <div className="text-xs font-bold text-slate-900">
                Глубина проработки брифа
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'compact', label: '8–10 вопр.' },
                  { id: 'standard', label: '12–15 вопр.' },
                  { id: 'deep', label: '16–20 вопр.' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDepth(opt.id as 'compact' | 'standard' | 'deep')
                    }
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      depth === opt.id
                        ? 'brand-bg-primary text-white'
                        : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional PIN */}
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60 space-y-2">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 brand-text-primary" />
                PIN-код поверх ссылки (опц.)
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder="Без PIN (только ссылка)"
                  className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  value={pinHint}
                  onChange={(e) => setPinHint(e.target.value)}
                  placeholder="Подсказка (опц.)"
                  className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold shadow-sm hover:opacity-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Исследовать в сети и сформировать бриф
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

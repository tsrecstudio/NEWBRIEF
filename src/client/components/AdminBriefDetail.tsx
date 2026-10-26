import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Globe,
  KeyRound,
  Lock,
  Unlock,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Loader2,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import {
  buildPublicBriefUrl,
  copyTextToClipboard,
  formatBytes,
  formatDateTimeRu,
  isQuestionAnsweredClient,
} from '../lib/utils';
import type { BriefQuestion, BriefRecord } from '../../shared/types';

interface AdminBriefDetailProps {
  briefId: string;
  onBack: () => void;
}

export const AdminBriefDetail: React.FC<AdminBriefDetailProps> = ({
  briefId,
  onBack,
}) => {
  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'answers' | 'blueprint' | 'research' | 'manage'
  >('answers');
  const [onlyAnswered, setOnlyAnswered] = useState(false);

  const [copiedType, setCopiedType] = useState<'url' | 'invite' | null>(null);
  const [blueprintLoading, setBlueprintLoading] = useState(false);

  // Manage tab state
  const [extraTopic, setExtraTopic] = useState('');
  const [addingAiQuestions, setAddingAiQuestions] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualImpact, setManualImpact] = useState('');
  const [manualType, setManualType] =
    useState<BriefQuestion['type']>('long_text');
  const [manualAllowFiles, setManualAllowFiles] = useState(true);

  const [pinDraft, setPinDraft] = useState('');
  const [pinHintDraft, setPinHintDraft] = useState('');
  const [savingAccess, setSavingAccess] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getBrief(briefId);
      setBrief(res.brief);
      setPublicBaseUrl(res.publicBaseUrl);
      setPinDraft(res.brief.pinCodePlainForAdmin || '');
      setPinHintDraft(res.brief.pinHint || '');
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading || !brief) {
    return (
      <div className="py-16 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin brand-text-primary mx-auto" />
        <div className="text-sm text-slate-500">Загружаем данные брифа...</div>
      </div>
    );
  }

  const clientUrl = buildPublicBriefUrl(brief.accessToken, publicBaseUrl);
  const answeredCount = brief.questions.filter((q) =>
    isQuestionAnsweredClient(
      q,
      brief.answers[q.id],
      brief.attachments.filter((a) => a.questionId === q.id)
    )
  ).length;

  const copyInviteMessage = async () => {
    const pinLine =
      brief.hasPin && brief.pinCodePlainForAdmin
        ? `\nКод доступа (PIN): ${brief.pinCodePlainForAdmin}`
        : '';
    const msg = `Здравствуйте! Команда ООО «МСДИС» подготовила для ${brief.intake.companyName} персональный интерактивный архитектурный бриф:\n${clientUrl}${pinLine}\n\nОбязательных вопросов нет — можно отвечать в любом порядке, прикреплять схемы/таблицы и возвращаться к заполнению в удобное время (все ответы сохраняются автоматически).`;
    if (await copyTextToClipboard(msg)) {
      setCopiedType('invite');
      setTimeout(() => setCopiedType(null), 2400);
    }
  };

  const copyRawUrl = async () => {
    if (await copyTextToClipboard(clientUrl)) {
      setCopiedType('url');
      setTimeout(() => setCopiedType(null), 2200);
    }
  };

  const handleGenerateBlueprint = async () => {
    setBlueprintLoading(true);
    try {
      const res = await adminApi.generateBlueprint(brief.id);
      setBrief(res.brief);
      setActiveTab('blueprint');
    } finally {
      setBlueprintLoading(false);
    }
  };

  const handleAddAiQuestions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraTopic.trim()) return;
    setAddingAiQuestions(true);
    try {
      const res = await adminApi.generateMoreQuestions(
        brief.id,
        extraTopic.trim()
      );
      setBrief(res.brief);
      setExtraTopic('');
    } finally {
      setAddingAiQuestions(false);
    }
  };

  const handleAddManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    const secId = brief.sections[brief.sections.length - 1]?.id || 'sec-custom';
    const newQ: BriefQuestion = {
      id: `q-custom-${Date.now()}`,
      sectionId: secId,
      type: manualType,
      title: manualTitle.trim(),
      architectureImpact:
        manualImpact.trim() ||
        'Уточняет требования к архитектуре, данным и интеграциям',
      allowFiles: manualAllowFiles || manualType === 'file_upload',
      ...(manualType === 'spectrum'
        ? {
            spectrum: {
              leftTitle: 'Базовый стандартный сценарий',
              rightTitle: 'Глубокая кастомизация процесса',
            },
          }
        : {}),
    };
    const res = await adminApi.updateBrief(brief.id, {
      questions: [...brief.questions, newQ],
    });
    setBrief(res.brief);
    setManualTitle('');
    setManualImpact('');
  };

  const handleDeleteQuestion = async (qId: string) => {
    const next = brief.questions.filter((q) => q.id !== qId);
    const res = await adminApi.updateBrief(brief.id, { questions: next });
    setBrief(res.brief);
  };

  const handleMoveQuestion = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= brief.questions.length) return;
    const copy = [...brief.questions];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    const res = await adminApi.updateBrief(brief.id, { questions: copy });
    setBrief(res.brief);
  };

  const handleSavePinSettings = async () => {
    setSavingAccess(true);
    try {
      const res = await adminApi.updateBrief(brief.id, {
        pinCode: pinDraft.trim() || null,
        pinHint: pinHintDraft.trim() || null,
      });
      setBrief(res.brief);
    } finally {
      setSavingAccess(false);
    }
  };

  const handleToggleLock = async () => {
    const nextStatus = brief.status === 'locked' ? 'in_progress' : 'locked';
    const res = await adminApi.updateBrief(brief.id, { status: nextStatus });
    setBrief(res.brief);
  };

  const handleRegenerateLink = async () => {
    if (
      !window.confirm(
        'Выпустить новую секретную ссылку? Старая ссылка перестанет открываться у клиента.'
      )
    ) {
      return;
    }
    const res = await adminApi.updateBrief(brief.id, { regenerateToken: true });
    setBrief(res.brief);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />К списку всех брифов
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchDetail}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Обновить ответы
          </button>

          <a
            href={`/api/admin/briefs/${encodeURIComponent(brief.id)}/export-md`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            Скачать .MD
          </a>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Печать / PDF
          </button>
        </div>
      </div>

      {/* Header Summary Card + Share Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold brand-text-primary brand-soft-tint px-2.5 py-0.5 rounded-full">
                {brief.intake.companyName}
              </span>
              {brief.intake.industry && (
                <span className="text-slate-500">· {brief.intake.industry}</span>
              )}
              <span className="text-slate-400">
                · Отвечено {answeredCount} из {brief.questions.length} · Файлов:{' '}
                {brief.attachments.length}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              {brief.title}
            </h1>
            {(brief.respondentName || brief.respondentRole) && (
              <div className="text-xs text-slate-600">
                Респондент со стороны клиента:{' '}
                <span className="font-semibold text-slate-900">
                  {[
                    brief.respondentName,
                    brief.respondentRole,
                    brief.respondentContact,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={blueprintLoading}
            onClick={handleGenerateBlueprint}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl brand-bg-primary text-white text-xs font-semibold shadow-xs hover:opacity-95 disabled:opacity-60 shrink-0 cursor-pointer no-print"
          >
            {blueprintLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {brief.architectureBlueprint
              ? 'Пересобрать ИИ-архитектуру'
              : 'Сформировать архитектурное резюме (ИИ)'}
          </button>
        </div>

        {/* Client Link Box */}
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 no-print">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Персональная защищённая ссылка для клиента
              {brief.hasPin && brief.pinCodePlainForAdmin
                ? ` · PIN: ${brief.pinCodePlainForAdmin}`
                : ' (доступ только по секретному токену)'}
            </div>
            <div className="text-xs sm:text-sm font-mono text-slate-800 truncate mt-0.5">
              {clientUrl}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyRawUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 cursor-pointer"
            >
              {copiedType === 'url' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Ссылка скопирована
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Копировать URL
                </>
              )}
            </button>

            <button
              type="button"
              onClick={copyInviteMessage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg brand-soft-tint brand-text-primary border brand-soft-border text-xs font-semibold cursor-pointer"
            >
              {copiedType === 'invite' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Текст приглашения скопирован
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Приглашение для Telegram/Почты
                </>
              )}
            </button>

            <a
              href={clientUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-blue-600"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Открыть
            </a>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 no-print">
        {[
          {
            id: 'answers',
            label: `Ответы и файлы (${answeredCount}/${brief.questions.length})`,
          },
          {
            id: 'blueprint',
            label: 'Архитектурное резюме ИИ (Presale)',
          },
          {
            id: 'research',
            label: 'ИИ-досье из сети и вводные',
          },
          {
            id: 'manage',
            label: 'Конструктор вопросов и Доступ',
          },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              setActiveTab(
                t.id as 'answers' | 'blueprint' | 'research' | 'manage'
              )
            }
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === t.id
                ? 'brand-bg-primary text-white shadow-2xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ================================================================= */}
      {/* TAB 1: CLIENT ANSWERS & ATTACHMENTS                               */}
      {/* ================================================================= */}
      {activeTab === 'answers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between no-print">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAnswered}
                onChange={(e) => setOnlyAnswered(e.target.checked)}
                className="accent-blue-600"
              />
              Показывать только заполненные клиентом вопросы
            </label>
          </div>

          {brief.attachments.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Paperclip className="w-4 h-4 brand-text-primary" />
                Все прикреплённые клиентом файлы ({brief.attachments.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {brief.attachments.map((att) => (
                  <a
                    key={att.id}
                    href={`/api/admin/briefs/${encodeURIComponent(brief.id)}/files/${encodeURIComponent(att.id)}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 px-3.5 py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 brand-text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {att.originalName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatBytes(att.sizeBytes)} ·{' '}
                          {formatDateTimeRu(att.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-slate-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {brief.sections.map((sec) => {
            const secQs = brief.questions.filter((q) => {
              if (q.sectionId !== sec.id) return false;
              if (!onlyAnswered) return true;
              return isQuestionAnsweredClient(
                q,
                brief.answers[q.id],
                brief.attachments.filter((a) => a.questionId === q.id)
              );
            });
            if (secQs.length === 0) return null;

            return (
              <div key={sec.id} className="space-y-3">
                <h2 className="text-base font-extrabold text-slate-900 border-b border-slate-200 pb-1.5">
                  {sec.title}
                </h2>

                <div className="space-y-3">
                  {secQs.map((q) => {
                    const ans = brief.answers[q.id];
                    const files = brief.attachments.filter(
                      (a) => a.questionId === q.id
                    );
                    const hasVal = isQuestionAnsweredClient(q, ans, files);

                    return (
                      <div
                        key={q.id}
                        className={`rounded-2xl border p-5 bg-white ${
                          hasVal
                            ? 'border-slate-200/90'
                            : 'border-slate-200/50 opacity-70'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900">
                            {q.title}
                          </h3>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                              hasVal
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {hasVal ? 'Отвечено' : 'Пропущено'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 brand-text-primary shrink-0" />
                          {q.architectureImpact}
                        </div>

                        {hasVal && (
                          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-2 text-sm">
                            {ans?.selectedOptionId && q.options && (
                              <div>
                                <span className="font-semibold text-slate-700">
                                  Выбрано:{' '}
                                </span>
                                <span className="font-bold brand-text-primary">
                                  {q.options.find(
                                    (o) => o.id === ans.selectedOptionId
                                  )?.label || ans.selectedOptionId}
                                </span>
                              </div>
                            )}

                            {ans?.selectedOptionIds &&
                              ans.selectedOptionIds.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {ans.selectedOptionIds.map((oid) => (
                                    <span
                                      key={oid}
                                      className="px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-xs font-semibold text-slate-800"
                                    >
                                      ✓{' '}
                                      {q.options?.find((o) => o.id === oid)
                                        ?.label || oid}
                                    </span>
                                  ))}
                                </div>
                              )}

                            {ans?.customOptions &&
                              ans.customOptions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {ans.customOptions.map((c) => (
                                    <span
                                      key={c}
                                      className="px-2.5 py-1 rounded-lg brand-soft-tint brand-text-primary text-xs font-semibold"
                                    >
                                      + Свой вариант: {c}
                                    </span>
                                  ))}
                                </div>
                              )}

                            {typeof ans?.spectrumValue === 'number' &&
                              q.spectrum && (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs text-slate-500">
                                    <span>{q.spectrum.leftTitle}</span>
                                    <span>{q.spectrum.rightTitle}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <div
                                        key={n}
                                        className={`h-2.5 flex-1 rounded-full ${
                                          ans.spectrumValue === n
                                            ? 'brand-bg-primary'
                                            : 'bg-slate-200'
                                        }`}
                                      />
                                    ))}
                                    <span className="text-xs font-bold brand-text-primary ml-1">
                                      {ans.spectrumValue}/5
                                    </span>
                                  </div>
                                </div>
                              )}

                            {ans?.statementVotes && q.statements && (
                              <div className="space-y-1.5">
                                {q.statements.map((st) => {
                                  const v = ans.statementVotes?.[st.id];
                                  if (!v) return null;
                                  return (
                                    <div
                                      key={st.id}
                                      className="flex items-start gap-2 text-xs"
                                    >
                                      <span
                                        className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                                          v === 'yes'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : v === 'partial'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-slate-200 text-slate-700'
                                        }`}
                                      >
                                        {v === 'yes'
                                          ? 'В точку'
                                          : v === 'partial'
                                            ? 'Отчасти'
                                            : 'Нет'}
                                      </span>
                                      <span className="text-slate-800">
                                        {st.text}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {ans?.bucketAssignments && q.items && q.buckets && (
                              <div className="space-y-1.5">
                                {q.buckets.map((b) => {
                                  const assigned = q.items!.filter(
                                    (it) =>
                                      ans.bucketAssignments?.[it.id] === b.id
                                  );
                                  if (assigned.length === 0) return null;
                                  return (
                                    <div key={b.id} className="text-xs">
                                      <span className="font-bold text-slate-900">
                                        {b.label}:{' '}
                                      </span>
                                      <span className="text-slate-700">
                                        {assigned
                                          .map((a) => a.label)
                                          .join(' · ')}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {ans?.text && (
                              <div className="text-sm text-slate-900 whitespace-pre-wrap">
                                {ans.text}
                              </div>
                            )}

                            {ans?.comment && (
                              <div className="text-xs text-slate-700 italic pt-1 border-t border-slate-200/70">
                                Комментарий клиента: «{ans.comment}»
                              </div>
                            )}

                            {files.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {files.map((f) => (
                                  <a
                                    key={f.id}
                                    href={`/api/admin/briefs/${encodeURIComponent(brief.id)}/files/${encodeURIComponent(f.id)}`}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold brand-text-primary hover:underline"
                                  >
                                    <Paperclip className="w-3 h-3" />
                                    {f.originalName} ({formatBytes(f.sizeBytes)})
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 2: AI PRESALE ARCHITECTURE BLUEPRINT                          */}
      {/* ================================================================= */}
      {activeTab === 'blueprint' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
          {!brief.architectureBlueprint ? (
            <div className="text-center py-10 space-y-3">
              <Sparkles className="w-10 h-10 brand-text-primary mx-auto" />
              <h3 className="text-lg font-bold text-slate-900">
                Сформировать архитектурную концепцию (AI Presale Summary)
              </h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                ИИ проанализирует все текущие ответы клиента, веб-досье и
                прикреплённые материалы, чтобы подготовить рекомендуемую
                архитектуру, стек, карту интеграций, границы MVP и вопросы на
                звонок.
              </p>
              <button
                type="button"
                disabled={blueprintLoading}
                onClick={handleGenerateBlueprint}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold cursor-pointer"
              >
                {blueprintLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Запустить архитектурный синтез
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4 flex flex-wrap justify-between gap-2">
                <div>
                  <div className="text-xs font-bold brand-text-primary uppercase tracking-wider">
                    Предпроектное архитектурное резюме МСДИС
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Сформировано: {formatDateTimeRu(brief.architectureBlueprint.generatedAt)} · Модель:{' '}
                    {brief.architectureBlueprint.modelUsed}
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold brand-soft-tint brand-text-primary">
                  {brief.architectureBlueprint.estimatedComplexity}
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-extrabold text-slate-900">
                  Резюме решения
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {brief.architectureBlueprint.executiveSummary}
                </p>
              </div>

              <div className="space-y-2 rounded-xl bg-slate-50 border border-slate-200/80 p-4">
                <h4 className="text-sm font-extrabold text-slate-900">
                  Рекомендуемая архитектура
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {brief.architectureBlueprint.recommendedArchitecture}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Предлагаемый технологический стек
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                    {brief.architectureBlueprint.suggestedTechStack.map(
                      (s, i) => (
                        <li key={i}>{s}</li>
                      )
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Карта интеграций
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                    {brief.architectureBlueprint.integrationMap.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                  <h4 className="text-sm font-extrabold text-emerald-950">
                    Состав 1-го запуска (MVP)
                  </h4>
                  <ul className="space-y-1.5 text-xs text-emerald-900 list-disc pl-4">
                    {brief.architectureBlueprint.mvpScope.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Этап 2 (Масштабирование и развитие)
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                    {brief.architectureBlueprint.phaseTwoScope.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {brief.architectureBlueprint.risksAndMitigations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Архитектурные риски и меры снижения
                  </h4>
                  <div className="space-y-2">
                    {brief.architectureBlueprint.risksAndMitigations.map(
                      (rm, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-3.5 text-xs space-y-1"
                        >
                          <div className="font-bold text-slate-900">
                            Риск: {rm.risk}
                          </div>
                          <div className="text-slate-700">
                            Решение: {rm.mitigation}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {brief.architectureBlueprint.openQuestionsForCall.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    Точечные вопросы на технический созвон с клиентом
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-700 list-decimal pl-5">
                    {brief.architectureBlueprint.openQuestionsForCall.map(
                      (q, i) => (
                        <li key={i}>{q}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 3: WEB RESEARCH DOSSIER & ORIGINAL INTAKE                     */}
      {/* ================================================================= */}
      {activeTab === 'research' && (
        <div className="space-y-5">
          {brief.researchDossier && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 brand-text-primary" />
                  <h3 className="text-base font-extrabold text-slate-900">
                    ИИ-досье предпроектного веб-исследования
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  Модель: {brief.researchDossier.aiModelUsed}
                </span>
              </div>

              <p className="text-sm text-slate-800 leading-relaxed">
                {brief.researchDossier.companySummary}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {brief.researchDossier.industryInsights.length > 0 && (
                  <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                    <div className="text-xs font-bold uppercase text-slate-500">
                      Отраслевая специфика
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                      {brief.researchDossier.industryInsights.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {brief.researchDossier.inferredTechLandscape.length > 0 && (
                  <div className="rounded-xl bg-slate-50 p-4 space-y-2">
                    <div className="text-xs font-bold uppercase text-slate-500">
                      Вероятный ИТ-ландшафт и интеграции
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                      {brief.researchDossier.inferredTechLandscape.map(
                        (x, i) => (
                          <li key={i}>{x}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {brief.researchDossier.searchQueriesExecuted.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-2">
                    Выполненные поисковые запросы в сети:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.researchDossier.searchQueriesExecuted.map((q, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700"
                      >
                        🔍 {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {brief.researchDossier.sources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-500">
                    Найденные и изученные веб-источники:
                  </div>
                  <div className="space-y-2">
                    {brief.researchDossier.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-xl border border-slate-200 hover:border-blue-300 p-3 transition-colors"
                      >
                        <div className="text-xs font-bold brand-text-primary flex items-center gap-1.5">
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {src.title}
                        </div>
                        <div className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {src.snippet}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Original Admin Intake */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              Исходные вводные от менеджера / архитектора МСДИС
            </h3>
            <div className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-4 border border-slate-200/70">
              {brief.intake.projectContext}
            </div>
            {brief.intake.constraintsAndDeadlines && (
              <div className="text-xs text-slate-600">
                <span className="font-bold">Ограничения и сроки: </span>
                {brief.intake.constraintsAndDeadlines}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB 4: QUESTION CONSTRUCTOR & ACCESS SECURITY                     */}
      {/* ================================================================= */}
      {activeTab === 'manage' && (
        <div className="space-y-6">
          {/* Access & Security Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 brand-text-primary" />
              Права доступа и защита ссылки
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  PIN-код для клиента (оставьте пустым для доступа только по ссылке)
                </label>
                <input
                  type="text"
                  value={pinDraft}
                  onChange={(e) => setPinDraft(e.target.value)}
                  placeholder="Например: 4820"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Подсказка к PIN-коду (опционально)
                </label>
                <input
                  type="text"
                  value={pinHintDraft}
                  onChange={(e) => setPinHintDraft(e.target.value)}
                  placeholder="Последние 4 цифры телефона..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={savingAccess}
                onClick={handleSavePinSettings}
                className="px-4 py-2 rounded-xl brand-bg-primary text-white text-xs font-semibold h-10 cursor-pointer"
              >
                {savingAccess ? 'Сохраняем...' : 'Сохранить настройки PIN'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleToggleLock}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {brief.status === 'locked' ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                    Разблокировать редактирование клиентом
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    Зафиксировать ответы (режим чтения)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleRegenerateLink}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Перевыпустить секретную ссылку (отозвать старую)
              </button>
            </div>
          </div>

          {/* AI Add Extra Questions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 brand-text-primary" />
              Догенерировать вопросы через ИИ по узкой теме
            </h3>
            <form
              onSubmit={handleAddAiQuestions}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                value={extraTopic}
                onChange={(e) => setExtraTopic(e.target.value)}
                placeholder="Например: Миграция исторических справочников из 1С:УПП и работа ТСД офлайн"
                className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={addingAiQuestions || !extraTopic.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl brand-bg-primary text-white text-xs font-semibold disabled:opacity-50 cursor-pointer shrink-0"
              >
                {addingAiQuestions ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Добавить вопросы с ИИ
              </button>
            </form>
          </div>

          {/* Manual Question Adder */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              Добавить свой вопрос вручную
            </h3>
            <form onSubmit={handleAddManualQuestion} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Текст вопроса клиенту..."
                  className="md:col-span-2 rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
                <select
                  value={manualType}
                  onChange={(e) =>
                    setManualType(e.target.value as BriefQuestion['type'])
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="long_text">Развёрнутый текст</option>
                  <option value="short_text">Короткий ответ</option>
                  <option value="file_upload">Запрос файлов / схем</option>
                  <option value="spectrum">Шкала дилеммы (1..5)</option>
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="text"
                  value={manualImpact}
                  onChange={(e) => setManualImpact(e.target.value)}
                  placeholder="На что влияет в архитектуре (пояснение для клиента)..."
                  className="flex-1 min-w-[240px] rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualAllowFiles}
                    onChange={(e) => setManualAllowFiles(e.target.checked)}
                    className="accent-blue-600"
                  />
                  Разрешить прикрепление файлов
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                >
                  + Добавить в бриф
                </button>
              </div>
            </form>
          </div>

          {/* Existing Questions List Editor */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="text-base font-extrabold text-slate-900">
              Список вопросов брифа ({brief.questions.length})
            </h3>
            <div className="space-y-2">
              {brief.questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 bg-slate-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {idx + 1}. {q.title}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Тип: <span className="font-mono">{q.type}</span> ·{' '}
                      {q.allowFiles ? '📎 С прикреплением файлов' : 'Опц. файлы'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveQuestion(idx, -1)}
                      disabled={idx === 0}
                      className="p-1.5 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveQuestion(idx, 1)}
                      disabled={idx === brief.questions.length - 1}
                      className="p-1.5 rounded-lg hover:bg-white text-slate-500 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

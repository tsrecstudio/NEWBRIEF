import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  Check,
  LayoutList,
  Layers,
  Lock,
  Paperclip,
  Send,
  ShieldCheck,
  SkipForward,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { publicApi } from '../lib/api';
import {
  applyBrandCssVars,
  copyTextToClipboard,
  formatDateTimeRu,
  isQuestionAnsweredClient,
} from '../lib/utils';
import { BrandLogo } from './BrandLogo';
import { QuestionRenderer } from './QuestionRenderer';
import type {
  BrandSettings,
  PublicBriefPayload,
  QuestionAnswerValue,
} from '../../shared/types';

interface ClientBriefViewProps {
  token: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'offline';

export const ClientBriefView: React.FC<ClientBriefViewProps> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [notFoundError, setNotFoundError] = useState<string | null>(null);

  // PIN gate state
  const [requiresPin, setRequiresPin] = useState(false);
  const [lockedMeta, setLockedMeta] = useState<{
    id: string;
    title: string;
    companyName: string;
    pinHint?: string;
    brand: BrandSettings;
  } | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Loaded brief state
  const [brief, setBrief] = useState<PublicBriefPayload | null>(null);
  const [viewMode, setViewMode] = useState<'focus' | 'list'>('focus');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedIso, setLastSavedIso] = useState<string | undefined>();
  const [copiedShare, setCopiedShare] = useState(false);
  const [justSubmittedBanner, setJustSubmittedBanner] = useState(false);

  // Respondent optional details
  const [respName, setRespName] = useState('');
  const [respRole, setRespRole] = useState('');
  const [respContact, setRespContact] = useState('');

  // Debounced auto-save queue
  const pendingPatchRef = useRef<{
    answers: Record<string, QuestionAnswerValue>;
    respondentName?: string;
    respondentRole?: string;
    respondentContact?: string;
  }>({ answers: {} });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localQueueKey = `msdis_offline_patch_${token}`;

  const loadBriefData = useCallback(
    async (knownId?: string) => {
      setLoading(true);
      setNotFoundError(null);
      try {
        const res = await publicApi.getBrief(token, knownId);
        if (res.requiresPin) {
          applyBrandCssVars(res.brand);
          setRequiresPin(true);
          setLockedMeta(res);
          setBrief(null);
        } else {
          applyBrandCssVars(res.brief.brand);
          setRequiresPin(false);

          // Check if there are unsynced offline answers in localStorage
          let mergedBrief = res.brief;
          try {
            const rawLocal = localStorage.getItem(localQueueKey);
            if (rawLocal) {
              const parsedLocal = JSON.parse(rawLocal);
              if (
                parsedLocal?.answers &&
                Object.keys(parsedLocal.answers).length > 0
              ) {
                mergedBrief = {
                  ...res.brief,
                  answers: { ...res.brief.answers, ...parsedLocal.answers },
                };
                // Sync offline cache back to server in background
                publicApi
                  .patchAnswers(token, res.brief.id, parsedLocal)
                  .then(() => localStorage.removeItem(localQueueKey))
                  .catch(() => {});
              }
            }
          } catch {
            // ignore storage errors
          }

          setBrief(mergedBrief);
          setRespName(mergedBrief.respondentName || '');
          setRespRole(mergedBrief.respondentRole || '');
          setRespContact(mergedBrief.respondentContact || '');
          setLastSavedIso(mergedBrief.updatedAt);

          // Position user on first unanswered question if returning later!
          const firstUnanswered = mergedBrief.questions.findIndex(
            (q) =>
              !isQuestionAnsweredClient(
                q,
                mergedBrief.answers[q.id],
                mergedBrief.attachments.filter((a) => a.questionId === q.id)
              ) && !mergedBrief.answers[q.id]?.skipped
          );
          if (firstUnanswered > 0) {
            setActiveQuestionIdx(firstUnanswered);
          }
        }
      } catch (err) {
        setNotFoundError(
          err instanceof Error ? err.message : 'Ссылка недействительна'
        );
      } finally {
        setLoading(false);
      }
    },
    [token, localQueueKey]
  );

  useEffect(() => {
    loadBriefData();
  }, [loadBriefData]);

  const flushPendingSave = useCallback(
    async (markSubmitted = false) => {
      if (!brief || brief.status === 'locked') return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const payload = {
        ...pendingPatchRef.current,
        ...(markSubmitted ? { markSubmitted: true } : {}),
      };

      const hasWork =
        markSubmitted ||
        Object.keys(payload.answers).length > 0 ||
        payload.respondentName !== undefined ||
        payload.respondentRole !== undefined ||
        payload.respondentContact !== undefined;

      if (!hasWork) return;

      setSaveState('saving');
      try {
        const res = await publicApi.patchAnswers(token, brief.id, payload);
        pendingPatchRef.current = { answers: {} };
        try {
          localStorage.removeItem(localQueueKey);
        } catch {
          // ignore
        }
        setSaveState('saved');
        setLastSavedIso(res.updatedAt);
        if (markSubmitted) {
          setBrief((prev) =>
            prev
              ? {
                  ...prev,
                  status: res.status,
                  submittedAt: res.submittedAt,
                }
              : prev
          );
          setJustSubmittedBanner(true);
        }
      } catch {
        setSaveState('offline');
        try {
          localStorage.setItem(localQueueKey, JSON.stringify(payload));
        } catch {
          // ignore
        }
      }
    },
    [brief, token, localQueueKey]
  );

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    saveTimerRef.current = setTimeout(() => {
      flushPendingSave(false);
    }, 450);
  }, [flushPendingSave]);

  // Flush when tab becomes hidden or network comes back online
  useEffect(() => {
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave(false);
      }
    };
    const onOnline = () => {
      flushPendingSave(false);
    };
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('online', onOnline);
    };
  }, [flushPendingSave]);

  const handleAnswerChange = (
    questionId: string,
    patch: QuestionAnswerValue
  ) => {
    if (!brief || brief.status === 'locked') return;
    setBrief((prev) =>
      prev
        ? {
            ...prev,
            answers: {
              ...prev.answers,
              [questionId]: patch,
            },
          }
        : prev
    );
    pendingPatchRef.current.answers[questionId] = patch;
    scheduleAutoSave();
  };

  const handleRespondentField = (
    field: 'respondentName' | 'respondentRole' | 'respondentContact',
    value: string
  ) => {
    if (field === 'respondentName') setRespName(value);
    if (field === 'respondentRole') setRespRole(value);
    if (field === 'respondentContact') setRespContact(value);
    pendingPatchRef.current[field] = value;
    scheduleAutoSave();
  };

  const handleUnlockPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockedMeta || !pinInput.trim()) return;
    setUnlocking(true);
    setPinError(null);
    try {
      await publicApi.unlockWithPin(token, lockedMeta.id, pinInput.trim());
      await loadBriefData(lockedMeta.id);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Неверный PIN-код');
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-3 border-blue-600 border-t-transparent animate-spin mx-auto" />
          <div className="text-sm font-medium text-slate-600">
            Загружаем персональный архитектурный бриф МСДИС...
          </div>
        </div>
      </div>
    );
  }

  if (notFoundError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
          <BrandLogo />
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            Доступ по ссылке недоступен
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {notFoundError} Пожалуйста, запросите актуальную персональную ссылку
            у вашего менеджера или архитектора ООО «МСДИС».
          </p>
        </div>
      </div>
    );
  }

  if (requiresPin && lockedMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 brand-gradient-hero">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-7 sm:p-8 space-y-5">
          <BrandLogo companyName={lockedMeta.brand.companyName} />
          <div className="pt-2 border-t border-slate-100">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold brand-text-primary brand-soft-tint px-2.5 py-1 rounded-full mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Защищённый бриф для {lockedMeta.companyName}
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-snug">
              {lockedMeta.title}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Введите код доступа, переданный вам командой МСДИС.
            </p>
          </div>

          <form onSubmit={handleUnlockPin} className="space-y-3">
            <div>
              <input
                type="password"
                autoFocus
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Код доступа (PIN)"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg tracking-widest font-bold focus:outline-none focus:border-blue-600"
              />
              {lockedMeta.pinHint && (
                <div className="text-xs text-slate-500 mt-1.5 text-center">
                  Подсказка: {lockedMeta.pinHint}
                </div>
              )}
            </div>

            {pinError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              disabled={unlocking || !pinInput.trim()}
              className="w-full py-3 rounded-xl brand-bg-primary text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {unlocking ? 'Проверяем доступ...' : 'Открыть бриф'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!brief) return null;

  const isLocked = brief.status === 'locked';
  const totalQuestions = brief.questions.length;
  const answeredCount = brief.questions.filter((q) =>
    isQuestionAnsweredClient(
      q,
      brief.answers[q.id],
      brief.attachments.filter((a) => a.questionId === q.id)
    )
  ).length;
  const progressPct =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const currentQuestion = brief.questions[activeQuestionIdx] || brief.questions[0];
  const currentSection = brief.sections.find(
    (s) => s.id === currentQuestion?.sectionId
  );

  const handleCopyColleagueLink = async () => {
    const ok = await copyTextToClipboard(window.location.href);
    if (ok) {
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo
              companyName={brief.brand.companyName}
              compact
            />
            <span className="hidden md:inline-block h-5 w-px bg-slate-200" />
            <div className="hidden md:block truncate">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-xs">
                {brief.companyName}
              </div>
              <div className="text-[11px] text-slate-500">
                Отвечено: {answeredCount} из {totalQuestions} (свободный выбор)
              </div>
            </div>
          </div>

          {/* Live Auto-save Status + View Switcher */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
              title="Все ваши ответы мгновенно сохраняются на сервере МСДИС"
            >
              {saveState === 'saving' && (
                <>
                  <Cloud className="w-3.5 h-3.5 brand-text-primary animate-pulse" />
                  <span className="hidden sm:inline">Сохранение...</span>
                </>
              )}
              {saveState === 'saved' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline text-emerald-700">
                    Сохранено
                  </span>
                </>
              )}
              {saveState === 'offline' && (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline text-amber-700">
                    Сохранено локально
                  </span>
                </>
              )}
              {saveState === 'idle' && (
                <>
                  <Cloud className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">
                    Автосохранение включено
                  </span>
                </>
              )}
            </div>

            {/* Mode Switcher */}
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setViewMode('focus')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'focus'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">По карточкам</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Все сразу</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyColleagueLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-white text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              title="Скопировать ссылку, чтобы вернуться позже или переслать профильному коллеге"
            >
              {copiedShare ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden lg:inline text-emerald-700">
                    Ссылка скопирована
                  </span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Переслать коллеге</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Thin Visual Progress Bar */}
        <div className="h-1 bg-slate-100 w-full overflow-hidden">
          <div
            className="h-full brand-bg-primary transition-all duration-300"
            style={{ width: `${Math.max(progressPct, 3)}%` }}
          />
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <div className="brand-gradient-hero text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-100 mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Персональный архитектурный бриф
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/10">
              <Clock className="w-3.5 h-3.5" />~{brief.estimatedMinutes} мин · без
              обязательных вопросов
            </span>
            {lastSavedIso && (
              <span className="text-blue-200/90">
                Обновлено: {formatDateTimeRu(lastSavedIso)}
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-snug">
            {brief.title}
          </h1>
          <p className="text-sm sm:text-base text-blue-100/95 mt-2.5 max-w-3xl leading-relaxed">
            {brief.clientWelcomeNote}
          </p>

          {isLocked && (
            <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-300/40 text-xs font-semibold text-amber-100">
              <Lock className="w-4 h-4" />
              Бриф зафиксирован архитектором МСДИС в режиме чтения.
            </div>
          )}
        </div>
      </div>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {justSubmittedBanner && (
          <div className="mb-6 rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-start gap-3.5 animate-card-enter">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-bold text-emerald-950">
                Отлично! Команда архитекторов МСДИС получила уведомление о вашей готовности.
              </div>
              <div className="text-xs text-emerald-800 leading-relaxed">
                Эта персональная ссылка остаётся активной: вы или ваши коллеги в
                любой момент можете вернуться, дополнить любые пункты или
                прикрепить дополнительные файлы — изменения сохранятся
                автоматически.
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Section & Question Map Sidebar */}
          <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-22 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Карта брифа
                </span>
                <span className="text-xs font-bold brand-text-primary">
                  {answeredCount}/{totalQuestions}
                </span>
              </div>

              <div className="space-y-4">
                {brief.sections.map((sec, sIdx) => {
                  const secQs = brief.questions.filter(
                    (q) => q.sectionId === sec.id
                  );
                  if (secQs.length === 0) return null;

                  return (
                    <div key={sec.id} className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-md brand-soft-tint brand-text-primary inline-flex items-center justify-center text-[10px] font-extrabold">
                          {sIdx + 1}
                        </span>
                        <span className="truncate">{sec.title}</span>
                      </div>

                      <div className="space-y-1 pl-1">
                        {secQs.map((q) => {
                          const globalIdx = brief.questions.findIndex(
                            (item) => item.id === q.id
                          );
                          const qFiles = brief.attachments.filter(
                            (a) => a.questionId === q.id
                          );
                          const answered = isQuestionAnsweredClient(
                            q,
                            brief.answers[q.id],
                            qFiles
                          );
                          const skipped =
                            !answered && Boolean(brief.answers[q.id]?.skipped);
                          const isCurrent =
                            viewMode === 'focus' &&
                            globalIdx === activeQuestionIdx;

                          return (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => {
                                setActiveQuestionIdx(globalIdx);
                                if (viewMode === 'list') {
                                  document
                                    .getElementById(`question-card-${q.id}`)
                                    ?.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'center',
                                    });
                                }
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'brand-soft-tint brand-text-primary font-semibold'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  answered
                                    ? 'bg-emerald-500'
                                    : isCurrent
                                      ? 'brand-bg-primary'
                                      : skipped
                                        ? 'bg-slate-300'
                                        : 'bg-slate-200'
                                }`}
                              />
                              <span className="truncate flex-1">{q.title}</span>
                              {qFiles.length > 0 && (
                                <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Question Workspace */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {viewMode === 'focus' && currentQuestion ? (
              <div className="space-y-4">
                {currentSection && (
                  <div className="px-1">
                    <div className="text-xs font-bold uppercase tracking-wider brand-text-primary">
                      {currentSection.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {currentSection.description}
                    </div>
                  </div>
                )}

                <QuestionRenderer
                  key={currentQuestion.id}
                  question={currentQuestion}
                  questionIndex={activeQuestionIdx}
                  totalQuestions={totalQuestions}
                  answer={brief.answers[currentQuestion.id]}
                  attachments={brief.attachments.filter(
                    (a) => a.questionId === currentQuestion.id
                  )}
                  disabled={isLocked}
                  downloadBaseUrl={`/api/public/briefs/${encodeURIComponent(token)}/files`}
                  onChange={(patch) =>
                    handleAnswerChange(currentQuestion.id, patch)
                  }
                  onUploadFiles={async (files) => {
                    const res = await publicApi.uploadFiles(
                      token,
                      brief.id,
                      currentQuestion.id,
                      files
                    );
                    setBrief((prev) =>
                      prev
                        ? {
                            ...prev,
                            attachments: [
                              ...prev.attachments,
                              ...res.attachments,
                            ],
                          }
                        : prev
                    );
                    setSaveState('saved');
                  }}
                  onDeleteFile={async (fileId) => {
                    await publicApi.deleteFile(token, brief.id, fileId);
                    setBrief((prev) =>
                      prev
                        ? {
                            ...prev,
                            attachments: prev.attachments.filter(
                              (a) => a.id !== fileId
                            ),
                          }
                        : prev
                    );
                  }}
                />

                {/* Step Navigation Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5 shadow-2xs">
                  <button
                    type="button"
                    disabled={activeQuestionIdx === 0}
                    onClick={() =>
                      setActiveQuestionIdx((i) => Math.max(0, i - 1))
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Предыдущий
                  </button>

                  <div className="flex items-center gap-2">
                    {activeQuestionIdx < totalQuestions - 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !isLocked &&
                            !isQuestionAnsweredClient(
                              currentQuestion,
                              brief.answers[currentQuestion.id],
                              brief.attachments.filter(
                                (a) => a.questionId === currentQuestion.id
                              )
                            )
                          ) {
                            handleAnswerChange(currentQuestion.id, {
                              ...(brief.answers[currentQuestion.id] || {}),
                              skipped: true,
                            });
                          }
                          setActiveQuestionIdx((i) =>
                            Math.min(totalQuestions - 1, i + 1)
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        Пропустить
                      </button>
                    )}

                    {activeQuestionIdx < totalQuestions - 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setActiveQuestionIdx((i) =>
                            Math.min(totalQuestions - 1, i + 1)
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl brand-bg-primary text-white text-xs font-semibold hover:opacity-95 shadow-xs cursor-pointer"
                      >
                        Далее
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          document
                            .getElementById('finish-brief-card')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs cursor-pointer"
                      >
                        К завершению брифа
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* LIST MODE: All questions grouped by section */
              <div className="space-y-8">
                {brief.sections.map((sec) => {
                  const secQs = brief.questions.filter(
                    (q) => q.sectionId === sec.id
                  );
                  if (secQs.length === 0) return null;
                  return (
                    <section key={sec.id} className="space-y-4">
                      <div className="border-b border-slate-200 pb-2">
                        <h2 className="text-lg font-extrabold text-slate-900">
                          {sec.title}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {sec.description}
                        </p>
                      </div>
                      <div className="space-y-5">
                        {secQs.map((q) => {
                          const gIdx = brief.questions.findIndex(
                            (x) => x.id === q.id
                          );
                          return (
                            <div key={q.id} id={`question-card-${q.id}`}>
                              <QuestionRenderer
                                question={q}
                                questionIndex={gIdx}
                                totalQuestions={totalQuestions}
                                answer={brief.answers[q.id]}
                                attachments={brief.attachments.filter(
                                  (a) => a.questionId === q.id
                                )}
                                disabled={isLocked}
                                downloadBaseUrl={`/api/public/briefs/${encodeURIComponent(token)}/files`}
                                onChange={(patch) =>
                                  handleAnswerChange(q.id, patch)
                                }
                                onUploadFiles={async (files) => {
                                  const res = await publicApi.uploadFiles(
                                    token,
                                    brief.id,
                                    q.id,
                                    files
                                  );
                                  setBrief((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          attachments: [
                                            ...prev.attachments,
                                            ...res.attachments,
                                          ],
                                        }
                                      : prev
                                  );
                                  setSaveState('saved');
                                }}
                                onDeleteFile={async (fileId) => {
                                  await publicApi.deleteFile(
                                    token,
                                    brief.id,
                                    fileId
                                  );
                                  setBrief((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          attachments:
                                            prev.attachments.filter(
                                              (a) => a.id !== fileId
                                            ),
                                        }
                                      : prev
                                  );
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {/* Optional Respondent Block & Non-blocking Submit */}
            <div
              id="finish-brief-card"
              className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl brand-soft-tint brand-text-primary flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Готовы передать ответы архитекторам МСДИС?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Все поля ниже необязательны. Вы можете отправить бриф при
                    любом количестве ответов (сейчас заполнено {answeredCount} из{' '}
                    {totalQuestions}) и при желании дополнить его позже по этой
                    же ссылке.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  disabled={isLocked}
                  value={respName}
                  onChange={(e) =>
                    handleRespondentField('respondentName', e.target.value)
                  }
                  placeholder="Ваше имя (необязательно)"
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  disabled={isLocked}
                  value={respRole}
                  onChange={(e) =>
                    handleRespondentField('respondentRole', e.target.value)
                  }
                  placeholder="Должность / роль"
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  disabled={isLocked}
                  value={respContact}
                  onChange={(e) =>
                    handleRespondentField('respondentContact', e.target.value)
                  }
                  placeholder="Telegram / телефон / email"
                  className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {!isLocked && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-slate-500">
                    {brief.status === 'submitted'
                      ? `✓ Отправлено команде МСДИС (${formatDateTimeRu(brief.submittedAt)}) — изменения продолжают автосохраняться`
                      : 'Данные уже сохранены автоматически — кнопка ниже уведомит команду МСДИС о завершении'}
                  </span>
                  <button
                    type="button"
                    onClick={() => flushPendingSave(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold hover:opacity-95 transition-opacity shadow-xs cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    {brief.status === 'submitted'
                      ? 'Обновить отправленный бриф'
                      : 'Отправить бриф в МСДИС'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-slate-400 border-t border-slate-200/60 mt-10">
        © {new Date().getFullYear()} ООО «МСДИС» · Заказная разработка ПО и
        автоматизация бизнес- и производственных процессов
      </footer>
    </div>
  );
};

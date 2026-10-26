import React, { useState, useRef } from 'react';
import {
  Check,
  Paperclip,
  Upload,
  X,
  Plus,
  MessageSquarePlus,
  Cpu,
  FileText,
  Download,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type {
  BriefQuestion,
  FileAttachmentMeta,
  QuestionAnswerValue,
  StatementVote,
} from '../../shared/types';
import { formatBytes } from '../lib/utils';

interface QuestionRendererProps {
  question: BriefQuestion;
  questionIndex: number;
  totalQuestions: number;
  answer: QuestionAnswerValue | undefined;
  attachments: FileAttachmentMeta[];
  disabled?: boolean;
  downloadBaseUrl: string;
  onChange: (patch: QuestionAnswerValue) => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  onDeleteFile: (fileId: string) => Promise<void>;
}

const SPECTRUM_LABELS = [
  'Полностью левый вектор',
  'Скорее левый',
  'Сбалансированно 50/50',
  'Скорее правый',
  'Полностью правый вектор',
];

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionIndex,
  totalQuestions,
  answer,
  attachments,
  disabled = false,
  downloadBaseUrl,
  onChange,
  onUploadFiles,
  onDeleteFile,
}) => {
  const [customOptionDraft, setCustomOptionDraft] = useState('');
  const [showComment, setShowComment] = useState(Boolean(answer?.comment));
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const current = answer || {};

  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (arr.length === 0 || disabled) return;
    setUploading(true);
    setUploadError(null);
    try {
      await onUploadFiles(arr);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addCustomTag = () => {
    const clean = customOptionDraft.trim();
    if (!clean || disabled) return;
    const existing = current.customOptions || [];
    if (!existing.includes(clean)) {
      onChange({
        ...current,
        skipped: false,
        customOptions: [...existing, clean],
      });
    }
    setCustomOptionDraft('');
  };

  const removeCustomTag = (tag: string) => {
    if (disabled) return;
    onChange({
      ...current,
      customOptions: (current.customOptions || []).filter((t) => t !== tag),
    });
  };

  const clearAnswer = () => {
    if (disabled) return;
    onChange({
      selectedOptionId: undefined,
      selectedOptionIds: [],
      customOptions: [],
      spectrumValue: undefined,
      statementVotes: {},
      bucketAssignments: {},
      text: '',
      comment: '',
      skipped: false,
    });
  };

  const hasAnyAnswer =
    Boolean(current.selectedOptionId) ||
    Boolean(current.selectedOptionIds?.length) ||
    Boolean(current.customOptions?.length) ||
    typeof current.spectrumValue === 'number' ||
    Boolean(current.statementVotes && Object.keys(current.statementVotes).length) ||
    Boolean(
      current.bucketAssignments && Object.keys(current.bucketAssignments).length
    ) ||
    Boolean(current.text?.trim()) ||
    Boolean(current.comment?.trim());

  const showFileZone =
    question.type === 'file_upload' ||
    question.allowFiles ||
    showManualUpload ||
    attachments.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-7 transition-all animate-card-enter">
      {/* Top Question Meta */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-semibold brand-soft-tint brand-text-primary border brand-soft-border">
            Вопрос {questionIndex + 1} из {totalQuestions}
          </span>
          <span className="text-xs text-slate-400 font-medium">
            Необязательный · автосохранение
          </span>
        </div>

        {hasAnyAnswer && !disabled && (
          <button
            type="button"
            onClick={clearAnswer}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="Сбросить ответ на этот вопрос"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить
          </button>
        )}
      </div>

      {/* Title & Subtitle */}
      <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug mb-1.5">
        {question.title}
      </h3>
      {question.subtitle && (
        <p className="text-sm text-slate-600 mb-3 leading-relaxed">
          {question.subtitle}
        </p>
      )}

      {/* Architectural Impact Callout */}
      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5 mb-5">
        <Cpu className="w-4 h-4 brand-text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">
            Влияние на архитектуру:{' '}
          </span>
          {question.architectureImpact}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 1. LIKE_OR_NOT ("Похоже на вашу ситуацию или нет?")               */}
      {/* ================================================================= */}
      {question.type === 'like_or_not' && question.statements && (
        <div className="space-y-3">
          {question.statements.map((st) => {
            const vote = current.statementVotes?.[st.id];
            const setVote = (v: StatementVote) => {
              if (disabled) return;
              const nextVotes = { ...(current.statementVotes || {}) };
              if (nextVotes[st.id] === v) {
                delete nextVotes[st.id];
              } else {
                nextVotes[st.id] = v;
              }
              onChange({
                ...current,
                skipped: false,
                statementVotes: nextVotes,
              });
            };

            return (
              <div
                key={st.id}
                className={`rounded-xl border p-4 transition-all ${
                  vote
                    ? 'border-blue-200 bg-blue-50/35'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-900 leading-snug">
                      {st.text}
                    </div>
                    {st.context && (
                      <div className="text-xs text-slate-500">{st.context}</div>
                    )}
                  </div>

                  <div className="inline-flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setVote('yes')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        vote === 'yes'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:text-emerald-700'
                      }`}
                    >
                      ✓ В точку
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setVote('partial')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        vote === 'partial'
                          ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400 hover:text-amber-700'
                      }`}
                    >
                      ◐ Отчасти
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setVote('no')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                        vote === 'no'
                          ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      ✕ Не про нас
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================================================================= */}
      {/* 2. SPECTRUM ("Что ближе — что дальше?")                           */}
      {/* ================================================================= */}
      {question.type === 'spectrum' && question.spectrum && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ ...current, skipped: false, spectrumValue: 1 })
              }
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                current.spectrumValue !== undefined &&
                current.spectrumValue <= 2
                  ? 'brand-soft-tint brand-border-primary ring-1 ring-blue-500/30'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                Полюс А (левый вектор)
              </div>
              <div className="text-sm font-bold text-slate-900">
                {question.spectrum.leftTitle}
              </div>
              {question.spectrum.leftDescription && (
                <div className="text-xs text-slate-600 mt-1">
                  {question.spectrum.leftDescription}
                </div>
              )}
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ ...current, skipped: false, spectrumValue: 5 })
              }
              className={`text-left rounded-xl p-4 border transition-all cursor-pointer ${
                current.spectrumValue !== undefined &&
                current.spectrumValue >= 4
                  ? 'brand-soft-tint brand-border-primary ring-1 ring-blue-500/30'
                  : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                Полюс Б (правый вектор)
              </div>
              <div className="text-sm font-bold text-slate-900">
                {question.spectrum.rightTitle}
              </div>
              {question.spectrum.rightDescription && (
                <div className="text-xs text-slate-600 mt-1">
                  {question.spectrum.rightDescription}
                </div>
              )}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((step) => {
                const active = current.spectrumValue === step;
                return (
                  <button
                    key={step}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...current,
                        skipped: false,
                        spectrumValue: step,
                      })
                    }
                    className={`py-2.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                      active
                        ? 'brand-bg-primary text-white border-transparent shadow-sm scale-[1.02]'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="text-sm font-bold">{step}</div>
                    <div
                      className={`text-[10px] leading-tight mt-0.5 hidden sm:block ${
                        active ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {SPECTRUM_LABELS[step - 1]}
                    </div>
                  </button>
                );
              })}
            </div>
            {typeof current.spectrumValue === 'number' && (
              <div className="text-center text-xs font-semibold brand-text-primary mt-2.5">
                Выбрано: {SPECTRUM_LABELS[current.spectrumValue - 1]} (
                {current.spectrumValue}/5)
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 3. SINGLE_CHOICE & SCALE_CHIPS                                    */}
      {/* ================================================================= */}
      {(question.type === 'single_choice' || question.type === 'scale_chips') &&
        question.options && (
          <div
            className={
              question.type === 'scale_chips'
                ? 'grid grid-cols-1 md:grid-cols-3 gap-3'
                : 'space-y-2.5'
            }
          >
            {question.options.map((opt, idx) => {
              const selected = current.selectedOptionId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...current,
                      skipped: false,
                      selectedOptionId: selected ? undefined : opt.id,
                    })
                  }
                  className={`w-full text-left rounded-xl p-4 border transition-all cursor-pointer flex items-start gap-3 ${
                    selected
                      ? 'brand-soft-tint brand-border-primary ring-1 ring-blue-500/30 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/40'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                      selected
                        ? 'brand-bg-primary border-transparent text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    {question.type === 'scale_chips' && (
                      <div className="flex gap-1 mb-1.5">
                        {[0, 1, 2].map((bar) => (
                          <span
                            key={bar}
                            className={`h-1.5 w-5 rounded-full ${
                              bar <= idx
                                ? 'brand-bg-primary'
                                : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="text-sm font-semibold text-slate-900">
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {/* ================================================================= */}
      {/* 4. MULTI_CHOICE (Чекбоксы-карточки + добавление своих систем)     */}
      {/* ================================================================= */}
      {question.type === 'multi_choice' && question.options && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {question.options.map((opt) => {
              const selectedList = current.selectedOptionIds || [];
              const checked = selectedList.includes(opt.id);
              const toggle = () => {
                if (disabled) return;
                const next = checked
                  ? selectedList.filter((id) => id !== opt.id)
                  : [...selectedList, opt.id];
                onChange({
                  ...current,
                  skipped: false,
                  selectedOptionIds: next,
                });
              };

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={toggle}
                  className={`text-left rounded-xl p-3.5 border transition-all cursor-pointer flex items-start gap-3 ${
                    checked
                      ? 'brand-soft-tint brand-border-primary ring-1 ring-blue-500/25'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                      checked
                        ? 'brand-bg-primary border-transparent text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 leading-snug">
                      {opt.label}
                    </div>
                    {opt.description && (
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom user-added tags */}
          {question.allowCustomOption !== false && (
            <div className="pt-1">
              {(current.customOptions || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2.5">
                  {(current.customOptions || []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold brand-soft-tint brand-text-primary border brand-soft-border"
                    >
                      {tag}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeCustomTag(tag)}
                          className="hover:text-red-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {!disabled && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customOptionDraft}
                    onChange={(e) => setCustomOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomTag();
                      }
                    }}
                    placeholder="Вписать свою систему / свой вариант и нажать +"
                    className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 bg-slate-50/60"
                  />
                  <button
                    type="button"
                    onClick={addCustomTag}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Добавить
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 5. PRIORITY_MATRIX (Корзины MVP / 2 этап / Не требуется)          */}
      {/* ================================================================= */}
      {question.type === 'priority_matrix' &&
        question.items &&
        question.buckets && (
          <div className="space-y-2.5">
            {question.items.map((item) => {
              const assignedBucket = current.bucketAssignments?.[item.id];
              const assign = (bucketId: string) => {
                if (disabled) return;
                const next = { ...(current.bucketAssignments || {}) };
                if (next[item.id] === bucketId) {
                  delete next[item.id];
                } else {
                  next[item.id] = bucketId;
                }
                onChange({
                  ...current,
                  skipped: false,
                  bucketAssignments: next,
                });
              };

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 p-3.5 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.description}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {question.buckets!.map((bucket) => {
                      const isSelected = assignedBucket === bucket.id;
                      const activeStyle =
                        bucket.tone === 'primary'
                          ? 'brand-bg-primary text-white border-transparent'
                          : bucket.tone === 'secondary'
                            ? 'bg-indigo-600 text-white border-transparent'
                            : 'bg-slate-600 text-white border-transparent';

                      return (
                        <button
                          key={bucket.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => assign(bucket.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            isSelected
                              ? `${activeStyle} shadow-2xs`
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {bucket.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* ================================================================= */}
      {/* 6. SHORT_TEXT & LONG_TEXT + Clickable Quick Hints                 */}
      {/* ================================================================= */}
      {(question.type === 'short_text' || question.type === 'long_text') && (
        <div className="space-y-3">
          {question.quickHints && question.quickHints.length > 0 && !disabled && (
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                <Sparkles className="w-3.5 h-3.5 brand-text-primary" />
                Быстрые ориентиры (нажмите, чтобы добавить в ответ):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {question.quickHints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      const prev = current.text?.trim() || '';
                      const sep = prev ? (prev.endsWith('.') ? ' ' : '; ') : '';
                      onChange({
                        ...current,
                        skipped: false,
                        text: prev.includes(hint) ? prev : `${prev}${sep}${hint}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-full text-xs bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                  >
                    + {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {question.type === 'short_text' ? (
            <input
              type="text"
              disabled={disabled}
              value={current.text || ''}
              onChange={(e) =>
                onChange({
                  ...current,
                  skipped: false,
                  text: e.target.value,
                })
              }
              placeholder={
                question.placeholder || 'Введите краткий ответ (необязательно)...'
              }
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 bg-white"
            />
          ) : (
            <textarea
              rows={4}
              disabled={disabled}
              value={current.text || ''}
              onChange={(e) =>
                onChange({
                  ...current,
                  skipped: false,
                  text: e.target.value,
                })
              }
              placeholder={
                question.placeholder ||
                'Поделитесь деталями в свободной форме (необязательно)...'
              }
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-blue-500 bg-white leading-relaxed"
            />
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* 7. FILE UPLOAD DROPZONE + ATTACHED FILES LIST                     */}
      {/* ================================================================= */}
      {showFileZone && (
        <div className="mt-4 space-y-3">
          {!disabled && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  handleFilesSelected(e.dataTransfer.files);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-5 text-center transition-all cursor-pointer ${
                dragOver
                  ? 'brand-border-primary brand-soft-tint'
                  : 'border-slate-200 hover:border-blue-400 bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFilesSelected(e.target.files);
                }}
              />
              <Upload className="w-6 h-6 brand-text-primary mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-800">
                {uploading
                  ? 'Загружаем файлы на сервер МСДИС...'
                  : question.filePrompt ||
                    'Нажмите или перетащите файлы сюда (Excel, PDF, DOCX, схемы, фото)'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Можно прикрепить несколько файлов · автосохранение на сервере
              </div>
            </div>
          )}

          {uploadError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {uploadError}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 brand-text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {att.originalName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatBytes(att.sizeBytes)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`${downloadBaseUrl}/${encodeURIComponent(att.id)}`}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-white transition-colors"
                      title="Скачать файл"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onDeleteFile(att.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors cursor-pointer"
                        title="Удалить файл"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* Optional Nuance Comment & Universal File Trigger                  */}
      {/* ================================================================= */}
      {question.type !== 'long_text' && question.type !== 'short_text' && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          {showComment || current.comment ? (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 block">
                Ваш комментарий или уточнение к ответу (необязательно):
              </label>
              <textarea
                rows={2}
                disabled={disabled}
                value={current.comment || ''}
                onChange={(e) =>
                  onChange({
                    ...current,
                    skipped: false,
                    comment: e.target.value,
                  })
                }
                placeholder="Если есть важный нюанс, напишите пару слов..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:border-blue-500 bg-slate-50/50"
              />
            </div>
          ) : (
            !disabled && (
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowComment(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  Добавить комментарий
                </button>
                {!showFileZone && (
                  <button
                    type="button"
                    onClick={() => setShowManualUpload(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Прикрепить файл / скриншот
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      {(question.type === 'long_text' || question.type === 'short_text') &&
        !showFileZone &&
        !disabled && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowManualUpload(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
            >
              <Paperclip className="w-3.5 h-3.5" />
              Прикрепить файл / схему к ответу
            </button>
          </div>
        )}
    </div>
  );
};

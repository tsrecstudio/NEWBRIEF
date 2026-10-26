import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderKanban,
  Lock,
  Paperclip,
  Plus,
  Search,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { BriefSummaryItem } from '../../shared/types';
import {
  buildPublicBriefUrl,
  copyTextToClipboard,
  formatDateTimeRu,
} from '../lib/utils';

interface AdminDashboardProps {
  briefs: BriefSummaryItem[];
  publicBaseUrl: string;
  onCreateNew: () => void;
  onOpenBrief: (id: string) => void;
  onDeleteBrief: (id: string) => Promise<void>;
}

const STATUS_META: Record<
  BriefSummaryItem['status'],
  { label: string; cls: string }
> = {
  active: {
    label: 'Ожидает клиента',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  in_progress: {
    label: 'Заполняется клиентом',
    cls: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  submitted: {
    label: 'Завершён клиентом',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  locked: {
    label: 'Закрыт (чтение)',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  briefs,
  publicBaseUrl,
  onCreateNew,
  onOpenBrief,
  onDeleteBrief,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = briefs.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.companyName.toLowerCase().includes(q) ||
      b.title.toLowerCase().includes(q) ||
      (b.industry || '').toLowerCase().includes(q)
    );
  });

  const stats = {
    total: briefs.length,
    inProgress: briefs.filter((b) => b.status === 'in_progress').length,
    submitted: briefs.filter((b) => b.status === 'submitted').length,
    filesTotal: briefs.reduce((acc, b) => acc + b.attachmentsCount, 0),
  };

  const handleCopyInvite = async (b: BriefSummaryItem) => {
    const url = buildPublicBriefUrl(b.accessToken, publicBaseUrl);
    const text = b.hasPin && b.pinCodePlainForAdmin
      ? `${url}\nКод доступа (PIN): ${b.pinCodePlainForAdmin}`
      : url;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(b.id);
      setTimeout(() => setCopiedId(null), 2200);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Архитектурные брифы клиентов
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Все брифы МСДИС, прогресс ответов клиентов в реальном времени и
            прикреплённые артефакты
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Создать умный бриф с ИИ
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">
            Всего брифов
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {stats.total}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">
            В работе у клиентов
          </div>
          <div className="text-2xl font-extrabold brand-text-primary mt-1">
            {stats.inProgress}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">
            Завершены клиентами
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">
            {stats.submitted}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">
            Получено файлов / схем
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {stats.filesTotal}
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white rounded-2xl border border-slate-200/90 p-3.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по компании, проекту или отрасли..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Все' },
            { id: 'active', label: 'Ожидают' },
            { id: 'in_progress', label: 'Заполняются' },
            { id: 'submitted', label: 'Завершены' },
            { id: 'locked', label: 'Закрыты' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'brand-bg-primary text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Brief Cards List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <FolderKanban className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="text-base font-bold text-slate-800">
            Брифов по выбранному фильтру пока нет
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Введите известные вводные о компании клиента и запросе — ИИ найдёт
            информацию в сети и подготовит персональный интерактивный бриф.
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl brand-bg-primary text-white text-xs font-semibold cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Сгенерировать первый бриф
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((b) => {
            const pct =
              b.totalQuestions > 0
                ? Math.round((b.answeredQuestions / b.totalQuestions) * 100)
                : 0;
            const st = STATUS_META[b.status];
            const clientUrl = buildPublicBriefUrl(b.accessToken, publicBaseUrl);

            return (
              <div
                key={b.id}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-blue-300 transition-all p-5 shadow-2xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div
                    className="space-y-1.5 min-w-0 flex-1 cursor-pointer"
                    onClick={() => onOpenBrief(b.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {b.companyName}
                      </span>
                      {b.industry && (
                        <span className="text-xs text-slate-400">
                          · {b.industry}
                        </span>
                      )}
                      {b.hasPin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                          <Shield className="w-3 h-3" />
                          PIN: {b.pinCodePlainForAdmin || 'защищён'}
                        </span>
                      )}
                      {b.status === 'locked' && (
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-bold text-slate-900 hover:text-blue-600 transition-colors leading-snug">
                      {b.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Создан: {formatDateTimeRu(b.createdAt)}</span>
                      {b.lastClientActivityAt && (
                        <span>
                          Активность клиента:{' '}
                          {formatDateTimeRu(b.lastClientActivityAt)}
                        </span>
                      )}
                      {b.attachmentsCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                          <Paperclip className="w-3.5 h-3.5 brand-text-primary" />
                          {b.attachmentsCount} файл(ов)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress & Actions */}
                  <div className="flex flex-col sm:flex-row lg:items-center gap-3 shrink-0">
                    <div className="w-full sm:w-40">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Ответы</span>
                        <span className="font-bold text-slate-800">
                          {b.answeredQuestions}/{b.totalQuestions} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full brand-bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenBrief(b.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl brand-soft-tint brand-text-primary text-xs font-semibold hover:opacity-90 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Ответы и управление
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyInvite(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:border-blue-300 text-xs font-semibold text-slate-700 cursor-pointer"
                        title="Скопировать персональную ссылку для отправки клиенту"
                      >
                        {copiedId === b.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            Скопировано
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Ссылка
                          </>
                        )}
                      </button>

                      <a
                        href={clientUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300"
                        title="Открыть бриф глазами клиента в новой вкладке"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Удалить бриф «${b.title}» и все его ответы?`
                            )
                          ) {
                            onDeleteBrief(b.id);
                          }
                        }}
                        className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 cursor-pointer"
                        title="Удалить бриф"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

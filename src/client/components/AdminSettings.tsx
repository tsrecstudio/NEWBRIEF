import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  FileUp,
  Palette,
  RefreshCw,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import { applyBrandCssVars } from '../lib/utils';
import type { BrandSettings } from '../../shared/types';

interface AdminSettingsProps {
  brand: BrandSettings;
  onBrandUpdated: (b: BrandSettings) => void;
  onModelUpdated: (m: string) => void;
  onBack: () => void;
}

const MCDIS_OFFICIAL_DEFAULTS = {
  primaryColor: '#306DFA',
  secondaryColor: '#486ACC',
  navyColor: '#082A5E',
  darkColor: '#101013',
  surfaceColor: '#F8F8F9',
};

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  brand,
  onBrandUpdated,
  onModelUpdated,
  onBack,
}) => {
  // CloseRouter AI status
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    activeModel: string;
    fallbackModels: string[];
    baseUrl: string;
    availableModelsSample?: string[];
    error?: string;
  } | null>(null);
  const [checkingAi, setCheckingAi] = useState(true);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [savingAi, setSavingAi] = useState(false);

  // Brand colors
  const [primaryColor, setPrimaryColor] = useState(brand.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(brand.secondaryColor);
  const [navyColor, setNavyColor] = useState(brand.navyColor);
  const [darkColor, setDarkColor] = useState(brand.darkColor);
  const [surfaceColor, setSurfaceColor] = useState(brand.surfaceColor);
  const [extractedPalette, setExtractedPalette] = useState<string[]>(
    brand.extractedPalette || []
  );
  const [pdfUploading, setPdfUploading] = useState(false);
  const [brandSavedMsg, setBrandSavedMsg] = useState<string | null>(null);

  const loadAiStatus = async () => {
    setCheckingAi(true);
    try {
      const st = await adminApi.getAiStatus();
      setAiStatus(st);
      setModelDraft(st.activeModel);
    } finally {
      setCheckingAi(false);
    }
  };

  useEffect(() => {
    loadAiStatus();
  }, []);

  const handleSaveAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      const payload: { apiKey?: string; model?: string } = {
        model: modelDraft.trim(),
      };
      if (apiKeyDraft.trim()) {
        payload.apiKey = apiKeyDraft.trim();
      }
      const res = await adminApi.saveAiSettings(payload);
      onModelUpdated(res.activeModel);
      setApiKeyDraft('');
      await loadAiStatus();
    } finally {
      setSavingAi(false);
    }
  };

  const handleSaveBrand = async (
    patchOverride?: Partial<BrandSettings>
  ) => {
    const res = await adminApi.saveBrand(
      patchOverride || {
        primaryColor,
        secondaryColor,
        navyColor,
        darkColor,
        surfaceColor,
      }
    );
    applyBrandCssVars(res.brand);
    onBrandUpdated(res.brand);
    setPrimaryColor(res.brand.primaryColor);
    setSecondaryColor(res.brand.secondaryColor);
    setNavyColor(res.brand.navyColor);
    setDarkColor(res.brand.darkColor);
    setSurfaceColor(res.brand.surfaceColor);
    setBrandSavedMsg('Фирменная палитра применена ко всем брифам МСДИС');
    setTimeout(() => setBrandSavedMsg(null), 3000);
  };

  const handlePdfUpload = async (file: File) => {
    setPdfUploading(true);
    try {
      const res = await adminApi.extractBrandFromPdf(file);
      setExtractedPalette(res.extracted.palette);
      setPrimaryColor(res.brand.primaryColor);
      setSecondaryColor(res.brand.secondaryColor);
      setNavyColor(res.brand.navyColor);
      setDarkColor(res.brand.darkColor);
      applyBrandCssVars(res.brand);
      onBrandUpdated(res.brand);
      setBrandSavedMsg(
        `Извлечено ${res.extracted.palette.length} фирменных цветов из «${file.name}»`
      );
      setTimeout(() => setBrandSavedMsg(null), 4000);
    } finally {
      setPdfUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />К списку брифов
      </button>

      {/* CloseRouter API Settings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 brand-text-primary" />
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Подключение к CloseRouter API (closerouter.dev)
              </h2>
              <p className="text-xs text-slate-500">
                Управление флагманской нейросетью и маршрутизацией запросов
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadAiStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkingAi ? 'animate-spin' : ''}`}
            />
            Проверить соединение
          </button>
        </div>

        {aiStatus && (
          <div
            className={`rounded-xl border p-4 text-xs space-y-1.5 ${
              aiStatus.reachable
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              {aiStatus.reachable ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Соединение с {aiStatus.baseUrl} активно!
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  {aiStatus.error || 'Ожидается настройка CLOSEROUTER_API_KEY'}
                </>
              )}
            </div>
            <div>
              Основная модель (.env):{' '}
              <span className="font-mono font-bold">
                {aiStatus.activeModel}
              </span>
            </div>
            <div>
              Резервная цепочка:{' '}
              <span className="font-mono">
                {aiStatus.fallbackModels.join(' → ')}
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveAi} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Модель CloseRouter (по умолчанию: anthropic/claude-opus-5.5)
            </label>
            <input
              type="text"
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder="anthropic/claude-opus-5.5"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Обновить CLOSEROUTER_API_KEY (необязательно, если задан в .env)
            </label>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="closerouter_..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-mono"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={savingAi}
              className="px-5 py-2 rounded-xl brand-bg-primary text-white text-xs font-semibold cursor-pointer"
            >
              {savingAi ? 'Сохраняем...' : 'Сохранить параметры ИИ'}
            </button>
          </div>
        </form>
      </div>

      {/* Corporate Brand Colors & PDF Brandbook Extractor */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 brand-text-primary" />
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Фирменные цвета ООО «МСДИС» и импорт из PDF
              </h2>
              <p className="text-xs text-slate-500">
                По умолчанию применена официальная палитра mcdis.ru (#306DFA ·
                #486ACC · #082A5E · #101013). Также можно загрузить любой PDF
                брендбука для авто-извлечения цветов.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleSaveBrand(MCDIS_OFFICIAL_DEFAULTS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить к эталону МСДИС
          </button>
        </div>

        {/* Upload PDF Brandbook */}
        <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/60 p-5 cursor-pointer transition-colors text-center">
          <FileUp className="w-6 h-6 brand-text-primary mb-1.5" />
          <span className="text-sm font-semibold text-slate-800">
            {pdfUploading
              ? 'Извлекаем векторные фирменные цвета из PDF...'
              : 'Загрузить корпоративный PDF брендбука / презентации для извлечения палитры'}
          </span>
          <span className="text-xs text-slate-500 mt-0.5">
            Автоматически распознаёт RGB / CMYK / HEX цвета векторных объектов PDF
          </span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfUpload(f);
            }}
          />
        </label>

        {extractedPalette.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-600">
              Извлечённые оттенки из PDF (нажмите, чтобы сделать основным акцентом):
            </div>
            <div className="flex flex-wrap gap-2">
              {extractedPalette.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setPrimaryColor(hex)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono cursor-pointer hover:border-blue-400"
                >
                  <span
                    className="w-4 h-4 rounded-sm border border-black/10"
                    style={{ backgroundColor: hex }}
                  />
                  {hex}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Основной акцент', val: primaryColor, set: setPrimaryColor },
            { label: 'Вторичный синий', val: secondaryColor, set: setSecondaryColor },
            { label: 'Глубокий Navy', val: navyColor, set: setNavyColor },
            { label: 'Тёмный графит', val: darkColor, set: setDarkColor },
            { label: 'Чистый фон', val: surfaceColor, set: setSurfaceColor },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 p-3 space-y-2"
            >
              <div className="text-[11px] font-bold text-slate-600">
                {item.label}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={item.val}
                  onChange={(e) => item.set(e.target.value.toUpperCase())}
                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                />
                <input
                  type="text"
                  value={item.val}
                  onChange={(e) => item.set(e.target.value)}
                  className="w-full text-xs font-mono border border-slate-200 rounded px-1.5 py-1"
                />
              </div>
            </div>
          ))}
        </div>

        {brandSavedMsg && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-semibold text-emerald-800">
            ✓ {brandSavedMsg}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => handleSaveBrand()}
            className="px-5 py-2.5 rounded-xl brand-bg-primary text-white text-xs font-semibold cursor-pointer"
          >
            Сохранить фирменные цвета
          </button>
        </div>
      </div>
    </div>
  );
};

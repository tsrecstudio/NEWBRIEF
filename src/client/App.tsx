import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowRight,
  Cpu,
  KeyRound,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  Layers,
} from 'lucide-react';
import { adminApi, publicApi } from './lib/api';
import { applyBrandCssVars } from './lib/utils';
import { BrandLogo } from './components/BrandLogo';
import { ClientBriefView } from './components/ClientBriefView';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminCreateBrief } from './components/AdminCreateBrief';
import { AdminBriefDetail } from './components/AdminBriefDetail';
import { AdminSettings } from './components/AdminSettings';
import type { BrandSettings, BriefSummaryItem } from '../shared/types';

function parseRoute(pathname: string):
  | { kind: 'client'; token: string }
  | { kind: 'admin' }
  | { kind: 'landing' } {
  const briefMatch = pathname.match(/^\/b\/([^/]+)/);
  if (briefMatch) {
    return { kind: 'client', token: decodeURIComponent(briefMatch[1]) };
  }
  if (pathname.startsWith('/admin')) {
    return { kind: 'admin' };
  }
  return { kind: 'landing' };
}

export const App: React.FC = () => {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [brand, setBrand] = useState<BrandSettings>({
    companyName: 'МСДИС',
    tagline:
      'Заказная разработка ПО для автоматизации бизнес- и производственных процессов',
    primaryColor: '#306DFA',
    secondaryColor: '#486ACC',
    navyColor: '#082A5E',
    darkColor: '#101013',
    surfaceColor: '#F8F8F9',
  });

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setPathname(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const route = parseRoute(pathname);

  // Load brand on Landing
  useEffect(() => {
    if (route.kind === 'landing') {
      publicApi
        .getBrand()
        .then((r) => {
          setBrand(r.brand);
          applyBrandCssVars(r.brand);
        })
        .catch(() => {});
    }
  }, [route.kind]);

  if (route.kind === 'client') {
    return <ClientBriefView token={route.token} />;
  }

  if (route.kind === 'admin') {
    return (
      <AdminWorkspace
        brand={brand}
        onBrandUpdated={(b) => {
          setBrand(b);
          applyBrandCssVars(b);
        }}
        onGoHome={() => navigate('/')}
      />
    );
  }

  return (
    <PortalLanding
      brand={brand}
      onOpenToken={(tok) => navigate(`/b/${encodeURIComponent(tok)}`)}
      onOpenAdmin={() => navigate('/admin')}
    />
  );
};

// ============================================================================
// Subdomain Root Landing (Publicly exposes zero client data)
// ============================================================================
const PortalLanding: React.FC<{
  brand: BrandSettings;
  onOpenToken: (token: string) => void;
  onOpenAdmin: () => void;
}> = ({ brand, onOpenToken, onOpenAdmin }) => {
  const [linkOrToken, setLinkOrToken] = useState('');

  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = linkOrToken.trim();
    if (!raw) return;
    const match = raw.match(/\/b\/([^/?#\s]+)/);
    const token = match ? match[1] : raw;
    onOpenToken(token);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo
            companyName={brand.companyName}
            subtitle="Портал предпроектного брифования"
          />
          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 hover:border-blue-300 bg-white text-xs font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 brand-text-primary" />
            Вход для МСДИС (/admin)
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold brand-soft-tint brand-text-primary border brand-soft-border">
              <Sparkles className="w-3.5 h-3.5" />
              Заказная разработка и автоматизация процессов
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight leading-tight">
              Интерактивные архитектурные брифы для клиентов{' '}
              <span className="brand-text-primary">{brand.companyName}</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Мы ценим время руководителей, главных инженеров и ИТ-директоров.
              Вместо скучных анкет сервис формирует персональные вопросы строго
              по архитектуре вашего решения — без обязательных полей и с
              мгновенным сохранением каждого ответа.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 space-y-1">
                <ShieldCheck className="w-5 h-5 brand-text-primary" />
                <div className="text-xs font-bold text-slate-900">
                  Закрытый доступ
                </div>
                <div className="text-[11px] text-slate-500">
                  Доступ к брифу только по персональной зашифрованной ссылке
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 space-y-1">
                <Layers className="w-5 h-5 brand-text-primary" />
                <div className="text-xs font-bold text-slate-900">
                  Свободный формат
                </div>
                <div className="text-[11px] text-slate-500">
                  Ни одного обязательного поля — отвечайте в удобном порядке
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 space-y-1">
                <Cpu className="w-5 h-5 brand-text-primary" />
                <div className="text-xs font-bold text-slate-900">
                  Только по делу
                </div>
                <div className="text-[11px] text-slate-500">
                  Вопросы, влияющие на архитектуру, интеграции, ИБ и запуск MVP
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
              <h2 className="text-lg font-extrabold text-slate-900">
                Открыть персональный бриф
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Перейдите по прямой ссылке от менеджера ООО «МСДИС» или вставьте
                полученную ссылку / код приглашения ниже:
              </p>

              <form onSubmit={handleOpen} className="space-y-3">
                <input
                  type="text"
                  value={linkOrToken}
                  onChange={(e) => setLinkOrToken(e.target.value)}
                  placeholder="Вставьте ссылку /b/... или токен доступа"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer"
                >
                  Перейти к брифу
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                >
                  Я сотрудник МСДИС — перейти в панель управления брифами →
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-5 text-center text-xs text-slate-400 border-t border-slate-200/70">
        © {new Date().getFullYear()} ООО «МСДИС» (mcdis.ru) · Интеллектуальная
        система предпроектного обследования
      </footer>
    </div>
  );
};

// ============================================================================
// Admin Workspace Shell
// ============================================================================
const AdminWorkspace: React.FC<{
  brand: BrandSettings;
  onBrandUpdated: (b: BrandSettings) => void;
  onGoHome: () => void;
}> = ({ brand, onBrandUpdated, onGoHome }) => {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [configuredModel, setConfiguredModel] = useState(
    'anthropic/claude-opus-5.5'
  );

  // Login form
  const [loginInput, setLoginInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Admin sub-screen
  const [screen, setScreen] = useState<
    | { name: 'list' }
    | { name: 'create' }
    | { name: 'detail'; id: string }
    | { name: 'settings' }
  >({ name: 'list' });

  const [briefs, setBriefs] = useState<BriefSummaryItem[]>([]);
  const [publicBaseUrl, setPublicBaseUrl] = useState('');

  const refreshBriefs = useCallback(async () => {
    const res = await adminApi.listBriefs();
    setBriefs(res.briefs);
    setPublicBaseUrl(res.publicBaseUrl);
  }, []);

  useEffect(() => {
    adminApi
      .getSession()
      .then(async (s) => {
        onBrandUpdated(s.brand);
        setConfiguredModel(s.configuredModel);
        setAuthenticated(s.authenticated);
        if (s.authenticated) {
          await refreshBriefs();
        }
      })
      .finally(() => setCheckingSession(false));
  }, [onBrandUpdated, refreshBriefs]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      await adminApi.login(loginInput, passwordInput);
      setAuthenticated(true);
      await refreshBriefs();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminApi.logout();
    setAuthenticated(false);
    setPasswordInput('');
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-3 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 brand-gradient-hero">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div className="flex items-center justify-between">
            <BrandLogo companyName={brand.companyName} />
            <button
              type="button"
              onClick={onGoHome}
              className="text-xs font-semibold text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              На главную
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <h1 className="text-xl font-extrabold text-slate-900">
              Панель администратора МСДИС
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Управление брифами клиентов, ИИ-генерацией и архитектурными резюме
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Логин (ADMIN_LOGIN)
              </label>
              <input
                type="text"
                value={loginInput}
                onChange={(e) => setLoginInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Пароль (ADMIN_PASSWORD)
              </label>
              <input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Введите пароль администратора"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {loginError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-2.5 rounded-xl brand-bg-primary text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer"
            >
              {loggingIn ? 'Входим...' : 'Войти в кабинет МСДИС'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 no-print">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              setScreen({ name: 'list' });
              refreshBriefs();
            }}
            className="cursor-pointer text-left"
          >
            <BrandLogo
              companyName={brand.companyName}
              subtitle="Кабинет архитектора · Все брифы"
              compact={false}
            />
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-slate-100 text-slate-600">
              <Cpu className="w-3.5 h-3.5 brand-text-primary" />
              {configuredModel}
            </span>

            <button
              type="button"
              onClick={() => setScreen({ name: 'settings' })}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                screen.name === 'settings'
                  ? 'brand-soft-tint brand-text-primary brand-soft-border'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ИИ и Бренд</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-red-600 hover:border-red-200 cursor-pointer"
              title="Выйти"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {screen.name === 'list' && (
          <AdminDashboard
            briefs={briefs}
            publicBaseUrl={publicBaseUrl}
            onCreateNew={() => setScreen({ name: 'create' })}
            onOpenBrief={(id) => setScreen({ name: 'detail', id })}
            onDeleteBrief={async (id) => {
              await adminApi.deleteBrief(id);
              await refreshBriefs();
            }}
          />
        )}

        {screen.name === 'create' && (
          <AdminCreateBrief
            configuredModel={configuredModel}
            onCancel={() => setScreen({ name: 'list' })}
            onCreated={async (created) => {
              await refreshBriefs();
              setScreen({ name: 'detail', id: created.id });
            }}
          />
        )}

        {screen.name === 'detail' && (
          <AdminBriefDetail
            briefId={screen.id}
            onBack={() => {
              refreshBriefs();
              setScreen({ name: 'list' });
            }}
          />
        )}

        {screen.name === 'settings' && (
          <AdminSettings
            brand={brand}
            onBrandUpdated={onBrandUpdated}
            onModelUpdated={setConfiguredModel}
            onBack={() => setScreen({ name: 'list' })}
          />
        )}
      </main>
    </div>
  );
};

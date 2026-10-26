import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export interface AppConfig {
  host: string;
  port: number;
  publicBaseUrl: string;
  closerouterBaseUrl: string;
  closerouterApiKey: string;
  closerouterModel: string;
  closerouterFallbackModels: string[];
  aiWebSearchEnabled: boolean;
  tavilyApiKey: string;
  adminLogin: string;
  adminPassword: string;
  sessionSecret: string;
  dataDir: string;
  maxUploadMb: number;
  brandDefaults: {
    primaryColor: string;
    secondaryColor: string;
    navyColor: string;
    darkColor: string;
    surfaceColor: string;
  };
}

export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const rawFallbacks =
    process.env.CLOSEROUTER_FALLBACK_MODELS ??
    'openai/gpt-6.1-sol,anthropic/claude-sonnet-5.5,openai/gpt-6-astra';

  const rawKey = (process.env.CLOSEROUTER_API_KEY ?? '').trim();
  const isPlaceholderKey =
    !rawKey ||
    rawKey === 'closerouter_your_api_key_here' ||
    rawKey === 'your_api_key_here';

  return {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
    closerouterBaseUrl: (
      process.env.CLOSEROUTER_BASE_URL || 'https://api.closerouter.dev/v1'
    ).replace(/\/+$/, ''),
    closerouterApiKey: isPlaceholderKey ? '' : rawKey,
    closerouterModel:
      process.env.CLOSEROUTER_MODEL || 'anthropic/claude-opus-5.5',
    closerouterFallbackModels: rawFallbacks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    aiWebSearchEnabled:
      (process.env.AI_WEB_SEARCH_ENABLED ?? 'true').toLowerCase() !== 'false',
    tavilyApiKey: (process.env.TAVILY_API_KEY || '').trim(),
    adminLogin: process.env.ADMIN_LOGIN || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || 'mcdis-admin-2026',
    sessionSecret:
      process.env.SESSION_SECRET ||
      'mcdis-brief-change-this-secret-in-production-2026',
    dataDir: path.resolve(process.env.DATA_DIR || './data'),
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),
    brandDefaults: {
      primaryColor: process.env.BRAND_PRIMARY || '#306DFA',
      secondaryColor: process.env.BRAND_SECONDARY || '#486ACC',
      navyColor: process.env.BRAND_NAVY || '#082A5E',
      darkColor: process.env.BRAND_DARK || '#101013',
      surfaceColor: process.env.BRAND_SURFACE || '#F8F8F9',
    },
    ...overrides,
  };
}

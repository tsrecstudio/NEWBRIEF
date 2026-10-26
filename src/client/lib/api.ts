import type {
  ArchitectureBlueprint,
  BrandSettings,
  BriefClientIntake,
  BriefRecord,
  BriefSummaryItem,
  FileAttachmentMeta,
  PublicBriefPayload,
  QuestionAnswerValue,
} from '../../shared/types';

const ADMIN_TOKEN_STORAGE = 'msdis_admin_token_v1';
const PIN_TOKEN_STORAGE_PREFIX = 'msdis_brief_pin_token_';

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_STORAGE, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_STORAGE);
  } catch {
    // ignore storage restrictions
  }
}

export function getStoredPinToken(briefId: string): string | null {
  try {
    return localStorage.getItem(`${PIN_TOKEN_STORAGE_PREFIX}${briefId}`);
  } catch {
    return null;
  }
}

export function setStoredPinToken(briefId: string, token: string): void {
  try {
    localStorage.setItem(`${PIN_TOKEN_STORAGE_PREFIX}${briefId}`, token);
  } catch {
    // ignore
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const adminToken = getStoredAdminToken();
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(adminToken ? { 'x-admin-token': adminToken } : {}),
    ...extraHeaders,
  };

  const res = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...headers,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || `Ошибка запроса (${res.status})`
    );
  }
  return data as T;
}

// ============================================================================
// Public Client Brief API (Always uses relative /api/public/* paths)
// ============================================================================
export const publicApi = {
  getBrand: () => requestJson<{ brand: BrandSettings }>('/api/public/brand'),

  getBrief: (token: string, knownBriefId?: string) => {
    const pinTok = knownBriefId ? getStoredPinToken(knownBriefId) : null;
    return requestJson<
      | {
          requiresPin: true;
          id: string;
          title: string;
          companyName: string;
          pinHint?: string;
          brand: BrandSettings;
        }
      | {
          requiresPin: false;
          brief: PublicBriefPayload;
        }
    >(
      `/api/public/briefs/${encodeURIComponent(token)}`,
      {},
      pinTok ? { 'x-brief-pin-token': pinTok } : {}
    );
  },

  unlockWithPin: async (token: string, briefId: string, pin: string) => {
    const res = await requestJson<{ ok: boolean; pinSessionToken?: string }>(
      `/api/public/briefs/${encodeURIComponent(token)}/unlock`,
      {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }
    );
    if (res.pinSessionToken) {
      setStoredPinToken(briefId, res.pinSessionToken);
    }
    return res;
  },

  patchAnswers: (
    token: string,
    briefId: string,
    payload: {
      answers?: Record<string, QuestionAnswerValue>;
      respondentName?: string;
      respondentRole?: string;
      respondentContact?: string;
      markSubmitted?: boolean;
    }
  ) => {
    const pinTok = getStoredPinToken(briefId);
    return requestJson<{
      ok: boolean;
      status: PublicBriefPayload['status'];
      answers: Record<string, QuestionAnswerValue>;
      updatedAt: string;
      submittedAt?: string;
    }>(
      `/api/public/briefs/${encodeURIComponent(token)}/answers`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      pinTok ? { 'x-brief-pin-token': pinTok } : {}
    );
  },

  uploadFiles: (
    token: string,
    briefId: string,
    questionId: string,
    files: File[]
  ) => {
    const form = new FormData();
    form.append('questionId', questionId);
    for (const f of files) {
      form.append('files', f);
    }
    const pinTok = getStoredPinToken(briefId);
    return requestJson<{ ok: boolean; attachments: FileAttachmentMeta[] }>(
      `/api/public/briefs/${encodeURIComponent(token)}/files`,
      {
        method: 'POST',
        body: form,
      },
      pinTok ? { 'x-brief-pin-token': pinTok } : {}
    );
  },

  deleteFile: (token: string, briefId: string, fileId: string) => {
    const pinTok = getStoredPinToken(briefId);
    return requestJson<{ ok: boolean }>(
      `/api/public/briefs/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
      pinTok ? { 'x-brief-pin-token': pinTok } : {}
    );
  },
};

// ============================================================================
// Admin API (/api/admin/*)
// ============================================================================
export const adminApi = {
  getSession: () =>
    requestJson<{
      authenticated: boolean;
      brand: BrandSettings;
      configuredModel: string;
      hasApiKey: boolean;
    }>('/api/admin/session'),

  login: async (login: string, password: string) => {
    const res = await requestJson<{ ok: boolean; adminToken?: string }>(
      '/api/admin/login',
      {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      }
    );
    if (res.adminToken) setStoredAdminToken(res.adminToken);
    return res;
  },

  logout: async () => {
    setStoredAdminToken(null);
    return requestJson<{ ok: boolean }>('/api/admin/logout', {
      method: 'POST',
    });
  },

  getAiStatus: () =>
    requestJson<{
      configured: boolean;
      reachable: boolean;
      activeModel: string;
      fallbackModels: string[];
      baseUrl: string;
      credits?: unknown;
      availableModelsSample?: string[];
      error?: string;
    }>('/api/admin/ai-status'),

  saveAiSettings: (payload: { apiKey?: string; model?: string }) =>
    requestJson<{ ok: boolean; activeModel: string; configured: boolean }>(
      '/api/admin/ai-settings',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  getBrand: () => requestJson<{ brand: BrandSettings }>('/api/admin/brand'),

  saveBrand: (patch: Partial<BrandSettings>) =>
    requestJson<{ ok: boolean; brand: BrandSettings }>('/api/admin/brand', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),

  extractBrandFromPdf: (file: File) => {
    const form = new FormData();
    form.append('pdf', file);
    return requestJson<{
      ok: boolean;
      extracted: {
        palette: string[];
        suggestedPrimary: string;
        suggestedSecondary: string;
        suggestedNavy: string;
        suggestedDark: string;
      };
      brand: BrandSettings;
    }>('/api/admin/brand/extract-pdf', {
      method: 'POST',
      body: form,
    });
  },

  listBriefs: () =>
    requestJson<{ briefs: BriefSummaryItem[]; publicBaseUrl: string }>(
      '/api/admin/briefs'
    ),

  generateBrief: (
    payload: BriefClientIntake & {
      customTitle?: string;
      pinCode?: string;
      pinHint?: string;
    }
  ) =>
    requestJson<{ ok: boolean; brief: BriefRecord }>(
      '/api/admin/briefs/generate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getBrief: (id: string) =>
    requestJson<{ brief: BriefRecord; publicBaseUrl: string }>(
      `/api/admin/briefs/${encodeURIComponent(id)}`
    ),

  updateBrief: (
    id: string,
    patch: Partial<{
      title: string;
      clientWelcomeNote: string;
      estimatedMinutes: number;
      status: BriefRecord['status'];
      sections: BriefRecord['sections'];
      questions: BriefRecord['questions'];
      pinCode: string | null;
      pinHint: string | null;
      regenerateToken: boolean;
    }>
  ) =>
    requestJson<{ ok: boolean; brief: BriefRecord }>(
      `/api/admin/briefs/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  generateMoreQuestions: (id: string, topic: string) =>
    requestJson<{ ok: boolean; addedCount: number; brief: BriefRecord }>(
      `/api/admin/briefs/${encodeURIComponent(id)}/more-questions`,
      {
        method: 'POST',
        body: JSON.stringify({ topic }),
      }
    ),

  generateBlueprint: (id: string) =>
    requestJson<{
      ok: boolean;
      blueprint: ArchitectureBlueprint;
      brief: BriefRecord;
    }>(`/api/admin/briefs/${encodeURIComponent(id)}/blueprint`, {
      method: 'POST',
    }),

  deleteBrief: (id: string) =>
    requestJson<{ ok: boolean }>(
      `/api/admin/briefs/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    ),
};

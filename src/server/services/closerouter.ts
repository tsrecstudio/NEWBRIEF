import type { AppConfig } from '../config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CloseRouterCompletionResult {
  content: string;
  modelUsed: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class CloseRouterError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'CloseRouterError';
  }
}

/**
 * Extracts valid JSON object/array from an LLM response even if wrapped in
 * ```json ... ``` fences or preceded by <think>...</think> reasoning tags.
 */
export function extractJsonFromLlm<T>(raw: string): T {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Locate outermost { ... } or [ ... ]
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned
        .slice(firstBrace, lastBrace + 1)
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(candidate) as T;
    }
    throw new Error(
      `Failed to parse JSON from model output: ${cleaned.slice(0, 200)}`
    );
  }
}

export class CloseRouterClient {
  constructor(
    private config: AppConfig,
    private getRuntimeOverrides?: () => { apiKey?: string; model?: string },
    private fetchImpl: typeof fetch = fetch
  ) {}

  getEffectiveApiKey(): string {
    const override = this.getRuntimeOverrides?.().apiKey?.trim();
    if (override) return override;
    return this.config.closerouterApiKey;
  }

  getEffectiveModel(): string {
    const override = this.getRuntimeOverrides?.().model?.trim();
    if (override) return override;
    return this.config.closerouterModel;
  }

  isConfigured(): boolean {
    return Boolean(this.getEffectiveApiKey());
  }

  async completeChat(params: {
    messages: ChatMessage[];
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<CloseRouterCompletionResult> {
    const apiKey = this.getEffectiveApiKey();
    if (!apiKey) {
      throw new CloseRouterError(
        'CLOSEROUTER_API_KEY is not configured',
        401,
        'missing_api_key'
      );
    }

    const primaryModel = this.getEffectiveModel();
    const candidateModels = [
      primaryModel,
      ...this.config.closerouterFallbackModels.filter(
        (m) => m !== primaryModel
      ),
    ];

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const res = await this.fetchImpl(
          `${this.config.closerouterBaseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: params.messages,
              max_tokens: params.maxTokens ?? 7500,
            }),
            signal: AbortSignal.timeout(params.timeoutMs ?? 90000),
          }
        );

        const textBody = await res.text();
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(textBody);
        } catch {
          throw new CloseRouterError(
            `Invalid JSON from CloseRouter (${res.status}): ${textBody.slice(0, 200)}`,
            res.status
          );
        }

        if (!res.ok) {
          const errObj = (data.error || {}) as Record<string, unknown>;
          const code = String(errObj.code || `http_${res.status}`);
          const msg = String(
            errObj.message || `CloseRouter error ${res.status}`
          );

          // Fatal account errors shouldn't retry other models
          if (res.status === 401 || res.status === 402) {
            throw new CloseRouterError(msg, res.status, code);
          }

          lastError = new CloseRouterError(
            `[${model}] ${msg}`,
            res.status,
            code
          );
          continue;
        }

        const choices = data.choices as
          | Array<{ message?: { content?: unknown } }>
          | undefined;
        const rawContent = choices?.[0]?.message?.content;
        const content =
          typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? rawContent
                  .map((part: Record<string, unknown>) =>
                    typeof part?.text === 'string' ? part.text : ''
                  )
                  .join('\n')
              : '';

        if (!content.trim()) {
          lastError = new CloseRouterError(
            `Empty content returned from model ${model}`,
            502,
            'empty_response'
          );
          continue;
        }

        return {
          content,
          modelUsed: String(data.model || model),
          usage: data.usage as CloseRouterCompletionResult['usage'],
        };
      } catch (err) {
        if (
          err instanceof CloseRouterError &&
          (err.status === 401 || err.status === 402)
        ) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw (
      lastError ||
      new CloseRouterError('All candidate models failed on CloseRouter', 503)
    );
  }

  async checkStatus(): Promise<{
    configured: boolean;
    reachable: boolean;
    activeModel: string;
    fallbackModels: string[];
    baseUrl: string;
    credits?: unknown;
    availableModelsSample?: string[];
    error?: string;
  }> {
    const apiKey = this.getEffectiveApiKey();
    const activeModel = this.getEffectiveModel();
    if (!apiKey) {
      return {
        configured: false,
        reachable: false,
        activeModel,
        fallbackModels: this.config.closerouterFallbackModels,
        baseUrl: this.config.closerouterBaseUrl,
        error:
          'API-ключ CloseRouter не задан (укажите CLOSEROUTER_API_KEY в .env или в настройках)',
      };
    }

    try {
      const [modelsRes, creditsRes] = await Promise.allSettled([
        this.fetchImpl(
          `${this.config.closerouterBaseUrl}/models?limit=25`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(8000),
          }
        ),
        this.fetchImpl(`${this.config.closerouterBaseUrl}/credits`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        }),
      ]);

      if (modelsRes.status === 'rejected') {
        return {
          configured: true,
          reachable: false,
          activeModel,
          fallbackModels: this.config.closerouterFallbackModels,
          baseUrl: this.config.closerouterBaseUrl,
          error: `Не удалось достучаться до ${this.config.closerouterBaseUrl}: ${modelsRes.reason?.message || modelsRes.reason}`,
        };
      }

      if (!modelsRes.value.ok) {
        const errData = (await modelsRes.value
          .json()
          .catch(() => ({}))) as { error?: { message?: string } };
        return {
          configured: true,
          reachable: false,
          activeModel,
          fallbackModels: this.config.closerouterFallbackModels,
          baseUrl: this.config.closerouterBaseUrl,
          error:
            errData?.error?.message ||
            `Ошибка авторизации CloseRouter (${modelsRes.value.status})`,
        };
      }

      const modelsJson = (await modelsRes.value.json().catch(() => ({}))) as {
        data?: Array<{ id: string }>;
      };
      const creditsJson =
        creditsRes.status === 'fulfilled' && creditsRes.value.ok
          ? await creditsRes.value.json().catch(() => undefined)
          : undefined;

      return {
        configured: true,
        reachable: true,
        activeModel,
        fallbackModels: this.config.closerouterFallbackModels,
        baseUrl: this.config.closerouterBaseUrl,
        credits: creditsJson,
        availableModelsSample: (modelsJson.data || [])
          .slice(0, 20)
          .map((m) => m.id),
      };
    } catch (err) {
      return {
        configured: true,
        reachable: false,
        activeModel,
        fallbackModels: this.config.closerouterFallbackModels,
        baseUrl: this.config.closerouterBaseUrl,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

import { describe, it, expect } from 'vitest';
import { getConfig } from '../src/server/config.js';
import {
  CloseRouterClient,
  extractJsonFromLlm,
} from '../src/server/services/closerouter.js';
import { WebResearchService } from '../src/server/services/webResearch.js';
import { BriefGeneratorService } from '../src/server/services/briefGenerator.js';

describe('CloseRouter API Integration, Model Fallback & Web Search Research Pipeline', () => {
  it('parses JSON cleanly even when wrapped in <think> blocks and markdown code fences', () => {
    const raw = `<think>Подбираем архитектурные развилки...</think>\n\`\`\`json\n{\n  "queries": ["запрос 1", "запрос 2",]\n}\n\`\`\``;
    const parsed = extractJsonFromLlm<{ queries: string[] }>(raw);
    expect(parsed.queries).toEqual(['запрос 1', 'запрос 2']);
  });

  it('calls CloseRouter /v1/chat/completions with anthropic/claude-opus-5.5 and falls back to openai/gpt-6.1-sol on 503', async () => {
    const calledModels: string[] = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      expect(url).toBe('https://api.closerouter.dev/v1/chat/completions');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer closerouter_live_test_key');

      const body = JSON.parse(String(init?.body));
      calledModels.push(body.model);

      if (body.model === 'anthropic/claude-opus-5.5') {
        return new Response(
          JSON.stringify({
            error: {
              code: 'no_available_provider',
              message: 'Upstream temporarily saturated',
            },
          }),
          { status: 503 }
        );
      }

      return new Response(
        JSON.stringify({
          model: body.model,
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"ok": true}',
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const cfg = getConfig({
      closerouterApiKey: 'closerouter_live_test_key',
      closerouterModel: 'anthropic/claude-opus-5.5',
      closerouterFallbackModels: ['openai/gpt-6.1-sol', 'anthropic/claude-sonnet-5.5'],
    });

    const client = new CloseRouterClient(cfg, undefined, mockFetch);
    const result = await client.completeChat({
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(calledModels).toEqual([
      'anthropic/claude-opus-5.5',
      'openai/gpt-6.1-sol',
    ]);
    expect(result.modelUsed).toBe('openai/gpt-6.1-sol');
    expect(result.content).toBe('{"ok": true}');
  });

  it('executes full Web Search + Client Website Crawl + AI Brief Synthesis pipeline', async () => {
    let llmCallIndex = 0;

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);

      // 1. Mock Client Website Homepage & /about page
      if (url.startsWith('https://agro-milk-plant.ru')) {
        if (url.includes('/about')) {
          return new Response(
            `<html><head><title>О заводе АгроМолПром</title></head><body>
              <h2>Производственные мощности</h2>
              <p>Переработка 450 тонн молока в сутки, обязательная маркировка Честный ЗНАК и интеграция с ФГИС Меркурий.</p>
            </body></html>`,
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        }
        return new Response(
          `<html><head><title>АгроМолПром — молочный комбинат</title>
            <meta name="description" content="Крупный производитель молочной продукции" /></head>
            <body>
              <a href="/about">О компании</a>
              <p>Собственные цеха пастеризации, фасовки и холодный склад WMS.</p>
            </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }

      // 2. Mock DuckDuckGo HTML Search
      if (url.includes('html.duckduckgo.com')) {
        return new Response(
          `<div class="result">
            <a class="result__a" href="https://example.com/mercury-mes">Интеграция MES молочного завода с ФГИС Меркурий и Честный ЗНАК</a>
            <a class="result__snippet">Прослеживаемость партий сырого молока, поштучный агрегированный код DataMatrix на высокоскоростных линиях.</a>
          </div>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        );
      }

      // 3. Mock Wikipedia RU Search
      if (url.includes('ru.wikipedia.org')) {
        return new Response(
          JSON.stringify({
            query: {
              search: [
                {
                  title: 'MES',
                  pageid: 100,
                  snippet: 'Система управления производственными процессами в реальном времени',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      // 4. Mock CloseRouter LLM Calls (Call 1 = Query Planner, Call 2 = Brief Generator, Call 3 = Presale Blueprint)
      if (url.includes('api.closerouter.dev/v1/chat/completions')) {
        llmCallIndex += 1;
        if (llmCallIndex === 1) {
          return new Response(
            JSON.stringify({
              model: 'anthropic/claude-opus-5.5',
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      queries: [
                        'АгроМолПром производство Честный ЗНАК Меркурий',
                        'MES молочный завод интеграция 1С ERP DataMatrix',
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            model: 'anthropic/claude-opus-5.5',
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: 'Архитектурный бриф: MES и маркировка для АгроМолПром',
                    clientWelcomeNote: 'Персональный бриф без обязательных вопросов.',
                    estimatedMinutes: 6,
                    researchDossier: {
                      companySummary:
                        'Молочный комбинат мощностью 450 т/сутки с контуром Честный ЗНАК и ФГИС Меркурий.',
                      industryInsights: ['Высокоскоростная сериализация DataMatrix на линиях розлива'],
                      inferredTechLandscape: ['1С:ERP', 'ФГИС Меркурий', 'Честный ЗНАК'],
                      regulatoryAndSecurityFactors: ['ВетИС Меркурий', '152-ФЗ'],
                      keyArchitecturalHypotheses: ['Edge-сервер на линии розлива для безостановочной печати кодов'],
                    },
                    sections: [
                      {
                        id: 's1',
                        title: 'Линии розлива, Меркурий и прослеживаемость',
                        description: 'Архитектура обмена на скоростных линиях',
                      },
                    ],
                    questions: [
                      {
                        id: 'q1',
                        sectionId: 's1',
                        type: 'like_or_not',
                        title: 'Сверка гипотез по линиям фасовки',
                        architectureImpact: 'Выбор Edge-узла агрегации кодов',
                        statements: [
                          { id: 'st1', text: 'Скорость линии свыше 6 000 уп./час' },
                        ],
                      },
                      {
                        id: 'q2',
                        sectionId: 's1',
                        type: 'spectrum',
                        title: 'Автономность линии при потере связи с ЦОД',
                        architectureImpact: 'Локальная БД цеха vs тонкий клиент',
                        spectrum: {
                          leftTitle: 'Облачная/центральная база',
                          rightTitle: 'Полная автономность линии 24 часа',
                        },
                      },
                      {
                        id: 'q3',
                        sectionId: 's1',
                        type: 'multi_choice',
                        title: 'Системы обмена',
                        architectureImpact: 'Шина интеграций',
                        options: [
                          { id: 'o1', label: '1С:ERP' },
                          { id: 'o2', label: 'ФГИС Меркурий' },
                        ],
                      },
                      {
                        id: 'q4',
                        sectionId: 's1',
                        type: 'file_upload',
                        title: 'Схема линий и примеры отчётов',
                        architectureImpact: 'Модель данных партий',
                        allowFiles: true,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response('Not found', { status: 404 });
    };

    const cfg = getConfig({
      closerouterApiKey: 'closerouter_test_key',
      closerouterModel: 'anthropic/claude-opus-5.5',
      aiWebSearchEnabled: true,
    });

    const aiClient = new CloseRouterClient(cfg, undefined, mockFetch);
    const webResearch = new WebResearchService({
      fetchImpl: mockFetch,
      skipDnsCheckForTests: true,
    });
    const generator = new BriefGeneratorService(cfg, aiClient, webResearch);

    const generated = await generator.generateBrief({
      companyName: 'АгроМолПром',
      companyWebsite: 'https://agro-milk-plant.ru',
      industry: 'Молочная промышленность',
      projectContext: 'Нужна система учёта партий молока, MES и маркировка.',
      enableWebSearch: true,
    });

    expect(generated.researchDossier.usedFallbackEngine).toBe(false);
    expect(generated.researchDossier.aiModelUsed).toBe(
      'anthropic/claude-opus-5.5'
    );
    // Must contain crawled website + search engine + Wikipedia sources!
    expect(generated.researchDossier.sources.length).toBeGreaterThanOrEqual(3);
    expect(
      generated.researchDossier.sources.some((s) =>
        s.url.includes('agro-milk-plant.ru/about')
      )
    ).toBe(true);
    expect(generated.questions).toHaveLength(4);
  });
});

import express, { type Express } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { getConfig, type AppConfig } from './config.js';
import { BriefDatabase } from './db.js';
import { CloseRouterClient } from './services/closerouter.js';
import { WebResearchService } from './services/webResearch.js';
import { BriefGeneratorService } from './services/briefGenerator.js';
import { createPublicBriefRouter } from './routes/publicBrief.js';
import { createAdminRouter } from './routes/admin.js';

export interface ServerBundle {
  app: Express;
  db: BriefDatabase;
  config: AppConfig;
  aiClient: CloseRouterClient;
  webResearch: WebResearchService;
  briefGenerator: BriefGeneratorService;
}

export function createAppBundle(
  configOverrides: Partial<AppConfig> = {},
  options: {
    seedDemo?: boolean;
    fetchImpl?: typeof fetch;
    skipDnsCheckForTests?: boolean;
  } = {}
): ServerBundle {
  const config = getConfig(configOverrides);
  const db = new BriefDatabase(config, { seedDemo: options.seedDemo });

  const aiClient = new CloseRouterClient(
    config,
    () => db.getRuntimeAiOverrides(),
    options.fetchImpl
  );

  const webResearch = new WebResearchService({
    tavilyApiKey: config.tavilyApiKey,
    fetchImpl: options.fetchImpl,
    skipDnsCheckForTests: options.skipDnsCheckForTests,
  });

  const briefGenerator = new BriefGeneratorService(
    config,
    aiClient,
    webResearch
  );

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'msdis-smart-brief',
      company: 'ООО «МСДИС»',
      model: aiClient.getEffectiveModel(),
      aiConfigured: aiClient.isConfigured(),
      webSearchEnabled: config.aiWebSearchEnabled,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/public', createPublicBriefRouter(db, config));
  app.use(
    '/api/admin',
    createAdminRouter(db, config, aiClient, briefGenerator)
  );

  // Clean error handler (including Multer upload size errors)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (err instanceof multer.MulterError) {
        res.status(413).json({
          error: 'upload_error',
          message:
            err.code === 'LIMIT_FILE_SIZE'
              ? `Файл превышает лимит ${config.maxUploadMb} МБ`
              : `Ошибка загрузки файла: ${err.message}`,
        });
        return;
      }
      console.error('[Server Error]', err);
      res.status(500).json({
        error: 'internal_error',
        message:
          err instanceof Error ? err.message : 'Внутренняя ошибка сервера',
      });
    }
  );

  return { app, db, config, aiClient, webResearch, briefGenerator };
}

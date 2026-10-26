import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { createAppBundle } from './app.js';

async function startDev() {
  const { app, config } = createAppBundle();

  const vite = await createViteServer({
    root: path.resolve(process.cwd(), 'src/client'),
    server: {
      middlewareMode: true,
      allowedHosts: true,
      hmr: true,
    },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    if (req.originalUrl.startsWith('/api/')) {
      next();
      return;
    }
    try {
      const indexPath = path.resolve(process.cwd(), 'src/client/index.html');
      let template = fs.readFileSync(indexPath, 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({
        'Content-Type': 'text/html; charset=utf-8',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(config.port, config.host, () => {
    console.log(
      `[МСДИС Smart Brief] Dev server running at http://${config.host}:${config.port} (Model: ${config.closerouterModel})`
    );
  });
}

startDev();

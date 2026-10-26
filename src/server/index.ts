import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAppBundle } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { app, config } = createAppBundle();

// Locate built SPA assets (dist/client)
const clientDistCandidates = [
  path.resolve(__dirname, '../../client'),
  path.resolve(process.cwd(), 'dist/client'),
];
const clientDist =
  clientDistCandidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) ||
  clientDistCandidates[1];

app.use(
  express.static(clientDist, {
    index: false,
    maxAge: '1h',
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(config.port, config.host, () => {
  console.log(
    `[МСДИС Smart Brief] Production server listening on http://${config.host}:${config.port} (AI model: ${config.closerouterModel})`
  );
});

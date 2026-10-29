import { resolve } from 'node:path';
import express from 'express';
import { createDatabase } from './db';
import { createApp } from './app';
import { seedDemo } from './seed';
const db = await createDatabase();
if (process.env.DEMO_ENABLED !== 'false') await seedDemo(db);
const app = createApp(db);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist'), { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, host: '0.0.0.0', allowedHosts: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, process.env.HOST || '0.0.0.0', () =>
  console.log(
    JSON.stringify({
      event: 'server.ready',
      port,
      url: `http://localhost:${port}`,
      mode: process.env.NODE_ENV || 'development',
    }),
  ),
);
server.requestTimeout = 60000;
server.headersTimeout = 65000;
const stop = () =>
  server.close(() => {
    void db.close().then(() => process.exit(0));
  });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

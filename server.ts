/**
 * server.ts — Nextgen Gaming Station Management API + Vite dev server.
 *
 * Architecture:
 *   Express handles all /api/* routes, then falls through to Vite (dev)
 *   or the built dist/ folder (production).
 *
 * DB lifecycle:
 *   - getDb() is called at startup to open the connection and run migrations.
 *   - seedDatabase() populates stations + pricing on first run.
 *   - closeDb() is called on SIGINT/SIGTERM for clean shutdown.
 */

import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bodyParser from 'body-parser';

import { getDb, closeDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';

import stationRoutes  from './routes/stations.js';
import pricingRoutes  from './routes/pricing.js';
import logsRoutes     from './routes/logs.js';
import settingsRoutes from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

async function startServer(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Database — initialize before accepting any requests
  // -------------------------------------------------------------------------
  const db = await getDb();
  await seedDatabase(db);

  // -------------------------------------------------------------------------
  // 2. Express setup
  // -------------------------------------------------------------------------
  const app  = express();
  const PORT = parseInt(process.env.PORT ?? '7432');

  app.use(cors());
  app.use(bodyParser.json());

  // -------------------------------------------------------------------------
  // 3. API Routes
  // -------------------------------------------------------------------------
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/stations', stationRoutes);
  app.use('/api/pricing',  pricingRoutes);

  // Logs router handles both /api/logs and /api/reports/daily
  app.use('/api/logs',           logsRoutes);
  app.use('/api/reports',        logsRoutes);

  // Settings router handles /api/admin/verify-pin, /api/settings
  app.use('/api', settingsRoutes);

  // -------------------------------------------------------------------------
  // 4. Frontend — Vite dev middleware or production static files
  // -------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: 7433 } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    // SPA fallback — serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // -------------------------------------------------------------------------
  // 5. Start listening
  // -------------------------------------------------------------------------
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Nextgen Gaming API running on http://localhost:${PORT}`);
    console.log(`[server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });

  // -------------------------------------------------------------------------
  // 6. Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    console.log(`\n[server] Received ${signal} — shutting down gracefully…`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });

    // Force exit if server hasn't closed within 10 s
    setTimeout(() => {
      console.error('[server] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(err => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});

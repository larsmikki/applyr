import { config } from './config';
import { initDb, closeDb } from './db/connection';
import { createApp } from './app';
import { scheduleAutoStatusUpdate } from './services/autoStatus';

async function main() {
  console.log('[applyr] Starting server...');
  console.log(`[applyr] Data directory: ${config.dataDir}`);

  initDb(config.dataDir);
  console.log('[applyr] Database initialized');

  scheduleAutoStatusUpdate();

  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`[applyr] Server running at http://localhost:${config.port}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[applyr] Client dev server expected at http://localhost:${config.port}`);
    }
  });

  // Graceful shutdown: stop accepting new connections, then checkpoint WAL and close the DB
  // so an abrupt SIGTERM (Docker stop, systemd, Ctrl+C) doesn't leave the journal half-flushed.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[applyr] Received ${signal}, shutting down...`);
    server.close(() => {
      closeDb();
      console.log('[applyr] Shutdown complete');
      process.exit(0);
    });
    // Hard exit if connections linger past 10s
    setTimeout(() => {
      console.warn('[applyr] Forced exit after timeout');
      closeDb();
      process.exit(1);
    }, 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[applyr] Failed to start:', err);
  process.exit(1);
});

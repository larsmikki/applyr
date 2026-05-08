import { config } from './config';
import { initDb } from './db/connection';
import { createApp } from './app';

async function main() {
  console.log('[applyr] Starting server...');
  console.log(`[applyr] Data directory: ${config.dataDir}`);

  initDb(config.dataDir);
  console.log('[applyr] Database initialized');

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`[applyr] Server running at http://localhost:${config.port}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[applyr] Client dev server expected at http://localhost:${config.port}`);
    }
  });
}

main().catch(err => {
  console.error('[applyr] Failed to start:', err);
  process.exit(1);
});

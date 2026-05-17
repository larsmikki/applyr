import { Router } from 'express';
import { getDb } from '../db/connection';

const router = Router();

router.get('/', (_req, res) => {
  // Verify the SQLite handle is reachable. A trivial query is cheap on better-sqlite3
  // (synchronous, ~microseconds) and turns this into a real liveness check for
  // Docker/k8s/uptime monitors rather than a static 200.
  try {
    getDb().prepare('SELECT 1 as ok').get();
    res.json({ status: 'ok', database: 'ok', version: '1.0.0', timestamp: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(503).json({ status: 'error', database: 'error', error: message, timestamp: Date.now() });
  }
});

export default router;

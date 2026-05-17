import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrate';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    db.close();
    db = null;
  }
}

export function initDb(dataDir: string): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'applyr.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // synchronous=NORMAL is the SQLite-recommended pairing for WAL: writes are still
  // crash-safe (WAL frames are fsynced on checkpoint), but per-transaction fsync is
  // skipped — typically 2-5x faster writes for the kind of small frequent inserts
  // this app makes (status changes, notes, generation logs).
  db.pragma('synchronous = NORMAL');
  // Cap how large the WAL file can get before it auto-checkpoints (1000 pages ≈ 4 MB
  // with the default 4 KB page size). Prevents unbounded growth between manual checkpoints.
  db.pragma('wal_autocheckpoint = 1000');

  runMigrations(db, dataDir);
}

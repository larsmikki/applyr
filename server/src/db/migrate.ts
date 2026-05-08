import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export function runMigrations(db: Database.Database, _dataDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.warn('[migrate] Migrations directory not found at:', migrationsDir);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const appliedNames = new Set(applied.map(r => r.name));

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
  );

  for (const file of files) {
    if (appliedNames.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const runMigration = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file, Date.now());
    });

    runMigration();
    console.log(`[migrate] Applied: ${file}`);
  }
}

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { PROMPTS, getEffectivePrompts } from '../constants/prompts';

const router = Router();

router.get('/', authMiddleware, (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.key === 'ai_api_key' && row.value) {
      result[row.key] = '***';
    } else {
      result[row.key] = row.value;
    }
  }

  res.json(result);
});

router.put('/', authMiddleware, (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction((data: Record<string, string>) => {
    for (const [key, value] of Object.entries(data)) {
      stmt.run(key, value);
    }
  });

  updateMany(updates);

  // Return updated settings with masked api_key
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.key === 'ai_api_key' && row.value) {
      result[row.key] = '***';
    } else {
      result[row.key] = row.value;
    }
  }

  res.json(result);
});

router.get('/api-key-status', authMiddleware, (_req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_api_key'").get() as { value: string } | undefined;
  res.json({ configured: !!(row?.value && row.value.trim()) });
});

router.get('/local-models', authMiddleware, async (_req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_ollama_url'").get() as { value: string } | undefined;
    const ollamaUrl = (row?.value && row.value.trim()) || 'http://localhost:11434';

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await response.json() as { models?: { name: string }[] };
    const models = (data.models || [])
      .map((m) => m.name)
      .filter((n) => !n.includes(':embed'));
    res.json({ models });
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException & { name?: string };
    if (err.code === 'ECONNREFUSED') {
      res.json({ models: [], error: 'not_running', message: "Ollama is not running. Start it with `ollama serve`." });
    } else if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      res.json({ models: [], error: 'timeout', message: "Could not reach Ollama — check if it's on a non-default port." });
    } else {
      res.json({ models: [], error: 'unknown', message: String(err.message || err) });
    }
  }
});

router.get('/prompts', authMiddleware, (_req, res) => {
  const db = getDb();
  const effective = getEffectivePrompts(db);
  const keys = Object.keys(PROMPTS);
  const dbKeys = keys.map(k => `prompt_${k}`);
  const placeholders = dbKeys.map(() => '?').join(', ');
  const customRows = db.prepare(
    `SELECT key FROM settings WHERE key IN (${placeholders})`
  ).all(...dbKeys) as { key: string }[];
  const customized = customRows.map(r => r.key.slice('prompt_'.length));
  res.json({ prompts: effective, customized });
});

router.put('/prompts/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  if (!(key in PROMPTS)) return res.status(400).json({ error: 'Unknown prompt key' });
  const { text } = req.body as { text?: string };
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Invalid prompt text' });
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`prompt_${key}`, text.trim());
  return res.json({ success: true });
});

router.delete('/prompts/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  if (!(key in PROMPTS)) return res.status(400).json({ error: 'Unknown prompt key' });
  const db = getDb();
  db.prepare('DELETE FROM settings WHERE key = ?').run(`prompt_${key}`);
  return res.json({ success: true });
});

router.get('/browse', authMiddleware, (req, res) => {
  try {
    const requestedPath = req.query.path as string | undefined;

    if (!requestedPath) {
      // Return filesystem roots
      if (process.platform === 'win32') {
        const drives: { name: string; path: string; hasChildren: boolean }[] = [];
        for (let i = 65; i <= 90; i++) {
          const drivePath = `${String.fromCharCode(i)}:\\`;
          try { fs.accessSync(drivePath, fs.constants.R_OK); drives.push({ name: drivePath, path: drivePath, hasChildren: true }); } catch { /* not accessible */ }
        }
        return res.json({ currentPath: '', parent: null, directories: drives });
      }
      return res.json({ currentPath: '', parent: null, directories: [{ name: '/', path: '/', hasChildren: true }] });
    }

    if (typeof requestedPath !== 'string' || requestedPath.includes('\0')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const resolved = path.resolve(requestedPath);
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const directories: { name: string; path: string; hasChildren: boolean }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const childPath = path.join(resolved, entry.name);
      let hasChildren = false;
      try { hasChildren = fs.readdirSync(childPath, { withFileTypes: true }).some(c => c.isDirectory()); } catch { /* permission denied */ }
      directories.push({ name: entry.name, path: childPath, hasChildren });
    }

    directories.sort((a, b) => a.name.localeCompare(b.name));

    const isRoot = process.platform === 'win32' ? /^[A-Z]:\\?$/i.test(resolved) : resolved === '/';
    const parent = isRoot ? null : path.dirname(resolved);

    return res.json({ currentPath: resolved, parent, directories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to browse path';
    return res.status(400).json({ error: message });
  }
});

export default router;

import { Router, json } from 'express';

import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { generateCsv } from '../services/csvExport';
import { config } from '../config';
import { getVaultDir, ensureVaultDir } from '../infrastructure/storage';

const router = Router();

// Full backups inline every vault file as base64. The global 10 MB JSON limit is
// too tight: per-file uploads alone allow 20 MB each, so a real backup with a
// handful of PDFs easily exceeds 10 MB. Give the import route its own larger limit.
const largeJson = json({ limit: '100mb' });

router.get('/export/csv', authMiddleware, (_req, res) => {
  const csv = generateCsv();
  const filename = `applyr_export_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

router.get('/config/export', authMiddleware, (_req, res) => {
  const db = getDb();

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of settingsRows) {
    // Never export API key
    if (row.key === 'ai_api_key') continue;
    settings[row.key] = row.value;
  }

  const snippets = db.prepare('SELECT * FROM snippets ORDER BY sort_order ASC').all();

  res.json({ settings, snippets });
});

router.post('/config/import', authMiddleware, (req, res) => {
  const db = getDb();
  const { settings, snippets } = req.body as {
    settings?: Record<string, string>;
    snippets?: Array<{
      id?: string;
      title: string;
      content: string;
      checked_by_default?: number;
      hidden?: number;
      sort_order?: number;
    }>;
  };

  const results = { settingsUpdated: 0, snippetsImported: 0 };

  if (settings) {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const importSettings = db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        // Never import API key from config
        if (key === 'ai_api_key') continue;
        stmt.run(key, value);
        results.settingsUpdated++;
      }
    });
    importSettings();
  }

  if (snippets && Array.isArray(snippets)) {
    const insertSnippet = db.prepare(`
      INSERT OR REPLACE INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const importSnippets = db.transaction(() => {
      for (const snippet of snippets) {
        const id = snippet.id || crypto.randomUUID();
        const now = Date.now();
        insertSnippet.run(
          id,
          snippet.title,
          snippet.content,
          snippet.checked_by_default ?? 0,
          snippet.hidden ?? 0,
          snippet.sort_order ?? 0,
          now,
          now
        );
        results.snippetsImported++;
      }
    });
    importSnippets();
  }

  res.json({ success: true, ...results });
});

// ── Full backup export ────────────────────────────────────────────────
router.get('/export/full', authMiddleware, (_req, res) => {
  const db = getDb();
  const vaultDir = getVaultDir(config.dataDir);

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of settingsRows) {
    if (row.key === 'ai_api_key') continue;
    settings[row.key] = row.value;
  }

  const vaultDocs = db.prepare('SELECT * FROM vault_documents ORDER BY created_at ASC').all() as Record<string, unknown>[];
  const vaultWithData = vaultDocs.map(doc => {
    const filePath = path.join(vaultDir, doc.stored_name as string);
    let file_data: string | null = null;
    if (fs.existsSync(filePath)) {
      file_data = fs.readFileSync(filePath).toString('base64');
    }
    return { ...doc, file_data };
  });

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    snippets:             db.prepare('SELECT * FROM snippets ORDER BY sort_order ASC').all(),
    applications:         db.prepare('SELECT * FROM applications ORDER BY created_at ASC').all(),
    application_notes:    db.prepare('SELECT * FROM application_notes ORDER BY created_at ASC').all(),
    application_snippets: db.prepare('SELECT * FROM application_snippets').all(),
    generation_log:       db.prepare('SELECT * FROM generation_log ORDER BY created_at ASC').all(),
    interview_prep:       db.prepare('SELECT * FROM interview_prep ORDER BY created_at ASC').all(),
    cv_analyses:          db.prepare('SELECT * FROM cv_analyses ORDER BY created_at ASC').all(),
    vault_documents:      vaultWithData,
  };

  const filename = `applyr_backup_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(backup, null, 2));
});

// ── Full backup import ────────────────────────────────────────────────
router.post('/import/full', largeJson, authMiddleware, (req, res) => {
  const db = getDb();
  const backup = req.body as {
    version?: number;
    settings?: Record<string, string>;
    snippets?: Record<string, unknown>[];
    applications?: Record<string, unknown>[];
    application_notes?: Record<string, unknown>[];
    application_snippets?: Record<string, unknown>[];
    generation_log?: Record<string, unknown>[];
    interview_prep?: Record<string, unknown>[];
    cv_analyses?: Record<string, unknown>[];
    vault_documents?: (Record<string, unknown> & { file_data?: string | null })[];
  };

  const vaultDir = getVaultDir(config.dataDir);
  ensureVaultDir(config.dataDir);

  // Collect vault files to write after the DB transaction succeeds
  const filesToWrite: { storedName: string; data: Buffer }[] = [];

  const restore = db.transaction(() => {
    // Delete in FK-safe order (children first)
    db.prepare('DELETE FROM application_snippets').run();
    db.prepare('DELETE FROM application_notes').run();
    db.prepare('DELETE FROM generation_log').run();
    db.prepare('DELETE FROM interview_prep').run();
    db.prepare('DELETE FROM cv_analyses').run();
    db.prepare('DELETE FROM applications').run();
    db.prepare('DELETE FROM vault_documents').run();
    db.prepare('DELETE FROM snippets').run();
    db.prepare('DELETE FROM settings').run();

    // Settings (skip API key)
    if (backup.settings) {
      const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(backup.settings)) {
        if (key === 'ai_api_key') continue;
        stmt.run(key, value);
      }
    }

    // Snippets
    if (backup.snippets?.length) {
      const stmt = db.prepare(`INSERT INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const s of backup.snippets) {
        stmt.run(s.id, s.title, s.content, s.checked_by_default ?? 0, s.hidden ?? 0, s.sort_order ?? 0, s.created_at, s.updated_at);
      }
    }

    // Vault documents
    if (backup.vault_documents?.length) {
      const stmt = db.prepare(`INSERT INTO vault_documents (id, label, filename, stored_name, mime_type, size_bytes, doc_type, extracted_text, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const d of backup.vault_documents) {
        // Reject path-traversal attempts: stored_name must be a plain basename
        // (no separators, no parent refs) so file writes stay inside the vault dir.
        const storedName = d.stored_name as string | undefined;
        if (storedName && (storedName !== path.basename(storedName) || storedName.includes('\0'))) {
          throw new Error(`Invalid stored_name in vault_documents: ${storedName}`);
        }
        stmt.run(d.id, d.label, d.filename, d.stored_name, d.mime_type, d.size_bytes, d.doc_type, d.extracted_text ?? null, d.is_default ?? 0, d.created_at, d.updated_at);
        if (d.file_data && storedName) {
          filesToWrite.push({ storedName, data: Buffer.from(d.file_data, 'base64') });
        }
      }
    }

    // Applications
    if (backup.applications?.length) {
      const stmt = db.prepare(`INSERT INTO applications (id, company, role, job_url, job_description, status, fit_score, fit_analysis, output_path, applied_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const a of backup.applications) {
        stmt.run(a.id, a.company, a.role, a.job_url ?? null, a.job_description ?? null, a.status, a.fit_score ?? null, a.fit_analysis ?? null, a.output_path ?? null, a.applied_at ?? null, a.notes ?? null, a.created_at, a.updated_at);
      }
    }

    // Application notes
    if (backup.application_notes?.length) {
      const stmt = db.prepare(`INSERT INTO application_notes (id, application_id, headline, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const n of backup.application_notes) {
        stmt.run(n.id, n.application_id, n.headline, n.body, n.created_at, n.updated_at);
      }
    }

    // Application snippets
    if (backup.application_snippets?.length) {
      const stmt = db.prepare(`INSERT INTO application_snippets (application_id, snippet_id) VALUES (?, ?)`);
      for (const s of backup.application_snippets) {
        stmt.run(s.application_id, s.snippet_id);
      }
    }

    // Generation log
    if (backup.generation_log?.length) {
      const stmt = db.prepare(`INSERT INTO generation_log (id, application_id, version, prompt_summary, response, model, tokens_used, filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const g of backup.generation_log) {
        stmt.run(g.id, g.application_id, g.version, g.prompt_summary ?? null, g.response, g.model ?? null, g.tokens_used ?? null, g.filename ?? null, g.created_at);
      }
    }

    // Interview prep
    if (backup.interview_prep?.length) {
      const stmt = db.prepare(`INSERT INTO interview_prep (application_id, questions, user_notes, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const i of backup.interview_prep) {
        stmt.run(i.application_id, i.questions, i.user_notes ?? null, i.model ?? null, i.created_at, i.updated_at);
      }
    }

    // CV analyses
    if (backup.cv_analyses?.length) {
      const stmt = db.prepare(`INSERT INTO cv_analyses (id, cv_document_id, content, score, created_at) VALUES (?, ?, ?, ?, ?)`);
      for (const c of backup.cv_analyses) {
        stmt.run(c.id, c.cv_document_id, c.content, c.score ?? null, c.created_at);
      }
    }
  });

  try {
    restore();
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' });
    return;
  }

  // Write vault files to disk after DB commit. Resolve under vaultDir as a
  // second line of defence against any stored_name that slipped past validation.
  const vaultDirResolved = path.resolve(vaultDir);
  for (const { storedName, data } of filesToWrite) {
    const target = path.resolve(vaultDirResolved, storedName);
    if (!target.startsWith(vaultDirResolved + path.sep) && target !== vaultDirResolved) {
      continue;
    }
    fs.writeFileSync(target, data);
  }

  res.json({
    success: true,
    restored: {
      settings:             Object.keys(backup.settings ?? {}).filter(k => k !== 'ai_api_key').length,
      snippets:             backup.snippets?.length ?? 0,
      applications:         backup.applications?.length ?? 0,
      vault_documents:      backup.vault_documents?.length ?? 0,
      generation_log:       backup.generation_log?.length ?? 0,
    },
  });
});

export default router;

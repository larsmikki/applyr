import fs from 'fs';
import path from 'path';
import { Router } from 'express';

import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { checkDuplicate } from '../services/duplicate';
import { processOdtTemplate, odtToPdf } from '../infrastructure/odtTemplate';
import { writeOdtBuffer } from '../infrastructure/outputWriter';
import { getVaultDir } from '../infrastructure/storage';
import { config } from '../config';

const router = Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const {
    status,
    search,
    sort = 'created_at_desc',
    page = '1',
    limit = '20',
  } = req.query as Record<string, string>;

  const pageNum = parseInt(page) || 1;
  const limitNum = Math.min(parseInt(limit) || 20, 100);
  const offset = (pageNum - 1) * limitNum;

  let where = '1=1';
  const params: (string | number)[] = [];

  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    where += ' AND (company LIKE ? OR role LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const orderMap: Record<string, string> = {
    created_at_desc: 'created_at DESC',
    created_at_asc: 'created_at ASC',
    company_asc: 'company ASC',
    updated_at_desc: 'updated_at DESC',
  };

  const orderBy = orderMap[sort] || 'created_at DESC';

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM applications WHERE ${where}`).get(...params) as { count: number };
  const rows = db.prepare(`SELECT * FROM applications WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limitNum, offset);

  res.json({
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: countRow.count,
      totalPages: Math.ceil(countRow.count / limitNum),
    },
  });
});

router.get('/duplicate-check', authMiddleware, (req, res) => {
  const { company = '', role = '' } = req.query as Record<string, string>;
  res.json(checkDuplicate(company.trim(), role.trim()));
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { company, role, job_url, job_description, status, notes } = req.body as {
    company: string;
    role: string;
    job_url?: string;
    job_description: string;
    status?: string;
    notes?: string;
  };

  if (!company || !role || !job_description) {
    res.status(400).json({ error: 'company, role, and job_description are required' });
    return;
  }

  const duplicate = checkDuplicate(company, role);

  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO applications (id, company, role, job_url, job_description, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, company, role, job_url || null, job_description, status || 'draft', notes || null, now, now);

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.status(201).json({ application, duplicate });
});

router.get('/roles', authMiddleware, (req, res) => {
  const db = getDb();
  const roles = (db.prepare(
    `SELECT role FROM applications WHERE role IS NOT NULL AND role != '' GROUP BY role ORDER BY MAX(created_at) DESC LIMIT 10`
  ).all() as { role: string }[]).map(r => r.role);
  res.json(roles);
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const logs = db.prepare('SELECT * FROM generation_log WHERE application_id = ? ORDER BY version DESC LIMIT 10').all(id);

  res.json({ application, logs });
});

router.patch('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const app = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const allowed = ['company', 'role', 'job_url', 'job_description', 'status', 'notes', 'applied_at', 'fit_score', 'fit_analysis', 'output_path'];
  const updates: string[] = [];
  const params: (string | number | null)[] = [];

  for (const key of allowed) {
    if (key in req.body) {
      updates.push(`${key} = ?`);
      params.push((req.body as Record<string, string | number | null>)[key]);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  updates.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const deleteFolder = req.query.deleteFolder !== 'false';

  const app = db.prepare('SELECT id, output_path FROM applications WHERE id = ?').get(id) as { id: string; output_path: string | null } | undefined;
  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  db.prepare('DELETE FROM applications WHERE id = ?').run(id);

  if (deleteFolder && app.output_path) {
    try {
      fs.rmSync(app.output_path, { recursive: true, force: true });
    } catch {
      // ignore — files may be locked or already gone
    }
  }

  res.json({ success: true });
});

router.post('/:id/regenerate-odt', authMiddleware, async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const app = db.prepare('SELECT id, company, role, output_path FROM applications WHERE id = ?').get(id) as {
    id: string; company: string; role: string; output_path: string | null;
  } | undefined;

  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  if (!app.output_path) {
    res.status(400).json({ error: 'No output folder — generate a cover letter first' });
    return;
  }

  const latestLog = db.prepare(
    'SELECT response FROM generation_log WHERE application_id = ? ORDER BY version DESC LIMIT 1'
  ).get(id) as { response: string } | undefined;

  if (!latestLog) {
    res.status(400).json({ error: 'No cover letter found — generate one first' });
    return;
  }

  const template = db.prepare(`
    SELECT stored_name, filename FROM vault_documents
    WHERE doc_type = 'cover_letter_template'
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  `).get() as { stored_name: string; filename: string } | undefined;

  if (!template) {
    res.status(400).json({ error: 'No cover letter template found in vault' });
    return;
  }

  // Copy attachments to output folder
  try {
    const attachments = db.prepare(
      `SELECT filename, stored_name FROM vault_documents WHERE doc_type = 'attachment'`
    ).all() as { filename: string; stored_name: string }[];
    for (const att of attachments) {
      fs.copyFileSync(
        path.join(getVaultDir(config.dataDir), att.stored_name),
        path.join(app.output_path, att.filename)
      );
    }
  } catch (err) {
    console.error('[regenerate-odt] attachment copy error:', err);
  }

  try {
    const templatePath = path.join(getVaultDir(config.dataDir), template.stored_name);
    const odtBuffer = await processOdtTemplate(templatePath, latestLog.response);
    writeOdtBuffer(app.output_path, template.filename, odtBuffer);

    const pdfFilename = template.filename.replace(/\.odt$/i, '.pdf');
    try {
      const pdfBuffer = await odtToPdf(odtBuffer);
      writeOdtBuffer(app.output_path, pdfFilename, pdfBuffer);
      res.json({ success: true, odtFile: template.filename, pdfFile: pdfFilename });
    } catch (pdfErr) {
      console.warn('[regenerate-odt] PDF conversion skipped:', pdfErr);
      res.json({ success: true, odtFile: template.filename, pdfFile: null });
    }
  } catch (err) {
    console.error('[regenerate-odt]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'ODT generation failed' });
  }
});

router.get('/:id/versions', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const logs = db.prepare('SELECT * FROM generation_log WHERE application_id = ? ORDER BY version DESC').all(id);
  res.json(logs);
});

// Application Notes
router.get('/:id/notes', authMiddleware, (req, res) => {
  const db = getDb();
  const notes = db.prepare(
    'SELECT * FROM application_notes WHERE application_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(notes);
});

router.post('/:id/notes', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { headline, body } = req.body as { headline: string; body?: string };

  if (!headline?.trim()) {
    res.status(400).json({ error: 'headline is required' });
    return;
  }

  const app = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const noteId = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    'INSERT INTO application_notes (id, application_id, headline, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(noteId, id, headline.trim(), body?.trim() ?? '', now, now);

  res.status(201).json(db.prepare('SELECT * FROM application_notes WHERE id = ?').get(noteId));
});

router.patch('/:id/notes/:noteId', authMiddleware, (req, res) => {
  const db = getDb();
  const { noteId } = req.params;
  const { headline, body } = req.body as { headline?: string; body?: string };

  const note = db.prepare('SELECT id FROM application_notes WHERE id = ?').get(noteId);
  if (!note) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (headline !== undefined) { updates.push('headline = ?'); params.push(headline.trim()); }
  if (body !== undefined) { updates.push('body = ?'); params.push(body.trim()); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push('updated_at = ?');
  params.push(Date.now(), noteId);

  db.prepare(`UPDATE application_notes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare('SELECT * FROM application_notes WHERE id = ?').get(noteId));
});

router.delete('/:id/notes/:noteId', authMiddleware, (req, res) => {
  const db = getDb();
  const { noteId } = req.params;

  const note = db.prepare('SELECT id FROM application_notes WHERE id = ?').get(noteId);
  if (!note) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  db.prepare('DELETE FROM application_notes WHERE id = ?').run(noteId);
  res.json({ success: true });
});

export default router;

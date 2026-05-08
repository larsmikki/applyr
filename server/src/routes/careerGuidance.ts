import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamCareerGuidance } from '../infrastructure/ai';

const router = Router();

// Stream new career guidance
router.post('/', authMiddleware, async (req, res) => {
  const db = getDb();

  const cvDoc = db.prepare(`
    SELECT extracted_text FROM vault_documents
    WHERE doc_type = 'cv' AND extracted_text IS NOT NULL AND extracted_text != ''
    ORDER BY is_default DESC, created_at DESC
    LIMIT 1
  `).get() as { extracted_text: string } | undefined;

  if (!cvDoc) {
    res.status(400).json({ error: 'No CV found in vault. Upload a CV first.' });
    return;
  }

  const gapRow = db.prepare(
    'SELECT content FROM gap_analyses ORDER BY created_at DESC LIMIT 1'
  ).get() as { content: string } | undefined;

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  await streamCareerGuidance(cvDoc.extracted_text, gapRow?.content ?? null, res, abort.signal);
});

// Save a career guidance result
router.post('/save', authMiddleware, (req, res) => {
  const { content } = req.body as { content: string };
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO career_guidance (id, content, created_at) VALUES (?, ?, ?)').run(id, content, Date.now());
  res.json({ id });
});

// List saved career guidance (newest first)
router.get('/history', authMiddleware, (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, content, created_at FROM career_guidance ORDER BY created_at DESC').all();
  res.json(rows);
});

// Delete a saved career guidance
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM career_guidance WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;

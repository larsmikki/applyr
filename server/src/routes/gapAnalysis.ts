import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamGapAnalysis } from '../infrastructure/ai';

const router = Router();

// Stream a new gap analysis
router.post('/', authMiddleware, async (req, res) => {
  const db = getDb();

  const rows = db.prepare(
    `SELECT company, role, fit_analysis FROM applications
     WHERE fit_analysis IS NOT NULL AND fit_analysis != ''
     ORDER BY updated_at DESC LIMIT 10`
  ).all() as { company: string; role: string; fit_analysis: string }[];

  if (rows.length === 0) {
    res.status(400).json({ error: 'No fit analyses found. Run Fit Analysis on at least one application first.' });
    return;
  }

  const fitAnalyses = rows.map(r => ({
    company: r.company,
    role: r.role,
    analysis: r.fit_analysis,
  }));

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  await streamGapAnalysis(fitAnalyses, res, abort.signal);
});

// Save a gap analysis result
router.post('/save', authMiddleware, (req, res) => {
  const { content } = req.body as { content: string };
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO gap_analyses (id, content, created_at) VALUES (?, ?, ?)').run(id, content, Date.now());
  res.json({ id });
});

// List all saved gap analyses (newest first)
router.get('/history', authMiddleware, (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, content, created_at FROM gap_analyses ORDER BY created_at DESC').all();
  res.json(rows);
});

// Delete a saved gap analysis
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM gap_analyses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;

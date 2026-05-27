import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamCVReview } from '../infrastructure/ai';
import { withSSECapture } from '../utils/sseCapture';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { cvDocumentId, targetRoles: bodyTargetRoles, targetDepartments: bodyTargetDepartments } = req.body as {
    cvDocumentId: string;
    targetRoles?: string[];
    targetDepartments?: string[];
  };

  if (!cvDocumentId) {
    res.status(400).json({ error: 'cvDocumentId is required' });
    return;
  }

  const db = getDb();

  const cvDoc = db.prepare('SELECT extracted_text FROM vault_documents WHERE id = ?').get(cvDocumentId) as {
    extracted_text: string | null;
  } | undefined;

  if (!cvDoc) {
    res.status(404).json({ error: 'CV document not found' });
    return;
  }

  const cvText = cvDoc.extracted_text;

  if (!cvText) {
    res.status(400).json({ error: 'The selected CV has no extracted text. Please re-upload the document.' });
    return;
  }

  const recentRoles = bodyTargetRoles?.length
    ? bodyTargetRoles
    : (db.prepare(
        `SELECT role FROM applications WHERE role IS NOT NULL AND role != '' GROUP BY role ORDER BY MAX(created_at) DESC LIMIT 10`
      ).all() as { role: string }[]).map(r => r.role);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  withSSECapture(res, ({ fullText, score }) => {
    if (fullText) {
      const id = crypto.randomUUID();
      db.prepare(
        'INSERT INTO cv_analyses (id, cv_document_id, content, score, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, cvDocumentId, fullText, score || null, Date.now());
    }
  });

  await streamCVReview(cvText, res, abort.signal, recentRoles, bodyTargetDepartments ?? []);
});

router.get('/doc/:docId', authMiddleware, (req, res) => {
  const { docId } = req.params;
  const db = getDb();
  const reviews = db.prepare('SELECT * FROM cv_analyses WHERE cv_document_id = ? ORDER BY created_at DESC').all(docId);
  res.json(reviews);
});

router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const review = db.prepare('SELECT * FROM cv_analyses WHERE id = ?').get(id);
  if (!review) {
    res.status(404).json({ error: 'Review not found' });
    return;
  }
  res.json(review);
});

router.patch('/:id/rewrite', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { rewrittenCV, rewriteReview, rewriteScore } = req.body as {
    rewrittenCV?: string;
    rewriteReview?: string;
    rewriteScore?: number | null;
  };

  if (typeof rewrittenCV !== 'string' || typeof rewriteReview !== 'string') {
    res.status(400).json({ error: 'rewrittenCV and rewriteReview must be strings' });
    return;
  }

  const db = getDb();
  const result = db.prepare(
    'UPDATE cv_analyses SET rewritten_cv = ?, rewrite_review = ?, rewrite_score = ? WHERE id = ?'
  ).run(rewrittenCV, rewriteReview, rewriteScore ?? null, id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'CV analysis not found' });
    return;
  }
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const result = db.prepare('DELETE FROM cv_analyses WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'CV analysis not found' });
    return;
  }
  res.json({ success: true });
});

export default router;

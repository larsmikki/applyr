import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { rewriteCVForScore, reviewCVInternal } from '../infrastructure/ai';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { cvDocumentId, reviewText, maxIterations, targetRoles: bodyTargetRoles, targetDepartments: bodyTargetDepartments } = req.body as {
    cvDocumentId: string;
    reviewText: string;
    maxIterations?: number;
    targetRoles?: string[];
    targetDepartments?: string[];
  };
  const iterations = Math.min(10, Math.max(1, Math.round(maxIterations ?? 5)));

  if (!cvDocumentId || !reviewText) {
    res.status(400).json({ error: 'cvDocumentId and reviewText are required' });
    return;
  }

  const db = getDb();
  const cvDoc = db.prepare('SELECT extracted_text FROM vault_documents WHERE id = ?').get(cvDocumentId) as {
    extracted_text: string | null;
  } | undefined;

  if (!cvDoc?.extracted_text) {
    res.status(404).json({ error: 'CV document not found or has no extracted text' });
    return;
  }

  const recentRoles = bodyTargetRoles?.length
    ? bodyTargetRoles
    : (db.prepare(
        `SELECT role FROM applications WHERE role IS NOT NULL AND role != '' GROUP BY role ORDER BY MAX(created_at) DESC LIMIT 10`
      ).all() as { role: string }[]).map(r => r.role);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  // Keep the SSE connection alive during blocking AI calls (which can take 60-120s each)
  const keepalive = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 20000);

  try {
    let currentCV = cvDoc.extracted_text;
    let currentReview = reviewText;

    for (let i = 1; i <= iterations; i++) {
      if (abort.signal.aborted) break;

      send({ type: 'phase', iteration: i, phase: 'rewriting' });
      const rewrittenCV = await rewriteCVForScore(currentCV, currentReview, abort.signal, recentRoles, bodyTargetDepartments ?? []);
      if (abort.signal.aborted) break;

      send({ type: 'phase', iteration: i, phase: 'reviewing' });
      const { fullText: newReview, score } = await reviewCVInternal(rewrittenCV, abort.signal, recentRoles, bodyTargetDepartments ?? []);
      if (abort.signal.aborted) break;

      send({ type: 'iteration_done', iteration: i, score });

      currentCV = rewrittenCV;
      currentReview = newReview;

      if ((score !== null && score >= 9) || i === iterations) {
        send({ type: 'done', rewrittenCV, finalReview: newReview, score, iterations: i });
        break;
      }
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      const message = error instanceof Error ? error.message : 'Rewrite failed';
      send({ type: 'error', error: message });
    }
  } finally {
    clearInterval(keepalive);
    res.end();
  }
});

export default router;

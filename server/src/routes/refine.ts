import { Router } from 'express';

import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamRefinement } from '../infrastructure/ai';
import { writeApplicationFile } from '../infrastructure/outputWriter';
import { withSSECapture } from '../utils/sseCapture';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { applicationId, instruction, cvDocumentId } = req.body as {
    applicationId: string;
    instruction: string;
    cvDocumentId?: string;
  };

  if (!applicationId || !instruction) {
    res.status(400).json({ error: 'applicationId and instruction are required' });
    return;
  }

  const db = getDb();

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as {
    id: string;
    company: string;
    role: string;
    output_path: string | null;
  } | undefined;

  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  // Fetch CV text — use provided document, or fall back to default CV
  let cvText: string | null = null;
  if (cvDocumentId) {
    const cvDoc = db.prepare('SELECT extracted_text FROM vault_documents WHERE id = ?').get(cvDocumentId) as {
      extracted_text: string | null;
    } | undefined;
    cvText = cvDoc?.extracted_text ?? null;
  } else {
    const cvDoc = db.prepare(
      `SELECT extracted_text FROM vault_documents WHERE doc_type = 'cv' AND extracted_text IS NOT NULL AND extracted_text != '' ORDER BY is_default DESC, created_at DESC LIMIT 1`
    ).get() as { extracted_text: string } | undefined;
    cvText = cvDoc?.extracted_text ?? null;
  }

  // Get latest generation log
  const latestLog = db.prepare(
    'SELECT * FROM generation_log WHERE application_id = ? ORDER BY version DESC LIMIT 1'
  ).get(applicationId) as {
    id: string;
    version: number;
    response: string;
    model: string;
  } | undefined;

  if (!latestLog) {
    res.status(400).json({ error: 'No cover letter to refine. Generate one first.' });
    return;
  }

  const newVersion = latestLog.version + 1;
  const filename = `cover_letter_v${newVersion}.md`;

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  let capturedPrompts: { system: string; user: string } | null = null;

  withSSECapture(res, ({ fullText }) => {
    if (!fullText) return;

    if (app.output_path) {
      try {
        writeApplicationFile(app.output_path, filename, fullText);
      } catch {
        // ignore file write errors
      }
    }

    const logId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO generation_log (id, application_id, version, prompt_summary, response, model, tokens_used, filename, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(logId, applicationId, newVersion, capturedPrompts ? JSON.stringify(capturedPrompts) : null, fullText, latestLog.model, filename, now);

    db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, applicationId);
  });

  await streamRefinement(latestLog.response, instruction, res, abort.signal, (system, user) => { capturedPrompts = { system, user }; }, cvText ?? undefined);
});

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamInterviewPrep } from '../infrastructure/ai';

const router = Router();

// GET /api/interview-prep/:applicationId — fetch existing prep
router.get('/:applicationId', authMiddleware, (req, res) => {
  const db = getDb();
  const { applicationId } = req.params;

  const row = db
    .prepare('SELECT * FROM interview_prep WHERE application_id = ?')
    .get(applicationId) as {
      application_id: string;
      questions: string;
      user_notes: string | null;
      model: string;
      created_at: number;
      updated_at: number;
    } | undefined;

  if (!row) {
    res.status(404).json({ error: 'No interview prep found' });
    return;
  }

  const parsed = JSON.parse(row.questions);
  // Support both old format (array) and new format (object with questions + questions_to_ask)
  const questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
  const questions_to_ask = Array.isArray(parsed) ? [] : (parsed.questions_to_ask ?? []);

  res.json({
    application_id: row.application_id,
    questions,
    questions_to_ask,
    user_notes: row.user_notes,
    model: row.model,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

// POST /api/interview-prep/generate — SSE stream
router.post('/generate', authMiddleware, async (req, res) => {
  const db = getDb();
  const { applicationId, cvDocumentId } = req.body as {
    applicationId: string;
    cvDocumentId?: string;
  };

  if (!applicationId) {
    res.status(400).json({ error: 'applicationId is required' });
    return;
  }

  // Fetch application
  const app = db
    .prepare('SELECT job_description FROM applications WHERE id = ?')
    .get(applicationId) as { job_description: string } | undefined;

  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  // Fetch CV text if provided
  let cvText: string | null = null;
  if (cvDocumentId) {
    const doc = db
      .prepare('SELECT extracted_text FROM vault_documents WHERE id = ?')
      .get(cvDocumentId) as { extracted_text: string | null } | undefined;
    cvText = doc?.extracted_text ?? null;
  }

  // Preserve existing user_notes and created_at before overwrite
  const existing = db
    .prepare('SELECT user_notes, created_at FROM interview_prep WHERE application_id = ?')
    .get(applicationId) as { user_notes: string | null; created_at: number } | undefined;
  const preservedNotes = existing?.user_notes ?? null;
  const preservedCreatedAt = existing?.created_at ?? null;

  // Abort when client disconnects
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  // onDone callback: persist generated questions
  const onDone = (fullText: string) => {
    try {
      JSON.parse(fullText); // validate JSON before storing
    } catch {
      return; // invalid JSON — don't persist; client will show parse error
    }

    const now = Date.now();
    const settingsRow = db
      .prepare("SELECT value FROM settings WHERE key = 'ai_model'")
      .get() as { value: string } | undefined;
    const model = settingsRow?.value || 'gpt-4o';

    // Preserve the original creation timestamp across regenerations.
    db.prepare(`
      INSERT OR REPLACE INTO interview_prep
        (application_id, questions, user_notes, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(applicationId, fullText, preservedNotes, model, preservedCreatedAt ?? now, now);
  };

  await streamInterviewPrep(app.job_description, cvText, res, controller.signal, onDone);
});

// PATCH /api/interview-prep/:applicationId — update user_notes
router.patch('/:applicationId', authMiddleware, (req, res) => {
  const db = getDb();
  const { applicationId } = req.params;
  const { user_notes } = req.body as { user_notes: string };

  const existing = db
    .prepare('SELECT application_id FROM interview_prep WHERE application_id = ?')
    .get(applicationId);

  if (!existing) {
    res.status(404).json({ error: 'No interview prep found' });
    return;
  }

  db.prepare('UPDATE interview_prep SET user_notes = ?, updated_at = ? WHERE application_id = ?')
    .run(user_notes, Date.now(), applicationId);

  res.json({ success: true });
});

export default router;

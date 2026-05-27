import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamAnalysis } from '../infrastructure/ai';
import { config } from '../config';
import { createApplicationFolder, writeJobDescription, writeAnalysis } from '../infrastructure/outputWriter';
import { withSSECapture } from '../utils/sseCapture';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { applicationId, cvDocumentId } = req.body as {
    applicationId: string;
    cvDocumentId: string;
  };

  if (!applicationId || !cvDocumentId) {
    res.status(400).json({ error: 'applicationId and cvDocumentId are required' });
    return;
  }

  const db = getDb();

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId) as {
    id: string;
    company: string;
    role: string;
    job_description: string;
    output_path: string | null;
  } | undefined;

  if (!app) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const cvDoc = db.prepare('SELECT extracted_text FROM vault_documents WHERE id = ?').get(cvDocumentId) as {
    extracted_text: string | null;
  } | undefined;

  if (!cvDoc) {
    res.status(404).json({ error: 'CV document not found' });
    return;
  }

  const cvText = cvDoc.extracted_text || '[No CV text available]';

  // Get output dir from settings
  const outputDirSetting = db.prepare("SELECT value FROM settings WHERE key = 'output_dir'").get() as { value: string } | undefined;
  const outputDir = outputDirSetting?.value || config.outputDir;

  // Create output folder if needed
  let outputPath = app.output_path;
  if (!outputPath) {
    try {
      outputPath = createApplicationFolder(outputDir, app.company, app.role, app.id);
      db.prepare('UPDATE applications SET output_path = ?, updated_at = ? WHERE id = ?').run(outputPath, Date.now(), app.id);
      writeJobDescription(outputPath, app.job_description);
    } catch {
      // Output dir might not exist, continue without it
      outputPath = null;
    }
  }

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  withSSECapture(res, ({ fullText, fitScore }) => {
    const updates: (string | number | null)[] = [];
    const sets: string[] = [];

    if (fitScore !== null && fitScore !== undefined) {
      sets.push('fit_score = ?');
      updates.push(fitScore);
    }
    if (fullText) {
      sets.push('fit_analysis = ?');
      updates.push(fullText);
    }
    sets.push('updated_at = ?');
    updates.push(Date.now());
    updates.push(applicationId);

    if (sets.length > 1) {
      db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`).run(...updates);
    }

    if (outputPath && fullText) {
      try {
        writeAnalysis(outputPath, fullText);
      } catch {
        // Ignore file write errors
      }
    }
  });

  await streamAnalysis(app.job_description, cvText, res, abort.signal);
});

export default router;

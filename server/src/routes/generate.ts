import path from 'path';
import fs from 'fs';
import { Router } from 'express';

import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { streamGeneration } from '../infrastructure/ai';
import { config } from '../config';
import { createApplicationFolder, writeApplicationFile, writeJobDescription, writeOdtBuffer } from '../infrastructure/outputWriter';
import { processOdtTemplate, odtToPdf } from '../infrastructure/odtTemplate';
import { getVaultDir } from '../infrastructure/storage';
import { withSSECapture } from '../utils/sseCapture';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const {
    applicationId,
    cvDocumentId,
    snippetIds,
    additionalInstructions,
    language,
  } = req.body as {
    applicationId: string;
    cvDocumentId: string;
    snippetIds?: string[];
    additionalInstructions?: string;
    language?: string;
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
    fit_analysis: string | null;
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

  // Gather snippets
  let snippetTexts: string[] = [];
  if (snippetIds && snippetIds.length > 0) {
    const placeholders = snippetIds.map(() => '?').join(',');
    const snips = db.prepare(`SELECT title, content FROM snippets WHERE id IN (${placeholders})`).all(...snippetIds) as {
      title: string;
      content: string;
    }[];
    snippetTexts = snips.map(s => `**${s.title}**: ${s.content}`);
  }

  // Get settings
  const settingsRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('output_dir', 'ai_model', 'output_language')").all() as { key: string; value: string }[];
  const settingsMap: Record<string, string> = {};
  for (const r of settingsRows) settingsMap[r.key] = r.value;

  // Get or create output folder
  const outputDirSetting = settingsMap['output_dir'] || config.outputDir;
  let outputPath = app.output_path;
  if (!outputPath) {
    try {
      outputPath = createApplicationFolder(outputDirSetting, app.company, app.role, app.id);
      db.prepare('UPDATE applications SET output_path = ?, updated_at = ? WHERE id = ?').run(outputPath, Date.now(), app.id);
      writeJobDescription(outputPath, app.job_description);
    } catch {
      outputPath = null;
    }
  }

  // Determine version number
  const versionRow = db.prepare('SELECT COUNT(*) as count FROM generation_log WHERE application_id = ?').get(applicationId) as { count: number };
  const version = versionRow.count + 1;
  const filename = `cover_letter_v${version}.md`;

  const cvText = cvDoc.extracted_text || '[No CV text available]';
  const fitAnalysis = app.fit_analysis || '';

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  let capturedPrompts: { system: string; user: string } | null = null;

  withSSECapture(res, ({ fullText }) => {
    if (!fullText) return;

    if (outputPath) {
      try {
        writeApplicationFile(outputPath, filename, fullText);
      } catch {
        // ignore file write errors
      }

      // Copy attachment vault docs to the output folder
      try {
        const attachments = db.prepare(
          `SELECT filename, stored_name FROM vault_documents WHERE doc_type = 'attachment'`
        ).all() as { filename: string; stored_name: string }[];
        for (const att of attachments) {
          fs.copyFileSync(
            path.join(getVaultDir(config.dataDir), att.stored_name),
            path.join(outputPath, att.filename)
          );
        }
      } catch (err) {
        console.error('[generate] attachment copy error:', err);
      }

      // Write .odt if a cover_letter_template exists in the vault (async, fire-and-forget)
      (() => {
        const template = db.prepare(`
          SELECT stored_name, filename FROM vault_documents
          WHERE doc_type = 'cover_letter_template'
          ORDER BY is_default DESC, created_at DESC
          LIMIT 1
        `).get() as { stored_name: string; filename: string } | undefined;

        if (template) {
          const templatePath = path.join(getVaultDir(config.dataDir), template.stored_name);
          processOdtTemplate(templatePath, fullText)
            .then(odtBuffer => {
              writeOdtBuffer(outputPath!, template.filename, odtBuffer);
              const pdfFilename = template.filename.replace(/\.odt$/i, '.pdf');
              return odtToPdf(odtBuffer)
                .then(pdfBuffer => writeOdtBuffer(outputPath!, pdfFilename, pdfBuffer))
                .catch(err => console.warn('[generate] PDF conversion skipped:', err));
            })
            .catch(err => console.error('[generate] ODT error:', err));
        }
      })();
    }

    const modelRow = db.prepare("SELECT value FROM settings WHERE key = 'ai_model'").get() as { value: string } | undefined;
    const model = modelRow?.value || 'gpt-4o';

    const logId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO generation_log (id, application_id, version, prompt_summary, response, model, tokens_used, filename, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(logId, applicationId, version, capturedPrompts ? JSON.stringify(capturedPrompts) : null, fullText, model, filename, now);

    db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, applicationId);
  });

  const resolvedLanguage = language || settingsMap['output_language'] || 'en';

  await streamGeneration(
    app.job_description,
    cvText,
    fitAnalysis,
    snippetTexts,
    additionalInstructions || '',
    resolvedLanguage,
    res,
    abort.signal,
    (system, user) => { capturedPrompts = { system, user }; }
  );
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import path from 'path';

import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';
import { config } from '../config';
import { ensureVaultDir, getVaultDir, deleteVaultFile } from '../infrastructure/storage';
import { extractTextFromFile } from '../infrastructure/textExtractor';

const router = Router();

function getStorage() {
  ensureVaultDir(config.dataDir);
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, getVaultDir(config.dataDir));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function getUpload() {
  return multer({
    storage: getStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  });
}

router.get('/', authMiddleware, (_req, res) => {
  const db = getDb();
  const docs = db.prepare('SELECT * FROM vault_documents ORDER BY created_at DESC').all();
  res.json(docs);
});

router.post('/', authMiddleware, (req, res) => {
  const upload = getUpload();
  upload.single('file')(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const db = getDb();
    const { label, doc_type } = req.body as { label?: string; doc_type?: string };

    const extractedText = await extractTextFromFile(req.file.path);

    const id = crypto.randomUUID();
    const now = Date.now();
    const docLabel = label || req.file.originalname;
    const docType = (doc_type as string) || 'other';

    // Templates auto-become the default so newly uploaded files are always used
    const isDefault = docType === 'cover_letter_template' ? 1 : 0;
    if (isDefault) {
      db.prepare('UPDATE vault_documents SET is_default = 0 WHERE doc_type = ?').run(docType);
    }

    db.prepare(`
      INSERT INTO vault_documents (id, label, filename, stored_name, mime_type, size_bytes, doc_type, extracted_text, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      docLabel,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      docType,
      extractedText,
      isDefault,
      now,
      now
    );

    const doc = db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(id);
    res.status(201).json(doc);
  });
});

router.patch('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { label, is_default, doc_type } = req.body as {
    label?: string;
    is_default?: number;
    doc_type?: string;
  };

  const doc = db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(id);
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (label !== undefined) {
    updates.push('label = ?');
    params.push(label);
  }
  if (is_default !== undefined) {
    // If setting as default, unset others of same type
    if (is_default) {
      const typedDoc = doc as { doc_type: string };
      db.prepare('UPDATE vault_documents SET is_default = 0 WHERE doc_type = ?').run(typedDoc.doc_type);
    }
    updates.push('is_default = ?');
    params.push(is_default ? 1 : 0);
  }
  if (doc_type !== undefined) {
    updates.push('doc_type = ?');
    params.push(doc_type);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);
    db.prepare(`UPDATE vault_documents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updated = db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const doc = db.prepare('SELECT stored_name FROM vault_documents WHERE id = ?').get(id) as { stored_name: string } | undefined;
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  deleteVaultFile(config.dataDir, doc.stored_name);
  db.prepare('DELETE FROM vault_documents WHERE id = ?').run(id);

  res.json({ success: true });
});

router.get('/:id/text', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const doc = db.prepare('SELECT extracted_text FROM vault_documents WHERE id = ?').get(id) as { extracted_text: string | null } | undefined;
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  res.json({ text: doc.extracted_text || '' });
});

export default router;

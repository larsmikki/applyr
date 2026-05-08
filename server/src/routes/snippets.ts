import { Router } from 'express';

import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';

const router = Router();

router.get('/', authMiddleware, (_req, res) => {
  const db = getDb();
  const snippets = db.prepare('SELECT * FROM snippets WHERE hidden = 0 ORDER BY sort_order ASC, created_at ASC').all();
  res.json(snippets);
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { title, content, checked_by_default } = req.body as {
    title: string;
    content: string;
    checked_by_default?: number;
  };

  if (!title || !content) {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }

  const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM snippets').get() as { max_order: number | null };
  const sortOrder = (maxOrder.max_order ?? -1) + 1;

  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(`
    INSERT INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, title, content, checked_by_default ? 1 : 0, sortOrder, now, now);

  const snippet = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
  res.status(201).json(snippet);
});

router.patch('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const snippet = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
  if (!snippet) {
    res.status(404).json({ error: 'Snippet not found' });
    return;
  }

  const { title, content, checked_by_default, hidden } = req.body as {
    title?: string;
    content?: string;
    checked_by_default?: number;
    hidden?: number;
  };

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (checked_by_default !== undefined) { updates.push('checked_by_default = ?'); params.push(checked_by_default ? 1 : 0); }
  if (hidden !== undefined) { updates.push('hidden = ?'); params.push(hidden ? 1 : 0); }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    params.push(Date.now());
    params.push(id);
    db.prepare(`UPDATE snippets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const updated = db.prepare('SELECT * FROM snippets WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const snippet = db.prepare('SELECT id FROM snippets WHERE id = ?').get(id);
  if (!snippet) {
    res.status(404).json({ error: 'Snippet not found' });
    return;
  }

  db.prepare('DELETE FROM snippets WHERE id = ?').run(id);
  res.json({ success: true });
});

router.post('/reorder', authMiddleware, (req, res) => {
  const db = getDb();
  const { ids } = req.body as { ids: string[] };

  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }

  const update = db.prepare('UPDATE snippets SET sort_order = ?, updated_at = ? WHERE id = ?');
  const reorder = db.transaction(() => {
    ids.forEach((id, index) => {
      update.run(index, Date.now(), id);
    });
  });

  reorder();
  res.json({ success: true });
});

export default router;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Create an in-memory SQLite DB before any module imports are resolved
const { db } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'src', 'db', 'migrations', '001_schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf-8'));

  return { db };
});

vi.mock('../../src/db/connection', () => ({
  getDb: () => db,
  initDb: vi.fn(),
}));

import { createApp } from '../../src/app';

const app = createApp();

beforeEach(() => {
  db.exec('DELETE FROM snippets');
});

describe('GET /api/snippets', () => {
  it('returns empty array when no snippets exist', async () => {
    const res = await request(app).get('/api/snippets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only visible snippets ordered by sort_order', async () => {
    const now = Date.now();
    db.prepare(
      'INSERT INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?)'
    ).run('s1', 'B snippet', 'content b', 0, now, now);  // sort_order=0 → first
    db.prepare(
      'INSERT INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?)'
    ).run('s2', 'A snippet', 'content a', 1, now, now);  // sort_order=1 → second
    db.prepare(
      'INSERT INTO snippets (id, title, content, checked_by_default, hidden, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)'
    ).run('s3', 'Hidden', 'hidden content', 2, now, now);

    const res = await request(app).get('/api/snippets');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe('s1');
    expect(res.body[1].id).toBe('s2');
  });
});

describe('POST /api/snippets', () => {
  it('creates a snippet and returns 201', async () => {
    const res = await request(app)
      .post('/api/snippets')
      .send({ title: 'My snippet', content: 'Some content' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('My snippet');
    expect(res.body.content).toBe('Some content');
    expect(res.body.hidden).toBe(0);
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/snippets')
      .send({ content: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/snippets')
      .send({ title: 'No content' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('assigns ascending sort_order for successive snippets', async () => {
    await request(app).post('/api/snippets').send({ title: 'First', content: 'A' });
    const res = await request(app).post('/api/snippets').send({ title: 'Second', content: 'B' });

    expect(res.body.sort_order).toBe(1);
  });
});

describe('PATCH /api/snippets/:id', () => {
  it('updates snippet fields', async () => {
    const create = await request(app)
      .post('/api/snippets')
      .send({ title: 'Original', content: 'Old content' });

    const id = create.body.id;
    const res = await request(app)
      .patch(`/api/snippets/${id}`)
      .send({ title: 'Updated', hidden: 1 });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.hidden).toBe(1);
    expect(res.body.content).toBe('Old content');
  });

  it('returns 404 for unknown snippet', async () => {
    const res = await request(app)
      .patch('/api/snippets/nonexistent-id')
      .send({ title: 'X' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/snippets/:id', () => {
  it('deletes a snippet and returns success', async () => {
    const create = await request(app)
      .post('/api/snippets')
      .send({ title: 'To delete', content: 'bye' });

    const id = create.body.id;
    const del = await request(app).delete(`/api/snippets/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const list = await request(app).get('/api/snippets');
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown snippet', async () => {
    const res = await request(app).delete('/api/snippets/ghost-id');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/snippets/reorder', () => {
  it('reorders snippets by provided ids array', async () => {
    const a = await request(app).post('/api/snippets').send({ title: 'A', content: 'a' });
    const b = await request(app).post('/api/snippets').send({ title: 'B', content: 'b' });

    const res = await request(app)
      .post('/api/snippets/reorder')
      .send({ ids: [b.body.id, a.body.id] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // B should now have sort_order 0, A should have sort_order 1
    const list = await request(app).get('/api/snippets');
    expect(list.body[0].id).toBe(b.body.id);
    expect(list.body[1].id).toBe(a.body.id);
  });

  it('returns 400 when ids is not an array', async () => {
    const res = await request(app)
      .post('/api/snippets/reorder')
      .send({ ids: 'not-an-array' });

    expect(res.status).toBe(400);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

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

  const schemaPath = path.join(process.cwd(), 'server', 'src', 'db', 'migrations', '001_schema.sql');
  db.exec(fs.readFileSync(schemaPath, 'utf-8'));

  return { db };
});

vi.mock('../../../server/src/db/connection', () => ({
  getDb: () => db,
  initDb: vi.fn(),
}));

import { createApp } from '../../../server/src/app';

const app = createApp();

const jobPayload = {
  company: 'Acme Corp',
  role: 'Software Engineer',
  job_description: 'Build great software',
};

beforeEach(() => {
  db.exec('DELETE FROM application_notes');
  db.exec('DELETE FROM generation_log');
  db.exec('DELETE FROM application_snippets');
  db.exec('DELETE FROM applications');
});

describe('GET /api/jobs', () => {
  it('returns empty data with pagination when no jobs exist', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.page).toBe(1);
  });

  it('returns created jobs', async () => {
    await request(app).post('/api/jobs').send(jobPayload);
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].company).toBe('Acme Corp');
    expect(res.body.pagination.total).toBe(1);
  });

  it('filters by status', async () => {
    await request(app).post('/api/jobs').send(jobPayload);
    await request(app).post('/api/jobs').send({ ...jobPayload, status: 'applied' });

    const res = await request(app).get('/api/jobs?status=applied');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('applied');
  });

  it('filters by search term (company or role)', async () => {
    await request(app).post('/api/jobs').send({ ...jobPayload, company: 'MatchCo' });
    await request(app).post('/api/jobs').send({ ...jobPayload, company: 'Other Inc' });

    const res = await request(app).get('/api/jobs?search=MatchCo');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].company).toBe('MatchCo');
  });

  it('paginates results', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/jobs').send({ ...jobPayload, company: `Company ${i}` });
    }

    const res = await request(app).get('/api/jobs?limit=2&page=1');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.totalPages).toBe(3);
  });
});

describe('POST /api/jobs', () => {
  it('creates a job application and returns 201', async () => {
    const res = await request(app).post('/api/jobs').send(jobPayload);
    expect(res.status).toBe(201);
    expect(res.body.application.id).toBeDefined();
    expect(res.body.application.company).toBe('Acme Corp');
    expect(res.body.application.role).toBe('Software Engineer');
    expect(res.body.application.status).toBe('draft');
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/jobs').send({ company: 'Acme' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('includes duplicate check in response', async () => {
    // Create first application
    await request(app).post('/api/jobs').send(jobPayload);
    // Create duplicate
    const res = await request(app).post('/api/jobs').send(jobPayload);
    expect(res.status).toBe(201);
    expect(res.body.duplicate.isDuplicate).toBe(true);
  });

  it('accepts optional fields', async () => {
    const res = await request(app).post('/api/jobs').send({
      ...jobPayload,
      job_url: 'https://example.com/job',
      status: 'applied',
      notes: 'Looks promising',
    });
    expect(res.status).toBe(201);
    expect(res.body.application.job_url).toBe('https://example.com/job');
    expect(res.body.application.status).toBe('applied');
    expect(res.body.application.notes).toBe('Looks promising');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns the job with generation logs', async () => {
    const created = await request(app).post('/api/jobs').send(jobPayload);
    const id = created.body.application.id;

    const res = await request(app).get(`/api/jobs/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.application.id).toBe(id);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/jobs/nonexistent-uuid');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/jobs/:id', () => {
  it('updates allowed fields', async () => {
    const created = await request(app).post('/api/jobs').send(jobPayload);
    const id = created.body.application.id;

    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .send({ status: 'interview', notes: 'Great interview' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('interview');
    expect(res.body.notes).toBe('Great interview');
    expect(res.body.company).toBe('Acme Corp'); // unchanged
  });

  it('returns 400 when no valid fields are provided', async () => {
    const created = await request(app).post('/api/jobs').send(jobPayload);
    const id = created.body.application.id;

    const res = await request(app)
      .patch(`/api/jobs/${id}`)
      .send({ unknown_field: 'value' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/jobs/ghost-id')
      .send({ status: 'applied' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/jobs/:id', () => {
  it('deletes a job and returns success', async () => {
    const created = await request(app).post('/api/jobs').send(jobPayload);
    const id = created.body.application.id;

    const del = await request(app).delete(`/api/jobs/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const get = await request(app).get(`/api/jobs/${id}`);
    expect(get.status).toBe(404);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/jobs/ghost-id');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/jobs/duplicate-check', () => {
  it('returns isDuplicate false when no match', async () => {
    const res = await request(app).get('/api/jobs/duplicate-check?company=Acme&role=Engineer');
    expect(res.status).toBe(200);
    expect(res.body.isDuplicate).toBe(false);
    expect(res.body.matches).toEqual([]);
  });

  it('returns isDuplicate true when same company exists', async () => {
    await request(app).post('/api/jobs').send(jobPayload);
    const res = await request(app).get(
      `/api/jobs/duplicate-check?company=${encodeURIComponent(jobPayload.company)}&role=${encodeURIComponent(jobPayload.role)}`
    );
    expect(res.body.isDuplicate).toBe(true);
    expect(res.body.matches.length).toBeGreaterThan(0);
  });
});

describe('Application Notes', () => {
  let jobId: string;

  beforeEach(async () => {
    const res = await request(app).post('/api/jobs').send(jobPayload);
    jobId = res.body.application.id;
  });

  it('GET /:id/notes returns empty array initially', async () => {
    const res = await request(app).get(`/api/jobs/${jobId}/notes`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /:id/notes creates a note', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/notes`)
      .send({ headline: 'Interview scheduled', body: 'Monday 2pm' });

    expect(res.status).toBe(201);
    expect(res.body.headline).toBe('Interview scheduled');
    expect(res.body.body).toBe('Monday 2pm');
    expect(res.body.application_id).toBe(jobId);
  });

  it('POST /:id/notes returns 400 when headline is missing', async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/notes`)
      .send({ body: 'No headline' });

    expect(res.status).toBe(400);
  });

  it('PATCH /:id/notes/:noteId updates a note', async () => {
    const create = await request(app)
      .post(`/api/jobs/${jobId}/notes`)
      .send({ headline: 'Original', body: 'Old body' });

    const noteId = create.body.id;
    const res = await request(app)
      .patch(`/api/jobs/${jobId}/notes/${noteId}`)
      .send({ headline: 'Updated headline' });

    expect(res.status).toBe(200);
    expect(res.body.headline).toBe('Updated headline');
    expect(res.body.body).toBe('Old body');
  });

  it('DELETE /:id/notes/:noteId removes the note', async () => {
    const create = await request(app)
      .post(`/api/jobs/${jobId}/notes`)
      .send({ headline: 'To delete' });

    const noteId = create.body.id;
    const del = await request(app).delete(`/api/jobs/${jobId}/notes/${noteId}`);
    expect(del.status).toBe(200);
    expect(del.body.success).toBe(true);

    const list = await request(app).get(`/api/jobs/${jobId}/notes`);
    expect(list.body).toHaveLength(0);
  });
});

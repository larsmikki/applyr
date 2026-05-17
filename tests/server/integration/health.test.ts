import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { getDb } from '../../../server/src/db/connection';

// Health route now probes the DB to verify liveness, so return a working stub
// for the trivial `SELECT 1` query.
vi.mock('../../../server/src/db/connection', () => ({
  getDb: vi.fn(() => ({
    prepare: () => ({ get: () => ({ ok: 1 }) }),
  })),
  initDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { createApp } from '../../../server/src/app';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns version and timestamp', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body.version).toBe('1.0.0');
    expect(typeof res.body.timestamp).toBe('number');
    expect(res.body.timestamp).toBeGreaterThan(0);
  });

  it('returns 503 when the database is unreachable', async () => {
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error('Database not initialized');
    });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.database).toBe('error');
  });
});

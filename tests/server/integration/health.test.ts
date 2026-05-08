import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Health route does not use getDb, but app.ts imports all routes so we mock connection
vi.mock('../../../server/src/db/connection', () => ({
  getDb: vi.fn(),
  initDb: vi.fn(),
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
});

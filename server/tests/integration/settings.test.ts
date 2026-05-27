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
  // Reset settings to only the defaults inserted by migration
  db.exec("DELETE FROM settings WHERE key NOT IN ('ai_provider','ai_model','ai_api_key','ai_base_url','tone','length','structure','output_dir','pin_enabled','theme','output_language')");
  db.exec("UPDATE settings SET value = '' WHERE key = 'ai_api_key'");
  db.exec("UPDATE settings SET value = 'openai' WHERE key = 'ai_provider'");
  db.exec("UPDATE settings SET value = 'gpt-4o' WHERE key = 'ai_model'");
});

describe('GET /api/settings', () => {
  it('returns all default settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.ai_provider).toBe('openai');
    expect(res.body.ai_model).toBe('gpt-4o');
    expect(res.body.tone).toBe('professional');
  });

  it('masks ai_api_key when set', async () => {
    db.prepare("UPDATE settings SET value = 'sk-secret123' WHERE key = 'ai_api_key'").run();

    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.ai_api_key).toBe('***');
  });

  it('does not mask ai_api_key when empty', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.body.ai_api_key).toBe('');
  });
});

describe('PUT /api/settings', () => {
  it('updates a setting and returns new state', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ tone: 'casual', length: 'short' });

    expect(res.status).toBe(200);
    expect(res.body.tone).toBe('casual');
    expect(res.body.length).toBe('short');
  });

  it('inserts a new key if it does not exist', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ custom_key: 'custom_value' });

    expect(res.status).toBe(200);
    expect(res.body.custom_key).toBe('custom_value');
  });

  it('masks ai_api_key in the response after update', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ ai_api_key: 'sk-newkey' });

    expect(res.status).toBe(200);
    expect(res.body.ai_api_key).toBe('***');
  });

  it('persists changes visible in subsequent GET', async () => {
    await request(app).put('/api/settings').send({ theme: 'dark' });
    const res = await request(app).get('/api/settings');
    expect(res.body.theme).toBe('dark');
  });
});

describe('GET /api/settings/api-key-status', () => {
  it('returns configured false when api key is empty', async () => {
    const res = await request(app).get('/api/settings/api-key-status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
  });

  it('returns configured true when api key is set', async () => {
    db.prepare("UPDATE settings SET value = 'sk-real-key' WHERE key = 'ai_api_key'").run();

    const res = await request(app).get('/api/settings/api-key-status');
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
  });
});

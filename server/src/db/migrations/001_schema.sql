-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings VALUES
  ('ai_provider',     'openai'),
  ('ai_model',        'gpt-4o'),
  ('ai_api_key',      ''),
  ('ai_base_url',     ''),
  ('tone',            'professional'),
  ('length',          'standard'),
  ('structure',       'standard'),
  ('output_dir',      ''),
  ('pin_enabled',     '0'),
  ('theme',           'light'),
  ('output_language', 'en');

-- Document Vault
CREATE TABLE IF NOT EXISTS vault_documents (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  filename       TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  doc_type       TEXT NOT NULL DEFAULT 'other',
  extracted_text TEXT,
  is_default     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- Snippet Library
CREATE TABLE IF NOT EXISTS snippets (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  content            TEXT NOT NULL,
  checked_by_default INTEGER NOT NULL DEFAULT 0,
  hidden             INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- Job Applications
CREATE TABLE IF NOT EXISTS applications (
  id              TEXT PRIMARY KEY,
  company         TEXT NOT NULL,
  role            TEXT NOT NULL,
  job_url         TEXT,
  job_description TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK(status IN ('draft','applied','interview','offer','rejected','withdrawn')),
  fit_score       INTEGER,
  fit_analysis    TEXT,
  output_path     TEXT,
  applied_at      INTEGER,
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_status     ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_company    ON applications(company);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at);

-- Generation Log
CREATE TABLE IF NOT EXISTS generation_log (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL DEFAULT 1,
  prompt_summary TEXT,
  response       TEXT NOT NULL,
  model          TEXT NOT NULL,
  tokens_used    INTEGER,
  filename       TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_log_app ON generation_log(application_id, version);

-- Application Snippets
CREATE TABLE IF NOT EXISTS application_snippets (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  snippet_id     TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
  PRIMARY KEY (application_id, snippet_id)
);

-- Interview Prep
CREATE TABLE IF NOT EXISTS interview_prep (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  questions      TEXT NOT NULL,
  user_notes     TEXT,
  model          TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- CV Analyses
CREATE TABLE IF NOT EXISTS cv_analyses (
  id             TEXT PRIMARY KEY,
  cv_document_id TEXT NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  score          REAL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cv_analyses_doc_id ON cv_analyses(cv_document_id);

-- Application Notes
CREATE TABLE IF NOT EXISTS application_notes (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  headline       TEXT NOT NULL,
  body           TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_notes_app ON application_notes(application_id, created_at);

-- Auth
CREATE TABLE IF NOT EXISTS auth (
  id         INTEGER PRIMARY KEY CHECK(id = 1),
  pin_hash   TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO auth (id, updated_at) VALUES (1, unixepoch() * 1000);

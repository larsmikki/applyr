-- Frequent vault lookups filter on doc_type (CV picker, template lookup,
-- attachment iteration). Without an index every read scans the table.
CREATE INDEX IF NOT EXISTS idx_vault_documents_doc_type ON vault_documents(doc_type);

-- History page can sort by updated_at_desc, and the "applied >7 days ago"
-- follow-up section on the dashboard reads (status, updated_at). Add an
-- index that supports both. SQLite can use a leading-column subset for the
-- status-only sort case as well.
CREATE INDEX IF NOT EXISTS idx_applications_status_updated_at ON applications(status, updated_at DESC);

-- Application notes index already exists for (application_id, created_at).
-- Snippet ordering ("WHERE hidden = 0 ORDER BY sort_order ASC, created_at ASC")
-- benefits from a covering index on (hidden, sort_order, created_at).
CREATE INDEX IF NOT EXISTS idx_snippets_visible_order ON snippets(hidden, sort_order, created_at);

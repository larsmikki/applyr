import { getDb } from '../db/connection';

interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  status: string;
  fit_score: number | null;
  job_url: string | null;
  applied_at: number | null;
  created_at: number;
  notes: string | null;
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toISOString();
}

export function generateCsv(): string {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, company, role, status, fit_score, job_url, applied_at, created_at, notes FROM applications ORDER BY created_at DESC'
  ).all() as ApplicationRow[];

  const headers = ['id', 'company', 'role', 'status', 'fit_score', 'job_url', 'applied_at', 'created_at', 'notes'];
  const lines: string[] = [headers.join(',')];

  for (const row of rows) {
    const line = [
      escapeCsvField(row.id),
      escapeCsvField(row.company),
      escapeCsvField(row.role),
      escapeCsvField(row.status),
      escapeCsvField(row.fit_score),
      escapeCsvField(row.job_url),
      escapeCsvField(formatTimestamp(row.applied_at)),
      escapeCsvField(formatTimestamp(row.created_at)),
      escapeCsvField(row.notes),
    ].join(',');
    lines.push(line);
  }

  return lines.join('\n');
}

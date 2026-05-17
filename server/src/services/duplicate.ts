import { getDb } from '../db/connection';

interface DuplicateMatch {
  id: string;
  company: string;
  role: string;
  status: string;
  created_at: number;
  exactMatch: boolean;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  totalMatches: number;
}

const MAX_MATCHES = 10;

export function checkDuplicate(company: string, role: string): DuplicateCheckResult {
  const db = getDb();

  const companyLower = company.toLowerCase().trim();
  const roleLower = role.toLowerCase().trim();

  const totalRow = db.prepare(
    'SELECT COUNT(*) as count FROM applications WHERE lower(trim(company)) LIKE ?'
  ).get(`%${companyLower}%`) as { count: number };

  // Surface exact-role matches first so they aren't pushed off the page by older history.
  const rows = db.prepare(
    `SELECT id, company, role, status, created_at FROM applications
     WHERE lower(trim(company)) LIKE ?
     ORDER BY (lower(trim(role)) = ?) DESC, created_at DESC
     LIMIT ?`
  ).all(`%${companyLower}%`, roleLower, MAX_MATCHES) as DuplicateMatch[];

  const matches = rows.map(app => ({
    ...app,
    exactMatch: app.role.toLowerCase().trim() === roleLower,
  }));

  return {
    isDuplicate: matches.length > 0,
    matches,
    totalMatches: totalRow.count,
  };
}

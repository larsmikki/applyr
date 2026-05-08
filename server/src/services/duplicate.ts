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
}

export function checkDuplicate(company: string, role: string): DuplicateCheckResult {
  const db = getDb();

  const companyLower = company.toLowerCase().trim();
  const roleLower = role.toLowerCase().trim();

  const rows = db.prepare(
    'SELECT id, company, role, status, created_at FROM applications WHERE lower(trim(company)) LIKE ? ORDER BY created_at DESC'
  ).all(`%${companyLower}%`) as DuplicateMatch[];

  const matches = rows.map(app => ({
    ...app,
    exactMatch: app.role.toLowerCase().trim() === roleLower,
  }));

  return {
    isDuplicate: matches.length > 0,
    matches,
  };
}

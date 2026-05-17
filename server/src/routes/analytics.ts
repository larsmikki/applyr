import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';

const router = Router();

router.get('/summary', authMiddleware, (_req, res) => {
  const db = getDb();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Combine status counts + total + this-month + avg fit score into 1 query
  // (previously 4 separate prepares). All aggregations table-scan once together.
  const statusRows = db.prepare(`
    SELECT status, COUNT(*) as count FROM applications GROUP BY status
  `).all() as { status: string; count: number }[];

  const aggRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as month_count,
      AVG(CASE WHEN fit_score IS NOT NULL THEN fit_score END) as avg_fit
    FROM applications
  `).get(startOfMonth.getTime()) as { total: number; month_count: number | null; avg_fit: number | null };

  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  const applied = (byStatus['applied'] || 0) + (byStatus['interview'] || 0) + (byStatus['offer'] || 0) + (byStatus['rejected'] || 0);
  const responses = (byStatus['interview'] || 0) + (byStatus['offer'] || 0);
  const responseRate = applied > 0 ? Math.round((responses / applied) * 100) : 0;

  res.json({
    total: aggRow.total,
    byStatus,
    responseRate,
    averageFitScore: aggRow.avg_fit ? Math.round(aggRow.avg_fit) : 0,
    totalThisMonth: aggRow.month_count ?? 0,
  });
});

router.get('/trends', authMiddleware, (_req, res) => {
  const db = getDb();

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  // Group by the server's local date — for self-hosted single-user apps the server
  // and user are on the same wall clock, so an application logged at 11 pm local
  // shows up on that day's bar (not the next day's UTC bar).
  const rows = db.prepare(`
    SELECT date(created_at / 1000, 'unixepoch', 'localtime') as date, COUNT(*) as count
    FROM applications
    WHERE created_at >= ?
    GROUP BY date(created_at / 1000, 'unixepoch', 'localtime')
    ORDER BY date ASC
  `).all(thirtyDaysAgo) as { date: string; count: number }[];

  const dateMap = new Map<string, number>();
  for (const row of rows) {
    dateMap.set(row.date, row.count);
  }

  // Build the 30-day window using local-date keys to match the SQL grouping.
  function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const daily: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateStr = localDateKey(d);
    daily.push({ date: dateStr, count: dateMap.get(dateStr) || 0 });
  }

  res.json({ daily });
});

router.get('/companies', authMiddleware, (_req, res) => {
  const db = getDb();

  // latestStatus = status of each company's most recently created application
  // (the previous MAX(status) returned the alphabetically-last status string, which was meaningless).
  const rows = db.prepare(`
    SELECT a.company,
           COUNT(*) as count,
           (SELECT status FROM applications a2
            WHERE a2.company = a.company
            ORDER BY a2.created_at DESC
            LIMIT 1) as latestStatus
    FROM applications a
    GROUP BY a.company
    ORDER BY count DESC
    LIMIT 10
  `).all() as { company: string; count: number; latestStatus: string }[];

  res.json(rows);
});

export default router;

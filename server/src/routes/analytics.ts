import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getDb } from '../db/connection';

const router = Router();

router.get('/summary', authMiddleware, (_req, res) => {
  const db = getDb();

  const totalRow = db.prepare('SELECT COUNT(*) as count FROM applications').get() as { count: number };
  const total = totalRow.count;

  const statusRows = db.prepare('SELECT status, COUNT(*) as count FROM applications GROUP BY status').all() as { status: string; count: number }[];
  const byStatus: Record<string, number> = {};
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
  }

  // Response rate: (interview + offer) / applied
  const applied = (byStatus['applied'] || 0) + (byStatus['interview'] || 0) + (byStatus['offer'] || 0) + (byStatus['rejected'] || 0);
  const responses = (byStatus['interview'] || 0) + (byStatus['offer'] || 0);
  const responseRate = applied > 0 ? Math.round((responses / applied) * 100) : 0;

  const avgRow = db.prepare('SELECT AVG(fit_score) as avg FROM applications WHERE fit_score IS NOT NULL').get() as { avg: number | null };
  const averageFitScore = avgRow.avg ? Math.round(avgRow.avg) : 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthRow = db.prepare('SELECT COUNT(*) as count FROM applications WHERE created_at >= ?').get(startOfMonth.getTime()) as { count: number };
  const totalThisMonth = monthRow.count;

  res.json({ total, byStatus, responseRate, averageFitScore, totalThisMonth });
});

router.get('/trends', authMiddleware, (_req, res) => {
  const db = getDb();

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT date(created_at / 1000, 'unixepoch') as date, COUNT(*) as count
    FROM applications
    WHERE created_at >= ?
    GROUP BY date(created_at / 1000, 'unixepoch')
    ORDER BY date ASC
  `).all(thirtyDaysAgo) as { date: string; count: number }[];

  // Fill in missing days with 0
  const dateMap = new Map<string, number>();
  for (const row of rows) {
    dateMap.set(row.date, row.count);
  }

  const daily: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    daily.push({ date: dateStr, count: dateMap.get(dateStr) || 0 });
  }

  res.json({ daily });
});

router.get('/companies', authMiddleware, (_req, res) => {
  const db = getDb();

  const rows = db.prepare(`
    SELECT company, COUNT(*) as count, MAX(status) as latestStatus
    FROM applications
    GROUP BY company
    ORDER BY count DESC
    LIMIT 10
  `).all() as { company: string; count: number; latestStatus: string }[];

  res.json(rows);
});

export default router;

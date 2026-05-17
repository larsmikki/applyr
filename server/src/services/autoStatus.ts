import { getDb } from '../db/connection';

const THIRTY_DAYS_MS = 30 * 86400 * 1000;

export function runAutoStatusUpdate(): { appliedToRejected: number; draftToWithdrawn: number } {
  const db = getDb();
  const now = Date.now();
  const cutoff = now - THIRTY_DAYS_MS;

  // Applied → Rejected when applied_at (or updated_at as fallback) is older than 30 days.
  const appliedResult = db.prepare(`
    UPDATE applications
    SET status = 'rejected', updated_at = ?
    WHERE status = 'applied'
      AND COALESCE(applied_at, updated_at) < ?
  `).run(now, cutoff);

  // Draft → Withdrawn when the row has been sitting in draft for 30 days.
  const draftResult = db.prepare(`
    UPDATE applications
    SET status = 'withdrawn', updated_at = ?
    WHERE status = 'draft'
      AND updated_at < ?
  `).run(now, cutoff);

  return {
    appliedToRejected: appliedResult.changes,
    draftToWithdrawn: draftResult.changes,
  };
}

export function scheduleAutoStatusUpdate(): NodeJS.Timeout {
  const tick = () => {
    try {
      const result = runAutoStatusUpdate();
      if (result.appliedToRejected > 0 || result.draftToWithdrawn > 0) {
        console.log(`[applyr] Auto-status: ${result.appliedToRejected} applied→rejected, ${result.draftToWithdrawn} draft→withdrawn`);
      }
    } catch (err) {
      console.error('[applyr] Auto-status update failed:', err);
    }
  };
  tick();
  const interval = setInterval(tick, 6 * 60 * 60 * 1000);
  interval.unref();
  return interval;
}

import { getDb } from '../db/connection';

export function isPinEnabled(): boolean {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'pin_enabled'").get() as { value: string } | undefined;
  return row?.value === '1';
}

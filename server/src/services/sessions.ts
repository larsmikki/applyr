const sessions = new Map<string, number>(); // token -> expiresAt (ms)

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function validateSession(token: string): boolean {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

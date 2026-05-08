import { Request, Response, NextFunction } from 'express';
import { isPinEnabled } from '../services/pinAuth';
import { validateSession } from '../services/sessions';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isPinEnabled()) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  if (!validateSession(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}

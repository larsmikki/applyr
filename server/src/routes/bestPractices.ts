import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

const BEST_PRACTICES_PATH = path.join(__dirname, '../../../resources/application-writing-prompt.md');

router.get('/', authMiddleware, (_req, res) => {
  try {
    const content = fs.existsSync(BEST_PRACTICES_PATH)
      ? fs.readFileSync(BEST_PRACTICES_PATH, 'utf-8')
      : '';
    res.json({ content });
  } catch {
    res.status(500).json({ error: 'Failed to read best practices file' });
  }
});

router.put('/', authMiddleware, (req, res) => {
  const { content } = req.body as { content: string };
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content must be a string' });
    return;
  }
  try {
    fs.mkdirSync(path.dirname(BEST_PRACTICES_PATH), { recursive: true });
    fs.writeFileSync(BEST_PRACTICES_PATH, content, 'utf-8');
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to write best practices file' });
  }
});

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { extractFromUrl, extractFromText } from '../infrastructure/extractor';

const router = Router();

function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  const h = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/i,
    /^127\./,
    /^0\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^fe[89ab][0-9a-f]:/i,
  ];
  return !blocked.some(re => re.test(h));
}

router.post('/', authMiddleware, async (req, res) => {
  const { url, text } = req.body as { url?: string; text?: string };

  if (!url && !text) {
    res.status(400).json({ error: 'Either url or text is required' });
    return;
  }

  try {
    if (url) {
      if (!isSafeUrl(url)) {
        res.status(400).json({ error: 'Invalid or disallowed URL' });
        return;
      }
      const result = await extractFromUrl(url);
      res.json(result);
    } else {
      const result = extractFromText(text!);
      res.json(result);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    res.status(500).json({ error: message });
  }
});

export default router;

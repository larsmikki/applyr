import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { extractFromUrl, extractFromText } from '../infrastructure/extractor';
import { isSafeUrl } from '../utils/url';

const router = Router();

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

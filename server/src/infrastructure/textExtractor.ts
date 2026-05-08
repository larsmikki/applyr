import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;

// pdf-parse faithfully reproduces incorrect ToUnicode mappings from some PDF fonts.
// These characters are ligature glyphs mapped to wrong Unicode codepoints.
function fixPdfLigatures(text: string): string {
  return text
    // Standard Unicode ligature block (U+FB00–U+FB06)
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/ﬅ/g, 'st')
    .replace(/ﬆ/g, 'st')
    // Font-specific mis-mappings observed in practice
    .replace(/Ɵ/g, 'ti')   // ti-ligature glyph mapped to U+019F
    .replace(/ƞ/g, 'tf');  // tf-ligature glyph mapped to U+019E
}

async function extractOdtText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('content.xml');
  if (!entry) return '';
  let xml = await entry.async('string');

  // Remove draw frames entirely — they contain image alt-text noise (titles, descriptions)
  xml = xml.replace(/<draw:frame\b[^>]*>[\s\S]*?<\/draw:frame>/gi, '');

  return xml
    // List items → bullet prefix (bullet char is in the list style, not the text node)
    .replace(/<text:list-item\b[^>]*>/gi, '• ')
    // Block elements → newline
    .replace(/<\/(text:p|text:h|text:list-item)[^>]*>/gi, '\n')
    // ODT explicit space: <text:s c="3"/> = 3 spaces, <text:s/> = 1 space
    // [^>]* consumes the full tag including the closing > (and / in />)
    .replace(/<text:s\b[^>]*>/gi, (m) => {
      const c = m.match(/\bc="(\d+)"/);
      return ' '.repeat(c ? parseInt(c[1], 10) : 1);
    })
    // ODT tab and line-break — [^>]*> consumes through the closing >
    .replace(/<text:tab\b[^>]*>/gi, '\t')
    .replace(/<text:line-break\b[^>]*>/gi, '\n')
    // Strip all remaining tags; [^>]* matches newlines in JS so multi-line tags are handled
    .replace(/<[^>]*>/g, '')
    // Decode XML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    // Normalise whitespace per line
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Extracts plain text from a file based on its extension.
 * Supports .txt, .md (UTF-8 read), .pdf (pdf-parse), .odt (AdmZip + XML strip).
 * Returns null if the format is unsupported or extraction fails.
 */
export async function extractTextFromFile(filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (['.txt', '.md'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    if (ext === '.pdf') {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      return parsed.text ? fixPdfLigatures(parsed.text) : null;
    }
    if (ext === '.odt') {
      const buffer = fs.readFileSync(filePath);
      return (await extractOdtText(buffer)) || null;
    }
  } catch {
    return null;
  }
  return null;
}

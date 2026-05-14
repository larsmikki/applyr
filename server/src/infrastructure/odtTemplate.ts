import fs from 'fs';
import JSZip from 'jszip';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const libre = require('libreoffice-convert');

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strips the Windows-specific PrinterSetup DEVMODE blob from settings.xml.
 * LibreOffice headless can't fully resolve the printer driver stored there,
 * which causes it to mis-scale document layout vs the GUI's rendering.
 */
async function clearPrinterSetup(zip: JSZip): Promise<void> {
  const settingsFile = zip.file('settings.xml');
  if (!settingsFile) return;
  let settings = await settingsFile.async('string');
  // Remove PrinterSetup config-item (base64 DEVMODE blob)
  settings = settings.replace(
    /<config:config-item config:name="PrinterSetup"[^>]*>[\s\S]*?<\/config:config-item>/g,
    ''
  );
  // Remove PrinterName so LibreOffice doesn't try to resolve a specific driver
  settings = settings.replace(
    /<config:config-item config:name="PrinterName"[^>]*>[\s\S]*?<\/config:config-item>/g,
    ''
  );
  zip.file('settings.xml', settings, { compression: 'DEFLATE' });
}

/**
 * Converts an ODT buffer to PDF using LibreOffice headless.
 * Requires LibreOffice to be installed in the environment.
 */
export async function odtToPdf(odtBuffer: Buffer): Promise<Buffer> {
  // Strip printer-specific settings so headless uses neutral defaults
  const zip = await JSZip.loadAsync(odtBuffer);
  await clearPrinterSetup(zip);
  const cleanBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  return new Promise((resolve, reject) => {
    libre.convert(cleanBuffer, '.pdf', undefined, (err: Error | null, result: Buffer) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Processes an ODT template file.
 *
 * Template placeholders:
 *   [heading] — replaced with the first non-empty line of the cover letter.
 *               Works inside both <text:p> and <text:h> elements.
 *   [text]    — replaced with the remaining body paragraphs.
 *               Double newlines → separate <text:p> elements.
 *               Single newlines within a block → <text:line-break/>.
 */
export async function processOdtTemplate(
  templatePath: string,
  coverLetterText: string
): Promise<Buffer> {
  const fileBuffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(fileBuffer);

  const contentFile = zip.file('content.xml');
  if (!contentFile) throw new Error('Invalid ODT template: content.xml not found');

  let xml = await contentFile.async('string');

  // Split cover letter into heading line and body
  const allLines = coverLetterText.split('\n');
  const headingIndex = allLines.findIndex(l => l.trim().length > 0);
  const rawHeading = headingIndex >= 0 ? allLines[headingIndex].trim() : '';
  const headingText = rawHeading.replace(/^#{1,6}\s+/, '');
  const bodyText = headingIndex >= 0
    ? allLines.slice(headingIndex + 1).join('\n').trimStart()
    : coverLetterText;

  // Match <text:p> and <text:h> block elements (non-self-closing only).
  // The negative lookbehind (?<!\/) ensures we skip self-closing tags like <text:p/>.
  const blockRegex = /<text:(?:p|h)\b[^>]*(?<!\/)>[\s\S]*?<\/text:(?:p|h)>/g;

  // Replace [heading] — keep the element's opening/closing tags, replace only content
  xml = xml.replace(blockRegex, (match) => {
    const plain = match.replace(/<[^>]+>/g, '');
    if (!/\[heading\]/i.test(plain)) return match;
    const tagName = match.match(/^<(text:(?:p|h)\b[^>]*)/)?.[0].match(/^<(\S+)/)?.[1] ?? 'text:p';
    const openTag = match.match(/^<text:(?:p|h)\b[^>]*(?<!\/)>/)?.[0] ?? `<${tagName}>`;
    return `${openTag}${xmlEscape(headingText)}</${tagName}>`;
  });

  // Replace [text] — expand into one <text:p> per double-newline block
  xml = xml.replace(blockRegex, (match) => {
    const plain = match.replace(/<[^>]+>/g, '');
    if (!/\[text\]/i.test(plain)) return match;
    const openTag = match.match(/^<text:(?:p|h)\b[^>]*(?<!\/)>/)?.[0] ?? '<text:p>';
    const styleMatch = openTag.match(/text:style-name="([^"]+)"/);
    const style = styleMatch?.[1] ?? 'Default Paragraph Style';
    return bodyText
      .split(/\n\n+/)
      .filter(p => p.trim().length > 0)
      .map(p => {
        const content = p.trim().split('\n').map(xmlEscape).join('<text:line-break/>');
        return `<text:p text:style-name="${style}">${content}</text:p>`;
      })
      .join('');
  });

  zip.file('content.xml', xml, { compression: 'DEFLATE' });

  // ODT spec: mimetype must be STORED (uncompressed) as the first entry
  const mimetypeFile = zip.file('mimetype');
  if (mimetypeFile) {
    const mimetypeContent = await mimetypeFile.async('uint8array');
    zip.file('mimetype', mimetypeContent, { compression: 'STORE' });
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}

import * as cheerio from 'cheerio';
import { isSafeUrl } from '../utils/url';

interface ExtractResult {
  company: string;
  role: string;
  description: string;
  source: 'url' | 'text';
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Convert an HTML string to clean Markdown. */
function htmlToMarkdown(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);

  function convert(el: any): string {
    if (el.type === 'text') {
      return (el.data as string).replace(/[ \t]+/g, ' ');
    }
    if (el.type !== 'tag') return '';

    const children: any[] = el.children || [];
    const inner = () => children.map(convert).join('');

    switch (el.name) {
      case 'script':
      case 'style':
      case 'noscript':
        return '';
      case 'br':
        return '\n';
      case 'h1': return `\n\n# ${inner().trim()}\n\n`;
      case 'h2': return `\n\n## ${inner().trim()}\n\n`;
      case 'h3': return `\n\n### ${inner().trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6': return `\n\n#### ${inner().trim()}\n\n`;
      case 'strong':
      case 'b': {
        const t = inner().trim();
        return t ? `**${t}**` : '';
      }
      case 'em':
      case 'i': {
        const t = inner().trim();
        return t ? `*${t}*` : '';
      }
      case 'li': return `\n- ${inner().trim()}`;
      case 'ul':
      case 'ol': return `\n${inner()}\n`;
      case 'p': return `\n\n${inner().trim()}\n\n`;
      case 'div':
      case 'section':
      case 'article':
      case 'main': return `\n${inner()}\n`;
      case 'a':
      case 'span':
      default: return inner();
    }
  }

  const result = $('body').contents().map((_: number, el: any) => convert(el)).get().join('');
  return result
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trim();
}

function extractFromJsonLd($: cheerio.CheerioAPI): { company: string; role: string; description: string } | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const content = $(scripts[i]).html() || '';
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'JobPosting') {
          const company = item.hiringOrganization?.name || item.hiringOrganization || '';
          const role = item.title || '';
          const description = item.description ? htmlToMarkdown(item.description) : '';
          if (role || description) {
            return { company: cleanText(company), role: cleanText(role), description };
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

function extractFromKnownSelectors($: cheerio.CheerioAPI, url: string): { company: string; role: string; description: string } | null {
  // LinkedIn
  if (url.includes('linkedin.com')) {
    const role = $(
      '.top-card-layout__title, .job-details-jobs-unified-top-card__job-title, h1.topcard__title'
    ).first().text().trim();
    const company = $(
      '.topcard__org-name-link, .top-card-layout__second-line a, .job-details-jobs-unified-top-card__company-name'
    ).first().text().trim();
    const descHtml = $('.show-more-less-html__markup, .jobs-description__content').first().html() || '';
    const description = htmlToMarkdown(descHtml);

    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogMatch = ogTitle.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+.+\s*\|/i);
    const resolvedCompany = company || (ogMatch ? ogMatch[1] : '');
    const resolvedRole = role || (ogMatch ? ogMatch[2] : '');

    if (resolvedRole || description) {
      return { role: cleanText(resolvedRole), company: cleanText(resolvedCompany), description };
    }
  }

  // Greenhouse
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) {
    const role = $('h1.app-title, .app-title').first().text().trim();
    const company = $('span.company-name').first().text().trim();
    const descHtml = $('#content, .job-content').first().html() || '';
    const description = htmlToMarkdown(descHtml);
    if (role || description) {
      return { role: cleanText(role), company: cleanText(company), description };
    }
  }

  // Lever
  if (url.includes('jobs.lever.co')) {
    const role = $('h2[data-qa="title"], .posting-headline h2').first().text().trim();
    const company = $('meta[property="og:site_name"]').attr('content') || '';
    const descHtml = $('.posting-description, .section-wrapper').html() || '';
    const description = htmlToMarkdown(descHtml);
    if (role || description) {
      return { role: cleanText(role), company: cleanText(company), description };
    }
  }

  // Workday
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) {
    const role = $('[data-automation-id="jobPostingHeader"]').first().text().trim();
    const company = $('meta[property="og:site_name"]').attr('content') || '';
    const descHtml = $('[data-automation-id="jobPostingDescription"]').first().html() || '';
    const description = htmlToMarkdown(descHtml);
    if (role || description) {
      return { role: cleanText(role), company: cleanText(company), description };
    }
  }

  // Indeed
  if (url.includes('indeed.com')) {
    const role = $('[data-testid="jobsearch-JobInfoHeader-title"], .jobsearch-JobInfoHeader-title').first().text().trim();
    const company = $('[data-testid="inlineHeader-companyName"], .jobsearch-InlineCompanyRating-companyHeader').first().text().trim();
    const descHtml = $('#jobDescriptionText, .jobsearch-JobComponent-description').first().html() || '';
    const description = htmlToMarkdown(descHtml);
    if (role || description) {
      return { role: cleanText(role), company: cleanText(company), description };
    }
  }

  // Jobindex (Danish job board)
  if (url.includes('jobindex.dk')) {
    const role = $('h1').first().text().trim();
    const company = $('a.vp-card__name').first().text().trim();
    const descHtml = $('.jobtext-jobad__body').first().html() || '';
    const description = htmlToMarkdown(descHtml);
    if (role || description) {
      return { role: cleanText(role), company: cleanText(company), description };
    }
  }

  return null;
}

function extractLargestBlock($: cheerio.CheerioAPI): string {
  let bestHtml = '';
  let bestLength = 0;
  const selectors = ['article', 'section', 'main', '.job-description', '#job-description', '[class*="description"]', '[id*="description"]', '.content', 'div.body'];

  for (const sel of selectors) {
    const el = $(sel).first();
    const text = el.text().trim();
    if (text.length > bestLength) {
      bestLength = text.length;
      bestHtml = el.html() || '';
    }
  }

  if (bestLength < 200) {
    $('div, p').each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > bestLength) {
        bestLength = text.length;
        bestHtml = $(el).html() || '';
      }
    });
  }

  return htmlToMarkdown(bestHtml);
}

async function fetchWithSafeRedirects(initialUrl: string, maxRedirects = 5): Promise<Response> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'da,en-US;q=0.9,en;q=0.5',
  };
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isSafeUrl(currentUrl)) {
      throw new Error('Redirect to a disallowed URL was blocked');
    }
    const response = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(30000),
    });
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get('location');
      if (!loc) return response;
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects');
}

export async function extractFromUrl(url: string): Promise<ExtractResult> {
  const response = await fetchWithSafeRedirects(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Try JSON-LD first (before removing script tags)
  const jsonLd = extractFromJsonLd($);

  // Try site-specific selectors before removing structural elements
  const earlyKnown = extractFromKnownSelectors($, url);

  // Remove script/style tags for cleaner extraction
  $('script, style, nav, footer, header').remove();
  if (jsonLd && (jsonLd.role || jsonLd.description)) {
    return { ...jsonLd, source: 'url' };
  }

  if (earlyKnown && (earlyKnown.role || earlyKnown.description)) {
    return { ...earlyKnown, source: 'url' };
  }

  // Try known site selectors again on cleaned DOM
  const known = extractFromKnownSelectors($, url);
  if (known && (known.role || known.description)) {
    return { ...known, source: 'url' };
  }

  // Fall back to meta tags + largest content block
  const role = $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() || '';
  const siteName = $('meta[property="og:site_name"]').attr('content') || '';
  const knownPlatforms = ['linkedin', 'indeed', 'glassdoor', 'monster', 'ziprecruiter', 'jobindex'];
  const company = knownPlatforms.some(p => siteName.toLowerCase().includes(p)) ? '' : siteName;
  const description = extractLargestBlock($);

  return {
    company: cleanText(company),
    role: cleanText(role),
    description,
    source: 'url',
  };
}

export function extractFromText(text: string): ExtractResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let company = '';
  let role = '';

  for (const line of lines.slice(0, 15)) {
    const companyMatch = line.match(/^(?:company|employer|organization|organisation)[:\s]+(.+)$/i);
    if (companyMatch) {
      company = companyMatch[1].trim();
      continue;
    }

    const roleMatch = line.match(/^(?:role|position|title|job title)[:\s]+(.+)$/i);
    if (roleMatch) {
      role = roleMatch[1].trim();
      continue;
    }
  }

  if (!company && lines.length > 0 && lines[0].length < 80) {
    company = lines[0];
  }
  if (!role && lines.length > 1 && lines[1].length < 80) {
    role = lines[1];
  }

  return {
    company,
    role,
    description: text,
    source: 'text',
  };
}

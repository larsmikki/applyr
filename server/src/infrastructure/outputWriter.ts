import path from 'path';
import fs from 'fs';

function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').trim();
}

export function createApplicationFolder(
  outputDir: string,
  company: string,
  role: string,
  _appId: string
): string {
  const safeCo = sanitizeFolderName(company).slice(0, 40).toLowerCase() || 'unknown';
  const safeRole = sanitizeFolderName(role).slice(0, 60).toLowerCase() || 'role';
  const folderName = `${safeCo}_${safeRole}`;
  const folderPath = path.join(outputDir, folderName);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  return folderPath;
}

export function writeApplicationFile(folderPath: string, filename: string, content: string): void {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  fs.writeFileSync(path.join(folderPath, filename), content, 'utf-8');
}

export function writeJobDescription(folderPath: string, jobDescription: string): void {
  writeApplicationFile(folderPath, 'job_description.txt', jobDescription);
}

export function writeAnalysis(folderPath: string, analysis: string): void {
  writeApplicationFile(folderPath, 'analysis.md', analysis);
}

export function writeOdtBuffer(folderPath: string, filename: string, buffer: Buffer): void {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  fs.writeFileSync(path.join(folderPath, filename), buffer);
}

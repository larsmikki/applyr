import path from 'path';
import fs from 'fs';

export function getVaultDir(dataDir: string): string {
  return path.join(dataDir, 'vault');
}

export function ensureVaultDir(dataDir: string): void {
  const vaultDir = getVaultDir(dataDir);
  if (!fs.existsSync(vaultDir)) {
    fs.mkdirSync(vaultDir, { recursive: true });
  }
}

export function deleteVaultFile(dataDir: string, storedName: string): void {
  const filePath = path.join(getVaultDir(dataDir), storedName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

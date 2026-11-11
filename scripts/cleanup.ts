import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../lib/logger.ts';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function cleanupOldStorageFiles(
  storageRoot = path.resolve(process.cwd(), process.env.STORAGE_LOCAL_PATH || './storage'),
  maxAgeMs = SEVEN_DAYS_MS
): { deletedCount: number; scannedCount: number } {
  let deletedCount = 0;
  let scannedCount = 0;
  const now = Date.now();

  if (!fs.existsSync(storageRoot)) {
    return { deletedCount, scannedCount };
  }

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        scannedCount++;
        const stat = fs.statSync(fullPath);
        const isTemp = entry.name.startsWith('temp_') || entry.name === 'concat_list.txt';
        if ((now - stat.mtimeMs > maxAgeMs) || (isTemp && now - stat.mtimeMs > 24 * 3600 * 1000)) {
          fs.unlinkSync(fullPath);
          deletedCount++;
          logger.info({ file: fullPath }, 'Deleted expired storage file');
        }
      }
    }
  }

  walk(storageRoot);
  return { deletedCount, scannedCount };
}

if (process.argv[1]?.endsWith('cleanup.ts')) {
  const res = cleanupOldStorageFiles();
  console.log(`Cleanup complete: scanned=${res.scannedCount}, deleted=${res.deletedCount}`);
}

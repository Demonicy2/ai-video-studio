import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import path from 'node:path';

export function cn(...inputs: unknown[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize filenames to prevent path traversal and invalid characters.
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+/, '');
  return cleaned || 'file';
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function estimateProjectCostUsd(totalSeconds: number): number {
  const rate = Number(process.env.ESTIMATED_COST_PER_SECOND_USD || '0.05');
  return Number((totalSeconds * rate).toFixed(2));
}


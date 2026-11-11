import crypto from 'node:crypto';
import { prisma } from './db.ts';

const AUTH_COOKIE_NAME = 'avs_session';
const SECRET = process.env.AUTH_SECRET || 'dev-super-secret-key-change-in-production-32chars';

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function createSessionToken(user: { id: string; email: string; name: string }): string {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as SessionPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export async function getUserFromCookieHeader(cookieHeader: string | undefined | null) {
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[AUTH_COOKIE_NAME];
  const session = verifySessionToken(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  return user;
}

export function makeSessionCookie(token: string): string {
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`;
}

export function makeLogoutCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// In-memory sliding window rate limit for storyboard generation (per user per hour)
const storyboardBuckets = new Map<string, number[]>();

export function checkStoryboardRateLimit(userId: string): { allowed: boolean; retryAfterSec?: number } {
  const limit = Number(process.env.STORYBOARD_HOURLY_LIMIT || '5');
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const timestamps = (storyboardBuckets.get(userId) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    const oldest = timestamps[0];
    return { allowed: false, retryAfterSec: Math.ceil((oldest + windowMs - now) / 1000) };
  }
  timestamps.push(now);
  storyboardBuckets.set(userId, timestamps);
  return { allowed: true };
}

export async function checkAndConsumeDailyQuota(userId: string, sceneCount: number): Promise<{ allowed: boolean; remaining: number }> {
  const maxDaily = Number(process.env.DAILY_SCENE_QUOTA || '30');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { allowed: false, remaining: 0 };

  const now = new Date();
  const resetAt = new Date(user.quotaResetAt);
  const isNewDay = now.toDateString() !== resetAt.toDateString();
  const currentUsed = isNewDay ? 0 : user.dailyQuotaUsed;

  if (currentUsed + sceneCount > maxDaily) {
    return { allowed: false, remaining: Math.max(0, maxDaily - currentUsed) };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      dailyQuotaUsed: currentUsed + sceneCount,
      quotaResetAt: isNewDay ? now : user.quotaResetAt,
    },
  });

  return { allowed: true, remaining: maxDaily - (currentUsed + sceneCount) };
}


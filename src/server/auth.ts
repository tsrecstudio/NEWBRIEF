import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const ADMIN_COOKIE_NAME = 'msdis_admin_session';
export const BRIEF_PIN_COOKIE_PREFIX = 'msdis_brief_pin_';

export function generateSecureToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashPin(pin: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`pin:${pin.trim()}`)
    .digest('hex');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep constant-ish work before returning false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function signTokenPayload(
  payload: Record<string, unknown>,
  secret: string
): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyTokenPayload<T extends Record<string, unknown>>(
  signed: string | undefined,
  secret: string
): T | null {
  if (!signed || !signed.includes('.')) return null;
  const [encoded, sig] = signed.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');
  if (!timingSafeEqualStr(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as T & { exp?: number };
    if (parsed.exp && Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAdminAuthenticated(req: Request, secret: string): boolean {
  const cookieVal = req.cookies?.[ADMIN_COOKIE_NAME];
  const headerToken = req.headers['x-admin-token'];
  const raw = typeof headerToken === 'string' ? headerToken : cookieVal;
  const verified = verifyTokenPayload<{ role: string }>(raw, secret);
  return verified?.role === 'admin';
}

export function requireAdmin(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isAdminAuthenticated(req, secret)) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Требуется авторизация администратора МСДИС',
      });
      return;
    }
    next();
  };
}

export function isBriefPinUnlocked(
  req: Request,
  briefId: string,
  pinHash: string | null,
  secret: string
): boolean {
  if (!pinHash) return true;
  if (isAdminAuthenticated(req, secret)) return true;
  const cookieName = `${BRIEF_PIN_COOKIE_PREFIX}${briefId}`;
  const raw =
    (typeof req.headers['x-brief-pin-token'] === 'string'
      ? req.headers['x-brief-pin-token']
      : undefined) || req.cookies?.[cookieName];
  const verified = verifyTokenPayload<{ briefId: string; pinHash: string }>(
    raw,
    secret
  );
  return (
    verified?.briefId === briefId && verified?.pinHash === pinHash
  );
}

// Simple in-memory rate limiter for PIN & Admin login attempts
export class AttemptLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private maxAttempts = 12,
    private windowMs = 5 * 60 * 1000
  ) {}

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now > entry.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > this.maxAttempts) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

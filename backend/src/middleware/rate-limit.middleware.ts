/**
 * API rate limiting — kullanıcı başına (JWT) veya IP bazlı
 */

import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';

function normalizeApiPath(req: Request): string {
  return (req.path || req.url?.split('?')[0] || '').replace(/\/+$/, '');
}

/** Sık poll edilen hafif GET uçları — ayrı yüksek limit */
export function isLightPollingRequest(req: Request): boolean {
  const path = normalizeApiPath(req);
  return (
    /^\/v1\/auth\/me$/.test(path) ||
    /^\/v1\/whatsapp\/qr\/[^/]+\/status$/.test(path) ||
    /^\/v1\/whatsapp\/status$/.test(path) ||
    /^\/v1\/notifications/.test(path)
  );
}

function decodeJwtSub(authorization?: string): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token || token.startsWith('demo-')) return `demo:${token}`;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { sub?: string };
    return payload.sub ? `user:${payload.sub}` : null;
  } catch {
    return null;
  }
}

export function getRateLimitKey(req: Request): string {
  const fromJwt = decodeJwtSub(req.headers.authorization);
  if (fromJwt) return fromJwt;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return `ip:${forwarded.split(',')[0].trim()}`;
  }
  return `ip:${req.ip || 'unknown'}`;
}

const limitMessage = { success: false, error: 'Çok fazla istek gönderildi' };

export const pollingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 5000 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: limitMessage,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.isDev ? 3000 : 1500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  skip: (req) => isLightPollingRequest(req),
  message: limitMessage,
});

export function applyApiRateLimit(req: Request, res: Parameters<typeof apiLimiter>[1], next: Parameters<typeof apiLimiter>[2]) {
  if (isLightPollingRequest(req)) {
    pollingLimiter(req, res, next);
    return;
  }
  apiLimiter(req, res, next);
}

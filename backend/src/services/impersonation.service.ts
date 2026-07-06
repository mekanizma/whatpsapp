/**
 * Super admin firma paneli impersonation — imzalı, süreli token
 */

import crypto from 'crypto';
import { config } from '../config';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signingSecret(): string {
  return config.supabase.serviceRoleKey;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function isValidCompanyUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export function createImpersonationToken(userId: string, companyId: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}:${companyId}:${exp}`;
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyImpersonationToken(token: string, userId: string): string | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig) return null;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expectedSig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  if (!timingSafeEqualStrings(sig, expectedSig)) return null;

  const [uid, companyId, expStr] = payload.split(':');
  if (uid !== userId || !companyId || !expStr) return null;
  if (!isValidCompanyUuid(companyId)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  return companyId;
}

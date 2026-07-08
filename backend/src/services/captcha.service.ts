/**
 * Basit, sunucu tarafında imzalı matematik captcha — harici servis gerektirmez.
 * Token = base64url(payload) + "." + HMAC(payload). payload = "<cevap>:<exp>".
 * Böylece durum (state) tutmadan doğrulanabilir ve kurcalamaya karşı korunur.
 */

import crypto from 'crypto';
import { config } from '../config';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function signingSecret(): string {
  return process.env.CAPTCHA_SECRET?.trim() || config.supabase.serviceRoleKey;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export interface CaptchaChallenge {
  token: string;
  question: string;
}

export function generateCaptcha(): CaptchaChallenge {
  const a = crypto.randomInt(1, 10);
  const b = crypto.randomInt(1, 10);
  const useMultiply = crypto.randomInt(0, 2) === 1;

  const answer = useMultiply ? a * b : a + b;
  const question = useMultiply ? `${a} × ${b}` : `${a} + ${b}`;

  const exp = Date.now() + CAPTCHA_TTL_MS;
  const payload = `${answer}:${exp}`;
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  const token = `${Buffer.from(payload).toString('base64url')}.${sig}`;

  return { token, question };
}

export function verifyCaptcha(token: string, userAnswer: string | number): boolean {
  if (typeof token !== 'string' || !token) return false;

  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig) return false;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expectedSig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  if (!timingSafeEqualStrings(sig, expectedSig)) return false;

  const [answerStr, expStr] = payload.split(':');
  if (!answerStr || !expStr) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = Number(answerStr);
  const provided = Number(String(userAnswer).trim());
  if (!Number.isFinite(provided)) return false;

  return expected === provided;
}

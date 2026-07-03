/**
 * Meta WhatsApp Cloud API webhook signature verification (X-Hub-Signature-256)
 */

import crypto from 'crypto';

export type WebhookSignatureFailureReason =
  | 'app_secret_not_configured'
  | 'missing_raw_body'
  | 'missing_or_malformed_signature'
  | 'signature_mismatch';

export type WebhookSignatureResult =
  | { ok: true }
  | { ok: false; reason: WebhookSignatureFailureReason };

export function verifyMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | string[] | undefined,
  appSecret: string | undefined
): WebhookSignatureResult {
  if (!appSecret) {
    return { ok: false, reason: 'app_secret_not_configured' };
  }

  if (!rawBody || rawBody.length === 0) {
    return { ok: false, reason: 'missing_raw_body' };
  }

  const headerValue = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!headerValue?.startsWith('sha256=')) {
    return { ok: false, reason: 'missing_or_malformed_signature' };
  }

  const expectedHex = headerValue.slice('sha256='.length);
  if (!expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) {
    return { ok: false, reason: 'missing_or_malformed_signature' };
  }

  const computedHex = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const computedBuf = Buffer.from(computedHex, 'hex');

  if (expectedBuf.length !== computedBuf.length) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  if (!crypto.timingSafeEqual(expectedBuf, computedBuf)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true };
}

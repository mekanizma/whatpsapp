/**
 * Tests set WHATSAPP_APP_SECRET before importing the controller (see beforeEach too).
 */
process.env.WHATSAPP_APP_SECRET = 'test-webhook-app-secret';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { verifyMetaWebhookSignature } from '../whatsapp/webhook-signature';
import { handleWebhook, verifyWebhook, webhookDeps } from './webhook.controller';

const APP_SECRET = 'test-webhook-app-secret';

let processWebhookCalls = 0;
const originalProcessWebhook = webhookDeps.processWebhook;
const originalResolveAppSecret = webhookDeps.resolveAppSecret;

function stubProcessWebhook() {
  processWebhookCalls = 0;
  webhookDeps.processWebhook = (async () => {
    processWebhookCalls++;
  }) as typeof originalProcessWebhook;
}

function restoreProcessWebhookStub() {
  webhookDeps.processWebhook = originalProcessWebhook;
}

function restoreResolveAppSecretStub() {
  webhookDeps.resolveAppSecret = originalResolveAppSecret;
}

function signBody(body: Buffer, secret = APP_SECRET): string {
  const hex = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

function createMockReqRes(options: {
  rawBody?: Buffer;
  body?: unknown;
  signature?: string;
}) {
  const rawBody = options.rawBody;
  const req = {
    rawBody,
    body:
      options.body ??
      (rawBody ? JSON.parse(rawBody.toString('utf8')) : {}),
    headers: options.signature ? { 'x-hub-signature-256': options.signature } : {},
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
  } as Request;

  let statusCode = 0;
  let responseBody = '';
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(data: string) {
      responseBody = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    statusCode: () => statusCode,
    responseBody: () => responseBody,
  };
}

describe('verifyMetaWebhookSignature', () => {
  it('accepts a valid signature over a unicode-containing body', () => {
    const rawBody = Buffer.from(
      JSON.stringify({ message: 'Merhaba dünya 🌍', nested: { ok: true } }),
      'utf8'
    );
    const result = verifyMetaWebhookSignature(rawBody, signBody(rawBody), APP_SECRET);
    assert.equal(result.ok, true);
  });

  it('rejects an invalid signature', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const result = verifyMetaWebhookSignature(rawBody, 'sha256=deadbeef', APP_SECRET);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'signature_mismatch');
  });

  it('rejects a missing signature header', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const result = verifyMetaWebhookSignature(rawBody, undefined, APP_SECRET);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'missing_or_malformed_signature');
  });

  it('rejects when signature was computed over re-serialized JSON instead of raw bytes', () => {
    const payload = { message: 'Merhaba dünya 🌍', count: 2 };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const reserialized = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    const signature = signBody(reserialized);

    const result = verifyMetaWebhookSignature(rawBody, signature, APP_SECRET);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'signature_mismatch');
  });

  it('rejects when app secret is not configured', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const result = verifyMetaWebhookSignature(rawBody, signBody(rawBody), undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'app_secret_not_configured');
  });
});

describe('handleWebhook', () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    stubProcessWebhook();
  });

  afterEach(() => {
    restoreProcessWebhookStub();
    restoreResolveAppSecretStub();
  });

  it('returns 200 and calls processWebhook once for a valid signature', async () => {
    const rawBody = Buffer.from(
      JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
      'utf8'
    );
    const { req, res, statusCode, responseBody } = createMockReqRes({
      rawBody,
      signature: signBody(rawBody),
    });

    await handleWebhook(req, res);

    assert.equal(statusCode(), 200);
    assert.equal(responseBody(), 'EVENT_RECEIVED');
    assert.equal(processWebhookCalls, 1);
  });

  it('returns 401 and does not call processWebhook for an invalid signature', async () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const { req, res, statusCode, responseBody } = createMockReqRes({
      rawBody,
      signature: 'sha256=00',
    });

    await handleWebhook(req, res);

    assert.equal(statusCode(), 401);
    assert.equal(responseBody(), 'Unauthorized');
    assert.equal(processWebhookCalls, 0);
  });

  it('returns 401 and does not call processWebhook when signature header is missing', async () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');
    const { req, res, statusCode, responseBody } = createMockReqRes({ rawBody });

    await handleWebhook(req, res);

    assert.equal(statusCode(), 401);
    assert.equal(responseBody(), 'Unauthorized');
    assert.equal(processWebhookCalls, 0);
  });

  it('returns 401 when signature matches re-serialized JSON but rawBody differs', async () => {
    const payload = { message: 'Merhaba dünya 🌍' };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const reserialized = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    const { req, res, statusCode } = createMockReqRes({
      rawBody,
      signature: signBody(reserialized),
    });

    await handleWebhook(req, res);

    assert.equal(statusCode(), 401);
    assert.equal(processWebhookCalls, 0);
  });

  it('uses the account-specific app secret when resolving webhook signatures', async () => {
    const accountSecret = 'second-company-app-secret';
    const rawBody = Buffer.from(
      JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: { metadata: { phone_number_id: '1234567890' }, messages: [] },
          }],
        }],
      }),
      'utf8'
    );
    webhookDeps.resolveAppSecret = async () => accountSecret;
    const { req, res, statusCode } = createMockReqRes({
      rawBody,
      signature: signBody(rawBody, accountSecret),
    });

    await handleWebhook(req, res);

    assert.equal(statusCode(), 200);
    assert.equal(processWebhookCalls, 1);
  });
});

describe('verifyWebhook (GET hub.verify_token)', () => {
  it('returns challenge when verify token matches', () => {
    let statusCode = 0;
    let body = '';
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
        'hub.challenge': 'challenge-12345',
      },
    } as unknown as Request;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(data: string) {
        body = data;
        return this;
      },
      json: () => res,
    } as unknown as Response;

    verifyWebhook(req, res);

    assert.equal(statusCode, 200);
    assert.equal(body, 'challenge-12345');
  });

  it('returns 403 when verify token does not match', () => {
    let statusCode = 0;
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'challenge-12345',
      },
    } as unknown as Request;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json: () => {
        statusCode = statusCode || 403;
        return res;
      },
    } as unknown as Response;

    verifyWebhook(req, res);

    assert.equal(statusCode, 403);
  });
});

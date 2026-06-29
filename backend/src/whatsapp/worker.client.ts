/**
 * WhatsApp Worker HTTP client
 * Vercel API → Railway/Fly worker üzerinden Baileys işlemleri
 */

import { config } from '../config';
import type { BaileysSession } from './baileys.manager';
import type { QrSession } from './qr.service';

interface WorkerResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function workerRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = config.whatsapp.workerUrl.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Secret': config.whatsapp.workerSecret,
      ...(options.headers as Record<string, string>),
    },
  });

  let body: WorkerResponse<T>;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Worker geçersiz yanıt (${res.status})`);
  }

  if (!res.ok || !body.success) {
    throw new Error(body.error || `Worker hatası (${res.status})`);
  }

  return body.data as T;
}

export async function startQr(companyId: string, userId?: string): Promise<BaileysSession> {
  return workerRequest<BaileysSession>('/internal/qr/start', {
    method: 'POST',
    body: JSON.stringify({ companyId, userId }),
  });
}

export async function getQrStatus(
  companyId: string,
  sessionToken: string
): Promise<BaileysSession | null> {
  try {
    return await workerRequest<BaileysSession>(
      `/internal/qr/${sessionToken}/status?companyId=${encodeURIComponent(companyId)}`
    );
  } catch {
    return null;
  }
}

export async function cancelQr(companyId: string, sessionToken: string): Promise<void> {
  await workerRequest('/internal/qr/cancel', {
    method: 'POST',
    body: JSON.stringify({ companyId, sessionToken }),
  });
}

export async function disconnect(companyId: string): Promise<void> {
  await workerRequest('/internal/disconnect', {
    method: 'POST',
    body: JSON.stringify({ companyId }),
  });
}

export async function getStatus(companyId: string): Promise<{
  connected: boolean;
  phone: string | null;
  displayName: string | null;
}> {
  return workerRequest(`/internal/status/${companyId}`);
}

export async function sendMessage(
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return workerRequest('/internal/send', {
    method: 'POST',
    body: JSON.stringify({ companyId, toPhone, message }),
  });
}

export async function checkHealth(): Promise<boolean> {
  try {
    const base = config.whatsapp.workerUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export type { QrSession };

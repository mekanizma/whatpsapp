/**
 * WhatsApp QR connection service
 * Yerel Baileys veya uzak Worker üzerinden çalışır
 */

import { config } from '../config';
import {
  startBaileysQrSession,
  getBaileysSession,
  cancelBaileysSession,
  disconnectBaileys as disconnectLocal,
  getBaileysConnectionStatus as getLocalStatus,
  sendBaileysMessage as sendLocal,
  restoreBaileysSessions,
  type BaileysSession,
  type QrSessionStatus,
} from './baileys.manager';
import * as worker from './worker.client';

export type { QrSessionStatus };

export interface QrSession {
  id: string;
  session_token: string;
  qr_data_url: string;
  status: QrSessionStatus;
  phone_number: string | null;
  display_name: string | null;
  expires_at: string;
  connected_at: string | null;
  created_at: string;
}

function useWorker(): boolean {
  return !!config.whatsapp.workerUrl;
}

function toQrSession(session: BaileysSession): QrSession {
  return {
    id: session.id,
    session_token: session.session_token,
    qr_data_url: session.qr_data_url || '',
    status: session.status,
    phone_number: session.phone_number,
    display_name: session.display_name,
    expires_at: session.expires_at,
    connected_at: session.connected_at,
    created_at: session.created_at,
  };
}

export function isWhatsAppWorkerEnabled(): boolean {
  return useWorker();
}

export async function startQrSession(companyId: string, userId?: string): Promise<QrSession> {
  const session = useWorker()
    ? await worker.startQr(companyId, userId)
    : await startBaileysQrSession(companyId, userId);
  return toQrSession(session);
}

export async function getQrSessionStatus(
  companyId: string,
  sessionToken: string
): Promise<QrSession | null> {
  const session = useWorker()
    ? await worker.getQrStatus(companyId, sessionToken)
    : getBaileysSession(companyId, sessionToken);
  return session ? toQrSession(session) : null;
}

export async function cancelQrSession(companyId: string, sessionToken: string): Promise<void> {
  if (useWorker()) {
    await worker.cancelQr(companyId, sessionToken);
    return;
  }
  await cancelBaileysSession(companyId, sessionToken);
}

export async function disconnectBaileys(companyId: string): Promise<void> {
  if (useWorker()) {
    await worker.disconnect(companyId);
    return;
  }
  await disconnectLocal(companyId);
}

export async function getBaileysConnectionStatus(companyId: string): Promise<{
  connected: boolean;
  phone: string | null;
  displayName: string | null;
}> {
  if (useWorker()) {
    return worker.getStatus(companyId);
  }
  return getLocalStatus(companyId);
}

export async function sendBaileysMessage(
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  if (useWorker()) {
    return worker.sendMessage(companyId, toPhone, message);
  }
  return sendLocal(companyId, toPhone, message);
}

export function getDemoWhatsAppStatus() {
  return getLocalStatus('00000000-0000-0000-0000-000000000003');
}

export async function disconnectDemoWhatsApp() {
  await disconnectLocal('00000000-0000-0000-0000-000000000003');
}

export { restoreBaileysSessions };

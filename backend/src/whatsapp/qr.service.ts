/**
 * WhatsApp QR connection service (Baileys)
 * Coolify ve yerel geliştirmede çalışır; serverless (Vercel) ortamında devre dışı
 */

import {
  startBaileysQrSession,
  getBaileysSession,
  cancelBaileysSession,
  disconnectBaileys,
  getBaileysConnectionStatus as getLocalBaileysStatus,
  isBaileysReconnecting,
  sendBaileysMessage,
  restoreBaileysSessions,
  verifySessionsDirWritable,
  type BaileysSession,
  type QrSessionStatus,
} from './baileys.manager';

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

export async function startQrSession(companyId: string, userId?: string): Promise<QrSession> {
  const session = await startBaileysQrSession(companyId, userId);
  return toQrSession(session);
}

export async function getQrSessionStatus(
  companyId: string,
  sessionToken: string
): Promise<QrSession | null> {
  const session = getBaileysSession(companyId, sessionToken);
  return session ? toQrSession(session) : null;
}

export async function cancelQrSession(companyId: string, sessionToken: string): Promise<void> {
  await cancelBaileysSession(companyId, sessionToken);
}

export async function getBaileysConnectionStatus(companyId: string): Promise<{
  connected: boolean;
  phone: string | null;
  displayName: string | null;
}> {
  return getLocalBaileysStatus(companyId);
}

export function getDemoWhatsAppStatus() {
  return getLocalBaileysStatus('00000000-0000-0000-0000-000000000003');
}

export async function disconnectDemoWhatsApp() {
  await disconnectBaileys('00000000-0000-0000-0000-000000000003');
}

export {
  disconnectBaileys,
  sendBaileysMessage,
  restoreBaileysSessions,
  isBaileysReconnecting,
  verifySessionsDirWritable,
};

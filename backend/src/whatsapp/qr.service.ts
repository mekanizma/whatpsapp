/**
 * WhatsApp QR connection service (Baileys)
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
  whatsapp_account_id?: string;
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
    whatsapp_account_id: session.whatsapp_account_id,
  };
}

export async function startQrSession(
  accountId: string,
  companyId: string,
  userId?: string
): Promise<QrSession> {
  const session = await startBaileysQrSession(accountId, companyId, userId);
  return toQrSession(session);
}

export async function getQrSessionStatus(
  companyId: string,
  accountId: string,
  sessionToken: string
): Promise<QrSession | null> {
  const session = getBaileysSession(companyId, accountId, sessionToken);
  return session ? toQrSession(session) : null;
}

export async function cancelQrSession(
  accountId: string,
  companyId: string,
  sessionToken: string
): Promise<void> {
  await cancelBaileysSession(accountId, companyId, sessionToken);
}

export async function getBaileysConnectionStatus(accountId: string): Promise<{
  connected: boolean;
  phone: string | null;
  displayName: string | null;
}> {
  return getLocalBaileysStatus(accountId);
}

export function getDemoWhatsAppStatus() {
  return getLocalBaileysStatus('00000000-0000-0000-0000-000000000003');
}

export async function disconnectDemoWhatsApp() {
  await disconnectBaileys('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003');
}

export {
  disconnectBaileys,
  sendBaileysMessage,
  restoreBaileysSessions,
  isBaileysReconnecting,
  verifySessionsDirWritable,
};

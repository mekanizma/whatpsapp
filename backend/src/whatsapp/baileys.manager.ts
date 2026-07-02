/**
 * Baileys WhatsApp Web session manager
 * Generates real scannable QR codes for device pairing
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import {
  processInboundMessage,
  extractPhoneFromMessage,
  jidToPhone,
  normalizePhoneNumber,
  cacheCustomerJid,
  getCachedCustomerJid,
} from './message.handler';
import { logActivity } from '../services/log.service';

export type QrSessionStatus = 'pending' | 'scanned' | 'connected' | 'expired' | 'failed';

export interface BaileysSession {
  id: string;
  company_id: string;
  session_token: string;
  qr_data_url: string | null;
  status: QrSessionStatus;
  phone_number: string | null;
  display_name: string | null;
  expires_at: string;
  connected_at: string | null;
  created_at: string;
  failure_reason?: string | null;
}

interface CompanyConnection {
  socket: WASocket | null;
  session: BaileysSession;
  isConnecting: boolean;
}

const SESSION_TTL_MS = 3 * 60 * 1000;
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
const MAX_RECONNECT_ATTEMPTS = 8;
const QR_WAIT_MS = 30_000;
const DEFAULT_BAILEYS_VERSION: [number, number, number] = [6, 7, 22];
const sessions = new Map<string, BaileysSession>();
const connections = new Map<string, CompanyConnection>();
const tokenToCompany = new Map<string, string>();
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Sunucu restart sonrası kayıtlı oturumdan otomatik bağlanma */
const autoRestoreActive = new Set<string>();

const logger = pino({ level: 'silent' });

function getSessionDir(companyId: string): string {
  const dir = path.join(config.sessionsDir, companyId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function verifySessionsDirWritable(): { ok: boolean; path: string; error?: string } {
  const dir = config.sessionsDir;
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { ok: true, path: dir };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: dir, error: message };
  }
}

async function resolveBaileysVersion(): Promise<[number, number, number]> {
  try {
    const { version, error } = await fetchLatestBaileysVersion();
    if (error) {
      console.warn('[Baileys] Versiyon API hatası, paket sürümü kullanılıyor:', error);
    }
    return version;
  } catch (err) {
    console.warn('[Baileys] fetchLatestBaileysVersion başarısız, paket sürümü kullanılıyor:', err);
    return DEFAULT_BAILEYS_VERSION;
  }
}

function generateToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function qrToDataUrl(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, {
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#111B21', light: '#FFFFFF' },
  });
}

function clearReconnectState(companyId: string): void {
  reconnectAttempts.delete(companyId);
  autoRestoreActive.delete(companyId);
  const timer = reconnectTimers.get(companyId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(companyId);
  }
}

export function isBaileysReconnecting(companyId: string): boolean {
  if (!hasStoredCredentials(companyId)) return false;
  if (autoRestoreActive.has(companyId)) return true;
  const attempts = reconnectAttempts.get(companyId);
  if (!attempts) return false;
  return attempts <= MAX_RECONNECT_ATTEMPTS;
}

export function getBaileysConnectionStatus(companyId: string) {
  const conn = connections.get(companyId);

  // Yalnızca aktif socket bağlantısı "bağlı" sayılır
  if (conn?.socket?.user) {
    const session = [...sessions.values()].find(
      (s) => s.company_id === companyId && s.status === 'connected'
    );
    const phone = session?.phone_number || `+${jidToPhone(conn.socket.user.id)}`;
    return {
      connected: true,
      phone,
      displayName: session?.display_name || conn.socket.user.name || null,
    };
  }

  return { connected: false, phone: null, displayName: null };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

export async function startBaileysQrSession(
  companyId: string,
  userId?: string
): Promise<BaileysSession> {
  const dirCheck = verifySessionsDirWritable();
  if (!dirCheck.ok) {
    throw new Error(
      `Oturum dizinine yazılamıyor (${dirCheck.path}). Coolify'da Persistent Storage: /data/sessions ve SESSIONS_DIR=/data/sessions olmalı.`
    );
  }

  clearReconnectState(companyId);

  // Mevcut bağlantıyı kapat ve oturum dosyalarını temizle (yeni QR)
  await disconnectBaileys(companyId, { logout: false });

  const sessionToken = generateToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const session: BaileysSession = {
    id: sessionId,
    company_id: companyId,
    session_token: sessionToken,
    qr_data_url: null,
    status: 'pending',
    phone_number: null,
    display_name: null,
    expires_at: expiresAt,
    connected_at: null,
    created_at: new Date().toISOString(),
  };

  sessions.set(sessionToken, session);
  tokenToCompany.set(sessionToken, companyId);

  if (!config.demoMode) {
    await adminClient.from('whatsapp_qr_sessions').insert({
      company_id: companyId,
      session_token: sessionToken,
      qr_payload: 'baileys',
      expires_at: expiresAt,
    });

    await logActivity({
      companyId,
      userId,
      action: 'whatsapp_qr_started',
      entityType: 'whatsapp_qr_session',
      entityId: sessionId,
    });
  }

  // Baileys socket başlat (arka planda QR üretir)
  connectBaileysSocket(companyId, session).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Baileys] Bağlantı hatası (${companyId}):`, err);
    session.status = 'failed';
    session.failure_reason = message;
  });

  // İlk QR'ın gelmesini bekle
  const qrDataUrl = await waitForQr(sessionToken, QR_WAIT_MS);
  session.qr_data_url = qrDataUrl;

  return session;
}

function waitForQr(sessionToken: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      const session = sessions.get(sessionToken);
      if (session?.qr_data_url) {
        resolve(session.qr_data_url);
        return;
      }
      if (session?.status === 'failed') {
        reject(new Error(session.failure_reason || 'WhatsApp bağlantısı başlatılamadı'));
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('QR kodu oluşturulamadı. Lütfen tekrar deneyin.'));
        return;
      }
      setTimeout(check, 500);
    };

    check();
  });
}

function getReconnectDelay(companyId: string): number {
  const attempt = reconnectAttempts.get(companyId) ?? 0;
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
}

async function markWhatsAppDisconnected(companyId: string): Promise<void> {
  if (config.demoMode) return;

  await adminClient
    .from('whatsapp_configs')
    .update({ status: 'disconnected' })
    .eq('company_id', companyId)
    .like('business_account_id', 'baileys:%');
}

async function scheduleReconnect(companyId: string, session: BaileysSession): Promise<void> {
  if (!hasStoredCredentials(companyId)) {
    clearReconnectState(companyId);
    return;
  }

  const attempt = (reconnectAttempts.get(companyId) ?? 0) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    console.log(`[Baileys] Yeniden bağlanma limiti aşıldı: ${companyId}`);
    clearReconnectState(companyId);
    await markWhatsAppDisconnected(companyId);
    return;
  }

  reconnectAttempts.set(companyId, attempt);
  const delay = getReconnectDelay(companyId);

  console.log(`[Baileys] Yeniden bağlanma planlandı: ${companyId} (${attempt}. deneme, ${delay}ms)`);

  const existingTimer = reconnectTimers.get(companyId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    reconnectTimers.delete(companyId);
    connectBaileysSocket(companyId, session).catch((err) => {
      console.error(`[Baileys] Yeniden bağlanma hatası (${companyId}):`, err);
    });
  }, delay);
  reconnectTimers.set(companyId, timer);
}

async function connectBaileysSocket(companyId: string, session: BaileysSession): Promise<void> {
  try {
    const existing = connections.get(companyId);
    if (existing?.socket) {
      try {
        existing.socket.end(undefined);
      } catch {
        /* önceki socket zaten kapanmış olabilir */
      }
    }

    const sessionDir = getSessionDir(companyId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const version = await resolveBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['WhatsApp AI SaaS', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30_000,
      defaultQueryTimeoutMs: 30_000,
    });

    connections.set(companyId, { socket, session, isConnecting: true });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

    if (qr) {
      try {
        const qrDataUrl = await qrToDataUrl(qr);
        session.qr_data_url = qrDataUrl;
        session.status = 'pending';
        console.log(`[Baileys] QR oluşturuldu: ${companyId}`);
      } catch (err) {
        console.error('QR dönüştürme hatası:', err);
      }
    }

    if (connection === 'connecting') {
      session.status = 'scanned';
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.connected_at = new Date().toISOString();
      clearReconnectState(companyId);
      connections.set(companyId, { socket, session, isConnecting: false });

      const user = socket.user;
      if (user) {
        const phone = jidToPhone(user.id);
        session.phone_number = `+${phone}`;
        session.display_name = user.name || user.verifiedName || 'WhatsApp Hattı';
      }

      console.log(`[Baileys] Bağlandı: ${session.phone_number} (${companyId})`);

      if (!config.demoMode) {
        await adminClient
          .from('whatsapp_configs')
          .update({
            phone_number: session.phone_number,
            status: 'connected',
            business_account_id: `baileys:${companyId}`,
          })
          .eq('company_id', companyId);

        await adminClient
          .from('whatsapp_qr_sessions')
          .update({
            status: 'connected',
            phone_number: session.phone_number,
            display_name: session.display_name,
            connected_at: session.connected_at,
          })
          .eq('session_token', session.session_token);
      }
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const wasConnected = session.status === 'connected';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[Baileys] Bağlantı kapandı: ${companyId}, kod: ${statusCode}, bağlıydı: ${wasConnected}`);

      connections.delete(companyId);

      if (statusCode === DisconnectReason.loggedOut) {
        session.status = 'expired';
        clearReconnectState(companyId);

        const sessionDir = path.join(config.sessionsDir, companyId);
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }

        if (!config.demoMode) {
          await adminClient
            .from('whatsapp_configs')
            .update({
              status: 'disconnected',
              phone_number: null,
              business_account_id: null,
            })
            .eq('company_id', companyId);
        }
        return;
      }

      if (!shouldReconnect) return;

      // QR aşamasında süre dolmuşsa yeniden bağlanma
      if (!wasConnected && new Date(session.expires_at) <= new Date()) {
        session.status = 'expired';
        return;
      }

      // Yalnızca daha önce bağlı oturumlar veya sunucu restart restore için otomatik yeniden dene
      const canAutoReconnect =
        wasConnected || autoRestoreActive.has(companyId);

      if (!canAutoReconnect) {
        if (session.status !== 'connected') {
          session.status = 'failed';
        }
        return;
      }

      if (wasConnected) {
        await markWhatsAppDisconnected(companyId);
      }

      await scheduleReconnect(companyId, session);
    }

    if (receivedPendingNotifications) {
      console.log(`[Baileys] Bekleyen bildirimler alındı: ${companyId}`);
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption;

      if (!text) continue;

      const customerPhone = extractPhoneFromMessage(msg.key);
      if (!customerPhone || msg.key.remoteJid?.endsWith('@g.us')) continue;

      const customerName = msg.pushName || null;
      const replyJid = msg.key.remoteJid;

      if (replyJid) {
        cacheCustomerJid(companyId, customerPhone, replyJid);
      }

      try {
        console.log(`[Baileys] Gelen mesaj: ${customerPhone} — "${text.slice(0, 40)}..."`);

        const reply = await processInboundMessage(
          companyId,
          customerPhone,
          customerName,
          text,
          msg.key.id || undefined
        );

        if (reply && socket.user && replyJid) {
          await socket.sendMessage(replyJid, { text: reply });
          console.log(`[Baileys] WhatsApp yanıtı iletildi: ${customerPhone}`);
        } else if (!reply) {
          console.log(`[Baileys] Yanıt üretilmedi: ${customerPhone}`);
        }
      } catch (err) {
        console.error('Mesaj işleme hatası:', err);
      }
    }
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Baileys] Socket başlatma hatası (${companyId}):`, err);
    session.status = 'failed';
    session.failure_reason = message;
    connections.delete(companyId);
    throw err;
  }
}

export function getBaileysSession(
  companyId: string,
  sessionToken: string
): BaileysSession | null {
  const session = sessions.get(sessionToken);
  if (!session || session.company_id !== companyId) return null;

  if (new Date(session.expires_at) < new Date() && session.status === 'pending') {
    session.status = 'expired';
  }

  return session;
}

export async function cancelBaileysSession(companyId: string, sessionToken: string): Promise<void> {
  const session = sessions.get(sessionToken);
  if (session) {
    session.status = 'expired';
    sessions.delete(sessionToken);
  }
  await disconnectBaileys(companyId);
}

export async function disconnectBaileys(
  companyId: string,
  options: { logout?: boolean } = {}
): Promise<void> {
  const shouldLogout = options.logout ?? true;
  clearReconnectState(companyId);

  const conn = connections.get(companyId);
  if (conn?.socket) {
    try {
      if (shouldLogout) {
        await conn.socket.logout();
      } else {
        conn.socket.end(undefined);
      }
    } catch {
      conn.socket.end(undefined);
    }
  }
  connections.delete(companyId);

  // Oturum dosyalarını temizle
  const sessionDir = path.join(config.sessionsDir, companyId);
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  for (const [token, session] of sessions.entries()) {
    if (session.company_id === companyId) {
      sessions.delete(token);
    }
  }

  if (!config.demoMode) {
    await adminClient
      .from('whatsapp_configs')
      .update({ status: 'disconnected', phone_number: null, business_account_id: null })
      .eq('company_id', companyId);
  }
}

export async function sendBaileysMessage(
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(companyId);
  if (!conn?.socket?.user) {
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  const normalized = normalizePhoneNumber(toPhone);
  if (!normalized) {
    return { success: false, error: 'Geçersiz telefon. Örnek: 905551234567' };
  }

  const socket = conn.socket;

  try {
    const cachedJid = getCachedCustomerJid(companyId, normalized);
    if (cachedJid) {
      await withTimeout(
        socket.sendMessage(cachedJid, { text: message }),
        20_000,
        'Mesaj gönderme zaman aşımı'
      );
      console.log(`[Baileys] Mesaj gönderildi (önbellek JID): ${companyId} → ${normalized}`);
      return { success: true };
    }

    const waResults = await withTimeout(
      socket.onWhatsApp(normalized),
      12_000,
      'Numara kontrolü zaman aşımı'
    );
    const waCheck = waResults?.[0];

    if (!waCheck?.exists) {
      return { success: false, error: 'Bu numara WhatsApp\'ta kayıtlı değil' };
    }

    const jid = waCheck.jid;
    cacheCustomerJid(companyId, normalized, jid);
    await withTimeout(
      socket.sendMessage(jid, { text: message }),
      20_000,
      'Mesaj gönderme zaman aşımı. Numarayı 905XXXXXXXXX formatında deneyin.'
    );

    console.log(`[Baileys] Mesaj gönderildi: ${companyId} → ${normalized}`);
    return { success: true };
  } catch (err) {
    console.error(`[Baileys] Mesaj gönderme hatası (${companyId}):`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Mesaj gönderilemedi',
    };
  }
}

function hasStoredCredentials(companyId: string): boolean {
  return fs.existsSync(path.join(config.sessionsDir, companyId, 'creds.json'));
}

function createRestoredSession(companyId: string, phoneNumber?: string | null): BaileysSession {
  const session: BaileysSession = {
    id: crypto.randomUUID(),
    company_id: companyId,
    session_token: generateToken(),
    qr_data_url: null,
    status: 'connected',
    phone_number: phoneNumber ?? null,
    display_name: null,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    connected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  sessions.set(session.session_token, session);
  tokenToCompany.set(session.session_token, companyId);
  return session;
}

async function restoreCompanySession(
  companyId: string,
  phoneNumber?: string | null
): Promise<void> {
  if (!hasStoredCredentials(companyId)) {
    console.warn(`[Baileys] Oturum dosyası yok, atlanıyor: ${companyId}`);
    return;
  }

  console.log(`[Baileys] Oturum geri yükleniyor: ${companyId}`);
  autoRestoreActive.add(companyId);
  const session = createRestoredSession(companyId, phoneNumber);
  try {
    await connectBaileysSocket(companyId, session);
  } catch (err) {
    autoRestoreActive.delete(companyId);
    throw err;
  }
}

// Sunucu başladığında mevcut oturumları yükle (Coolify restart / redeploy sonrası)
export async function restoreBaileysSessions(): Promise<void> {
  const sessionsDir = config.sessionsDir;
  console.log(`[Baileys] Oturum dizini: ${sessionsDir} (kalıcı volume: ${config.isCoolify})`);

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const restored = new Set<string>();

  if (!config.demoMode) {
    const { data: configs } = await adminClient
      .from('whatsapp_configs')
      .select('company_id, phone_number, business_account_id, status')
      .like('business_account_id', 'baileys:%');

    for (const row of configs || []) {
      if (!row.company_id) continue;
      restored.add(row.company_id);
      try {
        await restoreCompanySession(row.company_id, row.phone_number);
      } catch (err) {
        console.error(`[Baileys] DB oturum kurtarma hatası (${row.company_id}):`, err);
      }
    }
  }

  const companyDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const entry of companyDirs) {
    if (!entry.isDirectory() || restored.has(entry.name)) continue;
    try {
      await restoreCompanySession(entry.name);
    } catch (err) {
      console.error(`[Baileys] Disk oturum kurtarma hatası (${entry.name}):`, err);
    }
  }
}

/**
 * Baileys WhatsApp Web session manager
 * Supports multiple accounts per company — sessions keyed by account ID
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
  downloadMediaMessage,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import {
  processInboundMessage,
  processInboundImage,
  processInboundVoiceMessage,
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
  whatsapp_account_id: string;
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

interface AccountConnection {
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
const connections = new Map<string, AccountConnection>();
const tokenToAccount = new Map<string, string>();
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const autoRestoreActive = new Set<string>();

const logger = pino({ level: 'silent' });

function getAccountSessionDir(accountId: string): string {
  return path.join(config.sessionsDir, accountId);
}

function getLegacySessionDir(companyId: string): string {
  return path.join(config.sessionsDir, companyId);
}

async function isDefaultAccount(accountId: string, companyId: string): Promise<boolean> {
  if (config.demoMode) return true;
  const { data } = await adminClient
    .from('whatsapp_configs')
    .select('is_default')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();
  return data?.is_default === true;
}

/** Oturum dosyası yolu — legacy yalnızca varsayılan hat için (çoklu hat çakışmasını önler) */
function findSessionDirWithCreds(
  accountId: string,
  companyId: string,
  allowLegacy: boolean
): string | null {
  const accountDir = getAccountSessionDir(accountId);
  if (fs.existsSync(path.join(accountDir, 'creds.json'))) {
    return accountDir;
  }
  if (allowLegacy) {
    const legacyDir = getLegacySessionDir(companyId);
    if (fs.existsSync(path.join(legacyDir, 'creds.json'))) {
      return legacyDir;
    }
  }
  return null;
}

function resolveSessionDir(accountId: string, companyId: string, allowLegacy: boolean): string {
  const existing = findSessionDirWithCreds(accountId, companyId, allowLegacy);
  if (existing) return existing;

  const accountDir = getAccountSessionDir(accountId);
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true });
  }
  return accountDir;
}

function migrateLegacySessionToAccount(accountId: string, companyId: string): void {
  if (accountId === companyId) return;

  const accountDir = getAccountSessionDir(accountId);
  const legacyDir = getLegacySessionDir(companyId);
  if (!fs.existsSync(path.join(legacyDir, 'creds.json'))) return;
  if (fs.existsSync(path.join(accountDir, 'creds.json'))) return;

  fs.cpSync(legacyDir, accountDir, { recursive: true });
  fs.rmSync(legacyDir, { recursive: true, force: true });
  console.log(`[Baileys] Legacy oturum taşındı: ${companyId} → ${accountId}`);
}

function removeSessionFiles(accountId: string, companyId: string, removeLegacy: boolean): void {
  const accountDir = getAccountSessionDir(accountId);
  if (fs.existsSync(accountDir)) {
    fs.rmSync(accountDir, { recursive: true, force: true });
  }
  if (removeLegacy) {
    const legacyDir = getLegacySessionDir(companyId);
    if (fs.existsSync(legacyDir)) {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  }
}

async function endBaileysSocket(accountId: string): Promise<void> {
  clearReconnectState(accountId);

  const conn = connections.get(accountId);
  if (conn?.socket) {
    try {
      conn.socket.end(undefined);
    } catch {
      /* socket zaten kapanmış olabilir */
    }
  }
  connections.delete(accountId);

  for (const [token, session] of sessions.entries()) {
    if (session.whatsapp_account_id === accountId) {
      sessions.delete(token);
    }
  }
}

async function hasStoredCredentials(accountId: string, companyId: string): Promise<boolean> {
  const allowLegacy = await isDefaultAccount(accountId, companyId);
  return findSessionDirWithCreds(accountId, companyId, allowLegacy) !== null;
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

/** Docker/Coolify volume mount — overlay FS üzerindeki geçici dizinden ayırır */
export function isSessionsDirVolumeMounted(dir: string = config.sessionsDir): boolean {
  try {
    if (!fs.existsSync(dir)) return false;
    const dirStat = fs.statSync(dir);
    const parent = path.dirname(dir);
    if (!fs.existsSync(parent)) return false;
    const parentStat = fs.statSync(parent);
    return dirStat.dev !== parentStat.dev;
  } catch {
    return false;
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

function clearReconnectState(accountId: string): void {
  reconnectAttempts.delete(accountId);
  autoRestoreActive.delete(accountId);
  const timer = reconnectTimers.get(accountId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(accountId);
  }
}

export function isBaileysReconnecting(accountId: string): boolean {
  if (!connections.has(accountId) && !autoRestoreActive.has(accountId)) {
    return false;
  }
  if (autoRestoreActive.has(accountId)) return true;
  const attempts = reconnectAttempts.get(accountId);
  if (!attempts) return false;
  return attempts <= MAX_RECONNECT_ATTEMPTS;
}

export function getBaileysConnectionStatus(accountId: string) {
  const conn = connections.get(accountId);

  if (conn?.socket?.user) {
    const session = [...sessions.values()].find(
      (s) => s.whatsapp_account_id === accountId && s.status === 'connected'
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
  accountId: string,
  companyId: string,
  userId?: string
): Promise<BaileysSession> {
  const dirCheck = verifySessionsDirWritable();
  if (!dirCheck.ok) {
    throw new Error(
      `Oturum dizinine yazılamıyor (${dirCheck.path}). Coolify'da Persistent Storage: /data/sessions ve SESSIONS_DIR=/data/sessions olmalı.`
    );
  }

  clearReconnectState(accountId);
  await endBaileysSocket(accountId);

  const sessionToken = generateToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const session: BaileysSession = {
    id: sessionId,
    company_id: companyId,
    whatsapp_account_id: accountId,
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
  tokenToAccount.set(sessionToken, accountId);

  if (!config.demoMode) {
    await adminClient.from('whatsapp_qr_sessions').insert({
      company_id: companyId,
      whatsapp_account_id: accountId,
      session_token: sessionToken,
      qr_payload: 'baileys',
      expires_at: expiresAt,
    });

    await logActivity({
      companyId,
      userId,
      action: 'whatsapp_qr_started',
      entityType: 'whatsapp_account',
      entityId: accountId,
    });
  }

  connectBaileysSocket(accountId, companyId, session).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Baileys] Bağlantı hatası (${accountId}):`, err);
    session.status = 'failed';
    session.failure_reason = message;
  });

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

function getReconnectDelay(accountId: string): number {
  const attempt = reconnectAttempts.get(accountId) ?? 0;
  return Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
}

async function markWhatsAppDisconnected(accountId: string): Promise<void> {
  if (config.demoMode) return;

  await adminClient
    .from('whatsapp_configs')
    .update({ status: 'disconnected' })
    .eq('id', accountId);
}

async function scheduleReconnect(
  accountId: string,
  companyId: string,
  session: BaileysSession
): Promise<void> {
  if (!(await hasStoredCredentials(accountId, companyId))) {
    clearReconnectState(accountId);
    return;
  }

  const attempt = (reconnectAttempts.get(accountId) ?? 0) + 1;
  if (attempt > MAX_RECONNECT_ATTEMPTS) {
    console.log(`[Baileys] Yeniden bağlanma limiti aşıldı: ${accountId}`);
    clearReconnectState(accountId);
    await markWhatsAppDisconnected(accountId);
    return;
  }

  reconnectAttempts.set(accountId, attempt);
  const delay = getReconnectDelay(accountId);

  console.log(`[Baileys] Yeniden bağlanma planlandı: ${accountId} (${attempt}. deneme, ${delay}ms)`);

  const existingTimer = reconnectTimers.get(accountId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    reconnectTimers.delete(accountId);
    connectBaileysSocket(accountId, companyId, session).catch((err) => {
      console.error(`[Baileys] Yeniden bağlanma hatası (${accountId}):`, err);
    });
  }, delay);
  reconnectTimers.set(accountId, timer);
}

async function connectBaileysSocket(
  accountId: string,
  companyId: string,
  session: BaileysSession
): Promise<void> {
  try {
    const existing = connections.get(accountId);
    if (existing?.socket) {
      try {
        existing.socket.end(undefined);
      } catch {
        /* önceki socket zaten kapanmış olabilir */
      }
    }

    const allowLegacy = await isDefaultAccount(accountId, companyId);
    const sessionDir = resolveSessionDir(accountId, companyId, allowLegacy);
    const loadedFromLegacy =
      allowLegacy &&
      sessionDir === getLegacySessionDir(companyId) &&
      accountId !== companyId;
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const version = await resolveBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['WhatsApp AI SaaS', 'Chrome', accountId.slice(0, 8)],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 30_000,
      defaultQueryTimeoutMs: 30_000,
    });

    connections.set(accountId, { socket, session, isConnecting: true });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      if (qr) {
        try {
          const qrDataUrl = await qrToDataUrl(qr);
          session.qr_data_url = qrDataUrl;
          session.status = 'pending';
          console.log(`[Baileys] QR oluşturuldu: ${accountId}`);
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
        clearReconnectState(accountId);
        connections.set(accountId, { socket, session, isConnecting: false });

        if (loadedFromLegacy) {
          migrateLegacySessionToAccount(accountId, companyId);
        }

        const user = socket.user;
        if (user) {
          const phone = jidToPhone(user.id);
          session.phone_number = `+${phone}`;
          session.display_name = user.name || user.verifiedName || 'WhatsApp Hattı';
        }

        const syncedAt = new Date().toISOString();
        console.log(`[Baileys] Bağlandı: ${session.phone_number} (${accountId})`);

        if (!config.demoMode) {
          await adminClient
            .from('whatsapp_configs')
            .update({
              phone_number: session.phone_number,
              profile_name: session.display_name,
              status: 'connected',
              business_account_id: `baileys:${accountId}`,
              last_synced_at: syncedAt,
            })
            .eq('id', accountId);

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
        const isQrPairing = session.status === 'pending' || session.status === 'scanned';
        const hasCreds = await hasStoredCredentials(accountId, companyId);
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;

        console.log(
          `[Baileys] Bağlantı kapandı: ${accountId}, kod: ${statusCode}, bağlıydı: ${wasConnected}, qr: ${isQrPairing}, creds: ${hasCreds}`
        );

        connections.delete(accountId);

        if (statusCode === DisconnectReason.loggedOut) {
          session.status = 'expired';
          clearReconnectState(accountId);

          const removeLegacy = await isDefaultAccount(accountId, companyId);
          removeSessionFiles(accountId, companyId, removeLegacy);

          if (!config.demoMode) {
            await adminClient
              .from('whatsapp_configs')
              .update({
                status: 'disconnected',
                phone_number: null,
                profile_name: null,
                business_account_id: null,
              })
              .eq('id', accountId);
          }
          return;
        }

        if (!shouldReconnect) return;

        if (!wasConnected && session.status === 'pending' && new Date(session.expires_at) <= new Date()) {
          session.status = 'expired';
          return;
        }

        const canAutoReconnect =
          wasConnected ||
          autoRestoreActive.has(accountId) ||
          (isQrPairing && hasCreds);

        if (!canAutoReconnect) {
          if (session.status !== 'connected') {
            session.status = 'failed';
            session.failure_reason =
              session.failure_reason ||
              (statusCode != null ? `WhatsApp bağlantısı kapandı (kod: ${statusCode})` : 'WhatsApp bağlantısı kurulamadı');
          }
          return;
        }

        if (wasConnected) {
          await markWhatsAppDisconnected(accountId);
        }

        if (isQrPairing && hasCreds) {
          if (session.status !== 'connected') {
            session.status = 'scanned';
          }
          reconnectAttempts.set(accountId, 0);
          const existingTimer = reconnectTimers.get(accountId);
          if (existingTimer) clearTimeout(existingTimer);
          reconnectTimers.delete(accountId);

          const delay = isRestartRequired ? 0 : getReconnectDelay(accountId);
          const reconnect = () => {
            connectBaileysSocket(accountId, companyId, session).catch((err) => {
              console.error(`[Baileys] QR sonrası yeniden bağlanma hatası (${accountId}):`, err);
            });
          };

          if (delay === 0) {
            console.log(`[Baileys] QR sonrası hemen yeniden bağlanılıyor: ${accountId}`);
            reconnect();
          } else {
            const timer = setTimeout(reconnect, delay);
            reconnectTimers.set(accountId, timer);
          }
          return;
        }

        await scheduleReconnect(accountId, companyId, session);
      }

      if (receivedPendingNotifications) {
        console.log(`[Baileys] Bekleyen bildirimler alındı: ${accountId}`);
        if (!config.demoMode) {
          await adminClient
            .from('whatsapp_configs')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', accountId);
        }
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      const { data: accountRow } = await adminClient
        .from('whatsapp_configs')
        .select('is_active')
        .eq('id', accountId)
        .maybeSingle();

      if (accountRow && accountRow.is_active === false) return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (!msg.message) continue;

        const customerPhone = extractPhoneFromMessage(msg.key);
        if (!customerPhone || msg.key.remoteJid?.endsWith('@g.us')) continue;

        const customerName = msg.pushName || null;
        const replyJid = msg.key.remoteJid;

        if (replyJid) {
          cacheCustomerJid(accountId, customerPhone, replyJid);
        }

        const imageMessage = msg.message.imageMessage;
        if (imageMessage) {
          try {
            const buffer = (await downloadMediaMessage(
              msg as WAMessage,
              'buffer',
              {},
              {
                logger,
                reuploadRequest: socket.updateMediaMessage,
              }
            )) as Buffer;

            const mimeType = imageMessage.mimetype || 'image/jpeg';
            console.log(`[Baileys] Gelen resim (${accountId}): ${customerPhone}`);

            const reply = await processInboundImage(
              companyId,
              customerPhone,
              customerName,
              {
                buffer,
                mimeType,
                caption: imageMessage.caption || undefined,
              },
              msg.key.id || undefined,
              accountId
            );

            if (reply && socket.user && replyJid) {
              await socket.sendMessage(replyJid, { text: reply });
              console.log(`[Baileys] Resim yanıtı iletildi: ${customerPhone}`);
            }
          } catch (err) {
            console.error('Resim işleme hatası:', err);
          }
          continue;
        }

        const audioMessage = msg.message.audioMessage;
        if (audioMessage) {
          try {
            console.log(`[Baileys] Gelen sesli mesaj (${accountId}): ${customerPhone}`);

            const reply = await processInboundVoiceMessage(
              companyId,
              customerPhone,
              msg.key.id || undefined
            );

            if (reply && socket.user && replyJid) {
              await socket.sendMessage(replyJid, { text: reply });
              console.log(`[Baileys] Sesli mesaj uyarısı iletildi: ${customerPhone}`);
            }
          } catch (err) {
            console.error('Sesli mesaj işleme hatası:', err);
          }
          continue;
        }

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text;

        if (!text) continue;

        try {
          console.log(`[Baileys] Gelen mesaj (${accountId}): ${customerPhone} — "${text.slice(0, 40)}..."`);

          const reply = await processInboundMessage(
            companyId,
            customerPhone,
            customerName,
            text,
            msg.key.id || undefined,
            accountId
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
    console.error(`[Baileys] Socket başlatma hatası (${accountId}):`, err);
    session.status = 'failed';
    session.failure_reason = message;
    connections.delete(accountId);
    throw err;
  }
}

export function getBaileysSession(
  companyId: string,
  accountId: string,
  sessionToken: string
): BaileysSession | null {
  const session = sessions.get(sessionToken);
  if (!session || session.company_id !== companyId || session.whatsapp_account_id !== accountId) {
    return null;
  }

  if (new Date(session.expires_at) < new Date() && session.status === 'pending') {
    session.status = 'expired';
  }

  return session;
}

export async function cancelBaileysSession(
  accountId: string,
  companyId: string,
  sessionToken: string
): Promise<void> {
  const session = sessions.get(sessionToken);
  if (session) {
    session.status = 'expired';
    sessions.delete(sessionToken);
  }
  await disconnectBaileys(accountId, companyId);
}

export async function disconnectBaileys(
  accountId: string,
  companyId: string,
  options: { logout?: boolean } = {}
): Promise<void> {
  const shouldLogout = options.logout ?? true;
  clearReconnectState(accountId);

  const conn = connections.get(accountId);
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
  connections.delete(accountId);

  for (const [token, session] of sessions.entries()) {
    if (session.whatsapp_account_id === accountId) {
      sessions.delete(token);
    }
  }

  if (shouldLogout) {
    const removeLegacy = await isDefaultAccount(accountId, companyId);
    removeSessionFiles(accountId, companyId, removeLegacy);

    if (!config.demoMode) {
      await adminClient
        .from('whatsapp_configs')
        .update({
          status: 'disconnected',
          phone_number: null,
          profile_name: null,
          business_account_id: null,
        })
        .eq('id', accountId);
    }
  }
}

export async function sendBaileysMessage(
  accountId: string,
  companyId: string,
  toPhone: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(accountId);
  if (!conn?.socket?.user) {
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  const normalized = normalizePhoneNumber(toPhone);
  if (!normalized) {
    return { success: false, error: 'Geçersiz telefon. Örnek: 905551234567' };
  }

  const socket = conn.socket;

  try {
    const cachedJid = getCachedCustomerJid(accountId, normalized);
    if (cachedJid) {
      await withTimeout(
        socket.sendMessage(cachedJid, { text: message }),
        20_000,
        'Mesaj gönderme zaman aşımı'
      );
      console.log(`[Baileys] Mesaj gönderildi (önbellek JID): ${accountId} → ${normalized}`);
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
    cacheCustomerJid(accountId, normalized, jid);
    await withTimeout(
      socket.sendMessage(jid, { text: message }),
      20_000,
      'Mesaj gönderme zaman aşımı. Numarayı 905XXXXXXXXX formatında deneyin.'
    );

    console.log(`[Baileys] Mesaj gönderildi: ${accountId} → ${normalized}`);
    return { success: true };
  } catch (err) {
    console.error(`[Baileys] Mesaj gönderme hatası (${accountId}):`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Mesaj gönderilemedi',
    };
  }
}

export async function sendBaileysImage(
  accountId: string,
  companyId: string,
  toPhone: string,
  imageBuffer: Buffer,
  mimeType: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  const conn = connections.get(accountId);
  if (!conn?.socket?.user) {
    return { success: false, error: 'WhatsApp bağlantısı aktif değil. QR ile yeniden bağlanın.' };
  }

  const normalized = normalizePhoneNumber(toPhone);
  if (!normalized) {
    return { success: false, error: 'Geçersiz telefon. Örnek: 905551234567' };
  }

  const socket = conn.socket;

  try {
    let jid = getCachedCustomerJid(accountId, normalized);

    if (!jid) {
      const waResults = await withTimeout(
        socket.onWhatsApp(normalized),
        12_000,
        'Numara kontrolü zaman aşımı'
      );
      const waCheck = waResults?.[0];
      if (!waCheck?.exists) {
        return { success: false, error: 'Bu numara WhatsApp\'ta kayıtlı değil' };
      }
      jid = waCheck.jid;
      cacheCustomerJid(accountId, normalized, jid);
    }

    await withTimeout(
      socket.sendMessage(jid, {
        image: imageBuffer,
        mimetype: mimeType,
        caption: caption?.trim() || undefined,
      }),
      30_000,
      'Resim gönderme zaman aşımı'
    );

    console.log(`[Baileys] Resim gönderildi: ${accountId} → ${normalized}`);
    return { success: true };
  } catch (err) {
    console.error(`[Baileys] Resim gönderme hatası (${accountId}):`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Resim gönderilemedi',
    };
  }
}

function createRestoredSession(
  accountId: string,
  companyId: string,
  phoneNumber?: string | null
): BaileysSession {
  const session: BaileysSession = {
    id: crypto.randomUUID(),
    company_id: companyId,
    whatsapp_account_id: accountId,
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
  tokenToAccount.set(session.session_token, accountId);
  return session;
}

async function restoreAccountSession(
  accountId: string,
  companyId: string,
  phoneNumber?: string | null
): Promise<void> {
  if (!(await hasStoredCredentials(accountId, companyId))) {
    console.warn(`[Baileys] Oturum dosyası yok, atlanıyor: ${accountId}`);
    return;
  }

  console.log(`[Baileys] Oturum geri yükleniyor: ${accountId}`);
  autoRestoreActive.add(accountId);
  const session = createRestoredSession(accountId, companyId, phoneNumber);
  try {
    await connectBaileysSocket(accountId, companyId, session);
  } catch (err) {
    autoRestoreActive.delete(accountId);
    throw err;
  }
}

export async function restoreBaileysSessions(): Promise<void> {
  const sessionsDir = config.sessionsDir;
  const volumeMounted = isSessionsDirVolumeMounted(sessionsDir);
  console.log(`[Baileys] Oturum dizini: ${sessionsDir} (volume mount: ${volumeMounted})`);
  if (config.nodeEnv === 'production' && config.isCoolify && !volumeMounted) {
    console.error(
      '[Baileys] KRİTİK: /data/sessions kalıcı volume değil — restart/deploy sonrası tüm hatlar kopar. ' +
        'Coolify → Storages → Destination: /data/sessions, SESSIONS_DIR=/data/sessions'
    );
  }

  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const restored = new Set<string>();

  if (!config.demoMode) {
    let configs: Array<{
      id: string;
      company_id: string;
      phone_number: string | null;
      is_active?: boolean;
    }> | null = null;

    const primary = await adminClient
      .from('whatsapp_configs')
      .select('id, company_id, phone_number, business_account_id, status, is_active')
      .like('business_account_id', 'baileys:%');

    if (primary.error) {
      console.warn('[Baileys] is_active sütunu yok veya sorgu hatası, legacy sorgu deneniyor:', primary.error.message);
      const legacy = await adminClient
        .from('whatsapp_configs')
        .select('id, company_id, phone_number, business_account_id, status')
        .like('business_account_id', 'baileys:%');
      configs = legacy.data;
    } else {
      configs = primary.data;
    }

    for (const row of configs || []) {
      if (!row.id || !row.company_id) continue;
      if (row.is_active === false) continue;
      restored.add(row.id);
      try {
        await restoreAccountSession(row.id, row.company_id, row.phone_number);
      } catch (err) {
        console.error(`[Baileys] DB oturum kurtarma hatası (${row.id}):`, err);
      }
    }
  }

  const companyDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const entry of companyDirs) {
    if (!entry.isDirectory() || restored.has(entry.name)) continue;

    const credsPath = path.join(sessionsDir, entry.name, 'creds.json');
    if (!fs.existsSync(credsPath)) continue;

    if (!config.demoMode) {
      const { data: accountRow } = await adminClient
        .from('whatsapp_configs')
        .select('id, company_id')
        .eq('id', entry.name)
        .maybeSingle();

      if (accountRow?.company_id) {
        restored.add(accountRow.id);
        try {
          await restoreAccountSession(accountRow.id, accountRow.company_id);
        } catch (err) {
          console.error(`[Baileys] Disk oturum kurtarma hatası (${accountRow.id}):`, err);
        }
        continue;
      }

      const { data: defaultAccount } = await adminClient
        .from('whatsapp_configs')
        .select('id, company_id')
        .eq('company_id', entry.name)
        .eq('is_default', true)
        .maybeSingle();

      if (defaultAccount && !restored.has(defaultAccount.id)) {
        restored.add(defaultAccount.id);
        try {
          await restoreAccountSession(defaultAccount.id, defaultAccount.company_id);
        } catch (err) {
          console.error(`[Baileys] Legacy disk oturum kurtarma hatası (${defaultAccount.id}):`, err);
        }
      }
      continue;
    }

    try {
      await restoreAccountSession(entry.name, entry.name);
    } catch (err) {
      console.error(`[Baileys] Disk oturum kurtarma hatası (${entry.name}):`, err);
    }
  }
}

export { jidToPhone, normalizePhoneNumber };

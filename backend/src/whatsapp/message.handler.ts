/**
 * Gelen WhatsApp mesaj işleyici — AI kredi optimize
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import { generateAIResponse } from '../ai/openai.service';
import { buildTransferTicketSubject } from '../ai/transfer.service';
import { hasActiveTransferTicket } from '../ai/ai-quota.service';
import { logActivity } from '../services/log.service';
import { createTicketAndNotify } from '../services/ticket-notification.service';
import { recordUnknownQuestion } from '../services/unknown-questions.service';
import {
  shouldIncrementConversationUsage,
  getCustomerMessageTimestamps,
  isNewConversationUnit,
} from '../services/conversation-count.service';
import {
  getDepartmentsForWhatsAppAccount,
  listActiveDepartments,
} from '../services/department-access.service';
import {
  resolveTransferDepartment,
  getPendingDepartmentSelection,
  setPendingDepartmentSelection,
  clearPendingDepartmentSelection,
  matchDepartmentFromReply,
  buildDepartmentSelectionPrompt,
} from '../ai/department-routing.service';
import { detectConversationLanguage, t, type ConversationLang } from '../ai/language.service';
import { uploadMessageMedia } from '../services/message-media.service';
import { isCompanyAiEnabled } from '../services/company-ai-settings.service';
import type { WAMessage } from '@whiskeysockets/baileys';
import crypto from 'crypto';

const DEBOUNCE_MS = 3000;
const TRANSFER_REPLY_COOLDOWN_MS = 60_000;
/** Yalnızca bu süre içindeki gelen mesajlara yanıt ver (eski sohbet senkronunu atlar) */
export const INBOUND_MAX_AGE_SEC = 600;
const INBOUND_CLOCK_SKEW_SEC = 120;
const DUPLICATE_AI_REPLY_COOLDOWN_MS = 60 * 60 * 1000;

const recentMessages = new Map<string, { text: string; time: number }>();
const processedWaIds = new Set<string>();
const recentTransferReplies = new Map<string, number>();
const customerLocks = new Map<string, Promise<void>>();
const customerJidCache = new Map<string, string>();

function customerJidKey(accountId: string, phone: string): string {
  return `${accountId}:${resolveCustomerPhone(phone)}`;
}

/** Gelen mesajdaki WhatsApp JID'ini sakla — temsilci yanıtlarında doğru alıcıya iletmek için */
export function cacheCustomerJid(accountId: string, phone: string, jid: string): void {
  if (!jid || jid.endsWith('@g.us')) return;
  customerJidCache.set(customerJidKey(accountId, phone), jid);
}

export function getCachedCustomerJid(accountId: string, phone: string): string | null {
  return customerJidCache.get(customerJidKey(accountId, phone)) || null;
}

export function normalizePhoneNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0')) {
    digits = `90${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('5')) {
    digits = `90${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function resolveCustomerPhone(phone: string): string {
  return normalizePhoneNumber(phone) || phone.replace(/\D/g, '');
}

async function withCustomerLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = customerLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => gate);
  customerLocks.set(key, chain);

  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (customerLocks.get(key) === chain) {
      customerLocks.delete(key);
    }
  }
}

function markProcessedWaId(companyId: string, messageId: string): void {
  processedWaIds.add(`${companyId}:${messageId}`);
  if (processedWaIds.size > 2000) {
    const oldest = processedWaIds.values().next().value;
    if (oldest) processedWaIds.delete(oldest);
  }
}

export function getBaileysMessageTimestampSec(msg: WAMessage): number | null {
  const raw = msg.messageTimestamp;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

export function parseWebhookMessageTimestampSec(timestamp?: string): number | null {
  if (!timestamp) return null;
  const n = Number(timestamp);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

export function isRecentInboundMessage(
  timestampSec: number | null,
  maxAgeSec = INBOUND_MAX_AGE_SEC
): boolean {
  if (timestampSec == null) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - timestampSec;
  if (ageSec < -INBOUND_CLOCK_SKEW_SEC) return false;
  return ageSec >= 0 && ageSec <= maxAgeSec;
}

async function shouldSkipDuplicateAiReply(
  companyId: string,
  phone: string,
  replyText: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('messages')
    .select('created_at')
    .eq('company_id', companyId)
    .eq('customer_phone', phone)
    .eq('sender_type', 'ai')
    .eq('message', replyText)
    .order('created_at', { ascending: false })
    .limit(1);

  const last = data?.[0];
  if (!last?.created_at) return false;
  return Date.now() - new Date(last.created_at).getTime() < DUPLICATE_AI_REPLY_COOLDOWN_MS;
}

async function isMessageAlreadyStored(companyId: string, messageId: string): Promise<boolean> {
  const memKey = `${companyId}:${messageId}`;
  if (processedWaIds.has(memKey)) return true;

  const { count } = await adminClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('whatsapp_message_id', messageId);

  return (count || 0) > 0;
}

async function ensureOpenTransferTicket(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  subject: string,
  departmentId?: string | null
): Promise<void> {
  try {
    const { created } = await createTicketAndNotify(companyId, {
      customer_phone: customerPhone,
      customer_name: customerName,
      subject,
      priority: 'medium',
      status: 'open',
      department_id: departmentId || null,
    });

    if (!created) return;
  } catch (err) {
    console.error('Ticket oluşturma hatası:', err instanceof Error ? err.message : err);
  }
}

async function fetchRecentHistory(
  companyId: string,
  phone: string,
  limit = 12
): Promise<{ sender_type: string; message: string }[]> {
  const { data } = await adminClient
    .from('messages')
    .select('sender_type, message, media_type')
    .eq('company_id', companyId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).reverse().map((row) => ({
    sender_type: row.sender_type,
    message: formatHistoryLine(row.message, row.media_type),
  }));
}

function formatHistoryLine(message: string | null, mediaType?: string | null): string {
  if (mediaType?.startsWith('image/')) {
    const caption = message?.trim();
    return caption ? `[Fotoğraf] ${caption}` : '[Fotoğraf]';
  }
  return message?.trim() || '';
}

async function handleTransferWithDepartment(
  companyId: string,
  phone: string,
  customerName: string | null,
  messageText: string,
  subject: string,
  whatsappAccountId?: string | null,
  options?: { forceCustomerPrompt?: boolean }
): Promise<{ reply: string; ticketCreated: boolean }> {
  let departments = await getDepartmentsForWhatsAppAccount(companyId, whatsappAccountId);
  if (!departments.length) {
    departments = await listActiveDepartments(companyId);
  }

  if (!departments.length) {
    await ensureOpenTransferTicket(companyId, phone, customerName, subject);
    return { reply: '', ticketCreated: true };
  }

  const history = await fetchRecentHistory(companyId, phone);
  const routing = await resolveTransferDepartment(
    companyId,
    messageText,
    history,
    departments,
    phone,
    options?.forceCustomerPrompt ? { forceCustomerPrompt: true } : undefined
  );

  if (routing.awaitingSelection && routing.promptMessage) {
    setPendingDepartmentSelection(companyId, phone, {
      departments,
      subject,
      customerName,
    });
    return { reply: routing.promptMessage, ticketCreated: false };
  }

  await ensureOpenTransferTicket(companyId, phone, customerName, subject, routing.departmentId);
  return { reply: '', ticketCreated: true };
}

function shouldSkipTransferReply(companyId: string, phone: string): boolean {
  const last = recentTransferReplies.get(`${companyId}:${phone}`);
  return !!(last && Date.now() - last < TRANSFER_REPLY_COOLDOWN_MS);
}

function markTransferReply(companyId: string, phone: string): void {
  recentTransferReplies.set(`${companyId}:${phone}`, Date.now());
}

async function handleAiDisabledInbound(
  companyId: string,
  phone: string,
  customerName: string | null,
  messageText: string
): Promise<string> {
  if (await hasActiveTransferTicket(companyId, phone)) {
    console.log(`[WhatsApp] AI kapalı — aktif ticket, sessiz kayıt → ${phone}`);
    return '';
  }

  const subject = buildTransferTicketSubject(messageText, 'ai_disabled');
  await ensureOpenTransferTicket(companyId, phone, customerName, subject);

  await adminClient
    .from('messages')
    .update({ status: 'transferred' })
    .eq('company_id', companyId)
    .eq('customer_phone', phone)
    .eq('status', 'open');

  await logActivity({
    companyId,
    action: 'conversation_transferred',
    entityType: 'ticket',
    metadata: {
      customer_phone: phone,
      skip_reason: 'ai_disabled',
      skipped_ai: true,
      silent_handoff: true,
    },
  });

  console.log(`[WhatsApp] AI kapalı — otomatik talep açıldı (yanıt yok) → ${phone}`);
  return '';
}

export function clearTransferState(companyId: string, customerPhone: string): void {
  const phone = resolveCustomerPhone(customerPhone);
  recentTransferReplies.delete(`${companyId}:${phone}`);
  recentMessages.delete(`${companyId}:${phone}`);
  clearPendingDepartmentSelection(companyId, phone);
}

export interface InboundImagePayload {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  caption?: string;
}

function buildImageTransferSubject(caption?: string, lang: ConversationLang = 'tr'): string {
  const trimmed = caption?.trim() || '';
  if (trimmed) {
    return t(lang, 'photo_transfer_subject', { caption: trimmed.slice(0, 60) });
  }
  return t(lang, 'photo_transfer_subject_default');
}

/** Gelen resim mesajı — canlı desteğe aktar, departman seçimi sor */
export async function processInboundImage(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  image: InboundImagePayload,
  whatsappMessageId?: string,
  whatsappAccountId?: string
): Promise<string> {
  const phone = resolveCustomerPhone(customerPhone);
  const caption = image.caption?.trim() || '';

  if (config.demoMode) {
    const lang = detectConversationLanguage(caption);
    return t(lang, 'photo_received');
  }

  return withCustomerLock(`${companyId}:${phone}`, async () => {
    if (whatsappMessageId && (await isMessageAlreadyStored(companyId, whatsappMessageId))) {
      return '';
    }

    const messageId = crypto.randomUUID();
    let mediaPath: string | null = null;
    let mediaFilename: string | null = null;

    try {
      const uploaded = await uploadMessageMedia(
        companyId,
        messageId,
        image.buffer,
        image.mimeType,
        image.filename
      );
      mediaPath = uploaded.path;
      mediaFilename = uploaded.filename;
    } catch (err) {
      console.error('[WhatsApp] Resim yükleme hatası:', err instanceof Error ? err.message : err);
      return t(detectConversationLanguage(caption), 'photo_process_failed');
    }

    const { error: insertError } = await adminClient.from('messages').insert({
      id: messageId,
      company_id: companyId,
      customer_phone: phone,
      customer_name: customerName,
      message: caption,
      sender_type: 'customer',
      status: 'open',
      whatsapp_message_id: whatsappMessageId || null,
      whatsapp_account_id: whatsappAccountId || null,
      media_path: mediaPath,
      media_type: image.mimeType,
      media_filename: mediaFilename,
    });

    if (insertError?.code === '23505') {
      if (whatsappMessageId) markProcessedWaId(companyId, whatsappMessageId);
      return '';
    }

    if (insertError) {
      console.error('[WhatsApp] Resim mesajı kayıt hatası:', insertError.message);
      return '';
    }

    if (whatsappMessageId) markProcessedWaId(companyId, whatsappMessageId);

    if (await shouldIncrementConversationUsage(companyId, phone)) {
      await incrementConversationUsage(companyId);
    }

    if (!(await isCompanyAiEnabled(companyId))) {
      const lang = detectConversationLanguage(caption);
      return handleAiDisabledInbound(
        companyId,
        phone,
        customerName,
        caption || buildImageTransferSubject(undefined, lang)
      );
    }

    if (await hasActiveTransferTicket(companyId, phone, { excludeAiDisabled: true })) {
      console.log(`[WhatsApp] Aktif ticket — resim kaydedildi, yanıt yok → ${phone}`);
      return '';
    }

    const pendingDept = getPendingDepartmentSelection(companyId, phone);
    if (pendingDept) {
      const matched = matchDepartmentFromReply(caption, pendingDept.departments);
      if (matched) {
        clearPendingDepartmentSelection(companyId, phone);
        await ensureOpenTransferTicket(
          companyId,
          phone,
          customerName,
          pendingDept.subject,
          matched.id
        );

        await adminClient
          .from('messages')
          .update({ status: 'transferred' })
          .eq('company_id', companyId)
          .eq('customer_phone', phone)
          .eq('status', 'open');

        markTransferReply(companyId, phone);

        const lang = detectConversationLanguage(caption);
        const confirmMsg = t(lang, 'dept_forwarded', { department: matched.name });

        await adminClient.from('messages').insert({
          company_id: companyId,
          customer_phone: phone,
          customer_name: customerName,
          message: confirmMsg,
          sender_type: 'ai',
          status: 'transferred',
        });

        return confirmMsg;
      }

      const retryPrompt = buildDepartmentSelectionPrompt(
        pendingDept.departments,
        detectConversationLanguage(caption)
      );
      await adminClient.from('messages').insert({
        company_id: companyId,
        customer_phone: phone,
        customer_name: customerName,
        message: retryPrompt,
        sender_type: 'ai',
        status: 'open',
      });
      return retryPrompt;
    }

    const subject = buildImageTransferSubject(caption, detectConversationLanguage(caption));
    const transferResult = await handleTransferWithDepartment(
      companyId,
      phone,
      customerName,
      caption || subject,
      subject,
      whatsappAccountId,
      { forceCustomerPrompt: true }
    );

    let replyMessage = transferResult.reply;
    if (!replyMessage && transferResult.ticketCreated) {
      const lang = detectConversationLanguage(caption);
      replyMessage = t(lang, 'photo_received');
    }

    if (!replyMessage) return '';

    if (transferResult.ticketCreated) {
      await adminClient
        .from('messages')
        .update({ status: 'transferred' })
        .eq('company_id', companyId)
        .eq('customer_phone', phone)
        .eq('status', 'open');

      markTransferReply(companyId, phone);

      await logActivity({
        companyId,
        action: 'conversation_transferred',
        entityType: 'ticket',
        metadata: {
          customer_phone: phone,
          skip_reason: 'customer_image',
          media: true,
        },
      });

      console.log(`[WhatsApp] Resim ile temsilciye aktarıldı → ${phone}`);
    }

    await adminClient.from('messages').insert({
      company_id: companyId,
      customer_phone: phone,
      customer_name: customerName,
      message: replyMessage,
      sender_type: 'ai',
      status: transferResult.ticketCreated ? 'transferred' : 'open',
    });

    return replyMessage;
  });
}

function buildVoiceMessageReply(lang: ConversationLang): string {
  return t(lang, 'voice_message');
}

/** Gelen sesli mesaj — kaydetme, yazılı talep iste */
export async function processInboundVoiceMessage(
  companyId: string,
  customerPhone: string,
  whatsappMessageId?: string
): Promise<string> {
  const phone = resolveCustomerPhone(customerPhone);

  if (config.demoMode) {
    const history = await fetchRecentHistory(companyId, phone);
    return buildVoiceMessageReply(detectConversationLanguage('', history));
  }

  return withCustomerLock(`${companyId}:${phone}`, async () => {
    if (whatsappMessageId && (await isMessageAlreadyStored(companyId, whatsappMessageId))) {
      return '';
    }

    if (!(await isCompanyAiEnabled(companyId))) {
      if (whatsappMessageId) markProcessedWaId(companyId, whatsappMessageId);
      return '';
    }

    const history = await fetchRecentHistory(companyId, phone);
    const lang = detectConversationLanguage('', history);

    console.log(`[WhatsApp] Sesli mesaj alındı — kaydedilmedi → ${phone}`);
    return buildVoiceMessageReply(lang);
  });
}

export async function processInboundMessage(
  companyId: string,
  customerPhone: string,
  customerName: string | null,
  messageText: string,
  whatsappMessageId?: string,
  whatsappAccountId?: string
): Promise<string> {
  const trimmed = messageText.trim();
  const phone = resolveCustomerPhone(customerPhone);

  if (config.demoMode) {
    const lang = detectConversationLanguage(trimmed);
    return t(lang, 'live_demo_welcome');
  }

  return withCustomerLock(`${companyId}:${phone}`, async () => {
    if (whatsappMessageId && (await isMessageAlreadyStored(companyId, whatsappMessageId))) {
      return '';
    }

    const debounceKey = `${companyId}:${phone}`;
    const recent = recentMessages.get(debounceKey);
    const now = Date.now();
    if (recent && now - recent.time < DEBOUNCE_MS && recent.text === trimmed) {
      return '';
    }
    recentMessages.set(debounceKey, { text: trimmed, time: now });

    const { error: insertError } = await adminClient.from('messages').insert({
      company_id: companyId,
      customer_phone: phone,
      customer_name: customerName,
      message: trimmed,
      sender_type: 'customer',
      status: 'open',
      whatsapp_message_id: whatsappMessageId || null,
      whatsapp_account_id: whatsappAccountId || null,
    });

    if (insertError?.code === '23505') {
      if (whatsappMessageId) markProcessedWaId(companyId, whatsappMessageId);
      return '';
    }

    if (insertError) {
      console.error('[WhatsApp] Mesaj kayıt hatası:', insertError.message);
      return '';
    }

    if (whatsappMessageId) markProcessedWaId(companyId, whatsappMessageId);

    if (await shouldIncrementConversationUsage(companyId, phone)) {
      await incrementConversationUsage(companyId);
    }

    if (!(await isCompanyAiEnabled(companyId))) {
      return handleAiDisabledInbound(companyId, phone, customerName, trimmed);
    }

    if (await hasActiveTransferTicket(companyId, phone, { excludeAiDisabled: true })) {
      console.log(`[WhatsApp] Aktif ticket — AI yanıt atlandı → ${phone}`);
      return '';
    }

    const pendingDept = getPendingDepartmentSelection(companyId, phone);
    if (pendingDept) {
      const matched = matchDepartmentFromReply(trimmed, pendingDept.departments);
      if (matched) {
        clearPendingDepartmentSelection(companyId, phone);
        await ensureOpenTransferTicket(
          companyId,
          phone,
          customerName,
          pendingDept.subject,
          matched.id
        );

        await adminClient
          .from('messages')
          .update({ status: 'transferred' })
          .eq('company_id', companyId)
          .eq('customer_phone', phone)
          .eq('status', 'open');

        markTransferReply(companyId, phone);

        const lang = detectConversationLanguage(trimmed);
        const confirmMsg = t(lang, 'dept_forwarded', { department: matched.name });

        await adminClient.from('messages').insert({
          company_id: companyId,
          customer_phone: phone,
          customer_name: customerName,
          message: confirmMsg,
          sender_type: 'ai',
          status: 'transferred',
        });

        return confirmMsg;
      }

      const retryPrompt = buildDepartmentSelectionPrompt(
        pendingDept.departments,
        detectConversationLanguage(trimmed)
      );
      await adminClient.from('messages').insert({
        company_id: companyId,
        customer_phone: phone,
        customer_name: customerName,
        message: retryPrompt,
        sender_type: 'ai',
        status: 'open',
      });
      return retryPrompt;
    }

    if (config.platform.liveDemoCompanyId && companyId === config.platform.liveDemoCompanyId) {
      const timestamps = await getCustomerMessageTimestamps(companyId, phone);
      if (isNewConversationUnit(timestamps)) {
        const lang = detectConversationLanguage(trimmed);
        const welcome = t(lang, 'live_demo_welcome');

        await adminClient.from('messages').insert({
          company_id: companyId,
          customer_phone: phone,
          customer_name: customerName,
          message: welcome,
          sender_type: 'ai',
          status: 'open',
        });

        return welcome;
      }
    }

    let aiResponse;
    try {
      aiResponse = await generateAIResponse(companyId, trimmed, phone, customerName);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[WhatsApp] AI hatası:', detail);
      return t(detectConversationLanguage(trimmed), 'ai_unavailable');
    }

    let replyMessage = aiResponse.message;
    if (!replyMessage) return '';

    if (await shouldSkipDuplicateAiReply(companyId, phone, replyMessage)) {
      console.log(`[WhatsApp] Yinelenen AI yanıtı atlandı → ${phone}`);
      return '';
    }

    let messageStatus: 'open' | 'transferred' = 'open';

    if (aiResponse.shouldTransfer) {
      const hasTicket = await hasActiveTransferTicket(companyId, phone);
      if (hasTicket && shouldSkipTransferReply(companyId, phone)) {
        return '';
      }

      const transferResult = await handleTransferWithDepartment(
        companyId,
        phone,
        customerName,
        trimmed,
        buildTransferTicketSubject(trimmed, aiResponse.skipReason),
        whatsappAccountId
      );

      if (transferResult.reply) {
        replyMessage = transferResult.reply;
      }

      if (transferResult.ticketCreated) {
        messageStatus = 'transferred';

        await adminClient
          .from('messages')
          .update({ status: 'transferred' })
          .eq('company_id', companyId)
          .eq('customer_phone', phone)
          .eq('status', 'open');

        markTransferReply(companyId, phone);

        await logActivity({
          companyId,
          action: 'conversation_transferred',
          entityType: 'ticket',
          metadata: {
            customer_phone: phone,
            skip_reason: aiResponse.skipReason,
            skipped_ai: aiResponse.skippedAI,
          },
        });

        console.log(`[WhatsApp] Temsilciye aktarıldı → ${phone}`);
      }
    }

    await adminClient.from('messages').insert({
      company_id: companyId,
      customer_phone: phone,
      customer_name: customerName,
      message: replyMessage,
      sender_type: 'ai',
      status: messageStatus,
    });

    if (aiResponse.knowledgeMiss) {
      recordUnknownQuestion({
        companyId,
        customerPhone: phone,
        customerName,
        question: trimmed,
        aiResponse: replyMessage,
      }).catch((err) => {
        console.error(
          '[WhatsApp] Bilinmeyen soru kaydı hatası:',
          err instanceof Error ? err.message : err
        );
      });
    }

    await logActivity({
      companyId,
      action: 'ai_response_sent',
      entityType: 'message',
      metadata: {
        customer_phone: phone,
        skipped_ai: aiResponse.skippedAI,
        skip_reason: aiResponse.skipReason,
        tokens_used: aiResponse.tokensUsed,
        transferred: aiResponse.shouldTransfer,
        appointment_booked: aiResponse.appointmentBooked ?? false,
      },
    });

    console.log(`[WhatsApp] Yanıt gönderildi → ${phone}`);
    return replyMessage;
  });
}

async function incrementConversationUsage(companyId: string): Promise<void> {
  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('id, messages_used')
    .eq('company_id', companyId)
    .single();

  if (sub) {
    await adminClient
      .from('subscriptions')
      .update({ messages_used: sub.messages_used + 1 })
      .eq('id', sub.id);
  }
}

export function formatPhoneToJid(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) throw new Error('Geçersiz telefon numarası');
  return `${normalized}@s.whatsapp.net`;
}

export function jidToPhone(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/:\d+$/, '').replace('@lid', '');
}

function unwrapBaileysMessageContent(content: NonNullable<WAMessage['message']>) {
  return (
    content.ephemeralMessage?.message ||
    content.viewOnceMessage?.message ||
    content.viewOnceMessageV2?.message ||
    content.documentWithCaptionMessage?.message ||
    content
  );
}

/** Baileys sistem / senkron mesajlarını filtrele — yanlış otomatik yanıtları önler */
export function shouldIgnoreBaileysInboundMessage(msg: WAMessage): boolean {
  const jid = msg.key.remoteJid;
  if (!jid) return true;
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) return true;
  if (jid.endsWith('@newsletter')) return true;
  if (jid.endsWith('@g.us')) return true;

  const content = msg.message;
  if (!content) return true;

  const inner = unwrapBaileysMessageContent(content);
  if (inner.protocolMessage) return true;
  if (inner.reactionMessage) return true;
  if (inner.pollUpdateMessage) return true;
  if (inner.keepInChatMessage) return true;
  if (inner.senderKeyDistributionMessage) return true;

  return false;
}

export function extractTextFromBaileysMessage(msg: WAMessage): string | null {
  const content = msg.message;
  if (!content) return null;

  const inner = unwrapBaileysMessageContent(content);
  const text =
    inner.conversation ||
    inner.extendedTextMessage?.text ||
    inner.buttonsResponseMessage?.selectedDisplayText ||
    inner.listResponseMessage?.title ||
    inner.listResponseMessage?.singleSelectReply?.selectedRowId;

  const trimmed = text?.trim();
  return trimmed || null;
}

/** Baileys mesajından müşteri telefonu çıkar (LID desteği) */
export function extractPhoneFromMessage(key: {
  remoteJid?: string | null;
  senderPn?: string | null;
  participantPn?: string | null;
}): string {
  const pn = key.senderPn || key.participantPn;
  if (pn) {
    const fromPn = normalizePhoneNumber(jidToPhone(pn));
    if (fromPn) return fromPn;
  }
  if (key.remoteJid && !key.remoteJid.endsWith('@g.us')) {
    const fromJid = normalizePhoneNumber(jidToPhone(key.remoteJid));
    if (fromJid) return fromJid;
    return jidToPhone(key.remoteJid);
  }
  return '';
}

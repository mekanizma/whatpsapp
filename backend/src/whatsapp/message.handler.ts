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
import { shouldIncrementConversationUsage } from '../services/conversation-count.service';
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
import { detectConversationLanguage } from '../ai/language.service';

const DEBOUNCE_MS = 3000;
const TRANSFER_REPLY_COOLDOWN_MS = 60_000;

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
  limit = 10
): Promise<{ sender_type: string; message: string }[]> {
  const { data } = await adminClient
    .from('messages')
    .select('sender_type, message')
    .eq('company_id', companyId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).reverse();
}

async function handleTransferWithDepartment(
  companyId: string,
  phone: string,
  customerName: string | null,
  messageText: string,
  subject: string,
  whatsappAccountId?: string | null
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
    phone
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

export function clearTransferState(companyId: string, customerPhone: string): void {
  const phone = resolveCustomerPhone(customerPhone);
  recentTransferReplies.delete(`${companyId}:${phone}`);
  recentMessages.delete(`${companyId}:${phone}`);
  clearPendingDepartmentSelection(companyId, phone);
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
    const { data: company } = await adminClient
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .single();
    const name = company?.company_name?.trim();
    if (name) {
      return `Merhaba! Mesajınızı aldık. ${name} olarak yardımcı olmaktan mutluluk duyarız.`;
    }
    return 'Merhaba! Mesajınızı aldık. Size nasıl yardımcı olabiliriz?';
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

    if (await hasActiveTransferTicket(companyId, phone)) {
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
        const confirmMsg =
          lang === 'en'
            ? `Your request has been forwarded to the ${matched.name} team. A representative will assist you shortly.`
            : `Talebiniz ${matched.name} ekibine iletildi. Bir temsilcimiz kısa süre içinde size yardımcı olacak.`;

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

    let aiResponse;
    try {
      aiResponse = await generateAIResponse(companyId, trimmed, phone, customerName);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[WhatsApp] AI hatası:', detail);
      return 'Üzgünüz, şu an yanıt veremiyoruz. Lütfen kısa süre sonra tekrar deneyin.';
    }

    let replyMessage = aiResponse.message;
    if (!replyMessage) return '';

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

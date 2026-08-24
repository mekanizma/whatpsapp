/**
 * Destek talebi açıkken müşteri mesajından sonra 24 saatlik cevap penceresi.
 * Süre dolunca temsilci serbest metin/görsel gönderemez; müşteri yeniden yazınca süre sıfırlanır.
 */

import { adminClient } from '../database/supabase';

export const SUPPORT_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const SUPPORT_REPLY_WINDOW_CLOSED_MESSAGE =
  '24 saat cevap verilmediğinden talep kapatılmıştır. Lütfen telefon numarasından arayarak ulaşınız';

export type SupportReplyWindowStatus = {
  /** Açık destek talebi varken 24 saat penceresi hâlâ açık mı */
  canReply: boolean;
  /** Son müşteri mesajı zamanı (ISO); yoksa null */
  lastCustomerMessageAt: string | null;
  /** Pencere kapanış anı (ISO); müşteri mesajı varsa dolu */
  windowClosesAt: string | null;
};

async function getOpenTicketId(companyId: string, customerPhone: string): Promise<string | null> {
  const { data } = await adminClient
    .from('tickets')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_phone', customerPhone)
    .in('status', ['open', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

export async function getLastCustomerMessageAt(
  companyId: string,
  customerPhone: string
): Promise<string | null> {
  const { data } = await adminClient
    .from('messages')
    .select('created_at')
    .eq('company_id', companyId)
    .eq('customer_phone', customerPhone)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? null;
}

export async function getSupportReplyWindowStatus(
  companyId: string,
  customerPhone: string
): Promise<SupportReplyWindowStatus> {
  const ticketId = await getOpenTicketId(companyId, customerPhone);
  if (!ticketId) {
    return { canReply: true, lastCustomerMessageAt: null, windowClosesAt: null };
  }

  const lastCustomerMessageAt = await getLastCustomerMessageAt(companyId, customerPhone);
  if (!lastCustomerMessageAt) {
    // Henüz müşteri mesajı yoksa 24 saat kuralı uygulanmaz
    return { canReply: true, lastCustomerMessageAt: null, windowClosesAt: null };
  }

  const closesAtMs = new Date(lastCustomerMessageAt).getTime() + SUPPORT_REPLY_WINDOW_MS;
  const windowClosesAt = new Date(closesAtMs).toISOString();
  const canReply = Date.now() < closesAtMs;

  return { canReply, lastCustomerMessageAt, windowClosesAt };
}

/** Açık talep + süre dolmuşsa hata mesajı döner; aksi halde null. */
export async function getSupportReplyWindowBlockReason(
  companyId: string,
  customerPhone: string
): Promise<string | null> {
  const status = await getSupportReplyWindowStatus(companyId, customerPhone);
  if (status.canReply) return null;
  return SUPPORT_REPLY_WINDOW_CLOSED_MESSAGE;
}

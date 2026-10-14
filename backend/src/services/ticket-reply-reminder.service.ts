/**
 * Cevapsız destek talebi — 24s WhatsApp penceresi kapanmadan 1 saat önce e-posta hatırlatması
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import {
  getLastCustomerMessageAt,
  SUPPORT_REPLY_WINDOW_MS,
} from './support-reply-window.service';
import { notifyTicketReplyReminder } from './ticket-notification.service';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Pencere kapanmadan kaç ms önce hatırlat */
const REMINDER_LEAD_MS = 60 * 60 * 1000;

let checkTimer: NodeJS.Timeout | null = null;
let checkInProgress = false;

type OpenTicketRow = {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority: string | null;
  department_id: string | null;
  ticket_number: number | null;
  assigned_staff: string | null;
  created_at: string;
};

async function ticketHasStaffReply(ticket: OpenTicketRow): Promise<boolean> {
  const { count, error } = await adminClient
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', ticket.company_id)
    .eq('customer_phone', ticket.customer_phone)
    .eq('sender_type', 'staff')
    .gte('created_at', ticket.created_at);

  if (error) {
    console.error(`[TicketReminder] Personel mesajı kontrolü başarısız (${ticket.id}):`, error.message);
    return true; // güvenli taraf: hatırlatma atlama
  }

  return (count || 0) > 0;
}

async function wasReminderSent(ticketId: string, windowClosesAt: string): Promise<boolean> {
  const { data, error } = await adminClient
    .from('ticket_reply_reminder_log')
    .select('ticket_id')
    .eq('ticket_id', ticketId)
    .eq('window_closes_at', windowClosesAt)
    .maybeSingle();

  if (error) {
    console.error(`[TicketReminder] Log okunamadı (${ticketId}):`, error.message);
    return true;
  }

  return !!data;
}

async function markReminderSent(ticketId: string, windowClosesAt: string): Promise<void> {
  const { error } = await adminClient.from('ticket_reply_reminder_log').upsert(
    {
      ticket_id: ticketId,
      window_closes_at: windowClosesAt,
      notified_at: new Date().toISOString(),
    },
    { onConflict: 'ticket_id,window_closes_at' }
  );

  if (error) {
    console.error(`[TicketReminder] Log yazılamadı (${ticketId}):`, error.message);
  }
}

/**
 * Son müşteri mesajı penceresi: kapanmaya 1 saat kala ve henüz kapanmamış.
 * lastMsg ∈ (now − 24h, now − 23h]
 */
function isInReminderWindow(lastCustomerMessageAt: string, nowMs: number): {
  eligible: boolean;
  windowClosesAt: string;
} {
  const lastMs = new Date(lastCustomerMessageAt).getTime();
  if (!Number.isFinite(lastMs)) {
    return { eligible: false, windowClosesAt: '' };
  }

  const windowClosesAtMs = lastMs + SUPPORT_REPLY_WINDOW_MS;
  const reminderStartsAtMs = windowClosesAtMs - REMINDER_LEAD_MS;
  const eligible = nowMs >= reminderStartsAtMs && nowMs < windowClosesAtMs;

  return {
    eligible,
    windowClosesAt: new Date(windowClosesAtMs).toISOString(),
  };
}

export async function checkAndSendTicketReplyReminders(): Promise<void> {
  if (checkInProgress) return;
  if (!config.smtp.enabled) return;

  checkInProgress = true;
  const nowMs = Date.now();

  try {
    const { data: tickets, error } = await adminClient
      .from('tickets')
      .select(
        'id, company_id, customer_phone, customer_name, subject, priority, department_id, ticket_number, assigned_staff, created_at'
      )
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) {
      console.error('[TicketReminder] Açık talepler alınamadı:', error.message);
      return;
    }

    let sentCount = 0;

    for (const row of tickets || []) {
      const ticket = row as OpenTicketRow;

      const lastCustomerAt = await getLastCustomerMessageAt(
        ticket.company_id,
        ticket.customer_phone
      );
      if (!lastCustomerAt) continue;

      const { eligible, windowClosesAt } = isInReminderWindow(lastCustomerAt, nowMs);
      if (!eligible || !windowClosesAt) continue;

      if (await wasReminderSent(ticket.id, windowClosesAt)) continue;
      if (await ticketHasStaffReply(ticket)) continue;

      const notified = await notifyTicketReplyReminder(
        ticket.company_id,
        {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          customer_phone: ticket.customer_phone,
          customer_name: ticket.customer_name,
          subject: ticket.subject,
          priority: ticket.priority || undefined,
          department_id: ticket.department_id,
          assigned_staff: ticket.assigned_staff,
        },
        windowClosesAt
      );

      // Alıcı olmasa bile aynı pencerede tekrar denemeyi önle
      await markReminderSent(ticket.id, windowClosesAt);
      if (notified > 0) sentCount += 1;
    }

    if (sentCount > 0) {
      console.log(`[TicketReminder] ${sentCount} talep için hatırlatma e-postası gönderildi`);
    }
  } catch (err) {
    console.error(
      '[TicketReminder] Kontrol hatası:',
      err instanceof Error ? err.message : err
    );
  } finally {
    checkInProgress = false;
  }
}

export function startTicketReplyReminderSchedule(): void {
  if (checkTimer || config.demoMode || !config.smtp.enabled) return;

  const run = () => {
    void checkAndSendTicketReplyReminders();
  };

  setTimeout(run, 20000);
  checkTimer = setInterval(run, CHECK_INTERVAL_MS);
  checkTimer.unref();

  console.log('[TicketReminder] Periyodik kontrol başlatıldı (5 dk, 24s−1s)');
}

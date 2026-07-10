import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase, supabaseConfigured, syncSupabaseRealtimeAuth } from '@/services/supabase';
import { api } from '@/services/api';
import { showBrowserNotification } from '@/lib/browser-notifications';
import { getTicketSubjectLabel } from '@/lib/ticket-labels';
import type { Conversation, Ticket } from '@/types';

interface MessageRow {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name?: string | null;
  message?: string | null;
  sender_type: string;
  media_type?: string | null;
}

interface TicketRow {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name?: string | null;
  subject: string;
  status: string;
}

interface UsePanelRealtimeNotificationsOptions {
  companyId?: string;
  enabled: boolean;
}

const POLL_INTERVAL_MS = 12_000;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function usePanelRealtimeNotifications({
  companyId,
  enabled,
}: UsePanelRealtimeNotificationsOptions): void {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const seenIdsRef = useRef(new Set<string>());
  const pollSnapshotRef = useRef<{
    conversations: Map<string, string>;
    ticketIds: Set<string>;
  } | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!enabled || !companyId) return;

    const shouldSkipMessageNotification = (phone: string) => {
      const { pathname, search } = locationRef.current;
      const selectedPhone = new URLSearchParams(search).get('phone');
      if (document.hidden) return false;
      if (pathname !== '/panel/messages' || !selectedPhone) return false;
      return normalizePhone(selectedPhone) === normalizePhone(phone);
    };

    const markSeen = (id: string) => {
      seenIdsRef.current.add(id);
      if (seenIdsRef.current.size > 1000) {
        const oldest = seenIdsRef.current.values().next().value;
        if (oldest) seenIdsRef.current.delete(oldest);
      }
    };

    const notifyCustomerMessage = (row: MessageRow) => {
      if (row.sender_type !== 'customer') return;
      if (seenIdsRef.current.has(row.id)) return;
      markSeen(row.id);
      if (shouldSkipMessageNotification(row.customer_phone)) return;

      const title = row.customer_name?.trim() || row.customer_phone;
      const body =
        row.message?.trim() ||
        (row.media_type?.startsWith('image/')
          ? t('browserNotifications.imageMessage')
          : t('browserNotifications.newMessage'));

      showBrowserNotification({
        title,
        body: body.slice(0, 160),
        tag: `message-${row.id}`,
        url: `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}`,
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', row.customer_phone] });
    };

    const notifyNewTicket = (row: TicketRow) => {
      if (row.status !== 'open') return;
      if (seenIdsRef.current.has(row.id)) return;
      markSeen(row.id);

      const title = t('browserNotifications.newTicketTitle');
      const customer = row.customer_name?.trim() || row.customer_phone;
      const subject = getTicketSubjectLabel(t, row.subject);
      const body = t('browserNotifications.newTicketBody', { customer, subject });

      showBrowserNotification({
        title,
        body: body.slice(0, 160),
        tag: `ticket-${row.id}`,
        url: `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}&ticket=${row.id}`,
      });

      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
    };

    const poll = async () => {
      try {
        const [conversations, tickets] = await Promise.all([
          api.get<Conversation[]>('/messages'),
          api.get<Ticket[]>('/tickets'),
        ]);

        const nextConversations = new Map<string, string>();
        for (const conv of conversations) {
          const key = normalizePhone(conv.customer_phone);
          nextConversations.set(key, conv.last_message_at);

          if (!pollSnapshotRef.current) continue;

          const prevAt = pollSnapshotRef.current.conversations.get(key);
          if (prevAt === conv.last_message_at) continue;
          if (shouldSkipMessageNotification(conv.customer_phone)) continue;

          showBrowserNotification({
            title: conv.customer_name?.trim() || conv.customer_phone,
            body: (conv.last_message || t('browserNotifications.newMessage')).slice(0, 160),
            tag: `poll-message-${key}-${conv.last_message_at}`,
            url: `/panel/messages?phone=${encodeURIComponent(conv.customer_phone)}`,
          });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }

        const nextTicketIds = new Set(
          tickets.filter((ticket) => ticket.status === 'open').map((ticket) => ticket.id)
        );

        if (pollSnapshotRef.current) {
          for (const ticket of tickets) {
            if (ticket.status !== 'open') continue;
            if (pollSnapshotRef.current.ticketIds.has(ticket.id)) continue;

            notifyNewTicket({
              id: ticket.id,
              company_id: companyId,
              customer_phone: ticket.customer_phone,
              customer_name: ticket.customer_name,
              subject: ticket.subject,
              status: ticket.status,
            });
          }
        }

        pollSnapshotRef.current = {
          conversations: nextConversations,
          ticketIds: nextTicketIds,
        };
      } catch {
        /* polling sessiz */
      }
    };

    void poll();
    const pollTimer = setInterval(poll, POLL_INTERVAL_MS);

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtime = async () => {
      if (!supabaseConfigured) return;

      await syncSupabaseRealtimeAuth();

      channel = supabase
        .channel(`panel-notify-${companyId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => notifyCustomerMessage(payload.new as MessageRow)
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tickets',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => notifyNewTicket(payload.new as TicketRow)
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Notifications] Realtime durumu: ${status}`);
          }
        });
    };

    void setupRealtime();

    return () => {
      clearInterval(pollTimer);
      pollSnapshotRef.current = null;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [companyId, enabled, queryClient, t]);
}

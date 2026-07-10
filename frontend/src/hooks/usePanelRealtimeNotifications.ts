import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase, supabaseConfigured } from '@/services/supabase';
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

export function usePanelRealtimeNotifications({
  companyId,
  enabled,
}: UsePanelRealtimeNotificationsOptions): void {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const seenIdsRef = useRef(new Set<string>());
  const pollSnapshotRef = useRef<{ messageIds: Set<string>; ticketIds: Set<string> } | null>(null);

  useEffect(() => {
    if (!enabled || !companyId) return;

    const selectedPhone = new URLSearchParams(location.search).get('phone');
    const isMessagesPage = location.pathname === '/panel/messages';

    const shouldSkipMessageNotification = (phone: string) =>
      !document.hidden && isMessagesPage && selectedPhone === phone;

    const markSeen = (id: string) => {
      seenIdsRef.current.add(id);
      if (seenIdsRef.current.size > 500) {
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
        (row.media_type?.startsWith('image/') ? t('browserNotifications.imageMessage') : t('browserNotifications.newMessage'));

      showBrowserNotification({
        title,
        body: body.slice(0, 160),
        tag: `message-${row.customer_phone}`,
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

    if (supabaseConfigured) {
      const channel = supabase
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
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const poll = async () => {
      try {
        const [conversations, tickets] = await Promise.all([
          api.get<Conversation[]>('/messages'),
          api.get<Ticket[]>('/tickets'),
        ]);

        const messageIds = new Set<string>();
        for (const conv of conversations) {
          const syntheticId = `conv-${conv.customer_phone}-${conv.last_message_at}`;
          messageIds.add(syntheticId);
          if (!pollSnapshotRef.current) continue;
          if (pollSnapshotRef.current.messageIds.has(syntheticId)) continue;
          if (conv.unread_count <= 0) continue;
          if (shouldSkipMessageNotification(conv.customer_phone)) continue;

          showBrowserNotification({
            title: conv.customer_name?.trim() || conv.customer_phone,
            body: (conv.last_message || t('browserNotifications.newMessage')).slice(0, 160),
            tag: `message-${conv.customer_phone}`,
            url: `/panel/messages?phone=${encodeURIComponent(conv.customer_phone)}`,
          });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }

        for (const ticket of tickets) {
          if (ticket.status !== 'open') continue;
          messageIds.add(`ticket-${ticket.id}`);
          if (!pollSnapshotRef.current) continue;
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

        pollSnapshotRef.current = {
          messageIds,
          ticketIds: new Set(tickets.filter((tk) => tk.status === 'open').map((tk) => tk.id)),
        };
      } catch {
        /* polling sessiz */
      }
    };

    void poll();
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [companyId, enabled, location.pathname, location.search, queryClient, t]);
}

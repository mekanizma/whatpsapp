import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase, supabaseConfigured, syncSupabaseRealtimeAuth } from '@/services/supabase';
import { api } from '@/services/api';
import { showBrowserNotification } from '@/lib/browser-notifications';
import { getTicketSubjectLabel } from '@/lib/ticket-labels';
import type { Ticket, UserRole } from '@/types';

interface MessageRow {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name?: string | null;
  message?: string | null;
  sender_type: string;
  media_type?: string | null;
  ticket_id?: string | null;
}

interface TicketRow {
  id: string;
  company_id: string;
  customer_phone: string;
  customer_name?: string | null;
  subject: string;
  status: string;
  assigned_staff?: string | null;
  last_assigned_staff?: string | null;
}

interface AssignedTicketInfo {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  status: string;
  assigned_staff: string | null;
  last_assigned_staff: string | null;
}

interface UsePanelRealtimeNotificationsOptions {
  companyId?: string;
  enabled: boolean;
  userRole?: UserRole;
  staffId?: string | null;
}

const POLL_INTERVAL_MS = 12_000;
const ACTIVE_TICKET_STATUSES = new Set(['open', 'in_progress']);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function hasAssignee(
  ticket: {
    assigned_staff?: string | null;
    last_assigned_staff?: string | null;
  }
): boolean {
  return !!(ticket.assigned_staff || ticket.last_assigned_staff);
}

function isActiveTicketStatus(status: string): boolean {
  return ACTIVE_TICKET_STATUSES.has(status);
}

function toAssignedTicketInfo(ticket: Ticket | TicketRow): AssignedTicketInfo {
  return {
    id: ticket.id,
    customer_phone: ticket.customer_phone,
    customer_name: ticket.customer_name ?? null,
    subject: ticket.subject,
    status: ticket.status,
    assigned_staff: ticket.assigned_staff ?? null,
    last_assigned_staff: ticket.last_assigned_staff ?? null,
  };
}

export function usePanelRealtimeNotifications({
  companyId,
  enabled,
  userRole,
  staffId,
}: UsePanelRealtimeNotificationsOptions): void {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const seenIdsRef = useRef(new Set<string>());
  const assignedTicketsRef = useRef(new Map<string, AssignedTicketInfo>());
  const pollSnapshotRef = useRef<Set<string> | null>(null);
  const locationRef = useRef(location);
  const userRoleRef = useRef(userRole);
  const staffIdRef = useRef(staffId);
  locationRef.current = location;
  userRoleRef.current = userRole;
  staffIdRef.current = staffId;

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

    const shouldNotifyForTicket = (ticket: AssignedTicketInfo): boolean => {
      if (!isActiveTicketStatus(ticket.status)) return false;

      const role = userRoleRef.current;
      if (role === 'company_admin' || role === 'super_admin') return true;

      if (role === 'staff') {
        const myStaffId = staffIdRef.current;
        if (!myStaffId || !ticket.assigned_staff) return false;
        return ticket.assigned_staff === myStaffId;
      }

      return false;
    };

    const refreshAssignedTickets = (tickets: Ticket[]) => {
      const next = new Map<string, AssignedTicketInfo>();

      for (const ticket of tickets) {
        if (!isActiveTicketStatus(ticket.status)) continue;
        if (!hasAssignee(ticket)) continue;

        next.set(normalizePhone(ticket.customer_phone), toAssignedTicketInfo(ticket));
      }

      assignedTicketsRef.current = next;
    };

    const shouldNotifyNewTicket = (ticket: AssignedTicketInfo): boolean => {
      if (!isActiveTicketStatus(ticket.status)) return false;

      const role = userRoleRef.current;
      if (role === 'company_admin' || role === 'super_admin') return true;

      if (role === 'staff') {
        const myStaffId = staffIdRef.current;
        if (!hasAssignee(ticket)) return true;
        return !!myStaffId && ticket.assigned_staff === myStaffId;
      }

      return false;
    };

    const notifyNewTicket = (row: Ticket | TicketRow) => {
      const ticket = toAssignedTicketInfo(row);
      if (!shouldNotifyNewTicket(ticket)) return;
      if (seenIdsRef.current.has(`ticket-${row.id}`)) return;
      markSeen(`ticket-${row.id}`);

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

    const notifyAssignedTicketMessage = (row: MessageRow) => {
      if (row.sender_type !== 'customer') return;
      if (seenIdsRef.current.has(row.id)) return;

      const ticket = assignedTicketsRef.current.get(normalizePhone(row.customer_phone));
      if (!ticket || !hasAssignee(ticket)) return;
      if (!shouldNotifyForTicket(ticket)) return;

      markSeen(row.id);
      if (shouldSkipMessageNotification(row.customer_phone)) return;

      const customer = row.customer_name?.trim() || row.customer_phone;
      const subject = getTicketSubjectLabel(t, ticket.subject);
      const body =
        row.message?.trim() ||
        (row.media_type?.startsWith('image/')
          ? t('browserNotifications.imageMessage')
          : t('browserNotifications.ticketMessageBody', { customer, subject }));

      showBrowserNotification({
        title: t('browserNotifications.ticketMessageTitle'),
        body: body.slice(0, 160),
        tag: `ticket-message-${row.id}`,
        url: `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}&ticket=${ticket.id}`,
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', row.customer_phone] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
    };

    const syncTicketRow = (row: TicketRow) => {
      const info = toAssignedTicketInfo(row);
      const key = normalizePhone(row.customer_phone);

      if (isActiveTicketStatus(row.status) && hasAssignee(row)) {
        assignedTicketsRef.current.set(key, info);
        return;
      }

      assignedTicketsRef.current.delete(key);
    };

    const poll = async () => {
      try {
        const tickets = await api.get<Ticket[]>('/tickets');
        refreshAssignedTickets(tickets);

        const openTicketIds = new Set(
          tickets.filter((ticket) => isActiveTicketStatus(ticket.status)).map((ticket) => ticket.id)
        );

        if (pollSnapshotRef.current) {
          for (const ticket of tickets) {
            if (!isActiveTicketStatus(ticket.status)) continue;
            if (pollSnapshotRef.current.has(ticket.id)) continue;
            notifyNewTicket(ticket);
          }
        }

        pollSnapshotRef.current = openTicketIds;
      } catch {
        /* polling sessiz */
      }
    };

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
          (payload) => notifyAssignedTicketMessage(payload.new as MessageRow)
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'tickets',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => {
            const row = payload.new as TicketRow;
            syncTicketRow(row);
            notifyNewTicket(row);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tickets',
            filter: `company_id=eq.${companyId}`,
          },
          (payload) => syncTicketRow(payload.new as TicketRow)
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn(`[Notifications] Realtime durumu: ${status}`);
          }
        });
    };

    const pollTimer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    void (async () => {
      await poll();
      await setupRealtime();
    })();

    return () => {
      clearInterval(pollTimer);
      pollSnapshotRef.current = null;
      assignedTicketsRef.current = new Map();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [companyId, enabled, queryClient, staffId, t, userRole]);
}

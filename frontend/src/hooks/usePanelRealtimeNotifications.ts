import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase, supabaseConfigured, syncSupabaseRealtimeAuth } from '@/services/supabase';
import { api } from '@/services/api';
import { showBrowserNotification } from '@/lib/browser-notifications';
import { pushPanelLiveAlert } from '@/lib/panel-live-alerts';
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
  department_id?: string | null;
}

interface AssignedTicketInfo {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  status: string;
  assigned_staff: string | null;
  last_assigned_staff: string | null;
  department_id: string | null;
  departmentName: string | null;
  assigneeName: string | null;
}

interface UsePanelRealtimeNotificationsOptions {
  companyId?: string;
  /** Hook çalışsın mı (panel açıkken true) */
  enabled: boolean;
  /** OS tarayıcı bildirimi + mesaj beep’i için */
  browserNotifyEnabled?: boolean;
  userRole?: UserRole;
  staffId?: string | null;
}

const POLL_INTERVAL_MS = 12_000;
const ACTIVE_TICKET_STATUSES = new Set(['open', 'in_progress']);

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function isActiveTicketStatus(status: string): boolean {
  return ACTIVE_TICKET_STATUSES.has(status);
}

function toAssignedTicketInfo(ticket: Ticket | TicketRow): AssignedTicketInfo {
  const full = ticket as Ticket;
  return {
    id: ticket.id,
    customer_phone: ticket.customer_phone,
    customer_name: ticket.customer_name ?? null,
    subject: ticket.subject,
    status: ticket.status,
    assigned_staff: ticket.assigned_staff ?? null,
    last_assigned_staff: ticket.last_assigned_staff ?? null,
    department_id: ticket.department_id ?? null,
    departmentName: full.department?.name ?? null,
    assigneeName: full.staff?.name ?? null,
  };
}

export function usePanelRealtimeNotifications({
  companyId,
  enabled,
  browserNotifyEnabled = false,
  userRole,
  staffId,
}: UsePanelRealtimeNotificationsOptions): void {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const seenIdsRef = useRef(new Set<string>());
  const assignedTicketsRef = useRef(new Map<string, AssignedTicketInfo>());
  const ticketsByIdRef = useRef(new Map<string, AssignedTicketInfo>());
  const pollSnapshotRef = useRef<Set<string> | null>(null);
  const locationRef = useRef(location);
  const userRoleRef = useRef(userRole);
  const staffIdRef = useRef(staffId);
  const browserNotifyRef = useRef(browserNotifyEnabled);
  locationRef.current = location;
  userRoleRef.current = userRole;
  staffIdRef.current = staffId;
  browserNotifyRef.current = browserNotifyEnabled;

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
      const byId = new Map<string, AssignedTicketInfo>();

      for (const ticket of tickets) {
        const info = toAssignedTicketInfo(ticket);
        byId.set(ticket.id, info);
        if (!isActiveTicketStatus(ticket.status)) continue;
        if (!ticket.assigned_staff) continue;
        next.set(normalizePhone(ticket.customer_phone), info);
      }

      assignedTicketsRef.current = next;
      ticketsByIdRef.current = byId;
    };

    const shouldNotifyNewTicket = (ticket: AssignedTicketInfo): boolean => {
      if (!isActiveTicketStatus(ticket.status)) return false;

      const role = userRoleRef.current;
      if (role === 'company_admin' || role === 'super_admin') return true;

      if (role === 'staff') {
        const myStaffId = staffIdRef.current;
        if (!ticket.assigned_staff) return true;
        return !!myStaffId && ticket.assigned_staff === myStaffId;
      }

      return false;
    };

    const enrichTicketInfo = async (row: Ticket | TicketRow): Promise<AssignedTicketInfo> => {
      const base = toAssignedTicketInfo(row);
      const cached = ticketsByIdRef.current.get(row.id);
      if (cached) {
        return {
          ...base,
          departmentName: base.departmentName || cached.departmentName,
          assigneeName: base.assigneeName || cached.assigneeName,
          department_id: base.department_id || cached.department_id,
        };
      }

      if (base.departmentName || base.assigneeName) {
        ticketsByIdRef.current.set(row.id, base);
        return base;
      }

      try {
        const tickets = await api.get<Ticket[]>('/tickets');
        refreshAssignedTickets(tickets);
        const full = ticketsByIdRef.current.get(row.id);
        if (full) {
          return {
            ...base,
            departmentName: full.departmentName,
            assigneeName: full.assigneeName,
            department_id: full.department_id ?? base.department_id,
          };
        }
      } catch {
        /* sessiz */
      }

      ticketsByIdRef.current.set(row.id, base);
      return base;
    };

    const emitTicketAlert = (
      ticket: AssignedTicketInfo,
      kind: 'ticket' | 'transfer' | 'assign',
      title: string,
      body: string,
      url: string,
      tag: string
    ) => {
      pushPanelLiveAlert({
        id: tag,
        kind,
        title,
        body,
        department: ticket.departmentName,
        assignee: ticket.assigneeName,
        url,
      });

      showBrowserNotification({
        title,
        body: body.slice(0, 160),
        tag,
        url,
        urgent: true,
      });
    };

    const notifyNewTicket = async (row: Ticket | TicketRow) => {
      const ticket = await enrichTicketInfo(row);
      if (!shouldNotifyNewTicket(ticket)) return;
      if (seenIdsRef.current.has(`ticket-${row.id}`)) return;
      markSeen(`ticket-${row.id}`);

      const customer = row.customer_name?.trim() || row.customer_phone;
      const subject = getTicketSubjectLabel(t, row.subject);
      const title = t('browserNotifications.newTicketTitle');
      const body = t('browserNotifications.newTicketBody', { customer, subject });
      const url = ticket.assigned_staff
        ? `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}&ticket=${row.id}`
        : `/panel/tickets`;

      emitTicketAlert(ticket, 'ticket', title, body, url, `ticket-${row.id}`);

      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
    };

    const notifyTicketUpdate = async (row: TicketRow, prev?: TicketRow | null) => {
      if (!isActiveTicketStatus(row.status)) return;

      const ticket = await enrichTicketInfo(row);
      const myStaffId = staffIdRef.current;
      const role = userRoleRef.current;
      const isAdmin = role === 'company_admin' || role === 'super_admin';
      const prevAssigned = prev?.assigned_staff ?? null;
      const nextAssigned = row.assigned_staff ?? null;
      const prevDept = prev?.department_id ?? null;
      const nextDept = row.department_id ?? null;

      const assignedToMe =
        !!myStaffId && nextAssigned === myStaffId && prevAssigned !== myStaffId;
      const assignedChanged =
        !!nextAssigned && nextAssigned !== prevAssigned && (assignedToMe || isAdmin);
      const transferred =
        (!!prevDept && !!nextDept && prevDept !== nextDept) ||
        (!!prevAssigned && !nextAssigned);

      if (!assignedChanged && !transferred) return;
      if (!isAdmin && !assignedToMe && !shouldNotifyNewTicket(ticket)) return;

      const customer = row.customer_name?.trim() || row.customer_phone;
      const subject = getTicketSubjectLabel(t, row.subject);
      const url = nextAssigned
        ? `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}&ticket=${row.id}`
        : `/panel/tickets`;

      if (assignedChanged) {
        const tag = `ticket-assign-${row.id}-${nextAssigned}`;
        if (seenIdsRef.current.has(tag)) return;
        markSeen(tag);
        const title = assignedToMe
          ? t('browserNotifications.assignedTitle')
          : t('browserNotifications.assignNotifyTitle');
        emitTicketAlert(
          ticket,
          'assign',
          title,
          t('browserNotifications.assignedBody', { customer, subject }),
          url,
          tag
        );
      } else if (transferred) {
        const stableTag = `ticket-transfer-${row.id}-${nextDept || 'none'}-${nextAssigned || 'open'}`;
        if (seenIdsRef.current.has(stableTag)) return;
        markSeen(stableTag);
        emitTicketAlert(
          { ...ticket, assigneeName: null },
          'transfer',
          t('browserNotifications.transferTitle'),
          t('browserNotifications.transferBody', {
            customer,
            subject,
            department: ticket.departmentName || t('browserNotifications.unknownDepartment'),
          }),
          url,
          stableTag
        );
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
    };

    const notifyAssignedTicketMessage = (row: MessageRow) => {
      if (row.sender_type !== 'customer') return;
      if (seenIdsRef.current.has(row.id)) return;

      const ticket = assignedTicketsRef.current.get(normalizePhone(row.customer_phone));
      if (!ticket?.assigned_staff) return;
      if (!shouldNotifyForTicket(ticket)) return;

      markSeen(row.id);
      if (shouldSkipMessageNotification(row.customer_phone)) return;

      // Mesaj bildirimleri yalnızca tarayıcı bildirimi açıkken
      if (!browserNotifyRef.current) {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['messages', row.customer_phone] });
        queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
        return;
      }

      const customer = row.customer_name?.trim() || row.customer_phone;
      const subject = getTicketSubjectLabel(t, ticket.subject);
      const body =
        row.message?.trim() ||
        (row.media_type?.startsWith('image/')
          ? t('browserNotifications.imageMessage')
          : t('browserNotifications.ticketMessageBody', { customer, subject }));

      const title = t('browserNotifications.ticketMessageTitle');
      const url = `/panel/messages?phone=${encodeURIComponent(row.customer_phone)}&ticket=${ticket.id}`;

      pushPanelLiveAlert({
        id: `msg-${row.id}`,
        kind: 'message',
        title,
        body: body.slice(0, 160),
        department: ticket.departmentName,
        assignee: ticket.assigneeName,
        url,
      });

      showBrowserNotification({
        title,
        body: body.slice(0, 160),
        tag: `ticket-message-${row.id}`,
        url,
      });

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['messages', row.customer_phone] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket', row.customer_phone] });
    };

    const syncTicketRow = (row: TicketRow) => {
      const info = toAssignedTicketInfo(row);
      const cached = ticketsByIdRef.current.get(row.id);
      const merged: AssignedTicketInfo = {
        ...info,
        departmentName: info.departmentName || cached?.departmentName || null,
        assigneeName: info.assigneeName || cached?.assigneeName || null,
      };
      ticketsByIdRef.current.set(row.id, merged);

      const key = normalizePhone(row.customer_phone);
      if (isActiveTicketStatus(row.status) && row.assigned_staff) {
        assignedTicketsRef.current.set(key, merged);
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
            void notifyNewTicket(ticket);
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
            void notifyNewTicket(row);
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
          (payload) => {
            const row = payload.new as TicketRow;
            // REPLICA IDENTITY FULL yoksa payload.old yetersiz — cache'den önceki durumu kullan
            const cached = ticketsByIdRef.current.get(row.id);
            const oldPayload = payload.old as Partial<TicketRow> | undefined;
            const prev: TicketRow | null = cached
              ? {
                  id: cached.id,
                  company_id: row.company_id,
                  customer_phone: cached.customer_phone,
                  customer_name: cached.customer_name,
                  subject: cached.subject,
                  status: cached.status,
                  assigned_staff: cached.assigned_staff,
                  last_assigned_staff: cached.last_assigned_staff,
                  department_id: cached.department_id,
                }
              : oldPayload?.id
                ? ({ ...oldPayload, ...row, ...oldPayload } as TicketRow)
                : null;
            syncTicketRow(row);
            void notifyTicketUpdate(row, prev);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
            queryClient.invalidateQueries({
              queryKey: ['active-ticket', row.customer_phone],
            });
          }
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
      ticketsByIdRef.current = new Map();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [browserNotifyEnabled, companyId, enabled, queryClient, staffId, t, userRole]);
}

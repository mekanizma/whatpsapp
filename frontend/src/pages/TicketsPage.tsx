/**
 * Tickets / live support page — açık ve çözüldü sekmeleri
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Ticket, Clock, UserCheck, MessageSquare, CheckCircle2, CircleDot } from 'lucide-react';
import { api } from '@/services/api';
import { authQueryKey } from '@/lib/query-keys';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TransferTicketControl } from '@/components/TransferTicketControl';
import { getTicketAssigneeLabel } from '@/lib/ticket-assignee';
import { getTicketPriorityLabel, getTicketSubjectLabel } from '@/lib/ticket-labels';
import { Card, CardContent, Badge, Spinner, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Ticket as TicketType } from '@/types';

type TicketView = 'open' | 'resolved';

const priorityVariant: Record<string, 'default' | 'info' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'default',
};

export function TicketsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<TicketView>('open');

  const { data: openTickets, isPending: openPending } = useQuery({
    queryKey: authQueryKey(['tickets', 'open'], user?.id, user?.role),
    queryFn: () => api.get<TicketType[]>('/tickets?view=open'),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const { data: resolvedTickets, isPending: resolvedPending } = useQuery({
    queryKey: authQueryKey(['tickets', 'resolved'], user?.id, user?.role),
    queryFn: () => api.get<TicketType[]>('/tickets?view=resolved'),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const tickets = view === 'open' ? openTickets : resolvedTickets;
  const isPending = view === 'open' ? openPending : resolvedPending;

  const claimMutation = useMutation({
    mutationFn: (ticket: TicketType) => api.patch<TicketType>(`/tickets/${ticket.id}/claim`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/panel/messages?phone=${encodeURIComponent(data.customer_phone)}&ticket=${data.id}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.put<TicketType>(`/tickets/${id}`, { status: 'resolved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setView('resolved');
    },
  });

  const goToConversation = (ticket: TicketType) => {
    navigate(`/panel/messages?phone=${encodeURIComponent(ticket.customer_phone)}&ticket=${ticket.id}`);
  };

  const openCount = openTickets?.length ?? 0;
  const resolvedCount = resolvedTickets?.length ?? 0;

  const filters: { key: TicketView; label: string; count: number; icon: typeof CircleDot }[] = [
    {
      key: 'open',
      label: t('tickets.filters.open'),
      count: openCount,
      icon: CircleDot,
    },
    {
      key: 'resolved',
      label: t('tickets.filters.resolved'),
      count: resolvedCount,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        action={
          openCount > 0 ? (
            <Badge variant="warning">{t('tickets.pending', { count: openCount })}</Badge>
          ) : undefined
        }
      />

      <div
        className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100/80 p-1 sm:inline-grid sm:w-auto"
        role="tablist"
        aria-label={t('tickets.filters.label')}
      >
        {filters.map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(item.key)}
              className={cn(
                'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors sm:min-w-[140px]',
                active
                  ? item.key === 'open'
                    ? 'bg-white text-amber-800 shadow-sm ring-1 ring-amber-100'
                    : 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-100'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                    active
                      ? item.key === 'open'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200/80 text-slate-600'
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isPending ? (
        <div className="flex justify-center p-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : tickets?.length === 0 ? (
        <EmptyState
          icon={view === 'resolved' ? CheckCircle2 : Ticket}
          title={view === 'resolved' ? t('tickets.emptyResolved') : t('tickets.empty')}
          description={
            view === 'resolved' ? t('tickets.emptyResolvedDesc') : t('tickets.emptyDesc')
          }
        />
      ) : (
        <div className="space-y-3">
          {tickets?.map((ticket) => {
            const assignee = getTicketAssigneeLabel(ticket);
            const isActive = ticket.status === 'open' || ticket.status === 'in_progress';
            return (
              <Card
                key={ticket.id}
                className={cn(
                  'cursor-pointer overflow-hidden transition-shadow hover:shadow-md',
                  !isActive && 'opacity-95'
                )}
                onClick={() => goToConversation(ticket)}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex gap-3 sm:gap-4">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12',
                          isActive
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        )}
                      >
                        {isActive ? (
                          <Ticket className="h-5 w-5" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">
                            {getTicketSubjectLabel(t, ticket.subject)}
                          </h3>
                          <Badge variant={priorityVariant[ticket.priority]}>
                            {getTicketPriorityLabel(t, ticket.priority)}
                          </Badge>
                          <Badge variant={statusBadge[ticket.status] || 'default'}>
                            {t(`common.status.${ticket.status}`, {
                              defaultValue: ticket.status,
                            })}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-slate-600">
                          {ticket.customer_name || ticket.customer_phone}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {assignee ? (
                            <span className="inline-flex min-h-[28px] items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-100">
                              <UserCheck className="h-3.5 w-3.5" />
                              {assignee.isLast
                                ? t('tickets.lastAssigned', { name: assignee.name })
                                : t('tickets.assigned', { name: assignee.name })}
                            </span>
                          ) : ticket.status === 'in_progress' ? (
                            <span className="text-xs text-slate-400">{t('tickets.unassigned')}</span>
                          ) : null}
                          {ticket.department?.name && (
                            <span className="text-xs text-slate-500">
                              {t('tickets.department', { name: ticket.department.name })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {new Date(ticket.created_at).toLocaleString(locale)}
                        </div>
                      </div>
                    </div>
                    <div
                      className="flex w-full flex-col gap-3 sm:w-auto sm:shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isActive && <TransferTicketControl ticket={ticket} compact />}
                      <div className="flex flex-wrap gap-2">
                        {ticket.status === 'open' && (
                          <Button
                            size="sm"
                            className="min-h-[40px] flex-1 sm:flex-none"
                            onClick={() => claimMutation.mutate(ticket)}
                            disabled={claimMutation.isPending}
                          >
                            <UserCheck className="h-4 w-4" />
                            {t('tickets.claim')}
                          </Button>
                        )}
                        {ticket.status === 'in_progress' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[40px] flex-1 sm:flex-none"
                              onClick={() => goToConversation(ticket)}
                            >
                              <MessageSquare className="h-4 w-4" />
                              {t('tickets.goToChat')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-[40px] flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:flex-none"
                              onClick={() => resolveMutation.mutate(ticket.id)}
                              disabled={resolveMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              {t('tickets.markResolved')}
                            </Button>
                          </>
                        )}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-[40px] w-full sm:w-auto"
                            onClick={() => goToConversation(ticket)}
                          >
                            <MessageSquare className="h-4 w-4" />
                            {t('tickets.goToChat')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

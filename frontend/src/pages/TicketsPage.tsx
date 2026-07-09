/**
 * Tickets / live support page
 */

import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Ticket, Clock, UserCheck, MessageSquare, CheckCircle2 } from 'lucide-react';
import { api } from '@/services/api';
import { authQueryKey } from '@/lib/query-keys';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { TransferTicketControl } from '@/components/TransferTicketControl';
import { getTicketAssigneeLabel } from '@/lib/ticket-assignee';
import { Card, CardContent, Badge, Spinner, Button } from '@/components/ui';
import type { Ticket as TicketType } from '@/types';

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

  const { data: tickets, isPending } = useQuery({
    queryKey: authQueryKey(['tickets'], user?.id, user?.role),
    queryFn: () => api.get<TicketType[]>('/tickets'),
    enabled: !!user?.id,
    refetchInterval: 15000,
  });

  const claimMutation = useMutation({
    mutationFn: (ticket: TicketType) => api.patch<TicketType>(`/tickets/${ticket.id}/claim`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate(`/panel/messages?phone=${encodeURIComponent(data.customer_phone)}&ticket=${data.id}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.put<TicketType>(`/tickets/${id}`, { status: 'resolved' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const goToConversation = (ticket: TicketType) => {
    navigate(`/panel/messages?phone=${encodeURIComponent(ticket.customer_phone)}&ticket=${ticket.id}`);
  };

  const openCount = tickets?.filter((t) => t.status === 'open').length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('tickets.title')}
        description={t('tickets.description')}
        action={openCount > 0 ? <Badge variant="warning">{t('tickets.pending', { count: openCount })}</Badge> : undefined}
      />

      {isPending ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : tickets?.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={t('tickets.empty')}
          description={t('tickets.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {tickets?.map((ticket) => {
            const assignee = getTicketAssigneeLabel(ticket);
            return (
            <Card
              key={ticket.id}
              className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
              onClick={() => goToConversation(ticket)}
            >
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Ticket className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{ticket.subject}</h3>
                        <Badge variant={priorityVariant[ticket.priority]}>{ticket.priority}</Badge>
                        <Badge variant={statusBadge[ticket.status] || 'default'}>
                          {t(`common.status.${ticket.status}`, { defaultValue: ticket.status })}
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
                          <span className="text-xs text-slate-500">{t('tickets.department', { name: ticket.department.name })}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(ticket.created_at).toLocaleString(locale)}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:shrink-0" onClick={(e) => e.stopPropagation()}>
                    {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                      <TransferTicketControl ticket={ticket} compact />
                    )}
                    <div className="flex flex-wrap gap-2">
                    {ticket.status === 'open' && (
                      <Button size="sm" onClick={() => claimMutation.mutate(ticket)} disabled={claimMutation.isPending}>
                        <UserCheck className="h-4 w-4" />
                        {t('tickets.claim')}
                      </Button>
                    )}
                    {ticket.status === 'in_progress' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => goToConversation(ticket)}
                        >
                          <MessageSquare className="h-4 w-4" />
                          {t('tickets.goToChat')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => resolveMutation.mutate(ticket.id)}
                          disabled={resolveMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {t('tickets.markResolved')}
                        </Button>
                      </>
                    )}
                    {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                      <Button size="sm" variant="outline" onClick={() => goToConversation(ticket)}>
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

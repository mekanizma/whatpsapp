/**
 * Tickets / live support page
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Ticket, Clock, UserCheck, MessageSquare, CheckCircle2 } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, Badge, Spinner, Button } from '@/components/ui';
import type { Ticket as TicketType } from '@/types';

const priorityVariant: Record<string, 'default' | 'info' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const statusLabels: Record<string, string> = {
  open: 'Açık',
  in_progress: 'İşlemde',
  resolved: 'Çözüldü',
  closed: 'Kapalı',
};

const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'default',
};

export function TicketsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => api.get<TicketType[]>('/tickets'),
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

  const openCount = tickets?.filter((t) => t.status === 'open').length ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Destek Talepleri"
        description="Müşterilerden personele aktarılan canlı destek istekleri"
        action={openCount > 0 ? <Badge variant="warning">{openCount} bekleyen</Badge> : undefined}
      />

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : tickets?.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="Açık destek talebi yok"
          description="Müşteriler insan temsilcisi istediğinde talepler burada listelenir"
        />
      ) : (
        <div className="space-y-3">
          {tickets?.map((ticket) => (
            <Card key={ticket.id} className="overflow-hidden">
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
                          {statusLabels[ticket.status] || ticket.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-600">
                        {ticket.customer_name || ticket.customer_phone}
                      </p>
                      {ticket.staff && (
                        <p className="text-xs text-slate-400">Atanan: {ticket.staff.name}</p>
                      )}
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(ticket.created_at).toLocaleString('tr-TR')}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:shrink-0">
                    {ticket.status === 'open' && (
                      <Button size="sm" onClick={() => claimMutation.mutate(ticket)} disabled={claimMutation.isPending}>
                        <UserCheck className="h-4 w-4" />
                        Bana Ata
                      </Button>
                    )}
                    {ticket.status === 'in_progress' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/panel/messages?phone=${encodeURIComponent(ticket.customer_phone)}&ticket=${ticket.id}`)}
                        >
                          <MessageSquare className="h-4 w-4" />
                          Sohbete Git
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => resolveMutation.mutate(ticket.id)}
                          disabled={resolveMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Çözüldü
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Super admin — platform destek talepleri (tüm firmalar)
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Headphones, Search, Building2, ArrowRight, Send, CheckCircle2, X,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import {
  Button, Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle,
  Spinner, Badge,
} from '@/components/ui';
import type { PlatformSupportTicket, PlatformStats } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved', 'closed'] as const;
const priorityVariant: Record<string, 'default' | 'info' | 'warning' | 'danger'> = {
  low: 'default', medium: 'info', high: 'warning', urgent: 'danger',
};
const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info', in_progress: 'warning', resolved: 'success', closed: 'default',
};

function MessageThread({ ticket, locale }: { ticket: PlatformSupportTicket; locale: string }) {
  return (
    <div className="space-y-3">
      {(ticket.messages || []).map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            msg.sender_type === 'admin'
              ? 'ml-0 mr-4 border border-teal-100 bg-teal-50/80 sm:ml-8'
              : 'mr-0 ml-4 border border-slate-100 bg-slate-50 sm:mr-8'
          )}
        >
          <p className="mb-1 text-xs font-semibold text-slate-500">
            {msg.sender_name}
            <span className="mx-1.5 font-normal">·</span>
            {new Date(msg.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{msg.message}</p>
        </div>
      ))}
    </div>
  );
}

export function AdminSupportTicketsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<PlatformStats>('/admin/stats'),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-support-tickets', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return api.getWithMeta<PlatformSupportTicket[]>(`/admin/support-tickets${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 30_000,
  });

  const tickets = data?.data || [];
  const selected = tickets.find((tk) => tk.id === selectedId) || null;

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<PlatformSupportTicket>(`/admin/support-tickets/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      api.post<PlatformSupportTicket>(`/admin/support-tickets/${id}/messages`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      setReply('');
    },
  });

  const openCount = stats?.platform_support_open ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.supportTickets.title')}
        description={t('admin.supportTickets.description')}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          title={t('admin.supportTickets.stats.open')}
          value={openCount}
          icon={Headphones}
          color="text-rose-600"
          bgColor="bg-rose-50"
        />
        <StatCard
          title={t('admin.supportTickets.stats.total')}
          value={tickets.length}
          icon={Headphones}
          color="text-slate-600"
          bgColor="bg-slate-50"
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.supportTickets.search')}
          className="pl-9"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition',
              statusFilter === f ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {t(`admin.supportTickets.filters.${f}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className={cn('space-y-2 lg:col-span-2', selected && 'hidden lg:block')}>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
          ) : isError ? (
            <Card><CardContent className="py-8 text-center text-sm text-rose-600">{t('admin.supportTickets.loadError')}</CardContent></Card>
          ) : tickets.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-slate-500">{t('admin.supportTickets.empty')}</CardContent></Card>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                onClick={() => setSelectedId(ticket.id)}
                className={cn(
                  'w-full rounded-xl border p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/30',
                  selectedId === ticket.id ? 'border-teal-300 bg-teal-50/50 ring-1 ring-teal-200' : 'border-slate-100 bg-white'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 font-medium text-slate-900">{ticket.subject}</p>
                  <Badge variant={statusBadge[ticket.status] || 'default'} className="shrink-0">
                    {t(`admin.supportTickets.status.${ticket.status}`, { defaultValue: ticket.status })}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />
                  {ticket.company_name || ticket.company_id.slice(0, 8)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant={priorityVariant[ticket.priority] || 'default'}>
                    {t(`admin.supportTickets.priority.${ticket.priority}`, { defaultValue: ticket.priority })}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {new Date(ticket.created_at).toLocaleDateString(locale)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className={cn('lg:col-span-3', !selected && 'hidden lg:block')}>
          {!selected ? (
            <Card className="hidden lg:flex lg:min-h-[320px] lg:items-center lg:justify-center">
              <CardContent className="text-center text-slate-500">
                <Headphones className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                {t('admin.supportTickets.selectHint')}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base leading-snug">{selected.subject}</CardTitle>
                    <Link
                      to={`/admin/companies/${selected.company_id}`}
                      className="mt-1 inline-flex items-center gap-1 text-sm text-teal-600 hover:underline"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {selected.company_name}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusBadge[selected.status] || 'default'}>
                    {t(`admin.supportTickets.status.${selected.status}`)}
                  </Badge>
                  <Badge variant="info">
                    {t(`admin.supportTickets.category.${selected.category}`, { defaultValue: selected.category })}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {selected.created_by_name} · {new Date(selected.created_at).toLocaleString(locale)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status !== 'resolved' && selected.status !== 'closed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: selected.id, status: 'resolved' })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t('admin.supportTickets.resolve')}
                    </Button>
                  )}
                  {selected.status !== 'closed' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: selected.id, status: 'closed' })}
                    >
                      {t('admin.supportTickets.close')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <MessageThread ticket={selected} locale={locale} />

                {selected.status !== 'closed' && selected.status !== 'resolved' && (
                  <form
                    className="space-y-3 border-t border-slate-100 pt-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!reply.trim()) return;
                      replyMutation.mutate({ id: selected.id, message: reply.trim() });
                    }}
                  >
                    <Label htmlFor="admin-support-reply">{t('admin.supportTickets.replyLabel')}</Label>
                    <Textarea
                      id="admin-support-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t('admin.supportTickets.replyPlaceholder')}
                      rows={3}
                      className="min-h-[80px]"
                    />
                    <Button type="submit" disabled={replyMutation.isPending || !reply.trim()} className="w-full sm:w-auto">
                      {replyMutation.isPending ? <Spinner /> : <><Send className="h-4 w-4" /> {t('admin.supportTickets.sendReply')}</>}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

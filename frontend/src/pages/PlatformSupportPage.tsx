/**
 * Müşteri paneli — platform destek talepleri
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Headphones, Plus, Send, ArrowLeft, MessageSquare } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import {
  Button, Input, Label, Textarea, Card, CardContent,
  Spinner, Badge,
} from '@/components/ui';
import type { PlatformSupportTicket } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORIES = ['general', 'billing', 'technical', 'whatsapp', 'account'] as const;
const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'default'> = {
  open: 'info', in_progress: 'warning', resolved: 'success', closed: 'default',
};

function MessageThread({
  ticket,
  locale,
  t,
}: {
  ticket: PlatformSupportTicket;
  locale: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-3">
      {(ticket.messages || []).map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'rounded-xl px-4 py-3 text-sm',
            msg.sender_type === 'admin'
              ? 'border border-teal-100 bg-teal-50/80'
              : 'ml-4 border border-slate-100 bg-slate-50 sm:ml-8'
          )}
        >
          <p className="mb-1 text-xs font-semibold text-slate-500">
            {msg.sender_type === 'admin' ? t('platformSupport.platformTeam') : msg.sender_name}
            <span className="mx-1.5 font-normal">·</span>
            {new Date(msg.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{msg.message}</p>
        </div>
      ))}
    </div>
  );
}

export function PlatformSupportPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [form, setForm] = useState({ subject: '', message: '', category: 'general' as string });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['platform-support-tickets'],
    queryFn: () => api.get<PlatformSupportTicket[]>('/platform-support/tickets'),
    refetchInterval: 30_000,
  });

  const list = tickets || [];
  const selected = list.find((tk) => tk.id === selectedId) || null;
  const openCount = list.filter((tk) => tk.status === 'open' || tk.status === 'in_progress').length;

  const createMutation = useMutation({
    mutationFn: (body: { subject: string; message: string; category: string }) =>
      api.post<PlatformSupportTicket>('/platform-support/tickets', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] });
      setForm({ subject: '', message: '', category: 'general' });
      setFormError(null);
      setSelectedId(data.id);
      setView('detail');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      api.post<PlatformSupportTicket>(`/platform-support/tickets/${id}/messages`, { message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] });
      setReply('');
    },
  });

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setView('list')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader title={t('platformSupport.newTicket')} description={t('platformSupport.newTicketDesc')} />
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.subject.trim() || !form.message.trim()) {
                  setFormError(t('platformSupport.formError'));
                  return;
                }
                createMutation.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label>{t('platformSupport.subject')}</Label>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder={t('platformSupport.subjectPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('platformSupport.category')}</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{t(`platformSupport.categories.${cat}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t('platformSupport.message')}</Label>
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder={t('platformSupport.messagePlaceholder')}
                  rows={5}
                  className="min-h-[120px]"
                />
              </div>
              {formError && <p className="text-sm text-rose-600">{formError}</p>}
              <Button type="submit" disabled={createMutation.isPending} className="w-full min-h-[44px] sm:w-auto">
                {createMutation.isPending ? <Spinner /> : <><Send className="h-4 w-4" /> {t('platformSupport.submit')}</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'detail' && selected) {
    const canReply = selected.status !== 'closed' && selected.status !== 'resolved';

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setView('list'); setSelectedId(null); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <PageHeader title={selected.subject} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={statusBadge[selected.status] || 'default'}>
            {t(`platformSupport.status.${selected.status}`)}
          </Badge>
          <Badge variant="info">{t(`platformSupport.categories.${selected.category}`)}</Badge>
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <MessageThread ticket={selected} locale={locale} t={t} />

            {canReply ? (
              <form
                className="space-y-3 border-t border-slate-100 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reply.trim()) return;
                  replyMutation.mutate({ id: selected.id, message: reply.trim() });
                }}
              >
                <Label htmlFor="customer-reply">{t('platformSupport.addMessage')}</Label>
                <Textarea
                  id="customer-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={t('platformSupport.replyPlaceholder')}
                  rows={3}
                />
                <Button type="submit" disabled={replyMutation.isPending || !reply.trim()} className="w-full min-h-[44px] sm:w-auto">
                  {replyMutation.isPending ? <Spinner /> : <><Send className="h-4 w-4" /> {t('platformSupport.send')}</>}
                </Button>
              </form>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {t('platformSupport.closedHint')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('platformSupport.title')}
        description={t('platformSupport.description')}
        action={
          <Button onClick={() => setView('create')} className="w-full min-h-[44px] sm:w-auto">
            <Plus className="h-4 w-4" />
            {t('platformSupport.newTicket')}
          </Button>
        }
      />

      {openCount > 0 && (
        <Badge variant="warning">{t('platformSupport.openCount', { count: openCount })}</Badge>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : list.length === 0 ? (
        <>
        <EmptyState
          icon={Headphones}
          title={t('platformSupport.empty')}
          description={t('platformSupport.emptyDesc')}
        />
        <div className="flex justify-center">
          <Button onClick={() => setView('create')}>
            <Plus className="h-4 w-4" />
            {t('platformSupport.newTicket')}
          </Button>
        </div>
        </>
      ) : (
        <div className="space-y-2">
          {list.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => { setSelectedId(ticket.id); setView('detail'); }}
              className="w-full rounded-xl border border-slate-100 bg-white p-4 text-left transition hover:border-teal-200 hover:bg-teal-50/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{ticket.subject}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {t(`platformSupport.categories.${ticket.category}`)} ·{' '}
                    {new Date(ticket.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <Badge variant={statusBadge[ticket.status] || 'default'} className="shrink-0">
                  {t(`platformSupport.status.${ticket.status}`)}
                </Badge>
              </div>
              {(ticket.message_count ?? ticket.messages?.length ?? 0) > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t('platformSupport.messageCount', { count: ticket.message_count ?? ticket.messages?.length ?? 0 })}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

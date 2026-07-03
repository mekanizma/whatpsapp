/**
 * Messages page — professional chat interface
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Search, Phone, Bot, User, CheckCircle2, Headphones, MessageSquare, ChevronLeft } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Input, Spinner, Badge } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { TransferTicketControl } from '@/components/TransferTicketControl';
import { cn } from '@/lib/utils';
import type { Conversation, Message, Ticket } from '@/types';

export function MessagesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [searchParams, setSearchParams] = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const ticketParam = searchParams.get('ticket');

  const [selectedPhone, setSelectedPhone] = useState<string | null>(phoneParam);
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phoneParam) setSelectedPhone(phoneParam);
  }, [phoneParam]);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages'),
    refetchInterval: 10000,
  });

  const encodedPhone = selectedPhone ? encodeURIComponent(selectedPhone) : '';

  const { data: messages } = useQuery({
    queryKey: ['messages', selectedPhone],
    queryFn: () => api.get<Message[]>(`/messages/${encodedPhone}`),
    enabled: !!selectedPhone,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!messages?.length || !selectedPhone) return;
    messagesEndRef.current?.scrollIntoView({ behavior: ticketParam ? 'smooth' : 'auto' });
  }, [messages, selectedPhone, ticketParam]);

  const { data: activeTicket } = useQuery({
    queryKey: ['active-ticket', selectedPhone],
    queryFn: () => api.get<Ticket | null>(`/tickets/active/${encodedPhone}`),
    enabled: !!selectedPhone,
    refetchInterval: 5000,
  });

  const replyMutation = useMutation({
    mutationFn: (text: string) => api.post(`/messages/${encodedPhone}/reply`, { message: text }),
    onSuccess: () => {
      setReplyText('');
      setReplyError(null);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: Error) => {
      setReplyError(err.message || t('messages.sendFailed'));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (ticketId: string) => api.put(`/tickets/${ticketId}`, { status: 'resolved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSearchParams({});
    },
  });

  const filtered = conversations?.filter((c) =>
    c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_phone.includes(search)
  );

  const selectedConv = conversations?.find((c) => c.customer_phone === selectedPhone);
  const ticketId = activeTicket?.id || ticketParam;
  const hasActiveTicket = !!activeTicket;

  const selectConversation = (phone: string) => {
    setSelectedPhone(phone);
    setSearchParams({ phone });
  };

  const bubbleStyles = {
    customer: 'bg-white text-slate-800 rounded-tl-sm shadow-sm ring-1 ring-slate-200/60',
    ai: 'bg-gradient-to-br from-teal-50 to-emerald-50 text-slate-800 rounded-tr-sm ring-1 ring-teal-100',
    staff: 'bg-primary text-white rounded-tr-sm shadow-md shadow-primary/20',
  };

  const senderLabel = (type: string) => {
    if (type === 'customer') return t('messages.customer');
    if (type === 'ai') return t('messages.ai');
    return t('messages.agent');
  };

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] w-full max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-card)]">
      <div className={cn('flex w-full min-w-0 flex-col border-r border-slate-100 bg-slate-50/50 md:w-80 lg:w-[22rem]', selectedPhone && 'hidden md:flex')}>
        <div className="border-b border-slate-100 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('messages.title')}</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="border-slate-200 bg-slate-50 pl-9" placeholder={t('messages.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {isLoading ? (
            <div className="flex justify-center p-8"><Spinner /></div>
          ) : filtered?.length === 0 ? (
            <EmptyState icon={MessageSquare} title={t('messages.empty')} description={t('messages.emptyDesc')} className="m-2 border-none bg-transparent" />
          ) : (
            filtered?.map((conv) => (
              <button
                key={conv.customer_phone}
                onClick={() => selectConversation(conv.customer_phone)}
                className={cn(
                  'mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                  selectedPhone === conv.customer_phone
                    ? 'bg-white shadow-sm ring-1 ring-primary/20'
                    : 'hover:bg-white/80'
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-accent/15 text-primary ring-1 ring-primary/10">
                  <span className="text-sm font-bold">{(conv.customer_name || conv.customer_phone).charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{conv.customer_name || conv.customer_phone}</p>
                    {conv.unread_count > 0 && <Badge variant="success">{conv.unread_count}</Badge>}
                  </div>
                  <p className="truncate text-xs text-slate-500">{conv.last_message}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col', !selectedPhone && 'hidden md:flex')}>
        {selectedPhone ? (
          <>
            <div className="border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 md:hidden"
                  onClick={() => { setSelectedPhone(null); setSearchParams({}); }}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{selectedConv?.customer_name || selectedPhone}</p>
                  <p className="text-xs text-slate-500">{selectedPhone}</p>
                </div>
                {hasActiveTicket && ticketId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => resolveMutation.mutate(ticketId)}
                    disabled={resolveMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('messages.resolved')}</span>
                  </Button>
                )}
              </div>
              {hasActiveTicket && activeTicket && (
                <div className="border-t border-amber-100 bg-amber-50/80 px-4 py-3 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-amber-900">
                    <Headphones className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="truncate font-medium">{activeTicket.subject}</span>
                    {activeTicket.department?.name && (
                      <span className="hidden truncate text-amber-700/80 sm:inline">
                        · {activeTicket.department.name}
                      </span>
                    )}
                    <Badge variant="warning" className="ml-auto shrink-0">{t('messages.liveSupport')}</Badge>
                  </div>
                  <TransferTicketControl
                    ticket={activeTicket}
                    compact
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
                      setSearchParams({ phone: selectedPhone! });
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-chat-bg p-4 space-y-3 scrollbar-thin">
              {messages?.map((msg) => (
                <div key={msg.id} className={cn('flex', msg.sender_type === 'customer' ? 'justify-start' : 'justify-end')}>
                  <div className={cn('max-w-[82%] rounded-2xl px-4 py-2.5', bubbleStyles[msg.sender_type] || bubbleStyles.ai)}>
                    <div className="mb-1 flex items-center gap-1.5">
                      {msg.sender_type === 'ai' && <Bot className="h-3 w-3 text-violet-500" />}
                      {msg.sender_type === 'staff' && <User className="h-3 w-3 text-white/80" />}
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide', msg.sender_type === 'staff' ? 'text-white/70' : 'text-slate-400')}>
                        {senderLabel(msg.sender_type)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                    <p className={cn('mt-1.5 text-[10px] text-right', msg.sender_type === 'staff' ? 'text-white/60' : 'text-slate-400')}>
                      {new Date(msg.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 bg-white p-4">
              {replyError && (
                <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-100">
                  {replyError}
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder={hasActiveTicket ? t('messages.replyPlaceholder') : t('messages.messagePlaceholder')}
                  value={replyText}
                  onChange={(e) => {
                    setReplyText(e.target.value);
                    if (replyError) setReplyError(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && replyText.trim() && replyMutation.mutate(replyText)}
                />
                <Button size="icon" className="shrink-0 rounded-xl" disabled={!replyText.trim() || replyMutation.isPending} onClick={() => replyMutation.mutate(replyText)}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/30 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
              <MessageSquare className="h-8 w-8 text-slate-300" />
            </div>
            <p className="mt-4 font-medium text-slate-600">{t('messages.selectChat')}</p>
            <p className="mt-1 text-sm text-slate-400">{t('messages.selectChatDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Messages page — professional chat interface
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Search, Phone, Bot, User, CheckCircle2, Headphones, MessageSquare, ChevronLeft, ImagePlus } from 'lucide-react';
import { api } from '@/services/api';
import { supabase, supabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Spinner, Badge } from '@/components/ui';
import { EmptyState } from '@/components/EmptyState';
import { TransferTicketControl } from '@/components/TransferTicketControl';
import { getTicketAssigneeLabel } from '@/lib/ticket-assignee';
import { getTicketSubjectLabel } from '@/lib/ticket-labels';
import { MessageImage } from '@/components/MessageImage';
import { cn } from '@/lib/utils';
import type { Conversation, Message, Ticket } from '@/types';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SUPPORT_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

function channelBadgeLabel(channel: string, t: (key: string) => string): string {
  if (channel === 'facebook_messenger') return t('meta.channelMessenger');
  if (channel === 'instagram_dm') return t('meta.channelInstagram');
  return t('meta.channelWhatsapp');
}

function formatCustomerLabel(phone: string, t: (key: string) => string): string {
  if (phone.startsWith('fb:')) return `${t('meta.channelMessenger')} ${phone.slice(3)}`;
  if (phone.startsWith('ig:')) return `${t('meta.channelInstagram')} ${phone.slice(3)}`;
  return phone;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatChatDayLabel(
  iso: string,
  locale: string,
  t: (key: string) => string
): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfMsg.getTime()) / 86_400_000);

  if (diffDays === 0) return t('messages.dateToday');
  if (diffDays === 1) return t('messages.dateYesterday');

  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatMessageTimestamp(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessagesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const [searchParams, setSearchParams] = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const ticketParam = searchParams.get('ticket');
  const companyId = useAuthStore((s) => s.company?.id);
  const userRole = useAuthStore((s) => s.user?.role);
  const isImpersonating = useAuthStore((s) => s.isImpersonating);
  const isStaff = userRole === 'staff';
  const canSeeKbSources =
    userRole === 'company_admin' || (userRole === 'super_admin' && isImpersonating);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(phoneParam);
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phoneParam) setSelectedPhone(phoneParam);
  }, [phoneParam]);

  const invalidateMessageQueries = useCallback(
    (phone?: string | null) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (phone) {
        queryClient.invalidateQueries({ queryKey: ['messages', phone] });
        queryClient.invalidateQueries({ queryKey: ['active-ticket', phone] });
      }
    },
    [queryClient]
  );

  useEffect(() => {
    if (!supabaseConfigured || !companyId) return;

    const channel = supabase
      .channel(`messages-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as { customer_phone?: string };
          invalidateMessageQueries(row.customer_phone || selectedPhone);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as { customer_phone?: string };
          invalidateMessageQueries(row.customer_phone || selectedPhone);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, selectedPhone, invalidateMessageQueries]);

  const { data: conversations, isLoading, isFetched: conversationsFetched } = useQuery({
    queryKey: ['conversations', userRole],
    queryFn: () => api.get<Conversation[]>('/messages'),
    refetchInterval: supabaseConfigured ? false : 10000,
  });

  // Personel yalnızca kendisine atanan konuşmaları görebilir; yetkisiz deep-link'i kapat
  // ticketParam varken claim/navigasyon sonrası liste henüz güncellenmemiş olabilir
  useEffect(() => {
    if (!isStaff || !selectedPhone || !conversationsFetched || isLoading || ticketParam) return;
    const allowed = conversations?.some((c) => c.customer_phone === selectedPhone);
    if (!allowed) {
      setSelectedPhone(null);
      setSearchParams({});
    }
  }, [isStaff, selectedPhone, conversations, conversationsFetched, isLoading, ticketParam, setSearchParams]);

  const encodedPhone = selectedPhone ? encodeURIComponent(selectedPhone) : '';

  const { data: messages } = useQuery({
    queryKey: ['messages', selectedPhone],
    queryFn: () => api.get<Message[]>(`/messages/${encodedPhone}`),
    enabled: !!selectedPhone,
    refetchInterval: supabaseConfigured ? false : 5000,
  });

  useEffect(() => {
    if (!messages?.length || !selectedPhone) return;
    messagesEndRef.current?.scrollIntoView({ behavior: ticketParam ? 'smooth' : 'auto' });
  }, [messages, selectedPhone, ticketParam]);

  const { data: activeTicket } = useQuery({
    queryKey: ['active-ticket', selectedPhone],
    queryFn: () => api.get<Ticket | null>(`/tickets/active/${encodedPhone}`),
    enabled: !!selectedPhone,
    refetchInterval: supabaseConfigured ? false : 5000,
  });

  // 24 saat penceresi dolunca UI'yi güncelle (müşteri yeni mesaj atınca sorgu zaten yenilenir)
  useEffect(() => {
    if (!selectedPhone || !activeTicket) return;

    const closesAt =
      activeTicket.reply_window_closes_at ||
      (activeTicket.last_customer_message_at
        ? new Date(
            new Date(activeTicket.last_customer_message_at).getTime() + SUPPORT_REPLY_WINDOW_MS
          ).toISOString()
        : null);

    if (!closesAt) return;

    const msLeft = new Date(closesAt).getTime() - Date.now();
    if (msLeft <= 0) {
      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
      return;
    }

    const timer = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
    }, Math.min(msLeft + 250, 2_147_000_000));

    return () => window.clearTimeout(timer);
  }, [selectedPhone, activeTicket, queryClient]);

  const replyMutation = useMutation({
    mutationFn: (text: string) => api.post(`/messages/${encodedPhone}/reply`, { message: text }),
    onSuccess: () => {
      setReplyText('');
      setReplyError(null);
      invalidateMessageQueries(selectedPhone);
    },
    onError: (err: Error) => {
      setReplyError(err.message || t('messages.sendFailed'));
    },
  });

  const imageMutation = useMutation({
    mutationFn: (file: File) =>
      api.upload<Message>(`/messages/${encodedPhone}/reply-image`, file, {
        caption: replyText.trim(),
      }),
    onSuccess: () => {
      setReplyText('');
      setReplyError(null);
      invalidateMessageQueries(selectedPhone);
    },
    onError: (err: Error) => {
      setReplyError(err.message || t('messages.imageSendFailed'));
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (ticketId: string) => api.put(`/tickets/${ticketId}`, { status: 'resolved' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSearchParams({});
      if (isStaff) setSelectedPhone(null);
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
      setReplyError(t('messages.imageTypeError'));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setReplyError(t('messages.imageSizeError'));
      return;
    }

    setReplyError(null);
    imageMutation.mutate(file);
  };

  const filtered = conversations?.filter((c) =>
    c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_phone.includes(search)
  );

  const selectedConv = conversations?.find((c) => c.customer_phone === selectedPhone);
  const ticketId = activeTicket?.id || ticketParam;
  const hasActiveTicket = !!activeTicket;
  const isSending = replyMutation.isPending || imageMutation.isPending;

  const lastCustomerMessageAt =
    activeTicket?.last_customer_message_at ||
    [...(messages || [])].reverse().find((m) => m.sender_type === 'customer')?.created_at ||
    null;

  const isReplyWindowClosed = (() => {
    if (!hasActiveTicket || !activeTicket) return false;
    if (typeof activeTicket.reply_window_open === 'boolean') {
      return !activeTicket.reply_window_open;
    }
    if (!lastCustomerMessageAt) return false;
    return Date.now() - new Date(lastCustomerMessageAt).getTime() >= SUPPORT_REPLY_WINDOW_MS;
  })();

  const selectConversation = (phone: string) => {
    setSelectedPhone(phone);
    setSearchParams({ phone });
  };

  const bubbleStyles = {
    customer: 'bg-white text-slate-800 rounded-tl-sm shadow-sm ring-1 ring-slate-200/60',
    ai: 'bg-gradient-to-br from-teal-50 to-emerald-50 text-slate-800 rounded-tr-sm ring-1 ring-teal-100',
    staff: 'bg-primary text-white rounded-tr-sm shadow-md shadow-primary/20',
  };

  const senderLabel = (msg: Message) => {
    if (msg.sender_type === 'customer') return t('messages.customer');
    if (msg.sender_type === 'ai') return t('messages.ai');
    return msg.sender_display_name || msg.staff?.name || msg.sender_name || t('messages.agent');
  };

  const hasImage = (msg: Message) =>
    !!msg.media_url && (msg.media_type?.startsWith('image/') ?? true);

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-card)]">
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
            <EmptyState
              icon={MessageSquare}
              title={t(isStaff ? 'messages.emptyAssigned' : 'messages.empty')}
              description={t(isStaff ? 'messages.emptyAssignedDesc' : 'messages.emptyDesc')}
              className="m-2 border-none bg-transparent"
            />
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
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{conv.customer_name || formatCustomerLabel(conv.customer_phone, t)}</p>
                      {conv.channel && conv.channel !== 'whatsapp' && (
                        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                          {channelBadgeLabel(conv.channel, t)}
                        </span>
                      )}
                    </div>
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
                  <p className="truncate font-semibold text-slate-900">{selectedConv?.customer_name || formatCustomerLabel(selectedPhone, t)}</p>
                  <p className="text-xs text-slate-500">
                    {selectedConv?.channel && selectedConv.channel !== 'whatsapp'
                      ? `${channelBadgeLabel(selectedConv.channel, t)} · `
                      : ''}
                    {formatCustomerLabel(selectedPhone, t)}
                  </p>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
                    <Headphones className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="truncate font-medium">{getTicketSubjectLabel(t, activeTicket.subject)}</span>
                    {activeTicket.department?.name && (
                      <span className="hidden truncate text-amber-700/80 sm:inline">
                        · {activeTicket.department.name}
                      </span>
                    )}
                    {(() => {
                      const assignee = activeTicket ? getTicketAssigneeLabel(activeTicket) : null;
                      if (!assignee) return null;
                      return (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          <User className="h-3 w-3" />
                          {assignee.isLast
                            ? t('tickets.lastAssigned', { name: assignee.name })
                            : t('tickets.assigned', { name: assignee.name })}
                        </span>
                      );
                    })()}
                    <Badge variant="warning" className="ml-auto shrink-0">{t('messages.liveSupport')}</Badge>
                  </div>
                  <TransferTicketControl
                    ticket={activeTicket}
                    compact
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['active-ticket', selectedPhone] });
                      queryClient.invalidateQueries({ queryKey: ['conversations'] });
                      if (isStaff) {
                        setSelectedPhone(null);
                        setSearchParams({});
                      } else {
                        setSearchParams({ phone: selectedPhone! });
                      }
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-chat-bg p-3 space-y-3 scrollbar-thin sm:p-4">
              {messages?.map((msg, index) => {
                const prev = index > 0 ? messages[index - 1] : null;
                const showDateSeparator = !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);

                return (
                  <div key={msg.id} className="space-y-3">
                    {showDateSeparator && (
                      <div className="flex justify-center py-1">
                        <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200/70">
                          {formatChatDayLabel(msg.created_at, locale, t)}
                        </span>
                      </div>
                    )}
                    <div className={cn('flex', msg.sender_type === 'customer' ? 'justify-start' : 'justify-end')}>
                      <div className={cn('max-w-[85%] rounded-2xl px-3 py-2.5 sm:max-w-[82%] sm:px-4', bubbleStyles[msg.sender_type] || bubbleStyles.ai)}>
                        <div className="mb-1 flex items-center gap-1.5">
                          {msg.sender_type === 'ai' && <Bot className="h-3 w-3 text-violet-500" />}
                          {msg.sender_type === 'staff' && <User className="h-3 w-3 text-white/80" />}
                          <span
                            className={cn(
                              'text-[10px] font-semibold',
                              msg.sender_type === 'staff'
                                ? 'text-white/90'
                                : 'uppercase tracking-wide text-slate-400'
                            )}
                          >
                            {senderLabel(msg)}
                          </span>
                        </div>

                        {hasImage(msg) && msg.media_url ? (
                          <MessageImage
                            messageId={msg.id}
                            mediaUrl={msg.media_url}
                            filename={msg.media_filename}
                            caption={msg.message || undefined}
                            isStaffBubble={msg.sender_type === 'staff'}
                          />
                        ) : (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                        )}

                        {canSeeKbSources &&
                          msg.sender_type === 'ai' &&
                          Array.isArray(msg.rag_sources) &&
                          msg.rag_sources.length > 0 && (
                            <div className="mt-2 space-y-0.5 border-t border-emerald-200/60 pt-1.5">
                              <p className="text-[10px] font-medium text-emerald-800/70">
                                {t('messages.kbSources')}
                              </p>
                              {msg.rag_sources.map((src, idx) => {
                                let label = t('messages.kbSourceTitle', { title: src.title });
                                if (src.line_start != null) {
                                  label = t('messages.kbSourceLine', {
                                    title: src.title,
                                    line: src.line_start,
                                  });
                                } else if (typeof src.chunk_index === 'number') {
                                  label = t('messages.kbSourceChunk', {
                                    title: src.title,
                                    chunk: src.chunk_index + 1,
                                  });
                                }
                                return (
                                  <p
                                    key={`${src.knowledge_base_id}-${src.chunk_index ?? 'x'}-${idx}`}
                                    className="text-[10px] leading-snug text-emerald-700/80 break-words"
                                  >
                                    {label}
                                  </p>
                                );
                              })}
                            </div>
                          )}

                        <p
                          className={cn(
                            'mt-1.5 text-[10px] text-right tabular-nums',
                            msg.sender_type === 'staff' ? 'text-white/60' : 'text-slate-400'
                          )}
                          title={formatMessageTimestamp(msg.created_at, locale)}
                        >
                          {formatMessageTimestamp(msg.created_at, locale)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-slate-100 bg-white p-3 sm:p-4">
              {isReplyWindowClosed ? (
                <div
                  role="status"
                  className="rounded-xl bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-200/80 sm:px-4"
                >
                  {t('messages.replyWindowClosed')}
                </div>
              ) : (
                <>
                  {replyError && (
                    <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-100">
                      {replyError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="shrink-0 rounded-xl"
                      disabled={isSending}
                      onClick={() => fileInputRef.current?.click()}
                      aria-label={t('messages.sendImage')}
                    >
                      <ImagePlus className="h-4 w-4" />
                    </Button>
                    <Input
                      className="min-w-0 flex-1"
                      placeholder={hasActiveTicket ? t('messages.replyPlaceholder') : t('messages.messagePlaceholder')}
                      value={replyText}
                      onChange={(e) => {
                        setReplyText(e.target.value);
                        if (replyError) setReplyError(null);
                      }}
                      onKeyDown={(e) =>
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        replyText.trim() &&
                        !isSending &&
                        replyMutation.mutate(replyText)
                      }
                    />
                    <Button
                      size="icon"
                      className="shrink-0 rounded-xl"
                      disabled={!replyText.trim() || isSending}
                      onClick={() => replyMutation.mutate(replyText)}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/30 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80">
              <MessageSquare className="h-8 w-8 text-slate-300" />
            </div>
            <p className="mt-4 font-medium text-slate-600">{t('messages.selectChat')}</p>
            <p className="mt-1 max-w-xs text-center text-sm text-slate-400">
              {t(isStaff ? 'messages.selectChatAssignedDesc' : 'messages.selectChatDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

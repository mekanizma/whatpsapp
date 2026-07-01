/**
 * Bilinmeyen sorular — AI'ın bilgi bankasında bulamadığı müşteri soruları
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  XCircle,
  BookPlus,
  Clock,
  User,
  Repeat,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, Badge, Spinner, Button } from '@/components/ui';
import type { UnknownQuestion } from '@/types';

type StatusFilter = 'all' | UnknownQuestion['status'];

const statusBadge: Record<UnknownQuestion['status'], 'info' | 'success' | 'default' | 'warning'> = {
  open: 'info',
  resolved: 'success',
  dismissed: 'default',
  added_to_kb: 'warning',
};

export function UnknownQuestionsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>('open');

  const queryKey = ['unknown-questions', filter];
  const endpoint = filter === 'all' ? '/unknown-questions' : `/unknown-questions?status=${filter}`;

  const { data: questions, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<UnknownQuestion[]>(endpoint),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UnknownQuestion['status'] }) =>
      api.patch<UnknownQuestion>(`/unknown-questions/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['unknown-questions'] }),
  });

  const openCount = questions?.filter((q) => q.status === 'open').length ?? 0;

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  const goToConversation = (phone: string) => {
    navigate(`/panel/messages?phone=${encodeURIComponent(phone)}`);
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'open', label: t('unknownQuestions.filters.open') },
    { key: 'all', label: t('unknownQuestions.filters.all') },
    { key: 'resolved', label: t('unknownQuestions.filters.resolved') },
    { key: 'added_to_kb', label: t('unknownQuestions.filters.addedToKb') },
    { key: 'dismissed', label: t('unknownQuestions.filters.dismissed') },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title={t('unknownQuestions.title')}
        description={t('unknownQuestions.description')}
        action={
          openCount > 0 ? (
            <Badge variant="warning">{t('unknownQuestions.pending', { count: openCount })}</Badge>
          ) : undefined
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
              filter === item.key
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : questions?.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title={t('unknownQuestions.empty')}
          description={t('unknownQuestions.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {questions?.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadge[item.status]}>
                        {t(`unknownQuestions.status.${item.status}`)}
                      </Badge>
                      {item.occurrence_count > 1 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200/60">
                          <Repeat className="h-3 w-3" />
                          {t('unknownQuestions.askedTimes', { count: item.occurrence_count })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold leading-relaxed text-slate-900 sm:text-base">
                      {item.question}
                    </p>
                    {item.ai_response && (
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                        {item.ai_response}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 sm:text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    {item.customer_name || item.customer_phone}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {formatDate(item.last_asked_at)}
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => goToConversation(item.customer_phone)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {t('unknownQuestions.goToChat')}
                  </Button>

                  {item.status === 'open' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => navigate('/panel/knowledge')}
                      >
                        <BookPlus className="h-4 w-4" />
                        {t('unknownQuestions.addToKb')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          updateMutation.mutate({ id: item.id, status: 'added_to_kb' })
                        }
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {t('unknownQuestions.markAddedToKb')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: item.id, status: 'resolved' })}
                      >
                        {t('unknownQuestions.markResolved')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-slate-500 sm:w-auto"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({ id: item.id, status: 'dismissed' })}
                      >
                        <XCircle className="h-4 w-4" />
                        {t('unknownQuestions.dismiss')}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

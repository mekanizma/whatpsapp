/**
 * Active customers list — last 30 days
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Phone, Clock, MessageSquare, Pencil, Check, X } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, Spinner, Button, Badge, Input } from '@/components/ui';
import type { Conversation } from '@/types';

export function CustomersPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const queryClient = useQueryClient();
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<Conversation[]>('/messages'),
    refetchInterval: 30000,
  });

  const renameMutation = useMutation({
    mutationFn: ({ phone, customer_name }: { phone: string; customer_name: string }) =>
      api.patch<{ customer_phone: string; customer_name: string }>(
        `/messages/${encodeURIComponent(phone)}/customer-name`,
        { customer_name }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setEditingPhone(null);
      setEditName('');
    },
  });

  const sorted = [...(conversations || [])].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );

  const startEdit = (customer: Conversation) => {
    setEditingPhone(customer.customer_phone);
    setEditName(customer.customer_name || '');
  };

  const cancelEdit = () => {
    setEditingPhone(null);
    setEditName('');
  };

  const saveEdit = (phone: string) => {
    const trimmed = editName.trim();
    if (!trimmed || renameMutation.isPending) return;
    renameMutation.mutate({ phone, customer_name: trimmed });
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
      />

      <div className="flex items-center gap-3 rounded-xl bg-cyan-50 px-4 py-3 ring-1 ring-cyan-100">
        <Users className="h-5 w-5 shrink-0 text-cyan-600" />
        <p className="text-sm font-medium text-cyan-900">
          {t('customers.count', { count: sorted.length })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('customers.empty')}
          description={t('customers.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => {
            const isEditing = editingPhone === c.customer_phone;

            return (
              <Card
                key={c.customer_phone}
                className="transition-all hover:border-primary/20 hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-4 sm:p-5">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t('customers.namePlaceholder')}
                            className="h-10"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(c.customer_phone);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(c.customer_phone)}
                              disabled={!editName.trim() || renameMutation.isPending}
                            >
                              {renameMutation.isPending ? <Spinner /> : <Check className="h-4 w-4" />}
                              {t('common.save')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit} disabled={renameMutation.isPending}>
                              <X className="h-4 w-4" />
                              {t('common.cancel')}
                            </Button>
                          </div>
                          {renameMutation.isError && editingPhone === c.customer_phone && (
                            <p className="text-sm text-red-600">{(renameMutation.error as Error).message}</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {c.customer_name || c.customer_phone}
                            </p>
                            {c.status === 'transferred' && (
                              <Badge variant="warning">{t('customers.transferred')}</Badge>
                            )}
                          </div>
                          <p className="flex items-center gap-1 text-xs text-slate-500">
                            <Phone className="h-3 w-3 shrink-0" />
                            {c.customer_phone}
                          </p>
                          <p className="line-clamp-2 text-sm text-slate-600">{c.last_message}</p>
                          <p className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3 shrink-0" />
                            {new Date(c.last_message_at).toLocaleString(locale)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <div className="flex shrink-0 items-start gap-2 sm:flex-col sm:items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sm:inline">{t('customers.editName')}</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="flex-1 sm:flex-none" asChild>
                        <Link to={`/panel/messages?phone=${encodeURIComponent(c.customer_phone)}`}>
                          <MessageSquare className="h-4 w-4" />
                          <span className="sm:inline">{t('customers.openChat')}</span>
                        </Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

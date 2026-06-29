/**
 * Super admin — platform aktivite logları
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { Button, Card, CardContent, Spinner, Badge } from '@/components/ui';
import type { ActivityLog } from '@/types';

const ACTION_LABELS: Record<string, string> = {
  company_created: 'Şirket oluşturuldu',
  company_updated: 'Şirket güncellendi',
  subscription_updated: 'Abonelik güncellendi',
  login: 'Giriş',
  message_sent: 'Mesaj gönderildi',
  ticket_created: 'Talep oluşturuldu',
  ticket_resolved: 'Talep çözüldü',
};

export function AdminActivityPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-activity', page],
    queryFn: () => api.getWithMeta<ActivityLog[]>(`/admin/activity?page=${page}`),
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivite Logları"
        description="Platform genelinde yapılan işlemlerin kaydı"
      />

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="h-8 w-8" /></div>
      ) : (
        <>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-slate-500">
                  Henüz aktivite kaydı yok
                </CardContent>
              </Card>
            ) : (
              logs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                        <Activity className="h-4 w-4 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">
                          {ACTION_LABELS[log.action] || log.action}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(log.created_at).toLocaleString('tr-TR')}
                          {log.entity_type && ` · ${log.entity_type}`}
                          {log.company_id && ` · ${log.company_id.slice(0, 8)}…`}
                        </p>
                      </div>
                    </div>
                    <Badge variant="info">{log.action}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Önceki
              </Button>
              <span className="text-sm text-slate-500">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

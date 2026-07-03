/**
 * Transfer an active support ticket to another department
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Label, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

interface Department {
  id: string;
  name: string;
  is_active: boolean;
}

interface TransferTicketControlProps {
  ticket: Pick<Ticket, 'id' | 'department_id' | 'status'>;
  onSuccess?: (ticket: Ticket) => void;
  className?: string;
  compact?: boolean;
}

export function TransferTicketControl({
  ticket,
  onSuccess,
  className,
  compact = false,
}: TransferTicketControlProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedDept, setSelectedDept] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canTransfer = ticket.status === 'open' || ticket.status === 'in_progress';

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
    enabled: canTransfer,
  });

  const targetDepartments = departments.filter((d) => d.id !== ticket.department_id);

  const transferMutation = useMutation({
    mutationFn: (departmentId: string) =>
      api.patch<Ticket>(`/tickets/${ticket.id}/transfer`, { department_id: departmentId }),
    onSuccess: (updated) => {
      setFeedback({ type: 'success', text: t('tickets.transferSuccess', { name: updated.department?.name || '' }) });
      setSelectedDept('');
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['active-ticket'] });
      onSuccess?.(updated);
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', text: err.message || t('tickets.transferFailed') });
    },
  });

  if (!canTransfer || (!isLoading && targetDepartments.length === 0)) {
    return null;
  }

  const handleTransfer = () => {
    if (!selectedDept) return;
    setFeedback(null);
    transferMutation.mutate(selectedDept);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {!compact && (
        <Label className="text-xs text-slate-600">{t('tickets.transferLabel')}</Label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selectedDept}
          onChange={(e) => {
            setSelectedDept(e.target.value);
            setFeedback(null);
          }}
          disabled={isLoading || transferMutation.isPending}
          className={cn(
            'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900',
            'focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50',
            compact ? 'sm:min-w-[140px] sm:flex-1' : 'sm:flex-1'
          )}
          aria-label={t('tickets.transferSelect')}
        >
          <option value="">{t('tickets.transferSelect')}</option>
          {targetDepartments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          disabled={!selectedDept || transferMutation.isPending || isLoading}
          onClick={handleTransfer}
        >
          {transferMutation.isPending ? (
            <Spinner />
          ) : (
            <ArrowRightLeft className="h-4 w-4" />
          )}
          {t('tickets.transfer')}
        </Button>
      </div>
      {feedback && (
        <p
          className={cn(
            'text-xs',
            feedback.type === 'success' ? 'text-emerald-700' : 'text-red-600'
          )}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
}

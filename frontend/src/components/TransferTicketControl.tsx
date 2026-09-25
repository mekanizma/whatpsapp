/**
 * Reassign an active support ticket to another department (open pool)
 * or directly to a specific staff member.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, UserPlus } from 'lucide-react';
import { api } from '@/services/api';
import { Button, Label, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Conversation, StaffMember, Ticket } from '@/types';

interface Department {
  id: string;
  name: string;
  is_active: boolean;
}

type AssignMode = 'department' | 'staff';

interface TransferTicketControlProps {
  ticket: Pick<Ticket, 'id' | 'department_id' | 'status' | 'customer_phone' | 'assigned_staff'>;
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
  const [mode, setMode] = useState<AssignMode>('department');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canReassign = ticket.status === 'open' || ticket.status === 'in_progress';

  const { data: departments = [], isLoading: deptLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get<Department[]>('/departments'),
    enabled: canReassign,
  });

  const { data: staffList = [], isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => api.get<StaffMember[]>('/staff'),
    enabled: canReassign,
  });

  const targetDepartments = departments.filter((d) => d.id !== ticket.department_id);
  const targetStaff = staffList.filter(
    (s) => s.is_active && s.id !== ticket.assigned_staff
  );

  const isLoading = deptLoading || staffLoading;
  const hasDeptTargets = targetDepartments.length > 0;
  const hasStaffTargets = targetStaff.length > 0;

  const clearConversationCache = (phone: string) => {
    queryClient.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
      old ? old.filter((c) => c.customer_phone !== phone) : old
    );
    queryClient.removeQueries({ queryKey: ['messages', phone] });
    queryClient.removeQueries({ queryKey: ['active-ticket', phone] });
  };

  const afterSuccess = (updated: Ticket, message: string) => {
    setFeedback({ type: 'success', text: message });
    setSelectedDept('');
    setSelectedStaff('');
    const phone = updated.customer_phone || ticket.customer_phone;
    if (phone) clearConversationCache(phone);
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['active-ticket'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    onSuccess?.(updated);
  };

  const transferMutation = useMutation({
    mutationFn: (departmentId: string) =>
      api.patch<Ticket>(`/tickets/${ticket.id}/transfer`, { department_id: departmentId }),
    onSuccess: (updated) => {
      afterSuccess(
        updated,
        t('tickets.transferSuccess', { name: updated.department?.name || '' })
      );
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', text: err.message || t('tickets.transferFailed') });
    },
  });

  const assignMutation = useMutation({
    mutationFn: (staffId: string) =>
      api.patch<Ticket>(`/tickets/${ticket.id}/assign`, { staff_id: staffId }),
    onSuccess: (updated) => {
      const name = updated.staff?.name || '';
      afterSuccess(updated, t('tickets.assignSuccess', { name }));
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', text: err.message || t('tickets.assignFailed') });
    },
  });

  const pending = transferMutation.isPending || assignMutation.isPending;

  // Hiç hedef yoksa gizle
  if (!canReassign || (!isLoading && !hasDeptTargets && !hasStaffTargets)) {
    return null;
  }

  const effectiveMode: AssignMode =
    mode === 'department' && !hasDeptTargets && hasStaffTargets
      ? 'staff'
      : mode === 'staff' && !hasStaffTargets && hasDeptTargets
        ? 'department'
        : mode;

  const handleSubmit = () => {
    setFeedback(null);
    if (effectiveMode === 'department') {
      if (!selectedDept) return;
      transferMutation.mutate(selectedDept);
      return;
    }
    if (!selectedStaff) return;
    assignMutation.mutate(selectedStaff);
  };

  const canSubmit =
    effectiveMode === 'department' ? !!selectedDept : !!selectedStaff;

  return (
    <div className={cn('space-y-2', className)}>
      {!compact && (
        <Label className="text-xs text-slate-600">{t('tickets.reassignLabel')}</Label>
      )}

      {hasDeptTargets && hasStaffTargets && (
        <div
          className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/90 p-1"
          role="tablist"
          aria-label={t('tickets.reassignMode')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === 'department'}
            disabled={pending}
            onClick={() => {
              setMode('department');
              setSelectedStaff('');
              setFeedback(null);
            }}
            className={cn(
              'min-h-[40px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:text-sm',
              effectiveMode === 'department'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {t('tickets.modeDepartment')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveMode === 'staff'}
            disabled={pending}
            onClick={() => {
              setMode('staff');
              setSelectedDept('');
              setFeedback(null);
            }}
            className={cn(
              'min-h-[40px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:text-sm',
              effectiveMode === 'staff'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {t('tickets.modeStaff')}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {effectiveMode === 'department' ? (
          <select
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setFeedback(null);
            }}
            disabled={isLoading || pending || !hasDeptTargets}
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
        ) : (
          <select
            value={selectedStaff}
            onChange={(e) => {
              setSelectedStaff(e.target.value);
              setFeedback(null);
            }}
            disabled={isLoading || pending || !hasStaffTargets}
            className={cn(
              'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900',
              'focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-50',
              compact ? 'sm:min-w-[140px] sm:flex-1' : 'sm:flex-1'
            )}
            aria-label={t('tickets.assignSelect')}
          >
            <option value="">{t('tickets.assignSelect')}</option>
            {targetStaff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.department?.name
                  ? `${member.name} · ${member.department.name}`
                  : member.name}
              </option>
            ))}
          </select>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          disabled={!canSubmit || pending || isLoading}
          onClick={handleSubmit}
        >
          {pending ? (
            <Spinner />
          ) : effectiveMode === 'staff' ? (
            <UserPlus className="h-4 w-4" />
          ) : (
            <ArrowRightLeft className="h-4 w-4" />
          )}
          {effectiveMode === 'staff' ? t('tickets.assign') : t('tickets.transfer')}
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

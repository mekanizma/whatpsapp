/**
 * Appointment calendar — WhatsApp AI bookings + manual entries
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, Phone, Bot, Pencil, Trash2, X,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import {
  Button, Input, Label, Textarea, Card, CardContent, Badge, Spinner,
} from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  shouldAskAppointmentProvider,
  getCalendarProviderLabelKey,
  resolveAppointmentDisplayTitle,
  isGenericAppointmentTitle,
} from '@/lib/appointment-category';
import type { Appointment } from '@/types';

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0).toISOString();
}

const statusBadge: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger'> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
  completed: 'default',
};

const sourceIcon = {
  ai: Bot,
  manual: CalendarDays,
  panel: CalendarDays,
} as const;

interface FormState {
  customer_phone: string;
  customer_name: string;
  title: string;
  preferred_doctor: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
  status: Appointment['status'];
}

function emptyForm(date: Date): FormState {
  const start = new Date(date);
  start.setHours(10, 0, 0, 0);
  const end = new Date(date);
  end.setHours(10, 30, 0, 0);
  return {
    customer_phone: '',
    customer_name: '',
    title: '',
    preferred_doctor: '',
    notes: '',
    date: toDateInputValue(date),
    startTime: toTimeInputValue(start),
    endTime: toTimeInputValue(end),
    status: 'confirmed',
  };
}

function formFromAppointment(a: Appointment): FormState {
  const start = new Date(a.starts_at);
  const end = new Date(a.ends_at);
  return {
    customer_phone: a.customer_phone,
    customer_name: a.customer_name || '',
    title: a.title,
    preferred_doctor: a.preferred_doctor || '',
    notes: a.notes || '',
    date: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endTime: toTimeInputValue(end),
    status: a.status,
  };
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'tr-TR';
  const weekdays = useMemo(
    () => t('calendar.weekdaysShort', { returnObjects: true }) as string[],
    [t, i18n.language],
  );
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const company = useAuthStore((s) => s.company);
  const isAdmin = user?.role === 'company_admin';
  const askProvider = shouldAskAppointmentProvider(company?.category);
  const providerLabelKey = getCalendarProviderLabelKey(company?.category);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Appointment | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(new Date()));
  const [formError, setFormError] = useState('');

  const rangeFrom = startOfMonth(viewMonth).toISOString();
  const rangeTo = endOfMonth(viewMonth).toISOString();

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: ['appointments-upcoming'],
    queryFn: () => api.get<Appointment[]>('/appointments?upcoming=true&days=90'),
    refetchInterval: 30000,
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments', rangeFrom, rangeTo],
    queryFn: () =>
      api.get<Appointment[]>(`/appointments?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`),
    refetchInterval: 30000,
  });

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments || []) {
      const key = toDateInputValue(new Date(a.starts_at));
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const selectedKey = toDateInputValue(selectedDate);
  const dayAppointments = appointmentsByDay.get(selectedKey) || [];
  const sortedDayAppointments = useMemo(
    () =>
      [...dayAppointments].sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      ),
    [dayAppointments],
  );

  const calendarCells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const startPad = (first.getDay() + 6) % 7;
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(d.getDate() - i - 1);
      cells.push({ date: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const d = new Date(cells[cells.length - 1].date);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [viewMonth]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editItem
        ? api.put<Appointment>(`/appointments/${editItem.id}`, payload)
        : api.post<Appointment>('/appointments', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      closeForm();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      closeForm();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put<Appointment>(`/appointments/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-upcoming'] });
    },
  });

  function closeForm() {
    setShowForm(false);
    setEditItem(null);
    setFormError('');
  }

  function openCreate() {
    setEditItem(null);
    setForm(emptyForm(selectedDate));
    setFormError('');
    setShowForm(true);
  }

  function openEdit(a: Appointment) {
    setEditItem(a);
    setForm(formFromAppointment(a));
    setFormError('');
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customer_phone.trim()) {
      setFormError(t('calendar.errors.phoneRequired'));
      return;
    }
    if (!form.customer_name.trim()) {
      setFormError(t('calendar.errors.nameRequired'));
      return;
    }
    if (!form.title.trim()) {
      setFormError(t('calendar.errors.titleRequired'));
      return;
    }
    const starts_at = buildIso(form.date, form.startTime);
    const ends_at = buildIso(form.date, form.endTime);
    if (new Date(ends_at) <= new Date(starts_at)) {
      setFormError(t('calendar.errors.invalidTime'));
      return;
    }
    saveMutation.mutate({
      customer_phone: form.customer_phone.trim(),
      customer_name: form.customer_name.trim() || null,
      title: form.title.trim() || t('calendar.defaultTitle'),
      preferred_doctor: form.preferred_doctor.trim() || null,
      notes: form.notes.trim() || null,
      starts_at,
      ends_at,
      status: form.status,
    });
  }

  const monthLabel = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const selectedLabel = selectedDate.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const monthCount = appointments?.length ?? 0;
  const isSelectedToday = sameDay(selectedDate, new Date());

  function goToToday() {
    const today = new Date();
    setViewMonth(startOfMonth(today));
    setSelectedDate(today);
  }

  return (
    <div className="cal-page">
      <PageHeader
        title={t('calendar.title')}
        description={t('calendar.description')}
        action={
          <Button size="sm" onClick={openCreate} className="shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">{t('calendar.newAppointment')}</span>
            <span className="xs:hidden">{t('calendar.new')}</span>
          </Button>
        }
      />

      {(upcomingLoading || (upcoming && upcoming.length > 0)) && (
        <section className="cal-upcoming" aria-label={t('calendar.upcoming')}>
          <div className="cal-upcoming-head">
            <div>
              <h3>{t('calendar.upcoming')}</h3>
              <p>{t('calendar.upcomingHint')}</p>
            </div>
          </div>
          {upcomingLoading ? (
            <div className="flex justify-center py-6"><Spinner className="h-6 w-6" /></div>
          ) : (
            <div className="cal-upcoming-track">
              {upcoming?.slice(0, 8).map((a) => {
                const start = new Date(a.starts_at);
                const end = new Date(a.ends_at);
                const displayTitle = resolveAppointmentDisplayTitle(a);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setViewMonth(startOfMonth(start));
                      setSelectedDate(start);
                    }}
                    className="cal-upcoming-card"
                  >
                    <div className="cal-upcoming-date">
                      <span className="day">{start.getDate()}</span>
                      <span className="mon">{start.toLocaleDateString(locale, { month: 'short' })}</span>
                    </div>
                    <div className="cal-upcoming-body">
                      <p className="title">{displayTitle}</p>
                      <p className="meta">
                        {a.customer_name || a.customer_phone}
                      </p>
                      <p className="meta">
                        {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {a.source === 'ai' && (
                        <span className="mt-1 w-fit">
                          <Badge variant="info">{t('calendar.sourceAi')}</Badge>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="cal-layout">
        <section className="cal-month" aria-label={monthLabel}>
          <div className="cal-month-toolbar">
            <div className="cal-month-nav">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                aria-label={t('calendar.prevMonth')}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h3 className="cal-month-label">{monthLabel}</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                aria-label={t('calendar.nextMonth')}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="cal-month-meta">
              <span className="cal-month-summary">
                {t('calendar.monthSummary', { count: monthCount })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={goToToday}
                aria-label={t('calendar.goToToday')}
              >
                {t('calendar.today')}
              </Button>
            </div>
          </div>

          <div className="cal-weekdays">
            {weekdays.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          <div className="cal-grid">
            {calendarCells.map(({ date, inMonth }) => {
              const key = toDateInputValue(date);
              const count = appointmentsByDay.get(key)?.length || 0;
              const isSelected = sameDay(date, selectedDate);
              const isToday = sameDay(date, new Date());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <button
                  key={key + String(inMonth)}
                  type="button"
                  onClick={() => {
                    setSelectedDate(date);
                    if (!inMonth) setViewMonth(startOfMonth(date));
                  }}
                  className={cn(
                    'cal-day',
                    !inMonth && 'is-out',
                    isWeekend && 'is-weekend',
                    isToday && 'is-today',
                    isSelected && 'is-selected',
                  )}
                >
                  <span className="cal-day-num">{date.getDate()}</span>
                  {count > 0 && (
                    count > 1 ? (
                      <span className="cal-day-count">{count}</span>
                    ) : (
                      <span className="cal-day-dots" aria-hidden>
                        <span className="cal-day-dot" />
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="cal-day-panel" aria-label={selectedLabel}>
          <div className="cal-day-panel-head">
            <div>
              <h3>{selectedLabel}</h3>
              <p className="sub">
                {isSelectedToday ? t('calendar.today') : t('calendar.daySchedule')}
              </p>
            </div>
            <Badge variant="info">{t('calendar.count', { count: dayAppointments.length })}</Badge>
          </div>

          <div className="cal-day-panel-body">
            {isLoading ? (
              <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
            ) : sortedDayAppointments.length === 0 ? (
              <div className="cal-empty">
                <EmptyState
                  icon={CalendarDays}
                  title={t('calendar.emptyDay')}
                  description={t('calendar.emptyDayDesc')}
                />
                <Button size="sm" className="w-full sm:w-auto" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  {t('calendar.newAppointment')}
                </Button>
              </div>
            ) : (
              sortedDayAppointments.map((a) => {
                const SourceIcon = sourceIcon[a.source] || CalendarDays;
                const start = new Date(a.starts_at);
                const end = new Date(a.ends_at);
                const displayTitle = resolveAppointmentDisplayTitle(a);
                const showNotes =
                  a.notes?.trim() &&
                  a.notes.trim() !== displayTitle &&
                  !isGenericAppointmentTitle(a.notes);
                return (
                  <article key={a.id} className="cal-appt">
                    <div className="cal-appt-time">
                      <div className="clock">
                        <SourceIcon className="h-4 w-4" />
                      </div>
                      <span className="range">
                        {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        <br />
                        {end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="cal-appt-main">
                      <div className="cal-appt-title-row">
                        <p className="title">{displayTitle}</p>
                        <Badge variant={statusBadge[a.status] || 'default'}>
                          {t(`calendar.status.${a.status}`, { defaultValue: a.status })}
                        </Badge>
                        {a.source === 'ai' && (
                          <Badge variant="info">{t('calendar.sourceAi')}</Badge>
                        )}
                      </div>
                      <p className="cal-appt-customer">
                        {a.customer_name || a.customer_phone}
                      </p>
                      <div className="cal-appt-meta">
                        <span>
                          <Clock className="h-3 w-3" />
                          {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                          {' – '}
                          {end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span>
                          <Phone className="h-3 w-3" />
                          {a.customer_phone}
                        </span>
                      </div>
                      {askProvider && a.preferred_doctor && (
                        <p className="text-xs font-medium text-sky-700">
                          {providerLabelKey ? t(providerLabelKey) : t('calendar.doctor')}: {a.preferred_doctor}
                        </p>
                      )}
                      {showNotes && <p className="cal-appt-note">{a.notes}</p>}
                      <div className="cal-appt-actions">
                        <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                          <Pencil className="h-3.5 w-3.5" />
                          {t('common.edit')}
                        </Button>
                        {a.status !== 'cancelled' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelMutation.mutate(a.id)}
                            disabled={cancelMutation.isPending}
                          >
                            {t('calendar.cancel')}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(a.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t('common.delete')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <Card className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-2xl">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  {editItem ? t('calendar.editAppointment') : t('calendar.newAppointment')}
                </h3>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label={t('common.cancel')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cal-phone">{t('calendar.phone')} *</Label>
                    <Input
                      id="cal-phone"
                      type="tel"
                      value={form.customer_phone}
                      onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                      placeholder="+905551234567"
                      required
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cal-name">{t('calendar.customerName')}</Label>
                    <Input
                      id="cal-name"
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cal-title">{t('calendar.appointmentTitle')} *</Label>
                    <Input
                      id="cal-title"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder={t('calendar.titlePlaceholder')}
                      required
                    />
                  </div>
                  {askProvider && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="cal-doctor">
                        {providerLabelKey ? t(providerLabelKey) : t('calendar.doctor')}
                      </Label>
                      <Input
                        id="cal-doctor"
                        value={form.preferred_doctor}
                        onChange={(e) => setForm({ ...form, preferred_doctor: e.target.value })}
                        placeholder={t('calendar.doctorPlaceholder')}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="cal-date">{t('calendar.date')}</Label>
                    <Input
                      id="cal-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cal-status">{t('calendar.statusLabel')}</Label>
                    <select
                      id="cal-status"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as Appointment['status'] })}
                      className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
                    >
                      {(['pending', 'confirmed', 'completed', 'cancelled'] as const).map((s) => (
                        <option key={s} value={s}>{t(`calendar.status.${s}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cal-start">{t('calendar.startTime')}</Label>
                    <Input
                      id="cal-start"
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cal-end">{t('calendar.endTime')}</Label>
                    <Input
                      id="cal-end"
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="cal-notes">{t('calendar.notes')}</Label>
                    <Textarea
                      id="cal-notes"
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>

                {formError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
                )}

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={closeForm}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Spinner /> : null}
                    {editItem ? t('common.save') : t('calendar.create')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

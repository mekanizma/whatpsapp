import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellRing, X } from 'lucide-react';
import {
  subscribePanelLiveAlerts,
  type PanelLiveAlert,
} from '@/lib/panel-live-alerts';
import { stopNotificationSound } from '@/lib/browser-notifications';
import { cn } from '@/lib/utils';

const MAX_VISIBLE = 4;
const AUTO_DISMISS_MS = 12_000;

export function PanelLiveAlertStack() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<PanelLiveAlert[]>([]);

  useEffect(() => {
    return subscribePanelLiveAlerts((alert) => {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, MAX_VISIBLE));
    });
  }, []);

  useEffect(() => {
    if (!alerts.length) return;
    const timers = alerts.map((alert) =>
      window.setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      }, AUTO_DISMISS_MS)
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [alerts]);

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const open = (alert: PanelLiveAlert) => {
    stopNotificationSound();
    dismiss(alert.id);
    if (alert.url) navigate(alert.url);
  };

  if (!alerts.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(100vw-2rem,22rem)] flex-col gap-2 sm:bottom-5 sm:right-5"
      aria-live="polite"
      aria-relevant="additions"
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-xl shadow-slate-900/15 backdrop-blur-md',
            'animate-chat-in'
          )}
          role="status"
        >
          <button
            type="button"
            className="flex w-full gap-3 p-3.5 text-left transition-colors hover:bg-slate-50/80"
            onClick={() => open(alert)}
          >
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{alert.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-600">{alert.body}</span>
              {(alert.department || alert.assignee) && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {alert.department && (
                    <span className="inline-flex max-w-full truncate rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200/70">
                      {t('browserNotifications.departmentLabel', { name: alert.department })}
                    </span>
                  )}
                  {alert.assignee && (
                    <span className="inline-flex max-w-full truncate rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 ring-1 ring-violet-200/70">
                      {t('browserNotifications.assigneeLabel', { name: alert.assignee })}
                    </span>
                  )}
                  {!alert.assignee && alert.kind === 'transfer' && (
                    <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200/70">
                      {t('browserNotifications.unassigned')}
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('common.close', { defaultValue: 'Kapat' })}
            onClick={(e) => {
              e.stopPropagation();
              dismiss(alert.id);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

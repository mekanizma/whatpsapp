import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  getBrowserNotificationsEnabled,
  isBrowserNotificationSupported,
  requestBrowserNotificationPermission,
  setBrowserNotificationsEnabled,
} from '@/lib/browser-notifications';
import { usePanelRealtimeNotifications } from '@/hooks/usePanelRealtimeNotifications';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import type { StaffMember } from '@/types';

interface PanelNotificationBellProps {
  companyId?: string;
}

export function PanelNotificationBell({ companyId }: PanelNotificationBellProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const supported = isBrowserNotificationSupported();
  const [enabled, setEnabled] = useState(() => getBrowserNotificationsEnabled());
  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied'
  );

  useEffect(() => {
    if (!supported || !companyId) return;
    setEnabled(getBrowserNotificationsEnabled());
    setPermission(Notification.permission);
  }, [supported, companyId]);

  useEffect(() => {
    if (!supported || !companyId) return;
    if (sessionStorage.getItem('wa_browser_notifications_prompted')) return;
    if (Notification.permission !== 'default') return;

    sessionStorage.setItem('wa_browser_notifications_prompted', '1');
    void (async () => {
      const nextPermission = await requestBrowserNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission === 'granted') {
        setBrowserNotificationsEnabled(true);
        setEnabled(true);
      }
    })();
  }, [companyId, supported]);

  const { data: staffId } = useQuery({
    queryKey: ['my-staff-id', companyId, user?.id],
    enabled: !!companyId && !!user && user.role === 'staff',
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const staff = await api.get<StaffMember[]>('/staff');
      return staff.find((member) => member.profile_id === user?.id)?.id ?? null;
    },
  });

  usePanelRealtimeNotifications({
    companyId,
    enabled: enabled && permission === 'granted',
    userRole: user?.role,
    staffId: staffId ?? null,
  });

  const handleToggle = useCallback(async () => {
    if (!supported) return;

    if (permission === 'granted' && enabled) {
      setBrowserNotificationsEnabled(false);
      setEnabled(false);
      return;
    }

    const nextPermission = await requestBrowserNotificationPermission();
    setPermission(nextPermission);

    if (nextPermission === 'granted') {
      setBrowserNotificationsEnabled(true);
      setEnabled(true);
      return;
    }

    setBrowserNotificationsEnabled(false);
    setEnabled(false);
  }, [enabled, permission, supported]);

  const title =
    !supported
      ? t('layout.browserNotificationsUnsupported')
      : permission === 'denied'
        ? t('layout.browserNotificationsDenied')
        : enabled
          ? t('layout.browserNotificationsOn')
          : t('layout.browserNotificationsOff');

  return (
    <button
      type="button"
      className={cn(
        'relative rounded-xl p-2 transition-colors',
        enabled ? 'text-primary hover:bg-primary/10' : 'text-slate-500 hover:bg-slate-100'
      )}
      aria-label={t('layout.notifications')}
      title={title}
      onClick={handleToggle}
      disabled={!supported}
    >
      {enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
      {enabled && (
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white"
          aria-hidden
        />
      )}
    </button>
  );
}

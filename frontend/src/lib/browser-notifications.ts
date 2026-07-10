const STORAGE_KEY = 'wa_browser_notifications';

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationsEnabled(): boolean {
  if (!isBrowserNotificationSupported()) return false;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'false') return false;
  if (stored === 'true') return Notification.permission === 'granted';
  return Notification.permission === 'granted';
}

export function setBrowserNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export interface BrowserNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export function showBrowserNotification(payload: BrowserNotificationPayload): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (!getBrowserNotificationsEnabled()) return;

  const notification = new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: '/waai-logo.png',
    badge: '/favicon.svg',
    silent: false,
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    if (payload.url) {
      window.location.assign(payload.url);
    }
    notification.close();
  };
}

const STORAGE_KEY = 'wa_browser_notifications';
const SOUND_PLAY_COUNT = 5;
const SOUND_GAP_MS = 520;

let audioCtx: AudioContext | null = null;
let soundTimer: number | null = null;
let remainingPlays = 0;
let audioUnlockBound = false;
let soundGeneration = 0;

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

function getNotificationAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

function playNotificationBeep(): void {
  const ctx = getNotificationAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1175, now + 0.09);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

export function stopNotificationSound(): void {
  soundGeneration += 1;
  remainingPlays = 0;
  if (soundTimer != null) {
    window.clearTimeout(soundTimer);
    soundTimer = null;
  }
}

function scheduleNextBeep(): void {
  if (remainingPlays <= 0) {
    stopNotificationSound();
    return;
  }
  playNotificationBeep();
  remainingPlays -= 1;
  if (remainingPlays > 0) {
    soundTimer = window.setTimeout(scheduleNextBeep, SOUND_GAP_MS);
  } else {
    soundTimer = null;
  }
}

export function startNotificationSound(): void {
  stopNotificationSound();
  remainingPlays = SOUND_PLAY_COUNT;
  const gen = soundGeneration;
  const ctx = getNotificationAudioContext();
  if (!ctx) return;

  const begin = () => {
    if (gen !== soundGeneration) return;
    scheduleNextBeep();
  };
  if (ctx.state === 'suspended') {
    void ctx.resume().then(begin).catch(() => {});
    return;
  }
  begin();
}

/** Tarayıcı otomatik oynatma kilidini kullanıcı tıklamasıyla açar */
export function unlockNotificationAudio(): void {
  const ctx = getNotificationAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
}

export function bindNotificationAudioUnlock(): void {
  if (typeof window === 'undefined' || audioUnlockBound) return;
  audioUnlockBound = true;
  const unlock = () => {
    unlockNotificationAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

export function showBrowserNotification(payload: BrowserNotificationPayload): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (!getBrowserNotificationsEnabled()) return;

  startNotificationSound();

  const notification = new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: '/waai-logo.png',
    badge: '/favicon.svg',
    silent: true,
    requireInteraction: false,
  });

  notification.onclick = () => {
    stopNotificationSound();
    window.focus();
    if (payload.url) {
      window.location.assign(payload.url);
    }
    notification.close();
  };
}

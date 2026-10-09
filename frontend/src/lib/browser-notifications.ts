const STORAGE_KEY = 'wa_browser_notifications';
const SOUND_PLAY_COUNT = 6;
const SOUND_GAP_MS = 420;
/** Destek / transfer için daha yüksek ve belirgin ses */
const URGENT_SOUND_PLAY_COUNT = 7;
const URGENT_SOUND_GAP_MS = 380;

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

function playNotificationBeep(urgent = false): void {
  const ctx = getNotificationAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const peak = urgent ? 0.55 : 0.42;
  const duration = urgent ? 0.28 : 0.22;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(peak, now + 0.015);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  master.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(urgent ? 980 : 880, now);
  osc1.frequency.setValueAtTime(urgent ? 1318 : 1175, now + 0.08);
  osc1.connect(master);
  osc1.start(now);
  osc1.stop(now + duration + 0.02);

  // İkinci katman — daha dolgun / duyulabilir ses
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(urgent ? 740 : 660, now);
  osc2.frequency.setValueAtTime(urgent ? 988 : 880, now + 0.08);
  g2.gain.value = urgent ? 0.45 : 0.35;
  osc2.connect(g2);
  g2.connect(master);
  osc2.start(now);
  osc2.stop(now + duration + 0.02);
}

let urgentMode = false;

export function stopNotificationSound(): void {
  soundGeneration += 1;
  remainingPlays = 0;
  urgentMode = false;
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
  playNotificationBeep(urgentMode);
  remainingPlays -= 1;
  if (remainingPlays > 0) {
    soundTimer = window.setTimeout(
      scheduleNextBeep,
      urgentMode ? URGENT_SOUND_GAP_MS : SOUND_GAP_MS
    );
  } else {
    soundTimer = null;
  }
}

function beginNotificationSound(playCount: number, urgent: boolean): void {
  stopNotificationSound();
  urgentMode = urgent;
  remainingPlays = playCount;
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

export function startNotificationSound(): void {
  beginNotificationSound(SOUND_PLAY_COUNT, false);
}

/** Destek talebi / transfer için daha yüksek ses */
export function startUrgentNotificationSound(): void {
  beginNotificationSound(URGENT_SOUND_PLAY_COUNT, true);
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

export function showBrowserNotification(
  payload: BrowserNotificationPayload & { urgent?: boolean }
): void {
  const playSound = payload.urgent ? startUrgentNotificationSound : startNotificationSound;
  playSound();

  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (!getBrowserNotificationsEnabled()) return;

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

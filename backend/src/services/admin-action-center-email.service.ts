/**
 * Aksiyon merkezi alarmları için periyodik e-posta bildirimi
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import {
  getAdminActionCenter,
  type ActionCenterItem,
  type ActionCenterSeverity,
} from './admin.service';
import { buildMobileEmailHtml, sendEmail } from './email.service';
import { resolveAdminNotifyEmails } from './admin-email-notification.service';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const NOTIFY_SEVERITIES = new Set<ActionCenterSeverity>(['critical', 'warning']);

/** Yalnızca operasyonel alarmlar e-posta ile bildirilir (açık destek talepleri hariç) */
const EMAIL_ALERT_TYPES = new Set([
  'whatsapp_disconnected',
  'quota_exhausted',
  'quota_high',
  'trial_expired',
  'trial_ending',
]);

let checkTimer: NodeJS.Timeout | null = null;
let checkInProgress = false;

function adminBaseUrl(): string {
  const base = config.publicUrl || 'https://waai.mekanizma.com';
  return base.replace(/\/$/, '');
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  quota_exhausted: 'Mesaj kotası doldu',
  quota_high: 'Mesaj kotası yüksek',
  whatsapp_disconnected: 'WhatsApp bağlantısı kopuk',
  trial_expired: 'Deneme süresi bitti',
  trial_ending: 'Deneme süresi bitiyor',
  inactive_messaging: 'Mesajlaşma inaktif',
  open_ticket: 'Açık destek talebi',
  open_platform_support: 'Platform destek talebi',
};

const SEVERITY_LABELS: Record<ActionCenterSeverity, string> = {
  critical: 'Kritik',
  warning: 'Uyarı',
  info: 'Bilgi',
};

function describeAlert(item: ActionCenterItem): string {
  const typeLabel = ALERT_TYPE_LABELS[item.type] || item.type;
  const parts = [`${item.company_name}: ${typeLabel}`];

  if (item.meta.quota_percent != null) {
    parts.push(`%${item.meta.quota_percent} (${item.meta.messages_used}/${item.meta.messages_limit})`);
  }
  if (item.meta.days_left != null) {
    parts.push(`${item.meta.days_left} gün kaldı`);
  }
  if (item.meta.ticket_subject) {
    parts.push(item.meta.ticket_subject);
  }

  return parts.join(' — ');
}

async function loadNotifiedAlertIds(): Promise<Set<string>> {
  const { data, error } = await adminClient
    .from('admin_action_center_alert_log')
    .select('alert_id');

  if (error) {
    console.error('[ActionCenterEmail] Log okunamadı:', error.message);
    return new Set();
  }

  return new Set((data || []).map((row) => row.alert_id));
}

async function markAlertsNotified(alertIds: string[]): Promise<void> {
  if (!alertIds.length) return;

  const rows = alertIds.map((alert_id) => ({ alert_id }));
  const { error } = await adminClient
    .from('admin_action_center_alert_log')
    .upsert(rows, { onConflict: 'alert_id' });

  if (error) {
    console.error('[ActionCenterEmail] Log yazılamadı:', error.message);
  }
}

async function cleanupResolvedAlerts(activeAlertIds: Set<string>): Promise<void> {
  const { data, error } = await adminClient
    .from('admin_action_center_alert_log')
    .select('alert_id');

  if (error || !data?.length) return;

  const staleIds = data.map((row) => row.alert_id).filter((id) => !activeAlertIds.has(id));
  if (!staleIds.length) return;

  const { error: deleteError } = await adminClient
    .from('admin_action_center_alert_log')
    .delete()
    .in('alert_id', staleIds);

  if (deleteError) {
    console.error('[ActionCenterEmail] Eski log temizlenemedi:', deleteError.message);
  }
}

async function sendActionCenterAlertEmail(newAlerts: ActionCenterItem[]): Promise<boolean> {
  const recipients = await resolveAdminNotifyEmails();
  if (!recipients.length) return false;

  const criticalCount = newAlerts.filter((a) => a.severity === 'critical').length;
  const warningCount = newAlerts.filter((a) => a.severity === 'warning').length;
  const adminUrl = `${adminBaseUrl()}/admin`;

  const subject =
    criticalCount > 0
      ? `Aksiyon Merkezi: ${criticalCount} kritik alarm`
      : `Aksiyon Merkezi: ${warningCount} yeni uyarı`;

  const rows = newAlerts.slice(0, 15).map((item) => ({
    label: SEVERITY_LABELS[item.severity],
    value: describeAlert(item),
  }));

  if (newAlerts.length > 15) {
    rows.push({
      label: 'Diğer',
      value: `+${newAlerts.length - 15} alarm daha`,
    });
  }

  const text = [
    'Aksiyon Merkezi — yeni alarmlar',
    '',
    ...newAlerts.map((item) => `[${SEVERITY_LABELS[item.severity]}] ${describeAlert(item)}`),
    '',
    `Yönetim paneli: ${adminUrl}`,
  ].join('\n');

  return sendEmail({
    to: recipients,
    subject,
    html: buildMobileEmailHtml({
      title: 'Aksiyon Merkezi Alarmı',
      intro: `${newAlerts.length} yeni alarm tespit edildi. Lütfen yönetim panelini kontrol edin.`,
      rows,
      ctaLabel: 'Aksiyon Merkezini Aç',
      ctaUrl: adminUrl,
    }),
    text,
  });
}

export async function checkAndNotifyActionCenterAlerts(): Promise<void> {
  if (checkInProgress) return;
  if (!config.smtp.enabled) return;

  checkInProgress = true;
  try {
    const actionCenter = await getAdminActionCenter();
    const activeAlerts = actionCenter.items.filter(
      (item) => NOTIFY_SEVERITIES.has(item.severity) && EMAIL_ALERT_TYPES.has(item.type)
    );
    const activeIds = new Set(activeAlerts.map((a) => a.id));

    await cleanupResolvedAlerts(activeIds);

    const notifiedIds = await loadNotifiedAlertIds();
    const newAlerts = activeAlerts.filter((item) => !notifiedIds.has(item.id));
    if (!newAlerts.length) return;

    const sent = await sendActionCenterAlertEmail(newAlerts);
    if (sent) {
      await markAlertsNotified(newAlerts.map((a) => a.id));
    }
  } catch (err) {
    console.error(
      '[ActionCenterEmail] Kontrol hatası:',
      err instanceof Error ? err.message : err
    );
  } finally {
    checkInProgress = false;
  }
}

export function startActionCenterEmailSchedule(): void {
  if (checkTimer || config.demoMode || !config.smtp.enabled) return;

  const run = () => {
    void checkAndNotifyActionCenterAlerts();
  };

  setTimeout(run, 15000);
  checkTimer = setInterval(run, CHECK_INTERVAL_MS);
  checkTimer.unref();

  console.log('[ActionCenterEmail] Periyodik kontrol başlatıldı (5 dk)');
}

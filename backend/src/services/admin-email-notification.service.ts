/**
 * Platform yöneticilerine e-posta bildirimleri
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { buildMobileEmailHtml, sendEmail } from './email.service';
import { enrichProfilesWithEmail } from './password.service';
import type { SignupApplication } from './signup-application.service';
import type { PlatformSupportTicket } from './platform-support.service';
import { companyCategoryLabelsRecord } from '../constants/company-categories';

const CATEGORY_LABELS = companyCategoryLabelsRecord('tr');

function adminBaseUrl(): string {
  const base = config.publicUrl || 'https://waai.mekanizma.com';
  return base.replace(/\/$/, '');
}

export async function resolveAdminNotifyEmails(): Promise<string[]> {
  const emails = new Set(config.smtp.adminNotifyEmails);

  const { data: profiles, error } = await adminClient
    .from('profiles')
    .select('id, user_id')
    .eq('role', 'super_admin')
    .eq('is_active', true);

  if (!error && profiles?.length) {
    const enriched = await enrichProfilesWithEmail(profiles);
    for (const profile of enriched) {
      const email = profile.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }
  } else if (error) {
    console.error('[AdminEmail] Süper admin e-postaları alınamadı:', error.message);
  }

  return [...emails];
}

async function notifyAdmins(options: {
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  const recipients = await resolveAdminNotifyEmails();
  if (!recipients.length) {
    console.warn('[AdminEmail] Bildirim e-posta adresi tanımlı değil');
    return false;
  }

  return sendEmail({
    to: recipients,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}

function billingPeriodLabel(period: 'monthly' | 'yearly'): string {
  return period === 'yearly' ? 'Yıllık' : 'Aylık';
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category;
}

const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel',
  billing: 'Faturalama',
  technical: 'Teknik',
  whatsapp: 'WhatsApp',
  account: 'Hesap',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  urgent: 'Acil',
};

export async function notifyAdminsNewSignupApplication(app: SignupApplication): Promise<void> {
  const planName = app.plan?.name || '—';
  const billing = billingPeriodLabel(app.billing_period || 'monthly');
  const appNo = app.id.slice(0, 8).toUpperCase();
  const createdAt = new Date(app.created_at).toLocaleString('tr-TR');
  const adminUrl = `${adminBaseUrl()}/admin/applications`;

  const rows = [
    { label: 'İşletme', value: app.company_name },
    { label: 'Sektör', value: categoryLabel(app.category) },
    { label: 'Paket', value: `${planName} (${billing})` },
    { label: 'Ad Soyad', value: app.full_name },
    { label: 'Telefon', value: app.phone || '—' },
    { label: 'E-posta', value: app.email },
    { label: 'Başvuru No', value: appNo },
    { label: 'Tarih', value: createdAt },
  ];

  const text = [
    'Yeni satın alma / kayıt başvurusu',
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    `Yönetim paneli: ${adminUrl}`,
  ].join('\n');

  await notifyAdmins({
    subject: `Yeni başvuru: ${app.company_name}`,
    html: buildMobileEmailHtml({
      title: 'Yeni Satın Alma Başvurusu',
      intro: 'Websitesinden yeni bir kayıt başvurusu alındı.',
      rows,
      ctaLabel: 'Başvuruları Görüntüle',
      ctaUrl: adminUrl,
    }),
    text,
  });
}

export async function notifyAdminsNewPlatformSupportTicket(ticket: PlatformSupportTicket): Promise<void> {
  const firstMessage = ticket.messages?.[0]?.message || '—';
  const preview =
    firstMessage.length > 280 ? `${firstMessage.slice(0, 277)}...` : firstMessage;
  const createdAt = new Date(ticket.created_at).toLocaleString('tr-TR');
  const adminUrl = `${adminBaseUrl()}/admin/support-tickets`;

  const rows = [
    { label: 'Konu', value: ticket.subject },
    { label: 'Şirket', value: ticket.company_name || '—' },
    { label: 'Kategori', value: SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category },
    { label: 'Öncelik', value: PRIORITY_LABELS[ticket.priority] || ticket.priority },
    { label: 'Gönderen', value: ticket.created_by_name },
    { label: 'E-posta', value: ticket.created_by_email || '—' },
    { label: 'Mesaj', value: preview },
    { label: 'Tarih', value: createdAt },
  ];

  const text = [
    'Yeni platform destek talebi',
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    `Yönetim paneli: ${adminUrl}`,
  ].join('\n');

  await notifyAdmins({
    subject: `Yeni destek talebi: ${ticket.subject}`,
    html: buildMobileEmailHtml({
      title: 'Yeni Platform Destek Talebi',
      intro: 'Bir müşteri şirketinden yeni destek talebi oluşturuldu.',
      rows,
      ctaLabel: 'Destek Taleplerini Görüntüle',
      ctaUrl: adminUrl,
    }),
    text,
  });
}

export async function notifyAdminsPlatformSupportReply(
  ticket: PlatformSupportTicket,
  message: string,
  senderName?: string
): Promise<void> {
  const preview = message.length > 280 ? `${message.slice(0, 277)}...` : message;
  const createdAt = new Date().toLocaleString('tr-TR');
  const adminUrl = `${adminBaseUrl()}/admin/support-tickets`;

  const rows = [
    { label: 'Konu', value: ticket.subject },
    { label: 'Şirket', value: ticket.company_name || '—' },
    { label: 'Kategori', value: SUPPORT_CATEGORY_LABELS[ticket.category] || ticket.category },
    { label: 'Öncelik', value: PRIORITY_LABELS[ticket.priority] || ticket.priority },
    { label: 'Gönderen', value: senderName?.trim() || ticket.created_by_name || 'Kullanıcı' },
    { label: 'Yeni Mesaj', value: preview },
    { label: 'Tarih', value: createdAt },
  ];

  const text = [
    'Platform destek talebine yeni yanıt',
    '',
    ...rows.map((r) => `${r.label}: ${r.value}`),
    '',
    `Yönetim paneli: ${adminUrl}`,
  ].join('\n');

  await notifyAdmins({
    subject: `Destek talebine yanıt: ${ticket.subject}`,
    html: buildMobileEmailHtml({
      title: 'Destek Talebine Yeni Yanıt',
      intro: 'Mevcut bir platform destek talebine müşteri tarafından yeni mesaj eklendi.',
      rows,
      ctaLabel: 'Destek Taleplerini Görüntüle',
      ctaUrl: adminUrl,
    }),
    text,
  });
}

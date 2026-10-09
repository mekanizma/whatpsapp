/**
 * Ticket notification service — WhatsApp and email per staff preferences
 */

import { adminClient } from '../database/supabase';
import { config } from '../config';
import { resolveDepartmentForSubject } from '../ai/department-routing.service';
import { listActiveDepartments } from './department-access.service';
import { sendStaffTicketNotification } from '../whatsapp/whatsapp.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';
import { buildMobileEmailHtml, sendEmail } from './email.service';

export interface NotificationUserRow {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notify_enabled: boolean;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
}

export interface NotificationUserInput {
  profile_id: string;
  phone?: string | null;
  notify_enabled?: boolean;
  whatsapp_enabled?: boolean;
  email_enabled?: boolean;
}

export interface TicketNotificationPayload {
  id: string;
  ticket_number?: number | null;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority?: string;
  department_id?: string | null;
}

function formatTicketLabel(ticket: TicketNotificationPayload): string {
  if (ticket.ticket_number != null) return `#${ticket.ticket_number}`;
  return `#${ticket.id.slice(0, 8).toUpperCase()}`;
}

async function getProfileEmail(userId: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email || null;
}

function panelTicketsUrl(): string {
  const base = (config.publicUrl || 'https://waai.mekanizma.com').replace(/\/$/, '');
  return `${base}/panel/tickets`;
}

export async function getNotificationSettings(
  companyId: string
): Promise<NotificationUserRow[]> {
  const [
    { data: profiles, error: profilesError },
    { data: recipients, error: recipientsError },
    { data: staffRows, error: staffError },
  ] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, user_id, full_name, role, phone, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('full_name'),
    adminClient
      .from('ticket_notification_recipients')
      .select('profile_id, whatsapp_enabled, email_enabled')
      .eq('company_id', companyId),
    adminClient
      .from('staff')
      .select('profile_id, email, phone')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  if (profilesError) throw new Error(profilesError.message);
  if (recipientsError) throw new Error(recipientsError.message);
  if (staffError) throw new Error(staffError.message);

  const recipientMap = new Map(
    (recipients || []).map((r) => [
      r.profile_id as string,
      {
        whatsapp_enabled: r.whatsapp_enabled !== false,
        email_enabled: !!r.email_enabled,
      },
    ])
  );
  const staffByProfile = new Map(
    (staffRows || []).map((s) => [
      s.profile_id as string,
      { email: (s.email as string | null) || null, phone: (s.phone as string | null) || null },
    ])
  );

  return Promise.all(
    (profiles || []).map(async (profile) => {
      const prefs = recipientMap.get(profile.id);
      const staff = staffByProfile.get(profile.id);
      const authEmail = await getProfileEmail(profile.user_id);
      const whatsappEnabled = prefs?.whatsapp_enabled ?? false;
      const emailEnabled = prefs?.email_enabled ?? false;
      return {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        email: authEmail || staff?.email || null,
        phone: profile.phone || staff?.phone || null,
        whatsapp_enabled: whatsappEnabled,
        email_enabled: emailEnabled,
        notify_enabled: whatsappEnabled || emailEnabled,
      };
    })
  );
}

export async function updateNotificationSettings(
  companyId: string,
  users: NotificationUserInput[]
): Promise<NotificationUserRow[]> {
  const { data: companyProfiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (profilesError) throw new Error(profilesError.message);

  const validProfileIds = new Set((companyProfiles || []).map((p) => p.id));

  for (const entry of users) {
    if (!validProfileIds.has(entry.profile_id)) {
      throw new Error('Geçersiz kullanıcı seçimi');
    }

    if (entry.phone !== undefined) {
      const normalized = entry.phone?.trim()
        ? normalizePhoneNumber(entry.phone.trim()) || entry.phone.trim()
        : null;

      const { error: phoneError } = await adminClient
        .from('profiles')
        .update({ phone: normalized })
        .eq('id', entry.profile_id)
        .eq('company_id', companyId);

      if (phoneError) throw new Error(phoneError.message);
    }
  }

  const { error: deleteError } = await adminClient
    .from('ticket_notification_recipients')
    .delete()
    .eq('company_id', companyId);

  if (deleteError) throw new Error(deleteError.message);

  const rows = users
    .filter((u) => validProfileIds.has(u.profile_id))
    .map((u) => {
      const whatsappEnabled =
        u.whatsapp_enabled !== undefined ? !!u.whatsapp_enabled : !!u.notify_enabled;
      const emailEnabled = !!u.email_enabled;
      return {
        company_id: companyId,
        profile_id: u.profile_id,
        whatsapp_enabled: whatsappEnabled,
        email_enabled: emailEnabled,
      };
    })
    .filter((row) => row.whatsapp_enabled || row.email_enabled);

  if (rows.length > 0) {
    const { error: insertError } = await adminClient
      .from('ticket_notification_recipients')
      .insert(rows);

    if (insertError) throw new Error(insertError.message);
  }

  return getNotificationSettings(companyId);
}

function buildTicketNotificationMessage(ticket: TicketNotificationPayload, departmentName?: string): string {
  const customerLabel = ticket.customer_name
    ? `${ticket.customer_name} (${ticket.customer_phone})`
    : ticket.customer_phone;
  const ticketLabel = formatTicketLabel(ticket);

  const lines = [
    '🔔 Yeni destek talebi',
    '',
    `Talep No: ${ticketLabel}`,
    `Müşteri: ${customerLabel}`,
    `Konu: ${ticket.subject}`,
  ];
  if (departmentName) {
    lines.push(`Departman: ${departmentName}`);
  }
  lines.push('', 'Panele girip talebi inceleyebilirsiniz.');
  return lines.join('\n');
}

function shouldNotifyStaffForDepartment(
  role: string,
  staffDepartmentId: string | null | undefined,
  ticketDepartmentId: string | null | undefined
): boolean {
  if (role !== 'staff') return true;
  if (!ticketDepartmentId) return true;
  return staffDepartmentId === ticketDepartmentId;
}

function buildTicketDetailRows(
  ticket: TicketNotificationPayload,
  departmentName: string | undefined,
  lang: 'tr' | 'en',
  extraRows?: Array<{ label: string; value: string }>
): Array<{ label: string; value: string }> {
  const customerLabel = ticket.customer_name
    ? `${ticket.customer_name} (${ticket.customer_phone})`
    : ticket.customer_phone;
  const ticketLabel = formatTicketLabel(ticket);
  const labels =
    lang === 'tr'
      ? { no: 'Talep No', customer: 'Müşteri', subject: 'Konu', priority: 'Öncelik', dept: 'Departman' }
      : {
          no: 'Ticket No',
          customer: 'Customer',
          subject: 'Subject',
          priority: 'Priority',
          dept: 'Department',
        };

  const rows = [
    { label: labels.no, value: ticketLabel },
    { label: labels.customer, value: customerLabel },
    { label: labels.subject, value: ticket.subject },
  ];
  if (ticket.priority) {
    rows.push({ label: labels.priority, value: ticket.priority });
  }
  if (departmentName) {
    rows.push({ label: labels.dept, value: departmentName });
  }
  if (extraRows?.length) {
    rows.push(...extraRows);
  }
  return rows;
}

async function sendTicketEmail(options: {
  to: string;
  ticket: TicketNotificationPayload;
  departmentName?: string;
}): Promise<boolean> {
  const ticketLabel = formatTicketLabel(options.ticket);
  const panelUrl = panelTicketsUrl();
  const rowsTr = buildTicketDetailRows(options.ticket, options.departmentName, 'tr');
  const rowsEn = buildTicketDetailRows(options.ticket, options.departmentName, 'en');

  return sendEmail({
    to: options.to,
    subject: `Yeni destek talebi / New support ticket ${ticketLabel}: ${options.ticket.subject}`,
    html: buildMobileEmailHtml({
      title: 'Yeni Destek Talebi',
      intro: 'Şirket paneline yeni bir destek talebi geldi.',
      rows: rowsTr,
      ctaLabel: 'Talepleri Görüntüle',
      ctaUrl: panelUrl,
      secondary: {
        title: 'New Support Ticket',
        intro: 'A new support ticket has arrived in the company panel.',
        rows: rowsEn,
        ctaLabel: 'View Tickets',
      },
    }),
    text: [
      'Yeni destek talebi / New support ticket',
      '',
      ...rowsTr.map((r) => `${r.label}: ${r.value}`),
      '',
      '---',
      '',
      ...rowsEn.map((r) => `${r.label}: ${r.value}`),
      '',
      `Panel: ${panelUrl}`,
    ].join('\n'),
  });
}

async function sendTicketAssignmentEmail(options: {
  to: string;
  ticket: TicketNotificationPayload;
  departmentName?: string;
  assigneeName?: string;
}): Promise<boolean> {
  const ticketLabel = formatTicketLabel(options.ticket);
  const panelUrl = panelTicketsUrl();
  const assigneeExtraTr = options.assigneeName
    ? [{ label: 'Atanan', value: options.assigneeName }]
    : undefined;
  const assigneeExtraEn = options.assigneeName
    ? [{ label: 'Assignee', value: options.assigneeName }]
    : undefined;
  const rowsTr = buildTicketDetailRows(
    options.ticket,
    options.departmentName,
    'tr',
    assigneeExtraTr
  );
  const rowsEn = buildTicketDetailRows(
    options.ticket,
    options.departmentName,
    'en',
    assigneeExtraEn
  );

  return sendEmail({
    to: options.to,
    subject: `Size destek talebi atandı / Support ticket assigned to you ${ticketLabel}`,
    html: buildMobileEmailHtml({
      title: 'Size Destek Talebi Atandı',
      intro: 'Bir destek talebi size atandı. Panele girerek talebi inceleyebilirsiniz.',
      rows: rowsTr,
      ctaLabel: 'Talebi Görüntüle',
      ctaUrl: panelUrl,
      secondary: {
        title: 'Support Ticket Assigned to You',
        intro: 'A support ticket has been assigned to you. Open the panel to review it.',
        rows: rowsEn,
        ctaLabel: 'View Ticket',
      },
    }),
    text: [
      'Size destek talebi atandı / Support ticket assigned to you',
      '',
      ...rowsTr.map((r) => `${r.label}: ${r.value}`),
      '',
      '---',
      '',
      ...rowsEn.map((r) => `${r.label}: ${r.value}`),
      '',
      `Panel: ${panelUrl}`,
    ].join('\n'),
  });
}

/**
 * Destek talebi bir personele atandığında yalnızca o kişiye e-posta gönderir (TR + EN).
 */
export async function notifyTicketAssignee(
  companyId: string,
  ticket: TicketNotificationPayload,
  staffId: string
): Promise<void> {
  const { data: staff, error } = await adminClient
    .from('staff')
    .select('id, name, email, profile_id, is_active')
    .eq('id', staffId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error || !staff || !staff.is_active) {
    console.error('[TicketNotify] Atanan personel bulunamadı:', error?.message || staffId);
    return;
  }

  let departmentName: string | undefined;
  if (ticket.department_id) {
    const { data: dept } = await adminClient
      .from('departments')
      .select('name')
      .eq('id', ticket.department_id)
      .maybeSingle();
    departmentName = dept?.name || undefined;
  }

  let email = (staff.email as string | null)?.trim().toLowerCase() || '';
  if ((!email || !email.includes('@')) && staff.profile_id) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('id', staff.profile_id)
      .maybeSingle();
    if (profile?.user_id) {
      email = ((await getProfileEmail(profile.user_id)) || '').trim().toLowerCase();
    }
  }

  if (!email || !email.includes('@')) {
    console.log(`[TicketNotify] Atanan personelin e-postası yok → ${staff.name || staffId}`);
    return;
  }

  const sent = await sendTicketAssignmentEmail({
    to: email,
    ticket,
    departmentName,
    assigneeName: staff.name || undefined,
  });

  if (sent) {
    console.log(`[TicketNotify] Atama e-postası gönderildi → ${email}`);
  } else {
    console.error(`[TicketNotify] Atama e-postası gönderilemedi → ${email}`);
  }
}

export async function notifyTicketRecipients(
  companyId: string,
  ticket: TicketNotificationPayload
): Promise<void> {
  const [
    { data: profiles, error: profilesError },
    { data: recipients, error: recipientsError },
    { data: staffRows, error: staffError },
  ] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, user_id, full_name, role, phone, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true),
    adminClient
      .from('ticket_notification_recipients')
      .select('profile_id, whatsapp_enabled, email_enabled')
      .eq('company_id', companyId),
    adminClient
      .from('staff')
      .select('profile_id, phone, email, department_id')
      .eq('company_id', companyId)
      .eq('is_active', true),
  ]);

  if (profilesError) {
    console.error('[TicketNotify] Profiller alınamadı:', profilesError.message);
    return;
  }
  if (recipientsError) {
    console.error('[TicketNotify] Bildirim alıcıları alınamadı:', recipientsError.message);
    return;
  }
  if (staffError) {
    console.error('[TicketNotify] Personel alınamadı:', staffError.message);
    return;
  }

  let departmentName: string | undefined;
  let departmentEmail: string | null = null;
  let departmentNotifyEnabled = false;
  if (ticket.department_id) {
    const { data: dept } = await adminClient
      .from('departments')
      .select('name, email, notify_email_enabled')
      .eq('id', ticket.department_id)
      .maybeSingle();
    departmentName = dept?.name;
    departmentEmail = (dept?.email as string | null)?.trim().toLowerCase() || null;
    departmentNotifyEnabled = !!dept?.notify_email_enabled;
  }

  const recipientMap = new Map(
    (recipients || []).map((r) => [
      r.profile_id as string,
      {
        whatsapp_enabled: r.whatsapp_enabled !== false,
        email_enabled: !!r.email_enabled,
      },
    ])
  );
  const staffByProfile = new Map(
    (staffRows || []).map((s) => [
      s.profile_id as string,
      {
        phone: (s.phone as string | null) || null,
        email: (s.email as string | null) || null,
        department_id: (s.department_id as string | null) || null,
      },
    ])
  );

  const configured = (recipients || []).length > 0;
  const message = buildTicketNotificationMessage(ticket, departmentName);
  const customerLabel = ticket.customer_name
    ? `${ticket.customer_name} (${ticket.customer_phone})`
    : ticket.customer_phone;
  const sentPhones = new Set<string>();
  const sentEmails = new Set<string>();
  let notified = 0;

  for (const profile of profiles || []) {
    const staff = staffByProfile.get(profile.id);
    const prefs = recipientMap.get(profile.id);

    // Ayar kaydı yoksa eski davranış: yalnızca departman personeline WhatsApp
    const whatsappEnabled = configured
      ? !!prefs?.whatsapp_enabled
      : profile.role === 'staff' && !!ticket.department_id;
    const emailEnabled = configured ? !!prefs?.email_enabled : false;

    if (!whatsappEnabled && !emailEnabled) continue;
    if (!shouldNotifyStaffForDepartment(profile.role, staff?.department_id, ticket.department_id)) {
      continue;
    }

    if (whatsappEnabled) {
      const rawPhone = profile.phone?.trim() || staff?.phone?.trim();
      const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
      if (phone && !sentPhones.has(phone)) {
        sentPhones.add(phone);
        const result = await sendStaffTicketNotification(
          companyId,
          phone,
          {
            customerLabel,
            subject: ticket.subject,
            departmentName: departmentName || '-',
          },
          message
        );
        if (result.success) {
          notified += 1;
          console.log(`[TicketNotify] WhatsApp gönderildi → ${phone}`);
        } else {
          console.error(`[TicketNotify] WhatsApp gönderilemedi → ${phone}: ${result.error}`);
        }
      }
    }

    if (emailEnabled) {
      const email = ((await getProfileEmail(profile.user_id)) || staff?.email || '')
        .trim()
        .toLowerCase();
      if (email && email.includes('@') && !sentEmails.has(email)) {
        sentEmails.add(email);
        const sent = await sendTicketEmail({
          to: email,
          ticket,
          departmentName,
        });
        if (sent) {
          notified += 1;
          console.log(`[TicketNotify] E-posta gönderildi → ${email}`);
        } else {
          console.error(`[TicketNotify] E-posta gönderilemedi → ${email}`);
        }
      }
    }
  }

  if (
    departmentNotifyEnabled &&
    departmentEmail &&
    departmentEmail.includes('@') &&
    !sentEmails.has(departmentEmail)
  ) {
    sentEmails.add(departmentEmail);
    const sent = await sendTicketEmail({
      to: departmentEmail,
      ticket,
      departmentName,
    });
    if (sent) {
      notified += 1;
      console.log(`[TicketNotify] Departman e-postası gönderildi → ${departmentEmail}`);
    } else {
      console.error(`[TicketNotify] Departman e-postası gönderilemedi → ${departmentEmail}`);
    }
  }

  if (!notified) {
    if (!ticket.department_id && !configured && !departmentNotifyEnabled) {
      console.log('[TicketNotify] Departman atanmamış talep — bildirim gönderilmedi');
    } else {
      console.log(
        `[TicketNotify] ${departmentName || ticket.department_id || 'şirket'} için bildirilecek kişi bulunamadı`
      );
    }
  }
}

export async function createTicketAndNotify(
  companyId: string,
  input: {
    customer_phone: string;
    customer_name?: string | null;
    subject: string;
    priority?: string;
    status?: string;
    department_id?: string | null;
  }
): Promise<{ created: boolean; ticket?: TicketNotificationPayload }> {
  let departmentId = input.department_id || null;

  if (!departmentId) {
    const departments = await listActiveDepartments(companyId);
    departmentId = await resolveDepartmentForSubject(
      companyId,
      input.subject,
      departments,
      input.customer_phone
    );
  }

  const { data, error } = await adminClient
    .from('tickets')
    .insert({
      company_id: companyId,
      customer_phone: input.customer_phone,
      customer_name: input.customer_name || null,
      subject: input.subject,
      priority: input.priority || 'medium',
      status: input.status || 'open',
      department_id: departmentId,
    })
    .select('id, ticket_number, customer_phone, customer_name, subject, priority, department_id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { created: false };
    }
    throw new Error(error.message);
  }

  void notifyTicketRecipients(companyId, data);

  return { created: true, ticket: data };
}

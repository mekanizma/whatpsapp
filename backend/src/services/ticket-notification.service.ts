/**
 * Ticket WhatsApp notification service
 */

import { adminClient } from '../database/supabase';
import { resolveDepartmentForSubject } from '../ai/department-routing.service';
import { listActiveDepartments } from './department-access.service';
import { sendStaffTicketNotification } from '../whatsapp/whatsapp.service';
import { normalizePhoneNumber } from '../whatsapp/message.handler';

export interface NotificationUserRow {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notify_enabled: boolean;
}

export interface NotificationUserInput {
  profile_id: string;
  phone?: string | null;
  notify_enabled: boolean;
}

export interface TicketNotificationPayload {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  subject: string;
  priority?: string;
  department_id?: string | null;
}

async function getProfileEmail(userId: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email || null;
}

export async function getNotificationSettings(
  companyId: string
): Promise<NotificationUserRow[]> {
  const [{ data: profiles, error: profilesError }, { data: recipients, error: recipientsError }] =
    await Promise.all([
      adminClient
        .from('profiles')
        .select('id, user_id, full_name, role, phone, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('full_name'),
      adminClient
        .from('ticket_notification_recipients')
        .select('profile_id')
        .eq('company_id', companyId),
    ]);

  if (profilesError) throw new Error(profilesError.message);
  if (recipientsError) throw new Error(recipientsError.message);

  const recipientSet = new Set((recipients || []).map((r) => r.profile_id));

  const rows = await Promise.all(
    (profiles || []).map(async (profile) => ({
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      email: await getProfileEmail(profile.user_id),
      phone: profile.phone || null,
      notify_enabled: recipientSet.has(profile.id),
    }))
  );

  return rows;
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

  const enabledIds = users
    .filter((u) => u.notify_enabled)
    .map((u) => u.profile_id);

  const { error: deleteError } = await adminClient
    .from('ticket_notification_recipients')
    .delete()
    .eq('company_id', companyId);

  if (deleteError) throw new Error(deleteError.message);

  if (enabledIds.length > 0) {
    const { error: insertError } = await adminClient
      .from('ticket_notification_recipients')
      .insert(
        enabledIds.map((profile_id) => ({
          company_id: companyId,
          profile_id,
        }))
      );

    if (insertError) throw new Error(insertError.message);
  }

  return getNotificationSettings(companyId);
}

function buildTicketNotificationMessage(ticket: TicketNotificationPayload, departmentName?: string): string {
  const customerLabel = ticket.customer_name
    ? `${ticket.customer_name} (${ticket.customer_phone})`
    : ticket.customer_phone;

  const lines = [
    '🔔 Yeni destek talebi',
    '',
    `Müşteri: ${customerLabel}`,
    `Konu: ${ticket.subject}`,
  ];
  if (departmentName) {
    lines.push(`Departman: ${departmentName}`);
  }
  lines.push('', 'Panele girip talebi inceleyebilirsiniz.');
  return lines.join('\n');
}

export async function notifyTicketRecipients(
  companyId: string,
  ticket: TicketNotificationPayload
): Promise<void> {
  if (!ticket.department_id) {
    console.log('[TicketNotify] Departman atanmamış talep — bildirim gönderilmedi');
    return;
  }

  let departmentName: string | undefined;
  const phonesToNotify = new Set<string>();

  const { data: dept } = await adminClient
    .from('departments')
    .select('name')
    .eq('id', ticket.department_id)
    .maybeSingle();
  departmentName = dept?.name;

  const { data: deptStaff, error: staffError } = await adminClient
    .from('staff')
    .select('profile_id, phone, profiles:profile_id(id, phone, full_name, is_active)')
    .eq('company_id', companyId)
    .eq('department_id', ticket.department_id)
    .eq('is_active', true);

  if (staffError) {
    console.error('[TicketNotify] Departman personeli alınamadı:', staffError.message);
    return;
  }

  for (const member of deptStaff || []) {
    const profile = member.profiles as
      | { id: string; phone: string | null; full_name: string; is_active: boolean }
      | { id: string; phone: string | null; full_name: string; is_active: boolean }[]
      | null;
    const profileData = Array.isArray(profile) ? profile[0] : profile;
    const rawPhone = profileData?.phone?.trim() || member.phone?.trim();
    if (!profileData?.is_active || !rawPhone) continue;
    const phone = normalizePhoneNumber(rawPhone);
    if (phone) phonesToNotify.add(phone);
  }

  if (!phonesToNotify.size) {
    console.log(
      `[TicketNotify] ${departmentName || ticket.department_id} departmanında bildirilecek personel bulunamadı`
    );
    return;
  }

  const message = buildTicketNotificationMessage(ticket, departmentName);
  const customerLabel = ticket.customer_name
    ? `${ticket.customer_name} (${ticket.customer_phone})`
    : ticket.customer_phone;
  const sentPhones = new Set<string>();

  for (const phone of phonesToNotify) {
    if (sentPhones.has(phone)) continue;
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
      console.log(`[TicketNotify] Bildirim gönderildi → ${phone}`);
    } else {
      console.error(`[TicketNotify] Bildirim gönderilemedi → ${phone}: ${result.error}`);
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
    .select('id, customer_phone, customer_name, subject, priority, department_id')
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

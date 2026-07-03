/**
 * Staff user provisioning — auth account + profile + staff record
 */

import { AuthError } from '@supabase/supabase-js';
import { adminClient } from '../database/supabase';
import { normalizePhoneNumber } from '../whatsapp/message.handler';

function normalizeStaffPhone(phone?: string | null): string | null {
  if (!phone?.trim()) return null;
  return normalizePhoneNumber(phone.trim()) || phone.trim();
}

function formatServiceError(err: unknown): string {
  if (err instanceof AuthError) {
    const code = 'code' in err ? String((err as AuthError & { code?: string }).code || '') : '';
    const base = err.message || 'Kimlik doğrulama hatası';
    return code ? `${base} (${code})` : base;
  }
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const record = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    if (typeof record.message === 'string' && record.message.trim()) {
      const extra = [record.details, record.hint, record.code]
        .filter((v) => typeof v === 'string' && v.trim())
        .join(' — ');
      return extra ? `${record.message} (${extra})` : record.message;
    }
  }
  return 'Personel oluşturulamadı';
}

function isDuplicateAuthEmailError(err: unknown): boolean {
  if (!(err instanceof AuthError)) return false;
  const message = err.message?.toLowerCase() || '';
  return (
    err.status === 422 ||
    message.includes('already') ||
    message.includes('registered') ||
    message.includes('exists')
  );
}

async function resolveAuthStaffUser(
  email: string,
  password: string,
  fullName: string
): Promise<{ userId: string; created: boolean }> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'staff' },
  });

  if (!error) {
    return { userId: data.user.id, created: true };
  }

  if (!isDuplicateAuthEmailError(error)) {
    throw error;
  }

  const found = await findAuthUserByEmail(email);
  if (!found) {
    throw new Error('Bu e-posta adresi kayıtlı ancak kullanıcı bilgisi alınamadı');
  }

  await updateAuthStaffUser(found.id, password, fullName);
  return { userId: found.id, created: false };
}

async function findAuthUserByEmail(email: string) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message || 'Kullanıcı listesi alınamadı');

    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function ensureStaffProfile(
  userId: string,
  companyId: string,
  fullName: string,
  phone?: string | null
): Promise<string> {
  const normalizedPhone = normalizeStaffPhone(phone);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: existing, error: fetchError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    if (existing?.id) {
      const { error: updateError } = await adminClient
        .from('profiles')
        .update({
          company_id: companyId,
          full_name: fullName,
          role: 'staff',
          is_active: true,
          phone: normalizedPhone,
        })
        .eq('user_id', userId);

      if (updateError) throw new Error(updateError.message);
      return existing.id;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const { data: inserted, error: insertError } = await adminClient
    .from('profiles')
    .insert({
      user_id: userId,
      company_id: companyId,
      full_name: fullName,
      role: 'staff',
      is_active: true,
      phone: normalizedPhone,
    })
    .select('id')
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted.id;
}

async function syncStaffProfile(
  profileId: string,
  updates: { full_name?: string; phone?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.full_name !== undefined) payload.full_name = updates.full_name;
  if (updates.phone !== undefined) payload.phone = normalizeStaffPhone(updates.phone);

  if (Object.keys(payload).length === 0) return;

  const { error } = await adminClient
    .from('profiles')
    .update(payload)
    .eq('id', profileId);

  if (error) throw new Error(error.message);
}

async function updateAuthStaffUser(
  userId: string,
  password: string,
  fullName: string
): Promise<void> {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'staff' },
  });

  if (error) throw error;
}

export async function createStaffUser(
  companyId: string,
  email: string,
  password: string,
  fullName: string,
  staffRole = 'agent',
  phone?: string | null,
  departmentId?: string | null
) {
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalıdır');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();
  const normalizedPhone = normalizeStaffPhone(phone);

  const { data: existingStaff, error: staffLookupError } = await adminClient
    .from('staff')
    .select('id, profile_id, email')
    .eq('company_id', companyId)
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (staffLookupError) throw new Error(staffLookupError.message);

  if (existingStaff?.profile_id) {
    throw new Error('Bu e-posta adresi zaten personel olarak kayıtlı');
  }

  const found = await findAuthUserByEmail(normalizedEmail);
  let userId: string | null = null;
  let createdNewAuthUser = false;

  try {
    if (found) {
      const { data: existingProfile, error: profileLookupError } = await adminClient
        .from('profiles')
        .select('role, company_id')
        .eq('user_id', found.id)
        .maybeSingle();

      if (profileLookupError) throw new Error(profileLookupError.message);

      if (existingProfile?.role && existingProfile.role !== 'staff') {
        throw new Error('Bu e-posta adresi başka bir hesap türüne ait');
      }
      if (existingProfile?.company_id && existingProfile.company_id !== companyId) {
        throw new Error('Bu e-posta adresi başka bir şirkete bağlı');
      }

      await updateAuthStaffUser(found.id, password, trimmedName);
      userId = found.id;
    } else {
      const resolved = await resolveAuthStaffUser(normalizedEmail, password, trimmedName);
      userId = resolved.userId;
      createdNewAuthUser = resolved.created;
    }

    const profileId = await ensureStaffProfile(userId, companyId, trimmedName, normalizedPhone);

    if (existingStaff) {
      const { data: staff, error: staffUpdateError } = await adminClient
        .from('staff')
        .update({
          profile_id: profileId,
          name: trimmedName,
          phone: normalizedPhone,
          role: staffRole,
          is_active: true,
          ...(departmentId !== undefined ? { department_id: departmentId } : {}),
        })
        .eq('id', existingStaff.id)
        .eq('company_id', companyId)
        .select()
        .single();

      if (staffUpdateError) throw new Error(staffUpdateError.message);
      return staff;
    }

    const { data: staff, error: staffError } = await adminClient
      .from('staff')
      .insert({
        company_id: companyId,
        profile_id: profileId,
        name: trimmedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        role: staffRole,
        department_id: departmentId || null,
      })
      .select()
      .single();

    if (staffError) throw new Error(staffError.message);
    return staff;
  } catch (err) {
    if (createdNewAuthUser && userId) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    throw new Error(formatServiceError(err));
  }
}

export async function updateStaffMember(
  staffId: string,
  companyId: string,
  input: {
    name?: string;
    email?: string;
    phone?: string | null;
    role?: string;
    is_active?: boolean;
    department_id?: string | null;
  }
) {
  const { data: existing, error: fetchError } = await adminClient
    .from('staff')
    .select('id, profile_id, email')
    .eq('id', staffId)
    .eq('company_id', companyId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.email !== undefined) updates.email = input.email.trim().toLowerCase();
  if (input.phone !== undefined) updates.phone = normalizeStaffPhone(input.phone);
  if (input.role !== undefined) updates.role = input.role;
  if (input.is_active !== undefined) updates.is_active = input.is_active;
  if (input.department_id !== undefined) updates.department_id = input.department_id;

  if (Object.keys(updates).length === 0) {
    const { data, error } = await adminClient
      .from('staff')
      .select('*')
      .eq('id', staffId)
      .eq('company_id', companyId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data: staff, error: updateError } = await adminClient
    .from('staff')
    .update(updates)
    .eq('id', staffId)
    .eq('company_id', companyId)
    .select()
    .single();

  if (updateError) throw new Error(updateError.message);

  if (existing.profile_id) {
    await syncStaffProfile(existing.profile_id, {
      full_name: typeof updates.name === 'string' ? updates.name : undefined,
      phone: updates.phone !== undefined ? (updates.phone as string | null) : undefined,
    });
  }

  if (
    input.email !== undefined &&
    input.email.trim().toLowerCase() !== existing.email &&
    existing.profile_id
  ) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('id', existing.profile_id)
      .maybeSingle();

    if (profile?.user_id) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(profile.user_id, {
        email: input.email.trim().toLowerCase(),
        email_confirm: true,
      });
      if (authError) throw new Error(authError.message);
    }
  }

  return staff;
}

export async function deleteStaffUser(staffId: string, companyId: string): Promise<void> {
  const { data: staffMember, error: fetchError } = await adminClient
    .from('staff')
    .select('profile_id')
    .eq('id', staffId)
    .eq('company_id', companyId)
    .single();

  if (fetchError) throw new Error(fetchError.message);

  const { error: deleteError } = await adminClient
    .from('staff')
    .delete()
    .eq('id', staffId)
    .eq('company_id', companyId);

  if (deleteError) throw new Error(deleteError.message);

  if (staffMember.profile_id) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('user_id')
      .eq('id', staffMember.profile_id)
      .maybeSingle();

    if (profile?.user_id) {
      await adminClient.auth.admin.deleteUser(profile.user_id);
    }
  }
}

export { formatServiceError };

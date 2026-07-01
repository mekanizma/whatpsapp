/**
 * Staff user provisioning — auth account + profile + staff record
 */

import { AuthError } from '@supabase/supabase-js';
import { adminClient } from '../database/supabase';

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
  fullName: string
): Promise<string> {
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
    })
    .select('id')
    .single();

  if (insertError) throw new Error(insertError.message);
  return inserted.id;
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
  staffRole = 'agent'
) {
  if (!password || password.length < 6) {
    throw new Error('Şifre en az 6 karakter olmalıdır');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = fullName.trim();

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

    const profileId = await ensureStaffProfile(userId, companyId, trimmedName);

    if (existingStaff) {
      const { data: staff, error: staffUpdateError } = await adminClient
        .from('staff')
        .update({
          profile_id: profileId,
          name: trimmedName,
          role: staffRole,
          is_active: true,
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
        role: staffRole,
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

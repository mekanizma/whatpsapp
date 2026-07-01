/**
 * Staff user provisioning — auth account + profile + staff record
 */

import { adminClient } from '../database/supabase';

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

  const { data: existingStaff } = await adminClient
    .from('staff')
    .select('id')
    .eq('company_id', companyId)
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingStaff) {
    throw new Error('Bu e-posta adresi zaten personel olarak kayıtlı');
  }

  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const found = existingUsers?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);

  let userId: string;
  if (found) {
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', found.id)
      .maybeSingle();

    if (existingProfile?.role && existingProfile.role !== 'staff') {
      throw new Error('Bu e-posta adresi başka bir hesap türüne ait');
    }
    if (existingProfile?.company_id && existingProfile.company_id !== companyId) {
      throw new Error('Bu e-posta adresi başka bir şirkete bağlı');
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'staff' },
    });
    if (updateError) throw new Error(updateError.message);
    userId = found.id;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'staff' },
    });
    if (error) throw new Error(error.message);
    userId = data.user.id;
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        company_id: companyId,
        full_name: fullName,
        role: 'staff',
        is_active: true,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();

  if (profileError) throw new Error(profileError.message);

  const { data: staff, error: staffError } = await adminClient
    .from('staff')
    .insert({
      company_id: companyId,
      profile_id: profile.id,
      name: fullName,
      email: normalizedEmail,
      role: staffRole,
    })
    .select()
    .single();

  if (staffError) throw new Error(staffError.message);

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

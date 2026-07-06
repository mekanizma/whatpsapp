/**
 * Password management via Supabase Auth admin API
 */

import { adminClient } from '../database/supabase';

const MIN_PASSWORD_LENGTH = 6;

function sanitizeSearchTerm(value: string): string {
  return value.replace(/[%_\\,().]/g, '').trim().slice(0, 80);
}

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Şifre en az 6 karakter olmalıdır');
  }
}

async function getAuthEmail(userId: string): Promise<string | null> {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email || null;
}

export async function resetUserPasswordByProfileId(
  profileId: string,
  password: string
): Promise<{ profileId: string; email: string | null }> {
  validatePassword(password);

  const { data: profile, error } = await adminClient
    .from('profiles')
    .select('id, user_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile?.user_id) throw new Error('Kullanıcı bulunamadı');

  const { error: authError } = await adminClient.auth.admin.updateUserById(profile.user_id, {
    password,
  });
  if (authError) throw new Error(authError.message);

  return {
    profileId: profile.id,
    email: await getAuthEmail(profile.user_id),
  };
}

export interface PlatformUserRow {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  email: string | null;
}

export async function listPlatformUsers(
  page = 1,
  limit = 50,
  search = ''
): Promise<{
  users: PlatformUserRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const offset = (page - 1) * limit;
  const term = sanitizeSearchTerm(search).toLowerCase();

  let query = adminClient
    .from('profiles')
    .select('id, user_id, full_name, role, is_active, created_at, company_id', {
      count: 'exact',
    })
    .order('created_at', { ascending: false });

  if (term) {
    query = query.ilike('full_name', `%${term}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const rows = data || [];
  const companyIds = [...new Set(rows.map((row) => row.company_id).filter(Boolean))] as string[];

  let companyMap = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies, error: companyError } = await adminClient
      .from('companies')
      .select('id, company_name')
      .in('id', companyIds);

    if (companyError) throw new Error(companyError.message);

    for (const company of companies || []) {
      companyMap.set(company.id, company.company_name);
    }
  }

  const users = await Promise.all(
    rows.map(async (row) => {
      const email = row.user_id ? await getAuthEmail(row.user_id) : null;

      return {
        id: row.id,
        full_name: row.full_name,
        role: row.role,
        is_active: row.is_active,
        created_at: row.created_at,
        company_id: row.company_id,
        company_name: row.company_id ? companyMap.get(row.company_id) || null : null,
        email,
      };
    })
  );

  const filtered = term
    ? users.filter(
        (u) =>
          u.full_name.toLowerCase().includes(term) ||
          (u.email && u.email.toLowerCase().includes(term)) ||
          (u.company_name && u.company_name.toLowerCase().includes(term))
      )
    : users;

  const total = count || 0;

  return {
    users: filtered,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function enrichProfilesWithEmail<
  T extends { user_id?: string | null; id: string }
>(profiles: T[]): Promise<(T & { email: string | null })[]> {
  return Promise.all(
    profiles.map(async (profile) => ({
      ...profile,
      email: profile.user_id ? await getAuthEmail(profile.user_id) : null,
    }))
  );
}

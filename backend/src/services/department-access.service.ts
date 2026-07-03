/**
 * Departman erişim yardımcıları — personel ve kayıt doğrulama
 */

import { adminClient } from '../database/supabase';
import type { Department } from '../types';

export async function getStaffDepartmentId(
  companyId: string,
  profileId?: string
): Promise<string | null> {
  if (!profileId) return null;

  const { data } = await adminClient
    .from('staff')
    .select('department_id')
    .eq('company_id', companyId)
    .eq('profile_id', profileId)
    .maybeSingle();

  return data?.department_id || null;
}

export async function getStaffRecord(
  companyId: string,
  profileId?: string
): Promise<{ id: string; department_id: string | null } | null> {
  if (!profileId) return null;

  const { data } = await adminClient
    .from('staff')
    .select('id, department_id')
    .eq('company_id', companyId)
    .eq('profile_id', profileId)
    .maybeSingle();

  return data || null;
}

export async function companyHasActiveDepartments(companyId: string): Promise<boolean> {
  const { count } = await adminClient
    .from('departments')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  return (count || 0) > 0;
}

export async function validateDepartmentBelongsToCompany(
  companyId: string,
  departmentId: string
): Promise<boolean> {
  const { data } = await adminClient
    .from('departments')
    .select('id')
    .eq('id', departmentId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();

  return !!data;
}

export async function listActiveDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await adminClient
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(error.message);
  return (data || []) as Department[];
}

export async function getDepartmentsForWhatsAppAccount(
  companyId: string,
  whatsappAccountId?: string | null
): Promise<Department[]> {
  if (!whatsappAccountId) {
    return listActiveDepartments(companyId);
  }

  const { data: links, error } = await adminClient
    .from('whatsapp_department_links')
    .select('department_id, departments:department_id(*)')
    .eq('whatsapp_account_id', whatsappAccountId);

  if (error) throw new Error(error.message);

  const departments = (links || [])
    .map((row) => {
      const dept = row.departments as Department | Department[] | null;
      return Array.isArray(dept) ? dept[0] : dept;
    })
    .filter((d): d is Department => !!d && d.is_active);

  if (departments.length > 0) {
    return departments.sort((a, b) => a.name.localeCompare(b.name));
  }

  return listActiveDepartments(companyId);
}

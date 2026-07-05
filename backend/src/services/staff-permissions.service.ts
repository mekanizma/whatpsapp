/**
 * Personel alt rolü yetkileri
 */

import { adminClient } from '../database/supabase';
import { UserRole } from '../types';

export type StaffSubRole = 'agent' | 'supervisor' | 'admin';

export const STAFF_ROLE_OPTIONS = ['agent', 'supervisor'] as const;
export type StaffRoleOption = (typeof STAFF_ROLE_OPTIONS)[number];

export function isSuperStaffRole(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'supervisor' || staffRole === 'admin';
}

export function staffCanAccessKnowledge(userRole: UserRole, staffRole?: StaffSubRole | null): boolean {
  if (userRole === 'company_admin' || userRole === 'super_admin') return true;
  if (userRole !== 'staff') return false;
  return isSuperStaffRole(staffRole);
}

export function normalizeStaffRoleInput(role: unknown): StaffRoleOption {
  if (role === 'supervisor' || role === 'admin') return 'supervisor';
  return 'agent';
}

export async function getStaffSubRoleForProfile(profileId: string): Promise<StaffSubRole | null> {
  const { data } = await adminClient
    .from('staff')
    .select('role')
    .eq('profile_id', profileId)
    .maybeSingle();

  return (data?.role as StaffSubRole | undefined) || null;
}

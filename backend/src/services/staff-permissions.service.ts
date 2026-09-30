/**
 * Personel alt rolü yetkileri
 *
 * agent      = Personel (normal)
 * admin      = Admin Personel (departman sorumlusu)
 * supervisor = Süper Personel (şirket geneli)
 */

import { adminClient } from '../database/supabase';
import { UserRole } from '../types';

export type StaffSubRole = 'agent' | 'supervisor' | 'admin';

export const STAFF_ROLE_OPTIONS = ['agent', 'admin', 'supervisor'] as const;
export type StaffRoleOption = (typeof STAFF_ROLE_OPTIONS)[number];

/** Süper personel — şirket geneli destek + bilgi bankası */
export function isSuperStaffRole(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'supervisor';
}

/** Admin personel — departman sorumlusu */
export function isAdminStaffRole(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'admin';
}

/** Bilgi bankası: yönetici veya süper personel */
export function staffCanAccessKnowledge(userRole: UserRole, staffRole?: StaffSubRole | null): boolean {
  if (userRole === 'company_admin' || userRole === 'super_admin') return true;
  if (userRole !== 'staff') return false;
  return isSuperStaffRole(staffRole);
}

/** Başka departmana aktarma: tüm personel (standart dahil) */
export function staffCanTransferTickets(
  userRole: UserRole,
  _staffRole?: StaffSubRole | null
): boolean {
  if (userRole === 'company_admin' || userRole === 'super_admin') return true;
  return userRole === 'staff';
}

/** Başkasına talep atama: yönetici, süper personel, admin personel — normal personel yok */
export function staffCanAssignTickets(
  userRole: UserRole,
  staffRole?: StaffSubRole | null
): boolean {
  if (userRole === 'company_admin' || userRole === 'super_admin') return true;
  if (userRole !== 'staff') return false;
  return isSuperStaffRole(staffRole) || isAdminStaffRole(staffRole);
}

export function normalizeStaffRoleInput(role: unknown): StaffRoleOption {
  if (role === 'supervisor') return 'supervisor';
  if (role === 'admin') return 'admin';
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

/**
 * Personel alt rolü — panel erişim kuralları
 */

import type { Profile, UserRole } from '@/types';

export type StaffSubRole = 'agent' | 'supervisor' | 'admin';
export type StaffRoleOption = 'agent' | 'supervisor';

export const STAFF_ROLE_OPTIONS: StaffRoleOption[] = ['agent', 'supervisor'];

export function isSuperStaff(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'supervisor' || staffRole === 'admin';
}

export function staffCanAccessKnowledge(user?: Profile | null): boolean {
  if (!user) return false;
  if (user.role === 'company_admin' || user.role === 'super_admin') return true;
  if (user.role !== 'staff') return false;
  return isSuperStaff(user.staff_role);
}

export function canSeeNavItem(
  userRole: UserRole,
  staffRole: StaffSubRole | null | undefined,
  navKey: 'messages' | 'knowledge' | 'tickets' | 'settings' | 'calendar'
): boolean {
  if (userRole === 'company_admin') return true;
  if (userRole !== 'staff') return false;

  if (navKey === 'messages' || navKey === 'settings' || navKey === 'tickets' || navKey === 'calendar') return true;
  if (navKey === 'knowledge') return isSuperStaff(staffRole);
  return false;
}

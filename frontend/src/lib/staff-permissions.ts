/**
 * Personel alt rolü — panel erişim kuralları
 *
 * agent      = Personel
 * admin      = Admin Personel (departman sorumlusu)
 * supervisor = Süper Personel
 */

import type { Profile, UserRole } from '@/types';

export type StaffSubRole = 'agent' | 'supervisor' | 'admin';
export type StaffRoleOption = 'agent' | 'admin' | 'supervisor';

export const STAFF_ROLE_OPTIONS: StaffRoleOption[] = ['agent', 'admin', 'supervisor'];

export function isSuperStaff(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'supervisor';
}

export function isAdminStaff(staffRole?: StaffSubRole | null): boolean {
  return staffRole === 'admin';
}

export function staffCanAccessKnowledge(user?: Profile | null): boolean {
  if (!user) return false;
  if (user.role === 'company_admin' || user.role === 'super_admin') return true;
  if (user.role !== 'staff') return false;
  return isSuperStaff(user.staff_role);
}

/** Meta outreach şablonu ile yeni konuşma başlatma (yönetici / süper personel) */
export function canStartWaOutreach(user?: Profile | null): boolean {
  if (!user) return false;
  if (user.role === 'company_admin' || user.role === 'super_admin') return true;
  if (user.role !== 'staff') return false;
  return isSuperStaff(user.staff_role);
}

/** Başka departmana aktarma — tüm personel (standart dahil) */
export function canTransferTickets(user?: Profile | null): boolean {
  if (!user) return false;
  if (user.role === 'company_admin' || user.role === 'super_admin') return true;
  return user.role === 'staff';
}

/** Başkasına talep atama — normal personelde yok (admin / süper personel) */
export function canAssignTickets(user?: Profile | null): boolean {
  if (!user) return false;
  if (user.role === 'company_admin' || user.role === 'super_admin') return true;
  if (user.role !== 'staff') return false;
  return isSuperStaff(user.staff_role) || isAdminStaff(user.staff_role);
}

export function canSeeNavItem(
  userRole: UserRole,
  staffRole: StaffSubRole | null | undefined,
  navKey: 'messages' | 'knowledge' | 'tickets' | 'settings' | 'calendar' | 'quick_replies'
): boolean {
  if (userRole === 'company_admin') return true;
  if (userRole !== 'staff') return false;

  if (
    navKey === 'messages' ||
    navKey === 'settings' ||
    navKey === 'tickets' ||
    navKey === 'calendar' ||
    navKey === 'quick_replies'
  ) {
    return true;
  }
  if (navKey === 'knowledge') return isSuperStaff(staffRole);
  return false;
}

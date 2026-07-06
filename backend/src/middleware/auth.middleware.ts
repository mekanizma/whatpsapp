/**
 * Authentication middleware
 * Validates Supabase JWT and attaches user profile to request
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { DEMO_TOKENS, demoProfilesByToken } from '../demo/mockData';
import { getStaffSubRoleForProfile, staffCanAccessKnowledge } from '../services/staff-permissions.service';
import { Profile, UserRole, StaffSubRole } from '../types';

export interface AuthRequest extends Request {
  userId?: string;
  profile?: Profile;
  companyId?: string | null;
  role?: UserRole;
  staffRole?: StaffSubRole | null;
  accessToken?: string;
  isImpersonating?: boolean;
}

const IMPERSONATE_HEADER = 'x-impersonate-company';

async function applyImpersonation(req: AuthRequest): Promise<void> {
  if (req.role !== 'super_admin') return;

  const raw = req.headers[IMPERSONATE_HEADER];
  const companyId = typeof raw === 'string' ? raw.trim() : null;
  if (!companyId) return;

  if (config.demoMode && isDemoSession(req)) {
    req.companyId = demoProfilesByToken[req.accessToken!]?.company_id ?? companyId;
    req.isImpersonating = true;
    return;
  }

  const { data: company, error } = await adminClient
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!company) throw new Error('Geçersiz şirket kimliği');

  req.companyId = companyId;
  req.isImpersonating = true;
}

/** Yalnızca demo token ile giriş yapılmış oturumlar (gerçek Supabase JWT değil) */
export function isDemoSession(req: AuthRequest): boolean {
  return !!(config.demoMode && req.accessToken && demoProfilesByToken[req.accessToken]);
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Yetkilendirme token\'ı gerekli' });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (config.demoMode && Object.values(DEMO_TOKENS).includes(token as typeof DEMO_TOKENS[keyof typeof DEMO_TOKENS])) {
      const profile = demoProfilesByToken[token];
      req.userId = profile.user_id;
      req.profile = profile;
      req.companyId = profile.company_id;
      req.role = profile.role;
      req.staffRole = profile.staff_role ?? null;
      req.accessToken = token;
      await applyImpersonation(req);
      if (req.isImpersonating && req.role === 'super_admin') {
        req.companyId = demoProfilesByToken[DEMO_TOKENS.company].company_id;
      }
      next();
      return;
    }

    const { data: { user }, error } = await adminClient.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ success: false, error: 'Geçersiz veya süresi dolmuş token' });
      return;
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      res.status(401).json({ success: false, error: 'Kullanıcı profili bulunamadı' });
      return;
    }

    if (!profile.is_active) {
      res.status(403).json({ success: false, error: 'Hesabınız devre dışı bırakılmış' });
      return;
    }

    req.userId = user.id;
    req.profile = profile as Profile;
    req.companyId = profile.company_id;
    req.role = profile.role as UserRole;
    req.accessToken = token;

    if (req.role === 'staff') {
      req.staffRole = await getStaffSubRoleForProfile(profile.id);
    }

    await applyImpersonation(req);

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Kimlik doğrulama hatası';
    const status = message.includes('Geçersiz şirket') ? 403 : 500;
    res.status(status).json({ success: false, error: message });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.role) {
      res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok' });
      return;
    }
    if (roles.includes(req.role)) {
      next();
      return;
    }
    if (
      req.role === 'super_admin' &&
      req.isImpersonating &&
      (roles.includes('company_admin') || roles.includes('staff'))
    ) {
      next();
      return;
    }
    res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok' });
  };
}

/** Bilgi bankası — yalnızca firma yöneticisi ve süper personel */
export function requireKnowledgeAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.role || !staffCanAccessKnowledge(req.role, req.staffRole)) {
    res.status(403).json({ success: false, error: 'Bilgi bankasına erişim yetkiniz yok' });
    return;
  }
  next();
}

export function requireCompany(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.role === 'super_admin' && !req.isImpersonating) {
    next();
    return;
  }
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }
  next();
}

/** Super admin hariç yalnızca kendi şirketine erişim */
export function resolveAuthorizedCompanyId(
  req: AuthRequest,
  paramId?: string
): string | null {
  const targetId = paramId || req.companyId;
  if (!targetId) return null;
  if (req.role === 'super_admin') return targetId;
  if (req.companyId && req.companyId === targetId) return targetId;
  return null;
}

export function denyUnlessCompanyAccess(
  req: AuthRequest,
  res: Response,
  companyId: string | null
): companyId is string {
  if (companyId) return true;
  res.status(403).json({ success: false, error: 'Bu şirket verisine erişim yetkiniz yok' });
  return false;
}

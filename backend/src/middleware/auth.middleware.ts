/**
 * Authentication middleware
 * Validates Supabase JWT and attaches user profile to request
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { adminClient } from '../database/supabase';
import { DEMO_TOKENS, demoProfilesByToken } from '../demo/mockData';
import { Profile, UserRole } from '../types';

export interface AuthRequest extends Request {
  userId?: string;
  profile?: Profile;
  companyId?: string | null;
  role?: UserRole;
  accessToken?: string;
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
      req.accessToken = token;
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

    next();
  } catch {
    res.status(500).json({ success: false, error: 'Kimlik doğrulama hatası' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.role || !roles.includes(req.role)) {
      res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok' });
      return;
    }
    next();
  };
}

export function requireCompany(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.role === 'super_admin') {
    next();
    return;
  }
  if (!req.companyId) {
    res.status(403).json({ success: false, error: 'Şirket bilgisi bulunamadı' });
    return;
  }
  next();
}

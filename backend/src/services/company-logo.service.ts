/**
 * Şirket logosu — Supabase Storage (company-assets)
 */

import { adminClient } from '../database/supabase';

const BUCKET = 'company-assets';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function resolveImageExtension(mimeType: string, filename?: string): string {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;

  const fromName = filename?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }

  return 'png';
}

export function buildCompanyLogoPath(companyId: string, mimeType: string, filename?: string): string {
  const ext = resolveImageExtension(mimeType, filename);
  return `${companyId}/logo.${ext}`;
}

export async function uploadCompanyLogoFile(
  companyId: string,
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<string> {
  const path = buildCompanyLogoPath(companyId, mimeType, filename);

  const { error } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = adminClient.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteCompanyLogoFiles(companyId: string): Promise<void> {
  const paths = ['jpg', 'png', 'webp', 'gif'].map((ext) => `${companyId}/logo.${ext}`);
  const { error } = await adminClient.storage.from(BUCKET).remove(paths);
  if (error) {
    console.warn('[CompanyLogo] Silme uyarısı:', error.message);
  }
}

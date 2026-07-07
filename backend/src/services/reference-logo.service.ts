/**
 * Referans logosu — Supabase Storage (company-assets/reference-logos)
 */

import { adminClient } from '../database/supabase';

const BUCKET = 'company-assets';
const PREFIX = 'reference-logos';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

function resolveImageExtension(mimeType: string, filename?: string): string {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;

  const fromName = filename?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }

  return 'png';
}

export function buildReferenceLogoPath(id: string, mimeType: string, filename?: string): string {
  const ext = resolveImageExtension(mimeType, filename);
  return `${PREFIX}/${id}.${ext}`;
}

export async function uploadReferenceLogoFile(
  id: string,
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<string> {
  const path = buildReferenceLogoPath(id, mimeType, filename);

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

export async function deleteReferenceLogoFiles(id: string): Promise<void> {
  const paths = ['jpg', 'png', 'webp', 'gif', 'svg'].map((ext) => `${PREFIX}/${id}.${ext}`);
  const { error } = await adminClient.storage.from(BUCKET).remove(paths);
  if (error) {
    console.warn('[ReferenceLogo] Silme uyarısı:', error.message);
  }
}

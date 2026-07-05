/**
 * Mesaj medya dosyaları — Supabase Storage
 */

import { adminClient } from '../database/supabase';

const BUCKET = 'message-media';
const SIGNED_URL_TTL_SEC = 3600;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function resolveImageExtension(mimeType: string, filename?: string): string {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;

  const fromName = filename?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }

  return 'jpg';
}

export function buildMessageMediaPath(
  companyId: string,
  messageId: string,
  mimeType: string,
  filename?: string
): string {
  const ext = resolveImageExtension(mimeType, filename);
  return `${companyId}/${messageId}.${ext}`;
}

export async function uploadMessageMedia(
  companyId: string,
  messageId: string,
  buffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<{ path: string; filename: string }> {
  const path = buildMessageMediaPath(companyId, messageId, mimeType, filename);
  const mediaFilename = filename || `${messageId}.${resolveImageExtension(mimeType, filename)}`;

  const { error } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { path, filename: mediaFilename };
}

export async function downloadMessageMedia(
  path: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const { data, error } = await adminClient.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message || 'Medya dosyası bulunamadı');
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const mimeType = data.type || 'application/octet-stream';
  const filename = path.split('/').pop() || 'image.jpg';

  return { buffer, mimeType, filename };
}

export async function createSignedMediaUrl(path: string): Promise<string | null> {
  const { data, error } = await adminClient.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.error('[MessageMedia] Signed URL hatası:', error?.message);
    return null;
  }

  return data.signedUrl;
}

export async function attachSignedMediaUrls<T extends { media_path?: string | null }>(
  rows: T[]
): Promise<(T & { media_url: string | null })[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.media_path) {
        return { ...row, media_url: null };
      }
      const media_url = await createSignedMediaUrl(row.media_path);
      return { ...row, media_url };
    })
  );
}

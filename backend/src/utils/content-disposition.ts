/**
 * RFC 6266 / RFC 5987 uyumlu Content-Disposition üretir.
 * Türkçe karakterler HTTP başlığında ERR_INVALID_CHAR hatasına yol açmaz.
 */
export function buildContentDisposition(filename: string, inline = false): string {
  const disposition = inline ? 'inline' : 'attachment';
  const asciiFallback =
    filename
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 180) || 'download.pdf';

  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * Giden kanal mesajları (WhatsApp / Meta) — markdown linkleri düz URL'ye çevirir
 */

/** [metin](https://...) veya [https://...](https://...) → https://... */
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

/** <https://...> → https://... */
const ANGLE_LINK_RE = /<(https?:\/\/[^>\s]+)>/gi;

export function formatOutboundMessage(text: string): string {
  return text.replace(MARKDOWN_LINK_RE, '$2').replace(ANGLE_LINK_RE, '$1');
}

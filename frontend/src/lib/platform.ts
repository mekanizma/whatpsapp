/** Platform WhatsApp hattı — başvuru bildirimleri ve landing chat bot */
export const PLATFORM_WHATSAPP_PHONE =
  import.meta.env.VITE_PLATFORM_WHATSAPP_PHONE?.replace(/\D/g, '') || '905338507761';

/** Canlı demo WhatsApp hattı — onboarding "Canlı Demo" butonu */
export const LIVE_DEMO_WHATSAPP_PHONE =
  import.meta.env.VITE_LIVE_DEMO_WHATSAPP_PHONE?.replace(/\D/g, '') || PLATFORM_WHATSAPP_PHONE;

export function buildLiveDemoWhatsAppUrl(prefillMessage: string): string {
  return `https://wa.me/${LIVE_DEMO_WHATSAPP_PHONE}?text=${encodeURIComponent(prefillMessage)}`;
}

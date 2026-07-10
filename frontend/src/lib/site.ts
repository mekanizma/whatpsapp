/** Site ve KKTC geo sabitleri — yalnızca SEO / head etiketleri için */

const DEFAULT_SITE_URL = 'https://waai.mekanizma.com';

export function getSiteUrl(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_SITE_URL;
}

export const SITE_BRAND = {
  name: 'Waai',
  productName: 'WhatsApp AI Temsilci',
  legalName: 'Mekanizma',
  email: 'info@mekanizma.com',
  phone: '+90 533 850 77 61',
  ogImagePath: '/waai-logo.png',
} as const;

/** KKTC / Kuzey Kıbrıs — yerel SEO sinyalleri (görünür UI metni değil) */
export const SITE_GEO = {
  locality: 'Girne',
  region: 'KKTC',
  countryName: 'Kuzey Kıbrıs Türk Cumhuriyeti',
  countryNameEn: 'Turkish Republic of Northern Cyprus',
  streetAddress: 'Beşparmaklar Caddesi, No: 6, Çatalköy',
  postalCode: '9932',
  latitude: 35.3366,
  longitude: 33.3173,
  areaServed: [
    'KKTC',
    'Kuzey Kıbrıs',
    'Girne',
    'Lefkoşa',
    'Gazimağusa',
    'Güzelyurt',
    'İskele',
    'Kyrenia',
    'Nicosia',
    'Famagusta',
  ],
} as const;

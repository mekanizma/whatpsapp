import { getSiteUrl, SITE_BRAND, SITE_GEO } from '@/lib/site';

export interface PageSeoConfig {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath: string;
  robots?: string;
  ogType?: string;
  includeLocalBusinessSchema?: boolean;
  includeSoftwareSchema?: boolean;
}

function trKeywords(extra = ''): string {
  return [
    'KKTC WhatsApp AI',
    'Kuzey Kıbrıs yapay zeka',
    'Girne WhatsApp bot',
    'Lefkoşa müşteri destek',
    'KKTC işletme otomasyon',
    'WhatsApp müşteri temsilcisi',
    extra,
  ]
    .filter(Boolean)
    .join(', ');
}

function enKeywords(extra = ''): string {
  return [
    'Northern Cyprus WhatsApp AI',
    'TRNC AI customer support',
    'Kyrenia business automation',
    'Nicosia WhatsApp bot',
    'Cyprus AI assistant',
    extra,
  ]
    .filter(Boolean)
    .join(', ');
}

const PRIVATE_ROBOTS = 'noindex, nofollow';

const TR_PAGES: Record<string, PageSeoConfig> = {
  home: {
    title: `${SITE_BRAND.productName} | KKTC İşletmeler için Yapay Zeka Destek`,
    description:
      'Kuzey Kıbrıs genelinde işletmeler için WhatsApp yapay zeka müşteri temsilcisi. Girne, Lefkoşa, Gazimağusa ve KKTC çapında 7/24 otomatik yanıt, canlı aktarım ve bilgi bankası desteği.',
    keywords: trKeywords(),
    canonicalPath: '/',
    ogType: 'website',
    includeLocalBusinessSchema: true,
    includeSoftwareSchema: true,
  },
  pricing: {
    title: `Fiyatlar | ${SITE_BRAND.productName} — KKTC`,
    description:
      'Kuzey Kıbrıs işletmeleri için WhatsApp AI temsilci paketleri ve abonelik planları. KKTC genelinde ölçeklenebilir müşteri destek çözümü.',
    keywords: trKeywords('KKTC fiyat paketleri'),
    canonicalPath: '/pricing',
    ogType: 'website',
    includeSoftwareSchema: true,
  },
  login: {
    title: `Giriş | ${SITE_BRAND.productName}`,
    description: 'KKTC işletme paneli girişi — WhatsApp AI müşteri temsilci yönetimi.',
    canonicalPath: '/login',
    robots: PRIVATE_ROBOTS,
  },
  register: {
    title: `Kayıt | ${SITE_BRAND.productName} — KKTC`,
    description:
      'Kuzey Kıbrıs işletmeniz için WhatsApp yapay zeka temsilci başvurusu. KKTC genelinde hızlı kurulum.',
    keywords: trKeywords('işletme kayıt'),
    canonicalPath: '/register',
    robots: PRIVATE_ROBOTS,
  },
  adminLogin: {
    title: `Yönetici Girişi | ${SITE_BRAND.productName}`,
    description: 'Platform yönetici girişi.',
    canonicalPath: '/admin/login',
    robots: PRIVATE_ROBOTS,
  },
  private: {
    title: SITE_BRAND.productName,
    description: 'WhatsApp AI müşteri temsilci platformu.',
    canonicalPath: '/',
    robots: PRIVATE_ROBOTS,
  },
};

const EN_PAGES: Record<string, PageSeoConfig> = {
  home: {
    title: `${SITE_BRAND.productName} | AI Customer Support for Northern Cyprus`,
    description:
      'WhatsApp AI assistant for businesses across Northern Cyprus (TRNC). Automated replies, live handoff, and knowledge base support in Kyrenia, Nicosia, Famagusta, and island-wide.',
    keywords: enKeywords(),
    canonicalPath: '/',
    ogType: 'website',
    includeLocalBusinessSchema: true,
    includeSoftwareSchema: true,
  },
  pricing: {
    title: `Pricing | ${SITE_BRAND.productName} — Northern Cyprus`,
    description:
      'Subscription plans for WhatsApp AI customer support tailored to TRNC businesses.',
    keywords: enKeywords('pricing plans'),
    canonicalPath: '/pricing',
    ogType: 'website',
    includeSoftwareSchema: true,
  },
  login: {
    title: `Sign in | ${SITE_BRAND.productName}`,
    description: 'Business panel sign-in for WhatsApp AI customer support.',
    canonicalPath: '/login',
    robots: PRIVATE_ROBOTS,
  },
  register: {
    title: `Register | ${SITE_BRAND.productName} — TRNC`,
    description: 'Apply for WhatsApp AI customer support for your Northern Cyprus business.',
    keywords: enKeywords('business registration'),
    canonicalPath: '/register',
    robots: PRIVATE_ROBOTS,
  },
  adminLogin: {
    title: `Admin sign-in | ${SITE_BRAND.productName}`,
    description: 'Platform administrator sign-in.',
    canonicalPath: '/admin/login',
    robots: PRIVATE_ROBOTS,
  },
  private: {
    title: SITE_BRAND.productName,
    description: 'WhatsApp AI customer support platform.',
    canonicalPath: '/',
    robots: PRIVATE_ROBOTS,
  },
};

function resolvePageKey(pathname: string): keyof typeof TR_PAGES {
  if (pathname === '/' || pathname === '/welcome') return 'home';
  if (pathname === '/pricing') return 'pricing';
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/admin/login') return 'adminLogin';
  if (pathname.startsWith('/panel') || pathname.startsWith('/admin')) return 'private';
  return 'home';
}

export function resolvePageSeo(pathname: string, language: string): PageSeoConfig {
  const isEn = language.startsWith('en');
  const pages = isEn ? EN_PAGES : TR_PAGES;
  const key = resolvePageKey(pathname);
  return pages[key];
}

export function buildCanonicalUrl(path: string): string {
  const base = getSiteUrl();
  if (path === '/' || !path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildGeoMetaContent() {
  const { latitude, longitude, locality, countryName } = SITE_GEO;
  return {
    region: 'CY',
    placename: `${locality}, KKTC, ${countryName}`,
    position: `${latitude};${longitude}`,
    icbm: `${latitude}, ${longitude}`,
  };
}

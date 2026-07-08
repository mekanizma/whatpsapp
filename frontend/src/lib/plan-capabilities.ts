/**
 * Paket türüne göre müşteri paneli modül erişimi
 */

export const PLAN_MODULE_KEYS = [
  'dashboard',
  'messages',
  'customers',
  'knowledge',
  'unknown_questions',
  'tickets',
  'calendar',
  'staff',
  'whatsapp',
  'subscription',
  'settings',
  'website',
  'order_status',
  'shipping_tracking',
  'cart',
  'returns',
] as const;

export type PlanModuleKey = (typeof PLAN_MODULE_KEYS)[number];

const ECOMMERCE_MODULES: PlanModuleKey[] = [
  'dashboard',
  'messages',
  'customers',
  'knowledge',
  'unknown_questions',
  'tickets',
  'calendar',
  'staff',
  'whatsapp',
  'subscription',
  'settings',
  'website',
  'order_status',
  'shipping_tracking',
  'cart',
  'returns',
];

const PLAN_MODULES: Record<string, PlanModuleKey[]> = {
  starter: ['dashboard', 'messages', 'knowledge', 'whatsapp', 'subscription', 'settings'],
  business: [
    'dashboard',
    'messages',
    'customers',
    'knowledge',
    'unknown_questions',
    'tickets',
    'calendar',
    'staff',
    'whatsapp',
    'subscription',
    'settings',
  ],
  enterprise: [...PLAN_MODULE_KEYS],
  e_ticaret: ECOMMERCE_MODULES,
  eticaret: ECOMMERCE_MODULES,
};

/** DB'de plan_type bazen "E-ticaret (5000 ai görüşme)" gibi serbest metin olabilir */
export function normalizePlanType(planType?: string | null): string {
  if (!planType) return 'starter';
  const raw = planType
    .trim()
    .toLowerCase()
    .replace(/\r?\n/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (
    raw === 'eticaret' ||
    raw === 'e_ticaret' ||
    raw === 'e_commerce' ||
    raw === 'ecommerce' ||
    raw.includes('e_ticaret') ||
    raw.includes('eticaret') ||
    raw.includes('e_commerce') ||
    raw.includes('ecommerce')
  ) {
    return 'e_ticaret';
  }
  if (raw === 'business' || raw.startsWith('business_')) return 'business';
  if (raw === 'enterprise' || raw.startsWith('enterprise_')) return 'enterprise';
  if (raw === 'starter' || raw.startsWith('starter_')) return 'starter';
  return raw || 'starter';
}

export const NAV_MODULE_MAP: Record<string, PlanModuleKey> = {
  '/panel/dashboard': 'dashboard',
  '/panel/messages': 'messages',
  '/panel/customers': 'customers',
  '/panel/knowledge': 'knowledge',
  '/panel/unknown-questions': 'unknown_questions',
  '/panel/tickets': 'tickets',
  '/panel/calendar': 'calendar',
  '/panel/website': 'website',
  '/panel/order-status': 'order_status',
  '/panel/shipping-tracking': 'shipping_tracking',
  '/panel/cart': 'cart',
  '/panel/returns': 'returns',
  '/panel/staff': 'staff',
  '/panel/whatsapp': 'whatsapp',
  '/panel/subscription': 'subscription',
  '/panel/settings': 'settings',
};

export function getPlanModules(planType?: string | null): PlanModuleKey[] {
  const normalized = normalizePlanType(planType);
  return PLAN_MODULES[normalized] || PLAN_MODULES.starter;
}

export function planHasModule(planType: string | null | undefined, module: PlanModuleKey): boolean {
  return getPlanModules(planType).includes(module);
}

export function routeAllowedForPlan(path: string, planType?: string | null): boolean {
  const module = NAV_MODULE_MAP[path];
  if (!module) return true;
  return planHasModule(planType, module);
}

export const WHATSAPP_LINE_LIMITS = {
  starter: 1,
  business: 3,
  enterprise: 999,
  e_ticaret: 2,
  eticaret: 2,
} as const;

export function getWhatsAppLineLimit(planType?: string | null): number {
  const normalized = normalizePlanType(planType);
  return WHATSAPP_LINE_LIMITS[normalized as keyof typeof WHATSAPP_LINE_LIMITS] ?? WHATSAPP_LINE_LIMITS.starter;
}

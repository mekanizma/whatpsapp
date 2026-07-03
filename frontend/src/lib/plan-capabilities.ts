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
] as const;

export type PlanModuleKey = (typeof PLAN_MODULE_KEYS)[number];

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
};

export const NAV_MODULE_MAP: Record<string, PlanModuleKey> = {
  '/panel/dashboard': 'dashboard',
  '/panel/messages': 'messages',
  '/panel/customers': 'customers',
  '/panel/knowledge': 'knowledge',
  '/panel/unknown-questions': 'unknown_questions',
  '/panel/tickets': 'tickets',
  '/panel/calendar': 'calendar',
  '/panel/staff': 'staff',
  '/panel/whatsapp': 'whatsapp',
  '/panel/subscription': 'subscription',
  '/panel/settings': 'settings',
};

export function getPlanModules(planType?: string | null): PlanModuleKey[] {
  if (!planType) return PLAN_MODULES.starter;
  return PLAN_MODULES[planType] || PLAN_MODULES.starter;
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
} as const;

export function getWhatsAppLineLimit(planType?: string | null): number {
  if (!planType) return WHATSAPP_LINE_LIMITS.starter;
  return WHATSAPP_LINE_LIMITS[planType as keyof typeof WHATSAPP_LINE_LIMITS] ?? WHATSAPP_LINE_LIMITS.starter;
}

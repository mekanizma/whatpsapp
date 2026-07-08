/**
 * Paket türüne göre panel modül erişimi ve plan normalizasyonu
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

export interface CompanyPlanSnapshot {
  plan_type: string;
  name: string;
  description: string | null;
  features: string[];
  message_limit: number;
  user_limit: number;
  messages_limit: number;
  messages_used: number;
  users_limit: number;
  status: string;
}

function normalizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export const WHATSAPP_LINE_LIMITS = {
  starter: 1,
  business: 3,
  enterprise: 999,
  e_ticaret: 2,
  eticaret: 2,
} as const;

export function getWhatsAppLineLimit(planType: string): number {
  const normalized = normalizePlanType(planType);
  return WHATSAPP_LINE_LIMITS[normalized as keyof typeof WHATSAPP_LINE_LIMITS] ?? WHATSAPP_LINE_LIMITS.starter;
}

export function getPlanModules(planType: string): PlanModuleKey[] {
  const normalized = normalizePlanType(planType);
  return PLAN_MODULES[normalized] || PLAN_MODULES.starter;
}

export function planHasModule(planType: string, module: PlanModuleKey): boolean {
  return getPlanModules(planType).includes(module);
}

export function mapSubscriptionToCompanyPlan(
  subscription: Record<string, unknown> | null | undefined
): CompanyPlanSnapshot | null {
  if (!subscription) return null;

  const rawPlan = subscription.subscription_plans ?? subscription.plan;
  const plan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  if (!plan || typeof plan !== 'object') return null;

  const planRow = plan as Record<string, unknown>;
  const planType = String(planRow.plan_type || 'starter');

  return {
    plan_type: planType,
    name: String(planRow.name || planType),
    description: typeof planRow.description === 'string' ? planRow.description : null,
    features: normalizeFeatures(planRow.features),
    message_limit: Number(planRow.message_limit) || 0,
    user_limit: Number(planRow.user_limit) || 0,
    messages_limit: Number(subscription.messages_limit) || Number(planRow.message_limit) || 0,
    messages_used: Number(subscription.messages_used) || 0,
    users_limit: Number(subscription.users_limit) || Number(planRow.user_limit) || 0,
    status: String(subscription.status || 'trial'),
  };
}

/**
 * E-ticaret operasyonları — sipariş, kargo, sepet, iade
 */

import { adminClient } from '../database/supabase';
import { planHasModule, type PlanModuleKey } from './plan-capabilities.service';

export type EcommerceProvider = 'manual' | 'shopify' | 'woocommerce' | 'custom';
export type EcommerceApiAuthType = 'bearer' | 'api_key' | 'header';
export type EcommerceApiTestStatus = 'ok' | 'failed' | 'untested';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded';

export type ShipmentStatus =
  | 'label_created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'exception';

export type CartStatus = 'abandoned' | 'reminded' | 'recovered' | 'expired';

export type ReturnRequestType = 'return' | 'exchange';

export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'in_transit'
  | 'received'
  | 'refunded'
  | 'completed'
  | 'cancelled';

export interface EcommerceSettings {
  company_id: string;
  store_name: string | null;
  store_url: string | null;
  provider: EcommerceProvider;
  api_base_url: string | null;
  api_key: string | null;
  api_enabled: boolean;
  api_auth_type: EcommerceApiAuthType;
  api_auth_header_name: string | null;
  products_path: string | null;
  product_search_path: string | null;
  stock_path: string | null;
  order_status_path: string | null;
  shipping_path: string | null;
  api_connected_at: string | null;
  last_test_status: EcommerceApiTestStatus | null;
  last_test_at: string | null;
  last_test_message: string | null;
  order_status_enabled: boolean;
  shipping_tracking_enabled: boolean;
  cart_abandonment_enabled: boolean;
  returns_enabled: boolean;
  return_policy_text: string | null;
  cart_reminder_hours: number;
  created_at: string;
  updated_at: string;
}

export interface EcommerceOrder {
  id: string;
  company_id: string;
  order_number: string;
  customer_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_amount: number | null;
  currency: string;
  items_summary: string | null;
  notes: string | null;
  ordered_at: string;
  created_at: string;
  updated_at: string;
}

export interface EcommerceShipment {
  id: string;
  company_id: string;
  order_id: string | null;
  order_number: string | null;
  tracking_number: string;
  carrier: string | null;
  status: ShipmentStatus;
  tracking_url: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  estimated_delivery: string | null;
  last_event: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EcommerceCart {
  id: string;
  company_id: string;
  customer_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  cart_total: number | null;
  currency: string;
  items_summary: string | null;
  item_count: number;
  status: CartStatus;
  external_cart_id: string | null;
  abandoned_at: string;
  reminded_at: string | null;
  recovered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EcommerceReturnRequest {
  id: string;
  company_id: string;
  order_id: string | null;
  order_number: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  request_type: ReturnRequestType;
  reason: string | null;
  items_summary: string | null;
  status: ReturnStatus;
  staff_notes: string | null;
  created_at: string;
  updated_at: string;
}

const ECOMMERCE_MODULES: PlanModuleKey[] = [
  'order_status',
  'shipping_tracking',
  'cart',
  'returns',
  'website',
];

async function getCompanyPlanType(companyId: string): Promise<string> {
  const { data: sub } = await adminClient
    .from('subscriptions')
    .select('plan:plan_id(plan_type)')
    .eq('company_id', companyId)
    .maybeSingle();

  const planRow = sub?.plan;
  const plan = Array.isArray(planRow) ? planRow[0] : planRow;
  if (plan && typeof plan === 'object' && 'plan_type' in plan) {
    return String((plan as { plan_type: string }).plan_type);
  }

  const { data: company } = await adminClient
    .from('companies')
    .select('subscription_plan')
    .eq('id', companyId)
    .single();

  return String(company?.subscription_plan || 'starter');
}

export async function companyCanUseEcommerce(companyId: string): Promise<boolean> {
  const planType = await getCompanyPlanType(companyId);
  return ECOMMERCE_MODULES.some((module) => planHasModule(planType, module));
}

export async function companyHasEcommerceModule(
  companyId: string,
  module: PlanModuleKey
): Promise<boolean> {
  const planType = await getCompanyPlanType(companyId);
  return planHasModule(planType, module);
}

function defaultSettings(companyId: string): EcommerceSettings {
  const now = new Date().toISOString();
  return {
    company_id: companyId,
    store_name: null,
    store_url: null,
    provider: 'manual',
    api_base_url: null,
    api_key: null,
    api_enabled: false,
    api_auth_type: 'bearer',
    api_auth_header_name: 'Authorization',
    products_path: '/products',
    product_search_path: '/products/search',
    stock_path: '/products/{sku}/stock',
    order_status_path: '/orders/{orderNumber}',
    shipping_path: '/shipping/{trackingNumber}',
    api_connected_at: null,
    last_test_status: 'untested',
    last_test_at: null,
    last_test_message: null,
    order_status_enabled: true,
    shipping_tracking_enabled: true,
    cart_abandonment_enabled: true,
    returns_enabled: true,
    return_policy_text: null,
    cart_reminder_hours: 24,
    created_at: now,
    updated_at: now,
  };
}

export async function getEcommerceSettings(companyId: string): Promise<EcommerceSettings> {
  const { data, error } = await adminClient
    .from('ecommerce_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as EcommerceSettings) || defaultSettings(companyId);
}

export async function upsertEcommerceSettings(
  companyId: string,
  patch: Partial<Omit<EcommerceSettings, 'company_id' | 'created_at' | 'updated_at'>>
): Promise<EcommerceSettings> {
  const existing = await getEcommerceSettings(companyId);
  const payload = {
    company_id: companyId,
    store_name: patch.store_name !== undefined ? patch.store_name : existing.store_name,
    store_url: patch.store_url !== undefined ? patch.store_url : existing.store_url,
    provider: patch.provider || existing.provider,
    api_base_url: patch.api_base_url !== undefined ? patch.api_base_url : existing.api_base_url,
    api_key: patch.api_key !== undefined ? patch.api_key : existing.api_key,
    api_enabled: patch.api_enabled !== undefined ? patch.api_enabled : existing.api_enabled,
    api_auth_type: patch.api_auth_type || existing.api_auth_type,
    api_auth_header_name:
      patch.api_auth_header_name !== undefined
        ? patch.api_auth_header_name
        : existing.api_auth_header_name,
    products_path:
      patch.products_path !== undefined ? patch.products_path : existing.products_path,
    product_search_path:
      patch.product_search_path !== undefined
        ? patch.product_search_path
        : existing.product_search_path,
    stock_path: patch.stock_path !== undefined ? patch.stock_path : existing.stock_path,
    order_status_path:
      patch.order_status_path !== undefined
        ? patch.order_status_path
        : existing.order_status_path,
    shipping_path:
      patch.shipping_path !== undefined ? patch.shipping_path : existing.shipping_path,
    api_connected_at:
      patch.api_connected_at !== undefined ? patch.api_connected_at : existing.api_connected_at,
    last_test_status:
      patch.last_test_status !== undefined ? patch.last_test_status : existing.last_test_status,
    last_test_at: patch.last_test_at !== undefined ? patch.last_test_at : existing.last_test_at,
    last_test_message:
      patch.last_test_message !== undefined
        ? patch.last_test_message
        : existing.last_test_message,
    order_status_enabled:
      patch.order_status_enabled !== undefined
        ? patch.order_status_enabled
        : existing.order_status_enabled,
    shipping_tracking_enabled:
      patch.shipping_tracking_enabled !== undefined
        ? patch.shipping_tracking_enabled
        : existing.shipping_tracking_enabled,
    cart_abandonment_enabled:
      patch.cart_abandonment_enabled !== undefined
        ? patch.cart_abandonment_enabled
        : existing.cart_abandonment_enabled,
    returns_enabled:
      patch.returns_enabled !== undefined ? patch.returns_enabled : existing.returns_enabled,
    return_policy_text:
      patch.return_policy_text !== undefined
        ? patch.return_policy_text
        : existing.return_policy_text,
    cart_reminder_hours: patch.cart_reminder_hours ?? existing.cart_reminder_hours,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await adminClient
    .from('ecommerce_settings')
    .upsert(payload, { onConflict: 'company_id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceSettings;
}

export async function listOrders(
  companyId: string,
  status?: OrderStatus
): Promise<EcommerceOrder[]> {
  let query = adminClient
    .from('ecommerce_orders')
    .select('*')
    .eq('company_id', companyId)
    .order('ordered_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as EcommerceOrder[];
}

export async function createOrder(
  companyId: string,
  input: {
    order_number: string;
    customer_phone?: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    status?: OrderStatus;
    payment_status?: PaymentStatus;
    total_amount?: number | null;
    currency?: string;
    items_summary?: string | null;
    notes?: string | null;
    ordered_at?: string;
  }
): Promise<EcommerceOrder> {
  const orderNumber = input.order_number.trim();
  if (!orderNumber) throw new Error('Sipariş numarası gerekli');

  const { data, error } = await adminClient
    .from('ecommerce_orders')
    .insert({
      company_id: companyId,
      order_number: orderNumber,
      customer_phone: input.customer_phone?.trim() || null,
      customer_name: input.customer_name?.trim() || null,
      customer_email: input.customer_email?.trim() || null,
      status: input.status || 'pending',
      payment_status: input.payment_status || 'unpaid',
      total_amount: input.total_amount ?? null,
      currency: input.currency || 'TRY',
      items_summary: input.items_summary?.trim() || null,
      notes: input.notes?.trim() || null,
      ordered_at: input.ordered_at || new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceOrder;
}

export async function updateOrder(
  companyId: string,
  id: string,
  patch: Partial<{
    status: OrderStatus;
    payment_status: PaymentStatus;
    customer_phone: string | null;
    customer_name: string | null;
    customer_email: string | null;
    total_amount: number | null;
    currency: string;
    items_summary: string | null;
    notes: string | null;
  }>
): Promise<EcommerceOrder> {
  const { data, error } = await adminClient
    .from('ecommerce_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceOrder;
}

export async function findOrderForCustomer(
  companyId: string,
  orderNumber: string,
  customerPhone?: string | null
): Promise<EcommerceOrder | null> {
  let query = adminClient
    .from('ecommerce_orders')
    .select('*')
    .eq('company_id', companyId)
    .ilike('order_number', orderNumber.trim())
    .limit(1);

  if (customerPhone) {
    query = query.eq('customer_phone', customerPhone);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EcommerceOrder) || null;
}

export async function listShipments(
  companyId: string,
  status?: ShipmentStatus
): Promise<EcommerceShipment[]> {
  let query = adminClient
    .from('ecommerce_shipments')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as EcommerceShipment[];
}

export async function createShipment(
  companyId: string,
  input: {
    tracking_number: string;
    order_id?: string | null;
    order_number?: string | null;
    carrier?: string | null;
    status?: ShipmentStatus;
    tracking_url?: string | null;
    customer_phone?: string | null;
    customer_name?: string | null;
    estimated_delivery?: string | null;
    last_event?: string | null;
    shipped_at?: string | null;
  }
): Promise<EcommerceShipment> {
  const tracking = input.tracking_number.trim();
  if (!tracking) throw new Error('Takip numarası gerekli');

  const { data, error } = await adminClient
    .from('ecommerce_shipments')
    .insert({
      company_id: companyId,
      tracking_number: tracking,
      order_id: input.order_id || null,
      order_number: input.order_number?.trim() || null,
      carrier: input.carrier?.trim() || null,
      status: input.status || 'label_created',
      tracking_url: input.tracking_url?.trim() || null,
      customer_phone: input.customer_phone?.trim() || null,
      customer_name: input.customer_name?.trim() || null,
      estimated_delivery: input.estimated_delivery || null,
      last_event: input.last_event?.trim() || null,
      shipped_at: input.shipped_at || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceShipment;
}

export async function updateShipment(
  companyId: string,
  id: string,
  patch: Partial<{
    status: ShipmentStatus;
    carrier: string | null;
    tracking_url: string | null;
    last_event: string | null;
    estimated_delivery: string | null;
    delivered_at: string | null;
    customer_phone: string | null;
    customer_name: string | null;
  }>
): Promise<EcommerceShipment> {
  const { data, error } = await adminClient
    .from('ecommerce_shipments')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceShipment;
}

export async function findShipmentByTracking(
  companyId: string,
  trackingNumber: string
): Promise<EcommerceShipment | null> {
  const { data, error } = await adminClient
    .from('ecommerce_shipments')
    .select('*')
    .eq('company_id', companyId)
    .ilike('tracking_number', trackingNumber.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as EcommerceShipment) || null;
}

export async function listCarts(companyId: string, status?: CartStatus): Promise<EcommerceCart[]> {
  let query = adminClient
    .from('ecommerce_carts')
    .select('*')
    .eq('company_id', companyId)
    .order('abandoned_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as EcommerceCart[];
}

export async function createCart(
  companyId: string,
  input: {
    customer_phone?: string | null;
    customer_name?: string | null;
    customer_email?: string | null;
    cart_total?: number | null;
    currency?: string;
    items_summary?: string | null;
    item_count?: number;
    status?: CartStatus;
    external_cart_id?: string | null;
  }
): Promise<EcommerceCart> {
  const { data, error } = await adminClient
    .from('ecommerce_carts')
    .insert({
      company_id: companyId,
      customer_phone: input.customer_phone?.trim() || null,
      customer_name: input.customer_name?.trim() || null,
      customer_email: input.customer_email?.trim() || null,
      cart_total: input.cart_total ?? null,
      currency: input.currency || 'TRY',
      items_summary: input.items_summary?.trim() || null,
      item_count: input.item_count ?? 0,
      status: input.status || 'abandoned',
      external_cart_id: input.external_cart_id?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceCart;
}

export async function updateCart(
  companyId: string,
  id: string,
  patch: Partial<{
    status: CartStatus;
    customer_phone: string | null;
    customer_name: string | null;
    customer_email: string | null;
    cart_total: number | null;
    items_summary: string | null;
    item_count: number;
    reminded_at: string | null;
    recovered_at: string | null;
  }>
): Promise<EcommerceCart> {
  const { data, error } = await adminClient
    .from('ecommerce_carts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceCart;
}

export async function listReturns(
  companyId: string,
  status?: ReturnStatus
): Promise<EcommerceReturnRequest[]> {
  let query = adminClient
    .from('ecommerce_return_requests')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as EcommerceReturnRequest[];
}

export async function createReturnRequest(
  companyId: string,
  input: {
    order_id?: string | null;
    order_number?: string | null;
    customer_phone?: string | null;
    customer_name?: string | null;
    request_type?: ReturnRequestType;
    reason?: string | null;
    items_summary?: string | null;
    status?: ReturnStatus;
    staff_notes?: string | null;
  }
): Promise<EcommerceReturnRequest> {
  const { data, error } = await adminClient
    .from('ecommerce_return_requests')
    .insert({
      company_id: companyId,
      order_id: input.order_id || null,
      order_number: input.order_number?.trim() || null,
      customer_phone: input.customer_phone?.trim() || null,
      customer_name: input.customer_name?.trim() || null,
      request_type: input.request_type || 'return',
      reason: input.reason?.trim() || null,
      items_summary: input.items_summary?.trim() || null,
      status: input.status || 'requested',
      staff_notes: input.staff_notes?.trim() || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceReturnRequest;
}

export async function updateReturnRequest(
  companyId: string,
  id: string,
  patch: Partial<{
    status: ReturnStatus;
    reason: string | null;
    items_summary: string | null;
    staff_notes: string | null;
    request_type: ReturnRequestType;
  }>
): Promise<EcommerceReturnRequest> {
  const { data, error } = await adminClient
    .from('ecommerce_return_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data as EcommerceReturnRequest;
}

/** WhatsApp AI için şirket e-ticaret bağlamı */
export async function getEcommerceContextForAI(companyId: string): Promise<string> {
  const allowed = await companyCanUseEcommerce(companyId);
  if (!allowed) return '';

  const settings = await getEcommerceSettings(companyId);
  const parts: string[] = [];

  if (settings.store_name) parts.push(`Mağaza: ${settings.store_name}`);
  if (settings.store_url) parts.push(`Mağaza URL: ${settings.store_url}`);

  const features: string[] = [];
  if (settings.order_status_enabled) features.push('sipariş durumu sorgulama');
  if (settings.shipping_tracking_enabled) features.push('kargo takibi');
  if (settings.cart_abandonment_enabled) features.push('sepet hatırlatma');
  if (settings.returns_enabled) features.push('iade ve değişim');
  if (features.length) parts.push(`Aktif özellikler: ${features.join(', ')}`);

  if (settings.returns_enabled && settings.return_policy_text?.trim()) {
    parts.push(`İade / değişim politikası:\n${settings.return_policy_text.trim().slice(0, 800)}`);
  }

  if (settings.api_enabled && settings.api_base_url) {
    parts.push(
      'Web sitesi API bağlı: ürün adı, fiyat, stok ve (yapılandırıldıysa) sipariş/kargo için canlı API sonuçlarını kullan.',
      'API sonucu yoksa uydurma; ürün adını netleştir veya temsilciye aktar.'
    );
  }

  parts.push(
    'Müşteri sipariş numarası veya kargo takip numarası verdiğinde bu bilgileri kullanarak yardımcı ol.',
    'Sipariş / kargo bilgisi panelde yoksa uydurma; sipariş numarasını iste veya temsilciye aktar.'
  );

  return parts.join('\n');
}

export async function testAndSaveWebsiteApi(companyId: string): Promise<{
  settings: EcommerceSettings;
  test: { ok: boolean; message: string; sampleProductCount?: number };
}> {
  const { testWebsiteApiConnection } = await import('./website-api.client');
  const settings = await getEcommerceSettings(companyId);
  if (!settings.api_base_url?.trim()) {
    throw new Error('Önce API taban URL kaydedin');
  }

  const test = await testWebsiteApiConnection(settings);
  const updated = await upsertEcommerceSettings(companyId, {
    api_enabled: test.ok ? true : settings.api_enabled,
    last_test_status: test.ok ? 'ok' : 'failed',
    last_test_at: new Date().toISOString(),
    last_test_message: test.message,
    api_connected_at: test.ok ? new Date().toISOString() : settings.api_connected_at,
  });

  return { settings: updated, test };
}

export async function lookupOrderStatusForAI(
  companyId: string,
  orderNumber: string,
  customerPhone?: string | null
): Promise<string | null> {
  if (!(await companyHasEcommerceModule(companyId, 'order_status'))) return null;
  const settings = await getEcommerceSettings(companyId);
  if (!settings.order_status_enabled) return null;

  const { lookupWebsiteOrder, isWebsiteApiConfigured } = await import('./website-api.client');
  if (isWebsiteApiConfigured(settings)) {
    const remote = await lookupWebsiteOrder(settings, orderNumber).catch(() => null);
    if (remote) return remote;
  }

  const order = await findOrderForCustomer(companyId, orderNumber, customerPhone);
  if (!order) return null;

  const lines = [
    `Sipariş No: ${order.order_number}`,
    `Durum: ${order.status}`,
    `Ödeme: ${order.payment_status}`,
  ];
  if (order.items_summary) lines.push(`Ürünler: ${order.items_summary}`);
  if (order.total_amount != null) {
    lines.push(`Tutar: ${order.total_amount} ${order.currency}`);
  }
  return lines.join('\n');
}

export async function lookupShipmentForAI(
  companyId: string,
  trackingNumber: string
): Promise<string | null> {
  if (!(await companyHasEcommerceModule(companyId, 'shipping_tracking'))) return null;
  const settings = await getEcommerceSettings(companyId);
  if (!settings.shipping_tracking_enabled) return null;

  const { lookupWebsiteShipping, isWebsiteApiConfigured } = await import('./website-api.client');
  if (isWebsiteApiConfigured(settings)) {
    const remote = await lookupWebsiteShipping(settings, trackingNumber).catch(() => null);
    if (remote) return remote;
  }

  const shipment = await findShipmentByTracking(companyId, trackingNumber);
  if (!shipment) return null;

  const lines = [
    `Takip No: ${shipment.tracking_number}`,
    `Durum: ${shipment.status}`,
  ];
  if (shipment.carrier) lines.push(`Kargo: ${shipment.carrier}`);
  if (shipment.order_number) lines.push(`Sipariş: ${shipment.order_number}`);
  if (shipment.last_event) lines.push(`Son olay: ${shipment.last_event}`);
  if (shipment.tracking_url) lines.push(`Takip linki: ${shipment.tracking_url}`);
  if (shipment.estimated_delivery) lines.push(`Tahmini teslimat: ${shipment.estimated_delivery}`);
  return lines.join('\n');
}

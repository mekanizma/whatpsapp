/**
 * WhatsApp sipariş oluşturma akışı — ürün + müşteri bilgisi toplayıp website API'ye POST
 */

import {
  createWebsiteOrder,
  isWebsiteApiConfigured,
  searchWebsiteProducts,
  type WebsiteProduct,
} from '../services/website-api.client';
import {
  companyCanUseEcommerce,
  createOrder,
  getEcommerceSettings,
  type EcommerceSettings,
} from '../services/ecommerce.service';
import { resolveAccountAiSettings } from '../services/company-ai-settings.service';

export type OrderFlowStep =
  | 'await_product'
  | 'await_quantity'
  | 'await_name'
  | 'await_fulfillment'
  | 'await_address'
  | 'await_city'
  | 'await_confirm'
  | 'done';

export interface OrderSession {
  step: OrderFlowStep;
  productSku: string | null;
  productName: string | null;
  quantity: number;
  fullName: string | null;
  fulfillment: 'pickup' | 'delivery' | null;
  line1: string | null;
  city: string | null;
  expires: number;
}

export interface OrderFlowResult {
  handled: boolean;
  message?: string;
  orderCreated?: boolean;
  orderNumber?: string;
  shouldTransfer?: boolean;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessions = new Map<string, OrderSession>();

const ORDER_INTENT_RE =
  /sipari[sş]\s*(ver|oluştur|olustur|yap|almak)|sipari[sş]\s*vermek|sat[iı]n\s*al|almak\s*istiyorum|order\s*(please|now)|checkout|bu\s*(ürünü|urunü|monitörü|monitoru).*(al|sipariş|siparis)/i;

const CANCEL_RE = /^(iptal|vazgeç|vazgec|istemiyorum|vaz geç)(\s|$)/i;
const CONFIRM_RE = /^(evet|onay|onaylıyorum|onayliyorum|tamam|olur|ok|yes|confirm)(\s|!|\.|$)/i;
const PICKUP_RE = /mağaza|magaza|gel\s*al|gelal|pickup|teslim\s*al|elden/i;
const DELIVERY_RE = /kargo|teslimat|adres(e|ime)?|delivery|gönder|gonder|eve/i;

function sessionKey(companyId: string, phone: string): string {
  return `${companyId}:${phone.replace(/\D/g, '')}`;
}

function freshSession(): OrderSession {
  return {
    step: 'await_product',
    productSku: null,
    productName: null,
    quantity: 1,
    fullName: null,
    fulfillment: null,
    line1: null,
    city: null,
    expires: Date.now() + SESSION_TTL_MS,
  };
}

export function getOrderSession(companyId: string, customerPhone: string): OrderSession | null {
  const key = sessionKey(companyId, customerPhone);
  const existing = sessions.get(key);
  if (!existing) return null;
  if (existing.expires < Date.now() || existing.step === 'done') {
    sessions.delete(key);
    return null;
  }
  return existing;
}

export function saveOrderSession(
  companyId: string,
  customerPhone: string,
  session: OrderSession
): void {
  sessions.set(sessionKey(companyId, customerPhone), {
    ...session,
    expires: Date.now() + SESSION_TTL_MS,
  });
}

export function clearOrderSession(companyId: string, customerPhone: string): void {
  sessions.delete(sessionKey(companyId, customerPhone));
}

export function isOrderCreateIntent(message: string): boolean {
  return ORDER_INTENT_RE.test(message.trim());
}

/** Konuşma geçmişinden son ürün adı / SKU çıkar */
export function extractProductFromHistory(
  history: { sender_type: string; message: string }[]
): { name: string; sku?: string } | null {
  const recent = [...history].reverse().slice(0, 12);
  for (const msg of recent) {
    if (msg.sender_type === 'customer') continue;
    const text = msg.message || '';
    const skuMatch = text.match(/SKU:\s*([^\n\r]+)/i);
    const nameMatch =
      text.match(/Ürün:\s*([^\n\r]+)/i) ||
      text.match(/\*\*?([^*\n]{8,120})\*\*?[\s\S]{0,120}?Fiyat\s*:/i) ||
      text.match(
        /(?:^|\n)\s*([A-Za-zÀ-ÿĞğÜüŞşİıÖöÇç0-9][^\n]{6,120}?)\s*(?:\n|\\n)\s*Fiyat\s*:/i
      );
    if (nameMatch?.[1]) {
      return {
        name: nameMatch[1].replace(/\*+/g, '').trim(),
        sku: skuMatch?.[1]?.trim(),
      };
    }
    // "Fiyat:" satırından önceki son satırı ürün adı say
    const priceIdx = text.search(/Fiyat\s*:/i);
    if (priceIdx > 0) {
      const before = text.slice(0, priceIdx).trim().split(/\n+/).filter(Boolean);
      const last = before[before.length - 1]?.replace(/\*+/g, '').trim();
      if (last && last.length >= 4 && last.length <= 160) {
        return { name: last, sku: skuMatch?.[1]?.trim() };
      }
    }
  }
  return null;
}

function normalizePhoneForApi(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('90') && digits.length >= 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('0')) return digits;
  if (digits.length === 10) return `0${digits}`;
  return digits || phone;
}

function parseQuantity(message: string): number | null {
  const m = message.trim().match(/^(\d{1,3})\s*(adet|tane|x)?$/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 99) return n;
  }
  const embedded = message.match(/(\d{1,3})\s*(adet|tane)/i);
  if (embedded) {
    const n = Number(embedded[1]);
    if (n >= 1 && n <= 99) return n;
  }
  return null;
}

function summaryText(session: OrderSession): string {
  const fulfill =
    session.fulfillment === 'pickup' ? 'Mağazadan teslim' : 'Adrese teslimat';
  const lines = [
    'Sipariş özeti:',
    `• Ürün: ${session.productName || session.productSku}`,
    `• Adet: ${session.quantity}`,
    `• Ad Soyad: ${session.fullName}`,
    `• Teslimat: ${fulfill}`,
  ];
  if (session.fulfillment === 'delivery') {
    lines.push(`• Adres: ${session.line1}`);
    lines.push(`• Şehir: ${session.city}`);
  } else if (session.city) {
    lines.push(`• Şehir: ${session.city}`);
  }
  lines.push('', 'Onaylıyor musunuz? (evet / iptal)');
  return lines.join('\n');
}

async function resolveProduct(
  settings: EcommerceSettings,
  message: string,
  hint?: { name: string; sku?: string } | null
): Promise<WebsiteProduct | null> {
  if (hint?.sku || hint?.name) {
    const q = hint.sku || hint.name;
    const found = await searchWebsiteProducts(settings, q).catch(() => []);
    if (found[0]) return found[0];
    return {
      name: hint.name,
      sku: hint.sku || hint.name,
    };
  }
  const found = await searchWebsiteProducts(settings, message).catch(() => []);
  return found[0] || null;
}

function promptForStep(session: OrderSession): string {
  switch (session.step) {
    case 'await_product':
      return 'Hangi ürünü sipariş etmek istersiniz? Ürün adı veya model yazabilirsiniz.';
    case 'await_quantity':
      return `"${session.productName}" için kaç adet istersiniz? (örn. 1)`;
    case 'await_name':
      return 'Sipariş için adınızı ve soyadınızı yazar mısınız?';
    case 'await_fulfillment':
      return 'Teslimat şekli nedir?\n1) Mağazadan teslim\n2) Adrese kargo';
    case 'await_address':
      return 'Teslimat açık adresinizi yazar mısınız?';
    case 'await_city':
      return 'Şehir / ilçe bilgisini yazar mısınız? (örn. Girne)';
    case 'await_confirm':
      return summaryText(session);
    default:
      return 'Sipariş işlemi tamamlandı.';
  }
}

async function submitOrder(
  companyId: string,
  customerPhone: string,
  settings: EcommerceSettings,
  session: OrderSession
): Promise<OrderFlowResult> {
  const sku = (session.productSku || session.productName || '').trim();
  const line1 =
    session.fulfillment === 'pickup'
      ? session.line1?.trim() || 'Mağazadan teslim'
      : session.line1?.trim() || '';
  const city = session.city?.trim() || (session.fulfillment === 'pickup' ? '—' : '');

  const remote = await createWebsiteOrder(settings, {
    fulfillment: session.fulfillment || 'pickup',
    customer: {
      fullName: session.fullName!.trim(),
      phone: normalizePhoneForApi(customerPhone),
      line1,
      city,
    },
    items: [{ sku, quantity: session.quantity }],
    paymentMethod: 'whatsapp',
  });

  if (!remote.ok) {
    return {
      handled: true,
      shouldTransfer: true,
      message:
        `Sipariş şu an oluşturulamadı (${remote.message}). ` +
        'Sizi müşteri temsilcimize aktarabilirim; ister misiniz?',
    };
  }

  const orderNumber = remote.orderNumber || `WA-${Date.now()}`;
  await createOrder(companyId, {
    order_number: orderNumber,
    customer_phone: customerPhone,
    customer_name: session.fullName,
    status: 'pending',
    payment_status: 'unpaid',
    items_summary: `${session.quantity}x ${session.productName || sku}`,
    notes: `WhatsApp | ${session.fulfillment} | ${line1} | ${city}`,
  }).catch(() => null);

  clearOrderSession(companyId, customerPhone);
  return {
    handled: true,
    orderCreated: true,
    orderNumber,
    message:
      `Siparişiniz alındı.\n` +
      `Sipariş No: ${orderNumber}\n` +
      `Ürün: ${session.productName || sku} (${session.quantity} adet)\n` +
      `Teslimat: ${session.fulfillment === 'pickup' ? 'Mağazadan teslim' : 'Adrese kargo'}\n\n` +
      'Teşekkür ederiz! Başka bir konuda yardımcı olabilir miyim?',
  };
}

/**
 * Aktif sipariş oturumu veya yeni sipariş niyeti varsa işler.
 * handled=false → normal AI devam etsin.
 */
export async function runOrderCreateFlow(params: {
  companyId: string;
  customerPhone: string;
  message: string;
  history: { sender_type: string; message: string }[];
  whatsappAccountId?: string | null;
}): Promise<OrderFlowResult> {
  const { companyId, customerPhone, message, history, whatsappAccountId } = params;
  const trimmed = message.trim();

  const allowed = await companyCanUseEcommerce(companyId).catch(() => false);
  if (!allowed) return { handled: false };

  let useWebsiteApi = true;
  if (whatsappAccountId) {
    const line = await resolveAccountAiSettings(companyId, whatsappAccountId).catch(() => null);
    useWebsiteApi = line ? line.websiteApiEnabled : true;
  }
  if (!useWebsiteApi) return { handled: false };

  const settings = await getEcommerceSettings(companyId).catch(() => null);
  if (!settings || !isWebsiteApiConfigured(settings)) return { handled: false };

  let session = getOrderSession(companyId, customerPhone);
  const starting = !session && isOrderCreateIntent(trimmed);
  if (!session && !starting) return { handled: false };

  if (CANCEL_RE.test(trimmed) && session) {
    clearOrderSession(companyId, customerPhone);
    return { handled: true, message: 'Sipariş işlemini iptal ettim. Başka nasıl yardımcı olabilirim?' };
  }

  if (!session) {
    session = freshSession();
    const fromHistory = extractProductFromHistory(history);
    const product = await resolveProduct(settings, trimmed, fromHistory);
    if (product) {
      session.productName = product.name;
      session.productSku = product.sku || product.name;
      session.step = 'await_quantity';
      saveOrderSession(companyId, customerPhone, session);
      return { handled: true, message: promptForStep(session) };
    }
    session.step = 'await_product';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  // --- adım işleme ---
  if (session.step === 'await_product') {
    const product = await resolveProduct(settings, trimmed);
    if (!product) {
      return {
        handled: true,
        message:
          'Bu ürünü bulamadım. Lütfen ürün adını veya modelini yeniden yazar mısınız? İptal için "iptal" yazın.',
      };
    }
    session.productName = product.name;
    session.productSku = product.sku || product.name;
    session.step = 'await_quantity';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_quantity') {
    const qty = parseQuantity(trimmed);
    if (qty == null && !/^(bir|tek)$/i.test(trimmed)) {
      return { handled: true, message: 'Kaç adet istediğinizi sayı olarak yazar mısınız? (örn. 1)' };
    }
    session.quantity = qty ?? 1;
    session.step = 'await_name';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_name') {
    const name = trimmed.replace(/^ad[ıi]?m?\s*:?\s*/i, '').trim();
    if (name.length < 3 || /\d{4,}/.test(name)) {
      return { handled: true, message: 'Lütfen ad ve soyadınızı yazar mısınız.' };
    }
    session.fullName = name.slice(0, 120);
    session.step = 'await_fulfillment';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_fulfillment') {
    if (PICKUP_RE.test(trimmed) || /^1\b/.test(trimmed) || /mağaza|magaza/i.test(trimmed)) {
      session.fulfillment = 'pickup';
      session.line1 = 'Mağazadan teslim';
      session.step = 'await_city';
    } else if (DELIVERY_RE.test(trimmed) || /^2\b/.test(trimmed)) {
      session.fulfillment = 'delivery';
      session.step = 'await_address';
    } else {
      return {
        handled: true,
        message: 'Lütfen seçin: "mağazadan teslim" veya "adrese kargo".',
      };
    }
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_address') {
    if (trimmed.length < 5) {
      return { handled: true, message: 'Lütfen daha açık bir teslimat adresi yazar mısınız.' };
    }
    session.line1 = trimmed.slice(0, 250);
    session.step = 'await_city';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_city') {
    if (trimmed.length < 2) {
      return { handled: true, message: 'Şehir bilgisini yazar mısınız?' };
    }
    session.city = trimmed.slice(0, 80);
    session.step = 'await_confirm';
    saveOrderSession(companyId, customerPhone, session);
    return { handled: true, message: promptForStep(session) };
  }

  if (session.step === 'await_confirm') {
    if (!CONFIRM_RE.test(trimmed)) {
      return {
        handled: true,
        message: 'Onaylamak için "evet", iptal için "iptal" yazın.\n\n' + summaryText(session),
      };
    }
    return submitOrder(companyId, customerPhone, settings, session);
  }

  return { handled: false };
}

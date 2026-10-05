/**
 * Bağlı web sitesi API istemcisi — ürün, fiyat, stok, sipariş, kargo
 *
 * Beklenen JSON yanıt örnekleri (alan adları esnek normalize edilir):
 * Ürün arama: { products: [{ name, sku, price, currency, stock, in_stock, url }] }
 * Sipariş: { order_number, status, payment_status, total, items }
 * Kargo: { tracking_number, status, carrier, tracking_url, last_event }
 */

import type { EcommerceSettings } from './ecommerce.service';

const FETCH_TIMEOUT_MS = 8_000;
const MAX_PRODUCTS = 8;

/** Doğal dil sorularından çıkarılacak genel kelimeler (arama sorgusu değil) */
const SEARCH_STOPWORDS = new Set([
  'hangi',
  'neler',
  'ne',
  'var',
  'mi',
  'mı',
  'mu',
  'mü',
  'misiniz',
  'musunuz',
  'elinizde',
  'sizde',
  'mevcut',
  'bir',
  'bu',
  'su',
  'şu',
  'urun',
  'urunler',
  'urunleri',
  'product',
  'products',
  'fiyat',
  'fiyati',
  'fiyatı',
  'stok',
  'stokta',
  'kadar',
  'lütfen',
  'lutfen',
  'istiyorum',
  'isterim',
  'bakabilir',
  'bakabilirim',
  'gorebilir',
  'görebilir',
  'liste',
  'listesi',
  'hakkinda',
  'hakkında',
  'icin',
  'için',
  'bana',
  'acaba',
  'varsa',
  'olan',
  'modeller',
  'modelleri',
  'cesitleri',
  'çeşitleri',
  'nedir',
  'nasil',
  'nasıl',
  'nerede',
  'nezaman',
  'calisma',
  'çalışma',
  'saat',
  'saatler',
  'saatleri',
  'saatleriniz',
  'randevu',
  'iptal',
  'tesekkur',
  'teşekkür',
  'sagol',
  'sağol',
  'merhaba',
  'selam',
  'yardim',
  'yardım',
  'iletisim',
  'iletişim',
  'adres',
  'konum',
  'acik',
  'açık',
  'kapali',
  'kapalı',
  'soyler',
  'söyler',
  'anlat',
  'anlatir',
  'anlatır',
  'ozellik',
  'özellik',
  'ozellikleri',
  'özellikleri',
  'bilgi',
  'bilgiyi',
]);

export interface WebsiteProduct {
  name: string;
  sku?: string;
  price?: number | string;
  currency?: string;
  stock?: number | string;
  in_stock?: boolean;
  url?: string;
  description?: string;
}

export interface WebsiteApiTestResult {
  ok: boolean;
  message: string;
  sampleProductCount?: number;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function joinUrl(base: string, path: string): string {
  const b = trimSlash(base.trim());
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function fillPath(path: string, vars: Record<string, string>): string {
  let result = path;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(value));
  }
  return result;
}

function normalizeText(message: string): string {
  return message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Path içinde {query} varsa doldur; yoksa q= parametresi ekle (çift q üretme). */
function buildProductSearchUrl(baseUrl: string, searchPath: string, query: string): string {
  const q = query.trim();
  const hasPlaceholder = /\{query\}/i.test(searchPath);
  const filled = hasPlaceholder ? fillPath(searchPath, { query: q }) : searchPath;
  const url = joinUrl(baseUrl, filled);
  if (hasPlaceholder) return url;
  return url.includes('?') ? `${url}&q=${encodeURIComponent(q)}` : `${url}?q=${encodeURIComponent(q)}`;
}

/** Genel katalog / liste sorusu mu? (arama yerine ürün listesi çek) */
export function isProductBrowseIntent(message: string): boolean {
  const n = normalizeText(message);
  return /(hangi\s+urun|neler\s+var|ne\s+var|urun(ler|leri)?\s+var|katalog|liste|urunleriniz|ne\s+sat|elinizde\s+ne|sizde\s+ne)/i.test(
    n
  );
}

/**
 * Doğal dil mesajından API arama terimi çıkar.
 * Örn: "Hangi monitörler var" → "monitörler"
 * Genel sorularda boş döner (liste endpoint'i kullanılmalı).
 */
export function extractProductSearchQuery(message: string): string {
  const raw = message.trim();
  if (!raw) return '';

  const tokens = raw
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (t.length < 2) return false;
      const key = normalizeText(t);
      return !SEARCH_STOPWORDS.has(key);
    });

  if (!tokens.length) return '';
  return tokens.slice(0, 4).join(' ');
}

function buildAuthHeaders(settings: EcommerceSettings): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const key = settings.api_key?.trim();
  if (!key) return headers;

  const authType = settings.api_auth_type || 'bearer';
  if (authType === 'bearer') {
    headers.Authorization = key.toLowerCase().startsWith('bearer ') ? key : `Bearer ${key}`;
  } else if (authType === 'api_key') {
    headers['X-API-Key'] = key;
  } else {
    const headerName = settings.api_auth_header_name?.trim() || 'Authorization';
    headers[headerName] = key;
  }

  return headers;
}

async function fetchJson(
  url: string,
  settings: EcommerceSettings,
  options?: { method?: 'GET' | 'POST'; body?: unknown }
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const method = options?.method || 'GET';

  try {
    const res = await fetch(url, {
      method,
      headers: buildAuthHeaders(settings),
      signal: controller.signal,
      body: method !== 'GET' && options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, status: res.status, data: null, error: 'Geçersiz JSON yanıtı' };
      }
    }

    if (!res.ok) {
      const errObj = asRecord(data);
      const apiMsg =
        pickString(errObj || {}, ['message', 'error', 'detail', 'msg']) ||
        (typeof data === 'string' ? data : null);
      return {
        ok: false,
        status: res.status,
        data,
        error: apiMsg || `HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'API zaman aşımı'
          : err.message
        : 'API isteği başarısız';
    return { ok: false, status: 0, data: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

function pickBoolean(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

function normalizeProduct(raw: unknown): WebsiteProduct | null {
  const obj = asRecord(raw);
  if (!obj) return null;

  const name = pickString(obj, ['name', 'title', 'product_name', 'productName']);
  if (!name) return null;

  const stock = pickNumber(obj, ['stock', 'stock_quantity', 'quantity', 'inventory']);
  const inStock =
    pickBoolean(obj, ['in_stock', 'inStock', 'available']) ??
    (stock !== undefined ? stock > 0 : undefined);

  return {
    name,
    sku: pickString(obj, ['sku', 'id', 'product_id', 'productId', 'code']),
    price: pickNumber(obj, ['price', 'sale_price', 'amount']) ?? pickString(obj, ['price']),
    currency: pickString(obj, ['currency', 'currency_code']) || 'TRY',
    stock,
    in_stock: inStock,
    url: pickString(obj, ['url', 'permalink', 'link']),
    description: pickString(obj, ['description', 'short_description', 'summary'])?.slice(0, 200),
  };
}

function extractProductList(data: unknown): WebsiteProduct[] {
  if (Array.isArray(data)) {
    return data.map(normalizeProduct).filter(Boolean) as WebsiteProduct[];
  }

  const obj = asRecord(data);
  if (!obj) return [];

  const list =
    obj.products ||
    obj.data ||
    obj.items ||
    obj.results ||
    (Array.isArray(obj.product) ? obj.product : null);

  if (Array.isArray(list)) {
    return list.map(normalizeProduct).filter(Boolean) as WebsiteProduct[];
  }

  const single = normalizeProduct(obj);
  return single ? [single] : [];
}

function formatProduct(p: WebsiteProduct): string {
  const parts = [`Ürün: ${p.name}`];
  if (p.sku) parts.push(`SKU: ${p.sku}`);
  if (p.price != null) parts.push(`Fiyat: ${p.price} ${p.currency || 'TRY'}`);
  if (p.stock != null) parts.push(`Stok: ${p.stock}`);
  else if (p.in_stock != null) parts.push(`Stok: ${p.in_stock ? 'Var' : 'Yok'}`);
  if (p.url) parts.push(`Link: ${p.url}`);
  if (p.description) parts.push(`Özet: ${p.description}`);
  return parts.join('\n');
}

export function isWebsiteApiConfigured(settings: EcommerceSettings): boolean {
  return Boolean(settings.api_enabled && settings.api_base_url?.trim());
}

export async function testWebsiteApiConnection(
  settings: EcommerceSettings
): Promise<WebsiteApiTestResult> {
  if (!settings.api_base_url?.trim()) {
    return { ok: false, message: 'API taban URL gerekli' };
  }

  const searchPath = settings.product_search_path || settings.products_path || '/products';
  const testUrl = /\{query\}/i.test(searchPath)
    ? joinUrl(settings.api_base_url, fillPath(searchPath, { query: 'test' }))
    : (() => {
        const url = joinUrl(settings.api_base_url, searchPath);
        return url.includes('?') ? `${url}&q=test` : `${url}?q=test`;
      })();
  const result = await fetchJson(testUrl, settings);

  if (!result.ok) {
    // Bazı APIs arama parametresi istemez — düz products dene
    const fallbackPath = settings.products_path || '/products';
    const fallback = await fetchJson(joinUrl(settings.api_base_url, fallbackPath), settings);
    if (!fallback.ok) {
      return {
        ok: false,
        message: result.error || fallback.error || 'Bağlantı başarısız',
      };
    }
    const products = extractProductList(fallback.data);
    return {
      ok: true,
      message: 'Bağlantı başarılı',
      sampleProductCount: products.length,
    };
  }

  const products = extractProductList(result.data);
  return {
    ok: true,
    message: 'Bağlantı başarılı',
    sampleProductCount: products.length,
  };
}

/** Ürün listesi (arama sorgusu olmadan) — "hangi ürünler var?" için */
export async function listWebsiteProducts(
  settings: EcommerceSettings
): Promise<WebsiteProduct[]> {
  if (!isWebsiteApiConfigured(settings)) return [];
  const productsPath = settings.products_path || '/products';
  const result = await fetchJson(joinUrl(settings.api_base_url!, productsPath), settings);
  if (!result.ok) return [];
  return extractProductList(result.data).slice(0, MAX_PRODUCTS);
}

export async function searchWebsiteProducts(
  settings: EcommerceSettings,
  query: string
): Promise<WebsiteProduct[]> {
  if (!isWebsiteApiConfigured(settings)) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const searchPath = settings.product_search_path || '/products/search';
  const url = buildProductSearchUrl(settings.api_base_url!, searchPath, q);

  let result = await fetchJson(url, settings);
  if (!result.ok) {
    const productsPath = settings.products_path || '/products';
    // Fallback: listeyi çekip istemci tarafında süz (API q desteklemiyorsa)
    const fallback = await fetchJson(joinUrl(settings.api_base_url!, productsPath), settings);
    if (!fallback.ok) return [];
    const all = extractProductList(fallback.data);
    const needle = normalizeText(q);
    const filtered = all.filter((p) => {
      const hay = normalizeText([p.name, p.sku, p.description].filter(Boolean).join(' '));
      return hay.includes(needle) || needle.split(/\s+/).some((t) => t.length >= 3 && hay.includes(t));
    });
    return (filtered.length ? filtered : all).slice(0, MAX_PRODUCTS);
  }

  return extractProductList(result.data).slice(0, MAX_PRODUCTS);
}

export interface CreateWebsiteOrderItem {
  sku: string;
  quantity: number;
  options?: Record<string, string>;
}

export interface CreateWebsiteOrderInput {
  fulfillment: 'pickup' | 'delivery';
  customer: {
    fullName: string;
    phone: string;
    email?: string;
    line1: string;
    city: string;
  };
  items: CreateWebsiteOrderItem[];
  paymentMethod?: string;
}

export interface CreateWebsiteOrderResult {
  ok: boolean;
  orderNumber?: string;
  message: string;
  status?: number;
}

function resolveOrderCreatePath(settings: EcommerceSettings): string {
  const configured = settings.order_create_path?.trim();
  if (configured) return configured;
  // /api/v1/orders/{orderNumber} → /api/v1/orders
  const statusPath = settings.order_status_path || '/api/v1/orders/{orderNumber}';
  const derived = statusPath.replace(/\/\{orderNumber\}\s*$/i, '').replace(/\/:\w+\s*$/i, '');
  return derived || '/api/v1/orders';
}

/** WhatsApp / Waai sipariş oluşturma — POST /api/v1/orders */
export async function createWebsiteOrder(
  settings: EcommerceSettings,
  input: CreateWebsiteOrderInput
): Promise<CreateWebsiteOrderResult> {
  if (!isWebsiteApiConfigured(settings)) {
    return { ok: false, message: 'Website API yapılandırılmamış' };
  }
  if (!input.items.length || !input.customer.fullName.trim()) {
    return { ok: false, message: 'Sipariş için ürün ve müşteri adı gerekli' };
  }

  const path = resolveOrderCreatePath(settings);
  const url = joinUrl(settings.api_base_url!, path);
  const body = {
    fulfillment: input.fulfillment,
    customer: {
      fullName: input.customer.fullName.trim(),
      phone: input.customer.phone.trim(),
      email: input.customer.email?.trim() || undefined,
      line1: input.customer.line1.trim(),
      city: input.customer.city.trim(),
    },
    items: input.items.map((item) => ({
      sku: item.sku.trim(),
      quantity: Math.max(1, Math.floor(item.quantity) || 1),
      ...(item.options && Object.keys(item.options).length ? { options: item.options } : {}),
    })),
    paymentMethod: input.paymentMethod || 'whatsapp',
  };

  const result = await fetchJson(url, settings, { method: 'POST', body });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.error || 'Sipariş oluşturulamadı',
    };
  }

  const root = asRecord(result.data);
  const orderObj = asRecord(root?.order) || asRecord(root?.data) || root;
  const orderNumber =
    pickString(orderObj || {}, ['orderNumber', 'order_number', 'number', 'id']) ||
    pickString(root || {}, ['orderNumber', 'order_number']);

  return {
    ok: true,
    status: result.status,
    orderNumber: orderNumber || undefined,
    message: orderNumber ? `Sipariş oluşturuldu: ${orderNumber}` : 'Sipariş oluşturuldu',
  };
}

export async function lookupWebsiteOrder(
  settings: EcommerceSettings,
  orderNumber: string
): Promise<string | null> {
  if (!isWebsiteApiConfigured(settings)) return null;
  const path = fillPath(settings.order_status_path || '/orders/{orderNumber}', {
    orderNumber: orderNumber.trim(),
  });
  const result = await fetchJson(joinUrl(settings.api_base_url!, path), settings);
  if (!result.ok) return null;

  const obj = asRecord(result.data)?.order
    ? asRecord((asRecord(result.data) as Record<string, unknown>).order)
    : asRecord(result.data);
  if (!obj) return null;

  const lines = [
    `Sipariş No: ${pickString(obj, ['order_number', 'orderNumber', 'id', 'number']) || orderNumber}`,
    `Durum: ${pickString(obj, ['status', 'order_status', 'fulfillment_status']) || 'bilinmiyor'}`,
  ];
  const payment = pickString(obj, ['payment_status', 'paymentStatus', 'financial_status']);
  if (payment) lines.push(`Ödeme: ${payment}`);
  const total = pickNumber(obj, ['total', 'total_amount', 'amount']) ?? pickString(obj, ['total']);
  const currency = pickString(obj, ['currency']) || 'TRY';
  if (total != null) lines.push(`Tutar: ${total} ${currency}`);
  const items = pickString(obj, ['items_summary', 'items', 'products']);
  if (items) lines.push(`Ürünler: ${items}`);
  return lines.join('\n');
}

export async function lookupWebsiteShipping(
  settings: EcommerceSettings,
  trackingNumber: string
): Promise<string | null> {
  if (!isWebsiteApiConfigured(settings)) return null;
  const path = fillPath(settings.shipping_path || '/shipping/{trackingNumber}', {
    trackingNumber: trackingNumber.trim(),
  });
  const result = await fetchJson(joinUrl(settings.api_base_url!, path), settings);
  if (!result.ok) return null;

  const obj = asRecord(result.data)?.shipment
    ? asRecord((asRecord(result.data) as Record<string, unknown>).shipment)
    : asRecord(result.data);
  if (!obj) return null;

  const lines = [
    `Takip No: ${pickString(obj, ['tracking_number', 'trackingNumber', 'id']) || trackingNumber}`,
    `Durum: ${pickString(obj, ['status', 'shipment_status']) || 'bilinmiyor'}`,
  ];
  const carrier = pickString(obj, ['carrier', 'courier', 'company']);
  if (carrier) lines.push(`Kargo: ${carrier}`);
  const lastEvent = pickString(obj, ['last_event', 'lastEvent', 'status_detail', 'message']);
  if (lastEvent) lines.push(`Son olay: ${lastEvent}`);
  const url = pickString(obj, ['tracking_url', 'trackingUrl', 'url']);
  if (url) lines.push(`Takip linki: ${url}`);
  return lines.join('\n');
}

export async function buildWebsiteCatalogContext(
  settings: EcommerceSettings,
  customerMessage: string
): Promise<string> {
  if (!isWebsiteApiConfigured(settings)) return '';

  const searchQuery = extractProductSearchQuery(customerMessage);
  const browse = isProductBrowseIntent(customerMessage) || !searchQuery;

  let products: WebsiteProduct[] = [];
  if (browse && !searchQuery) {
    // "Hangi ürünler var?" → doğrudan liste
    products = await listWebsiteProducts(settings);
  } else if (searchQuery) {
    // "Hangi monitörler var?" → "monitorler" ile ara
    products = await searchWebsiteProducts(settings, searchQuery);
    if (!products.length) {
      // Arama boşsa listeyi çekip anahtar kelimeyle süz
      const all = await listWebsiteProducts(settings);
      const needle = normalizeText(searchQuery);
      products = all
        .filter((p) => {
          const hay = normalizeText([p.name, p.sku, p.description].filter(Boolean).join(' '));
          return (
            hay.includes(needle) || needle.split(/\s+/).some((t) => t.length >= 3 && hay.includes(t))
          );
        })
        .slice(0, MAX_PRODUCTS);
      if (!products.length && browse) products = all.slice(0, MAX_PRODUCTS);
    }
  } else {
    products = await listWebsiteProducts(settings);
  }

  if (!products.length) return '';

  return [
    'Web sitesi API ürün sonuçları (güncel fiyat/stok):',
    ...products.map((p, i) => `(${i + 1})\n${formatProduct(p)}`),
    'Yalnızca bu sonuçlardaki fiyat ve stok bilgilerini kullan; uydurma.',
    products.length >= MAX_PRODUCTS
      ? 'Daha fazla ürün olabilir; müşteri kategori veya ürün adı netleştirirse yeniden ara.'
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Fiyat / stok / ürün sorusu mu? */
export function isProductCatalogIntent(message: string): boolean {
  const n = normalizeText(message);
  return /(fiyat|ucret|ne kadar|stok|var\s*mi|mevcut|urun|product|price|stock|kac\s*tl|katalog|liste|hangi\s+\w+|neler\s+var|ne\s+var|monitor|laptop|yazici|telefon|bilgisayar|notebook|marka|model|ozellik|sku|cesit)/i.test(
    n
  );
}

/**
 * Bilgi bankasında eşleşme yokken web sitesi API katalog araması denensin mi?
 * Marka / model / ürün sinyali veya çıkarılabilir arama terimi arar.
 */
export function shouldSearchCatalogOnKnowledgeMiss(message: string): boolean {
  if (isProductBrowseIntent(message) || isProductCatalogIntent(message)) return true;
  const q = extractProductSearchQuery(message);
  if (!q) return false;
  // Model / SKU: rakam içeren kod (S24, MX-120, iPhone15)
  if (/\d/.test(q)) return true;
  // "Bosch buzdolabı var mı" gibi ürün soruları (katalog regex'ine düşmeyenler)
  const softProductAsk =
    /(var\s*m[iı]|istiyorum|isterim|bakar\s*m[iı]s|goster|göster|kac\s*tl|\btl\b|lira|siparis|sipariş|satin|satın)/i.test(
      normalizeText(message)
    );
  return softProductAsk;
}

/** Prompt içinde canlı API ürün sonuçlarının olup olmadığını kontrol eder */
export function ecommerceContextHasCatalogResults(ecommerceContext: string): boolean {
  return /Web sitesi API ürün sonuçları/i.test(ecommerceContext || '');
}

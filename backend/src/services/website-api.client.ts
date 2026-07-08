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
const MAX_PRODUCTS = 5;

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
  settings: EcommerceSettings
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildAuthHeaders(settings),
      signal: controller.signal,
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
      return {
        ok: false,
        status: res.status,
        data,
        error: `HTTP ${res.status}`,
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
  const url = joinUrl(settings.api_base_url, searchPath);
  const testUrl = url.includes('?') ? `${url}&q=test` : `${url}?q=test`;
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

export async function searchWebsiteProducts(
  settings: EcommerceSettings,
  query: string
): Promise<WebsiteProduct[]> {
  if (!isWebsiteApiConfigured(settings)) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const searchPath = settings.product_search_path || '/products/search';
  const baseSearch = joinUrl(settings.api_base_url!, fillPath(searchPath, {}));
  const url = baseSearch.includes('?')
    ? `${baseSearch}&q=${encodeURIComponent(q)}`
    : `${baseSearch}?q=${encodeURIComponent(q)}`;

  let result = await fetchJson(url, settings);
  if (!result.ok) {
    const productsPath = settings.products_path || '/products';
    const fallback = joinUrl(settings.api_base_url!, productsPath);
    const fallbackUrl = fallback.includes('?')
      ? `${fallback}&q=${encodeURIComponent(q)}`
      : `${fallback}?q=${encodeURIComponent(q)}`;
    result = await fetchJson(fallbackUrl, settings);
  }

  if (!result.ok) return [];
  return extractProductList(result.data).slice(0, MAX_PRODUCTS);
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

  const products = await searchWebsiteProducts(settings, customerMessage);
  if (!products.length) return '';

  return [
    'Web sitesi API ürün sonuçları (güncel fiyat/stok):',
    ...products.map((p, i) => `(${i + 1})\n${formatProduct(p)}`),
    'Yalnızca bu sonuçlardaki fiyat ve stok bilgilerini kullan; uydurma.',
  ].join('\n\n');
}

/** Fiyat / stok / ürün sorusu mu? */
export function isProductCatalogIntent(message: string): boolean {
  const n = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /(fiyat|ucret|ne kadar|stok|var mi|mevcut|urun|product|price|stock|kac tl|kaç tl)/i.test(
    n
  );
}

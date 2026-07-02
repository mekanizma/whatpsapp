/**
 * API client for backend REST endpoints
 */

import { supabase } from './supabase';
import { isDemoMode } from '@/lib/env';
import type { ApiResponse } from '@/types';

function extractApiError(data: Record<string, unknown>, status: number): string {
  const err = data.error ?? data.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const nested = (err as { message?: unknown }).message;
    if (typeof nested === 'string' && nested.trim()) return nested;
  }
  return `İstek başarısız (${status})`;
}

const API_BASE = (() => {
  const raw = import.meta.env.VITE_API_URL || '/api/v1';
  if (raw.endsWith('/api/v1')) return raw;
  return `${raw.replace(/\/$/, '')}/api/v1`;
})();

const API_URL = API_BASE;
const DEMO_TOKEN_KEY = 'wa_demo_token';

export function setDemoToken(token: string) {
  localStorage.setItem(DEMO_TOKEN_KEY, token);
}

export function clearDemoToken() {
  localStorage.removeItem(DEMO_TOKEN_KEY);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  if (isDemoMode) {
    const token = localStorage.getItem(DEMO_TOKEN_KEY) || 'demo-company-token';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    const headers = await getAuthHeaders();
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  } catch {
    throw new Error(
      'Sunucuya bağlanılamadı. Backend çalışıyor mu? (npm run dev) ve .env dosyalarını kontrol edin.'
    );
  }

  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Sunucu geçersiz yanıt döndü (${response.status})`);
  }

  if (!response.ok || !data.success) {
    throw new Error(extractApiError(data as unknown as Record<string, unknown>, response.status));
  }

  return data.data as T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function requestWithMeta<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; pagination?: PaginationMeta }> {
  let response: Response;
  try {
    const headers = await getAuthHeaders();
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  } catch {
    throw new Error('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
  }

  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(extractApiError(body as Record<string, unknown>, response.status));
  }

  return { data: body.data as T, pagination: body.pagination };
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  getWithMeta: <T>(endpoint: string) => requestWithMeta<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),

  downloadBlob: async (endpoint: string, filename?: string): Promise<void> => {
    const authHeaders = await getAuthHeaders();
    const { 'Content-Type': _ct, ...headers } = authHeaders as Record<string, string>;

    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, { headers });
    } catch {
      throw new Error('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    }

    if (!response.ok) {
      let message = `İstek başarısız (${response.status})`;
      try {
        const body = await response.json();
        message = extractApiError(body as Record<string, unknown>, response.status);
      } catch {
        // binary response
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const basicMatch = disposition.match(/filename="([^"]+)"/i);
    const resolvedName =
      filename ||
      (utf8Match ? decodeURIComponent(utf8Match[1]) : basicMatch ? basicMatch[1] : 'download');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resolvedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  upload: async <T>(endpoint: string, file: File): Promise<T> => {
    const formData = new FormData();
    formData.append('file', file);

    const authHeaders = await getAuthHeaders();
    const { 'Content-Type': _ct, ...headers } = authHeaders as Record<string, string>;

    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch {
      throw new Error('Sunucuya bağlanılamadı. Backend çalışıyor mu?');
    }

    let data: ApiResponse<T>;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Sunucu geçersiz yanıt döndü (${response.status})`);
    }

    if (!response.ok || !data.success) {
      throw new Error(extractApiError(data as unknown as Record<string, unknown>, response.status));
    }

    return data.data as T;
  },
};

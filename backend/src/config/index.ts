/**
 * Environment configuration loader
 * Validates and exports all environment variables
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function normalizePublicUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function collectPlatformUrls(): string[] {
  const urls: string[] = [];
  const add = (raw?: string) => {
    if (!raw) return;
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => urls.push(normalizePublicUrl(part)));
  };

  add(process.env.APP_URL);
  add(process.env.COOLIFY_URL);
  add(process.env.COOLIFY_FQDN);
  if (process.env.VERCEL_URL) add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) add(`https://${process.env.VERCEL_BRANCH_URL}`);

  return [...new Set(urls)];
}

function getCorsOrigins(): string[] {
  const fromEnv = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return [...new Set([...fromEnv, ...collectPlatformUrls()])];
}

function getPublicUrl(): string | null {
  const urls = collectPlatformUrls();
  return urls[0] ?? null;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[FATAL] Missing required environment variable: ${key}`);
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireEnvOnBoot(): void {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'WHATSAPP_VERIFY_TOKEN',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[FATAL] Missing environment variables:', missing.join(', '));
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

requireEnvOnBoot();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isVercel: !!process.env.VERCEL,
  isCoolify:
    !!process.env.COOLIFY_URL ||
    !!process.env.COOLIFY_FQDN ||
    !!process.env.COOLIFY_RESOURCE_UUID,
  publicUrl: getPublicUrl(),
  serveFrontend: process.env.NODE_ENV === 'production',

  supabase: {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  rag: {
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-large',
    embeddingDimensions: parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS || '1536', 10),
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1200', 10),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '150', 10),
    topK: parseInt(process.env.RAG_TOP_K || '6', 10),
    matchThreshold: parseFloat(process.env.RAG_MATCH_THRESHOLD || '0.25'),
    /** FTS text_rank bu değerin altındaysa zayıf gürültü sayılır (bilinmeyen soru kaydı için) */
    minLexicalRank: parseFloat(process.env.RAG_MIN_LEXICAL_RANK || '0.08'),
    vectorWeight: parseFloat(process.env.RAG_VECTOR_WEIGHT || '0.7'),
    textWeight: parseFloat(process.env.RAG_TEXT_WEIGHT || '0.3'),
    maxContextChars: parseInt(process.env.RAG_MAX_CONTEXT_CHARS || '3500', 10),
    maxVariants: parseInt(process.env.RAG_MAX_VARIANTS || '5', 10),
    indexBatchSize: parseInt(process.env.RAG_INDEX_BATCH_SIZE || '50', 10),
  },

  ai: {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '500', 10),
    maxHistoryMessages: parseInt(process.env.AI_MAX_HISTORY || '14', 10),
    maxKnowledgeItems: parseInt(process.env.AI_MAX_KNOWLEDGE_ITEMS || '3', 10),
    maxKnowledgeChars: parseInt(process.env.AI_MAX_KNOWLEDGE_CHARS || '1500', 10),
    maxKbAnswerChars: parseInt(process.env.AI_MAX_KB_ANSWER_CHARS || '650', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
    cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false',
    cacheTtlMs: parseInt(process.env.AI_CACHE_TTL_MS || '3600000', 10), // 1 saat
    /** Bumped on deploy to invalidate all cached AI responses (memory + DB) */
    cacheVersion: process.env.CACHE_VERSION || '2',
    /** Bumped when query-rewrite / intent-variant logic changes */
    rewriteCacheVersion: process.env.REWRITE_CACHE_VERSION || '6',
    /** Max age for persistent cache rows — enforced at read time */
    cacheMaxAgeMs:
      (parseInt(process.env.AI_CACHE_TTL_HOURS || '168', 10) || 168) * 60 * 60 * 1000,
    appointmentProviderLabel: process.env.APPOINTMENT_PROVIDER_LABEL || '',
  },

  whatsapp: {
    verifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    baseUrl: `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}`,
    embeddedSignupUrl: process.env.WHATSAPP_EMBEDDED_SIGNUP_URL || '',
    metaAppId: process.env.META_APP_ID || '',
  },

  cors: {
    origins: getCorsOrigins(),
  },

  sessionsDir: process.env.SESSIONS_DIR || path.join(process.cwd(), 'sessions'),

  demoMode: process.env.DEMO_MODE === 'true',
} as const;

if (config.nodeEnv === 'production' && config.demoMode) {
  console.warn(
    '[UYARI] DEMO_MODE=true — canlı ortamda müşteri özellikleri kısıtlanır. Coolify env: DEMO_MODE=false ve VITE_DEMO_MODE=false yapın.'
  );
}

if (!config.whatsapp.appSecret) {
  console.warn(
    '[UYARI] WHATSAPP_APP_SECRET tanımlı değil — Meta Cloud API webhook POST istekleri 401 ile reddedilecek.'
  );
}

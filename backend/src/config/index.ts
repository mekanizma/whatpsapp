/**
 * Environment configuration loader
 * Validates and exports all environment variables
 */

import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  supabase: {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  },

  openai: {
    apiKey: requireEnv('OPENAI_API_KEY'),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },

  ai: {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '250', 10),
    maxHistoryMessages: parseInt(process.env.AI_MAX_HISTORY || '4', 10),
    maxKnowledgeItems: parseInt(process.env.AI_MAX_KNOWLEDGE_ITEMS || '3', 10),
    maxKnowledgeChars: parseInt(process.env.AI_MAX_KNOWLEDGE_CHARS || '1500', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
    cacheEnabled: process.env.AI_CACHE_ENABLED !== 'false',
    cacheTtlMs: parseInt(process.env.AI_CACHE_TTL_MS || '3600000', 10), // 1 saat
  },

  whatsapp: {
    verifyToken: requireEnv('WHATSAPP_VERIFY_TOKEN'),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    baseUrl: `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}`,
    embeddedSignupUrl: process.env.WHATSAPP_EMBEDDED_SIGNUP_URL || '',
    metaAppId: process.env.META_APP_ID || '',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  demoMode: process.env.DEMO_MODE === 'true',
} as const;

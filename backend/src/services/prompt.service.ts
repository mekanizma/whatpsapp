/**
 * AI prompt şablonları — DB'den yükleme, önbellek ve admin CRUD
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { DEFAULT_PROMPTS, getDefaultContent, getDefaultPrompt } from '../ai/prompt-defaults';

export interface PromptTemplate {
  id: string;
  prompt_key: string;
  name: string;
  description: string | null;
  category: string;
  content: string;
  variables: string[];
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptInput {
  prompt_key: string;
  name: string;
  description?: string;
  category?: string;
  content: string;
  variables?: string[];
}

export interface UpdatePromptInput {
  name?: string;
  description?: string;
  category?: string;
  content?: string;
  variables?: string[];
  is_active?: boolean;
}

const CACHE_TTL_MS = 60_000;
const contentCache = new Map<string, { content: string; expires: number }>();
let demoStore: Map<string, PromptTemplate> | null = null;

function initDemoStore(): Map<string, PromptTemplate> {
  if (!demoStore) {
    demoStore = new Map();
    const now = new Date().toISOString();
    for (const p of DEFAULT_PROMPTS) {
      demoStore.set(p.prompt_key, {
        id: `demo-${p.prompt_key}`,
        prompt_key: p.prompt_key,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
        is_active: true,
        version: 1,
        created_at: now,
        updated_at: now,
      });
    }
  }
  return demoStore;
}

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function extractVariablesFromContent(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

export function invalidatePromptCache(key?: string): void {
  if (key) {
    contentCache.delete(key);
    return;
  }
  contentCache.clear();
}

function rowToTemplate(row: Record<string, unknown>): PromptTemplate {
  const vars = row.variables;
  return {
    id: String(row.id),
    prompt_key: String(row.prompt_key),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    category: String(row.category || 'general'),
    content: String(row.content),
    variables: Array.isArray(vars) ? vars.map(String) : [],
    is_active: row.is_active !== false,
    version: Number(row.version) || 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** AI motoru için aktif prompt içeriğini yükle (önbellekli) */
export async function getPromptContent(promptKey: string): Promise<string> {
  const cached = contentCache.get(promptKey);
  if (cached && Date.now() < cached.expires) {
    return cached.content;
  }

  if (config.demoMode) {
    const store = initDemoStore();
    const content = store.get(promptKey)?.content || getDefaultContent(promptKey);
    contentCache.set(promptKey, { content, expires: Date.now() + CACHE_TTL_MS });
    return content;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .select('content, is_active')
    .eq('prompt_key', promptKey)
    .maybeSingle();

  if (error || !data || !data.is_active) {
    const fallback = getDefaultContent(promptKey);
    contentCache.set(promptKey, { content: fallback, expires: Date.now() + CACHE_TTL_MS });
    return fallback;
  }

  const content = String(data.content);
  contentCache.set(promptKey, { content, expires: Date.now() + CACHE_TTL_MS });
  return content;
}

export async function getGreetingMessage(
  lang: import('../ai/language.service').ConversationLang
): Promise<string> {
  const { t, LANG_NAMES } = await import('../ai/language.service');
  const template = await getPromptContent('greeting');
  const fallback = getDefaultContent('greeting');

  if (!template.trim() || (fallback && template === fallback)) {
    return t(lang, 'greeting');
  }

  if (template.includes('{{langName}}')) {
    return renderPromptTemplate(template, { langName: LANG_NAMES[lang] });
  }

  return template.trim();
}

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  if (config.demoMode) {
    return Array.from(initDemoStore().values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'tr')
    );
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .select('*')
    .order('category')
    .order('name');

  if (error) throw new Error(error.message);

  if (!data?.length) {
    await seedDefaultPrompts();
    const { data: seeded, error: seedError } = await adminClient
      .from('ai_prompt_templates')
      .select('*')
      .order('category')
      .order('name');
    if (seedError) throw new Error(seedError.message);
    return (seeded || []).map((row) => rowToTemplate(row as Record<string, unknown>));
  }

  return data.map((row) => rowToTemplate(row as Record<string, unknown>));
}

export async function getPromptTemplate(promptKey: string): Promise<PromptTemplate | null> {
  if (config.demoMode) {
    return initDemoStore().get(promptKey) || null;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .select('*')
    .eq('prompt_key', promptKey)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToTemplate(data as Record<string, unknown>);
}

export async function createPromptTemplate(input: CreatePromptInput): Promise<PromptTemplate> {
  const key = input.prompt_key.trim().toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error('Anahtar yalnızca küçük harf, rakam ve alt çizgi içerebilir');
  }
  if (!input.name?.trim() || !input.content?.trim()) {
    throw new Error('Ad ve içerik gerekli');
  }

  if (config.demoMode) {
    const store = initDemoStore();
    if (store.has(key)) throw new Error('Bu anahtar zaten kullanılıyor');
    const now = new Date().toISOString();
    const item: PromptTemplate = {
      id: `demo-${key}`,
      prompt_key: key,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || 'custom',
      content: input.content.trim(),
      variables: input.variables || [],
      is_active: true,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    store.set(key, item);
    invalidatePromptCache(key);
    return item;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .insert({
      prompt_key: key,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || 'custom',
      content: input.content.trim(),
      variables:
        input.variables && input.variables.length > 0
          ? input.variables
          : extractVariablesFromContent(input.content),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  invalidatePromptCache(key);
  return rowToTemplate(data as Record<string, unknown>);
}

export async function updatePromptTemplate(
  promptKey: string,
  input: UpdatePromptInput
): Promise<PromptTemplate> {
  if (config.demoMode) {
    const store = initDemoStore();
    const existing = store.get(promptKey);
    if (!existing) throw new Error('Prompt bulunamadı');
    const updated: PromptTemplate = {
      ...existing,
      name: input.name?.trim() || existing.name,
      description: input.description !== undefined ? input.description?.trim() || null : existing.description,
      category: input.category?.trim() || existing.category,
      content: input.content?.trim() || existing.content,
      variables: input.variables ?? existing.variables,
      is_active: input.is_active ?? existing.is_active,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
    };
    store.set(promptKey, updated);
    invalidatePromptCache(promptKey);
    return updated;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.category !== undefined) patch.category = input.category.trim();
  if (input.content !== undefined) patch.content = input.content.trim();
  if (input.variables !== undefined) patch.variables = input.variables;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  const { data: current, error: currentError } = await adminClient
    .from('ai_prompt_templates')
    .select('version')
    .eq('prompt_key', promptKey)
    .maybeSingle();

  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error('Prompt bulunamadı');

  patch.version = (Number(current.version) || 1) + 1;

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .update(patch)
    .eq('prompt_key', promptKey)
    .select()
    .single();

  if (error) throw new Error(error.message);
  invalidatePromptCache(promptKey);
  return rowToTemplate(data as Record<string, unknown>);
}

export async function seedDefaultPrompts(): Promise<number> {
  if (config.demoMode) {
    initDemoStore();
    return DEFAULT_PROMPTS.length;
  }

  let inserted = 0;
  for (const p of DEFAULT_PROMPTS) {
    const { data: existing } = await adminClient
      .from('ai_prompt_templates')
      .select('id')
      .eq('prompt_key', p.prompt_key)
      .maybeSingle();

    if (existing) continue;

    const { error } = await adminClient.from('ai_prompt_templates').insert({
      prompt_key: p.prompt_key,
      name: p.name,
      description: p.description,
      category: p.category,
      content: p.content,
      variables: p.variables,
    });

    if (!error) inserted++;
  }

  invalidatePromptCache();
  return inserted;
}

export async function resetPromptToDefault(promptKey: string): Promise<PromptTemplate> {
  const def = getDefaultPrompt(promptKey);
  if (!def) throw new Error('Bu prompt için varsayılan yok');

  return updatePromptTemplate(promptKey, {
    name: def.name,
    description: def.description,
    category: def.category,
    content: def.content,
    variables: def.variables,
    is_active: true,
  });
}

/** Tüm varsayılan promptları DB'ye yazar (eksik olanları ekler, mevcutları sıfırlar) */
export async function resetAllPromptsToDefault(): Promise<{ reset: number; seeded: number }> {
  let reset = 0;
  let seeded = 0;

  for (const p of DEFAULT_PROMPTS) {
    if (config.demoMode) {
      const store = initDemoStore();
      const now = new Date().toISOString();
      store.set(p.prompt_key, {
        id: `demo-${p.prompt_key}`,
        prompt_key: p.prompt_key,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
        is_active: true,
        version: (store.get(p.prompt_key)?.version || 0) + 1,
        created_at: store.get(p.prompt_key)?.created_at || now,
        updated_at: now,
      });
      reset++;
      continue;
    }

    const { data: existing } = await adminClient
      .from('ai_prompt_templates')
      .select('id')
      .eq('prompt_key', p.prompt_key)
      .maybeSingle();

    if (existing) {
      await resetPromptToDefault(p.prompt_key);
      reset++;
    } else {
      const { error } = await adminClient.from('ai_prompt_templates').insert({
        prompt_key: p.prompt_key,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
      });
      if (!error) seeded++;
    }
  }

  invalidatePromptCache();
  return { reset, seeded };
}

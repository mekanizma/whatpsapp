/**
 * AI prompt şablonları — DB'den yükleme, önbellek ve admin CRUD
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import { DEFAULT_PROMPTS, getDefaultContent, getDefaultPrompt } from '../ai/prompt-defaults';
import {
  CORE_PROMPT_ROLES,
  PROMPT_ROLE_META,
  type PromptRole,
  resolvePromptRole,
  roleToLegacyKey,
} from '../ai/prompt-roles';

export interface PromptTemplate {
  id: string;
  prompt_key: string;
  prompt_role: PromptRole;
  name: string;
  description: string | null;
  category: string;
  content: string;
  variables: string[];
  is_active: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePromptInput {
  prompt_key: string;
  prompt_role?: PromptRole;
  name: string;
  description?: string;
  category?: string;
  content: string;
  variables?: string[];
  sort_order?: number;
}

export interface UpdatePromptInput {
  name?: string;
  description?: string;
  category?: string;
  content?: string;
  variables?: string[];
  is_active?: boolean;
  sort_order?: number;
}

const CACHE_TTL_MS = 60_000;
const contentCache = new Map<string, { content: string; expires: number }>();
let demoStore: Map<string, PromptTemplate> | null = null;

const ROLE_SORT: Record<PromptRole, number> = {
  greeting: 0,
  system: 1,
  appointment: 2,
  language: 3,
  translation: 4,
  custom: 5,
};

function categoryForRole(role: PromptRole): string {
  if (role === 'greeting' || role === 'system') return 'ai_system';
  if (role === 'appointment') return 'appointment';
  if (role === 'language') return 'language';
  if (role === 'translation') return 'translation';
  return 'custom';
}

function initDemoStore(): Map<string, PromptTemplate> {
  if (!demoStore) {
    demoStore = new Map();
    const now = new Date().toISOString();
    for (const p of DEFAULT_PROMPTS) {
      demoStore.set(p.prompt_key, {
        id: `demo-${p.prompt_key}`,
        prompt_key: p.prompt_key,
        prompt_role: p.prompt_role,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
        is_active: true,
        sort_order: 0,
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
    const role = resolvePromptRole(key);
    if (role) contentCache.delete(`role:${role}`);
    contentCache.delete('extensions');
    return;
  }
  contentCache.clear();
}

function rowToTemplate(row: Record<string, unknown>): PromptTemplate {
  const vars = row.variables;
  const role = (row.prompt_role as PromptRole) || resolvePromptRole(String(row.prompt_key)) || 'custom';
  return {
    id: String(row.id),
    prompt_key: String(row.prompt_key),
    prompt_role: role,
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    category: String(row.category || 'general'),
    content: String(row.content),
    variables: Array.isArray(vars) ? vars.map(String) : [],
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
    version: Number(row.version) || 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function sortTemplates(list: PromptTemplate[]): PromptTemplate[] {
  return [...list].sort((a, b) => {
    const roleDiff = ROLE_SORT[a.prompt_role] - ROLE_SORT[b.prompt_role];
    if (roleDiff !== 0) return roleDiff;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name, 'tr');
  });
}

async function loadActiveContentByRole(role: PromptRole): Promise<string | null> {
  if (config.demoMode) {
    const match = [...initDemoStore().values()]
      .filter((p) => p.prompt_role === role && p.is_active)
      .sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
    return match[0]?.content || null;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .select('content')
    .eq('prompt_role', role)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.content) return null;
  return String(data.content);
}

/** AI motoru için aktif prompt içeriğini yükle (rol veya anahtar ile) */
export async function getPromptContent(keyOrRole: string): Promise<string> {
  const role = resolvePromptRole(keyOrRole);
  const cacheKey = role ? `role:${role}` : keyOrRole;
  const cached = contentCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.content;
  }

  let content = '';

  if (role) {
    content = (await loadActiveContentByRole(role)) || '';
  }

  if (!content && config.demoMode) {
    const legacyKey = role ? roleToLegacyKey(role) : keyOrRole;
    content = initDemoStore().get(legacyKey)?.content || getDefaultContent(legacyKey);
  } else if (!content) {
    const legacyKey = role ? roleToLegacyKey(role) : keyOrRole;
    const { data } = await adminClient
      .from('ai_prompt_templates')
      .select('content, is_active')
      .eq('prompt_key', legacyKey)
      .maybeSingle();

    if (data?.is_active && data.content) {
      content = String(data.content);
    } else {
      content = getDefaultContent(legacyKey);
    }
  }

  contentCache.set(cacheKey, { content, expires: Date.now() + CACHE_TTL_MS });
  return content;
}

/** Ek (custom) prompt içerikleri — AI sistem promptuna eklenir */
export async function getExtensionPromptContents(): Promise<string[]> {
  const cached = contentCache.get('extensions');
  if (cached && Date.now() < cached.expires) {
    return cached.content ? cached.content.split('\x1e') : [];
  }

  if (config.demoMode) {
    const items = [...initDemoStore().values()]
      .filter((p) => p.prompt_role === 'custom' && p.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    const contents = items.map((p) => p.content);
    contentCache.set('extensions', {
      content: contents.join('\x1e'),
      expires: Date.now() + CACHE_TTL_MS,
    });
    return contents;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .select('content')
    .eq('prompt_role', 'custom')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name');

  if (error) throw new Error(error.message);
  const contents = (data || []).map((r) => String(r.content));
  contentCache.set('extensions', {
    content: contents.join('\x1e'),
    expires: Date.now() + CACHE_TTL_MS,
  });
  return contents;
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
    return sortTemplates(Array.from(initDemoStore().values()));
  }

  const { data, error } = await adminClient.from('ai_prompt_templates').select('*');

  if (error) throw new Error(error.message);

  if (!data?.length) {
    await seedDefaultPrompts();
    const { data: seeded, error: seedError } = await adminClient
      .from('ai_prompt_templates')
      .select('*');
    if (seedError) throw new Error(seedError.message);
    return sortTemplates((seeded || []).map((row) => rowToTemplate(row as Record<string, unknown>)));
  }

  return sortTemplates(data.map((row) => rowToTemplate(row as Record<string, unknown>)));
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

async function deactivateOtherRolePrompts(role: PromptRole, exceptKey: string): Promise<void> {
  if (role === 'custom' || config.demoMode) return;

  await adminClient
    .from('ai_prompt_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('prompt_role', role)
    .neq('prompt_key', exceptKey);
}

export async function createPromptTemplate(input: CreatePromptInput): Promise<PromptTemplate> {
  const key = input.prompt_key.trim().toLowerCase().replace(/\s+/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error('Anahtar yalnızca küçük harf, rakam ve alt çizgi içerebilir');
  }
  if (!input.name?.trim() || !input.content?.trim()) {
    throw new Error('Ad ve içerik gerekli');
  }

  const role: PromptRole = input.prompt_role || 'custom';
  const variables =
    input.variables && input.variables.length > 0
      ? input.variables
      : input.variables === undefined && PROMPT_ROLE_META[role]
        ? PROMPT_ROLE_META[role].variables
        : extractVariablesFromContent(input.content);

  if (config.demoMode) {
    const store = initDemoStore();
    if (store.has(key)) throw new Error('Bu anahtar zaten kullanılıyor');
    const now = new Date().toISOString();
    if (role !== 'custom') {
      for (const p of store.values()) {
        if (p.prompt_role === role) p.is_active = false;
      }
    }
    const item: PromptTemplate = {
      id: `demo-${key}`,
      prompt_key: key,
      prompt_role: role,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || categoryForRole(role),
      content: input.content.trim(),
      variables,
      is_active: true,
      sort_order: input.sort_order ?? 0,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    store.set(key, item);
    invalidatePromptCache();
    return item;
  }

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .insert({
      prompt_key: key,
      prompt_role: role,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || categoryForRole(role),
      content: input.content.trim(),
      variables,
      sort_order: input.sort_order ?? 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await deactivateOtherRolePrompts(role, key);
  invalidatePromptCache();
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
      description:
        input.description !== undefined ? input.description?.trim() || null : existing.description,
      category: input.category?.trim() || existing.category,
      content: input.content?.trim() || existing.content,
      variables: input.variables ?? existing.variables,
      is_active: input.is_active ?? existing.is_active,
      sort_order: input.sort_order ?? existing.sort_order,
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
    };
    store.set(promptKey, updated);
    invalidatePromptCache();
    return updated;
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.category !== undefined) patch.category = input.category.trim();
  if (input.content !== undefined) patch.content = input.content.trim();
  if (input.variables !== undefined) patch.variables = input.variables;
  if (input.is_active !== undefined) patch.is_active = input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  const { data: current, error: currentError } = await adminClient
    .from('ai_prompt_templates')
    .select('version, prompt_role')
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

  const role = (current.prompt_role as PromptRole) || 'custom';
  if (input.is_active !== false && role !== 'custom') {
    await deactivateOtherRolePrompts(role, promptKey);
  }

  invalidatePromptCache();
  return rowToTemplate(data as Record<string, unknown>);
}

export async function deletePromptTemplate(promptKey: string): Promise<void> {
  const existing = await getPromptTemplate(promptKey);
  if (!existing) throw new Error('Prompt bulunamadı');

  const isDefault = DEFAULT_PROMPTS.some((p) => p.prompt_key === promptKey);
  if (isDefault) {
    throw new Error('Sistem promptları silinemez. Düzenleyebilir veya varsayılana döndürebilirsiniz.');
  }

  if (config.demoMode) {
    initDemoStore().delete(promptKey);
    invalidatePromptCache();
    return;
  }

  const { error } = await adminClient
    .from('ai_prompt_templates')
    .delete()
    .eq('prompt_key', promptKey);

  if (error) throw new Error(error.message);
  invalidatePromptCache();
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
      prompt_role: p.prompt_role,
      name: p.name,
      description: p.description,
      category: p.category,
      content: p.content,
      variables: p.variables,
      sort_order: 0,
      is_active: true,
    });

    if (!error) inserted++;
  }

  invalidatePromptCache();
  return inserted;
}

export async function resetPromptToDefault(promptKey: string): Promise<PromptTemplate> {
  const def = getDefaultPrompt(promptKey);
  if (!def) throw new Error('Bu prompt için varsayılan yok');

  if (config.demoMode) {
    return updatePromptTemplate(promptKey, {
      name: def.name,
      description: def.description,
      category: def.category,
      content: def.content,
      variables: def.variables,
      is_active: true,
      sort_order: 0,
    });
  }

  const patch = {
    name: def.name,
    description: def.description,
    category: def.category,
    content: def.content,
    variables: def.variables,
    is_active: true,
    sort_order: 0,
    prompt_role: def.prompt_role,
    updated_at: new Date().toISOString(),
  };

  const { data: current, error: currentError } = await adminClient
    .from('ai_prompt_templates')
    .select('version')
    .eq('prompt_key', promptKey)
    .maybeSingle();

  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error('Prompt bulunamadı');

  const { data, error } = await adminClient
    .from('ai_prompt_templates')
    .update({ ...patch, version: (Number(current.version) || 1) + 1 })
    .eq('prompt_key', promptKey)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await deactivateOtherRolePrompts(def.prompt_role, promptKey);
  invalidatePromptCache();
  return rowToTemplate(data as Record<string, unknown>);
}

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
        prompt_role: p.prompt_role,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
        is_active: true,
        sort_order: 0,
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
        prompt_role: p.prompt_role,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        variables: p.variables,
        sort_order: 0,
        is_active: true,
      });
      if (!error) seeded++;
    }
  }

  invalidatePromptCache();
  return { reset, seeded };
}

/** Ek promptları sil, varsayılan 5 promptu sıfırla */
export async function cleanupAndReseedPrompts(): Promise<{
  removed: number;
  reset: number;
  seeded: number;
}> {
  const defaultKeys = new Set(DEFAULT_PROMPTS.map((p) => p.prompt_key));
  let removed = 0;

  if (!config.demoMode) {
    const { data: all, error } = await adminClient
      .from('ai_prompt_templates')
      .select('prompt_key');

    if (error) throw new Error(error.message);

    const toRemove = (all || []).filter((r) => !defaultKeys.has(String(r.prompt_key)));
    for (const row of toRemove) {
      const { error: delErr } = await adminClient
        .from('ai_prompt_templates')
        .delete()
        .eq('prompt_key', row.prompt_key);
      if (!delErr) removed++;
    }
  } else {
    const store = initDemoStore();
    for (const key of [...store.keys()]) {
      if (!defaultKeys.has(key)) {
        store.delete(key);
        removed++;
      }
    }
  }

  const { reset, seeded } = await resetAllPromptsToDefault();
  return { removed, reset, seeded };
}

export { CORE_PROMPT_ROLES, PROMPT_ROLE_META };

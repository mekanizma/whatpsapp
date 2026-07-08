/**
 * Abonelik paketi metinlerini TR → EN çevirir (OpenAI).
 * Admin kaydında ve fiyatlar sayfasında eksik çeviriler için kullanılır.
 */

import { createChatCompletion } from '../ai/openai-client';

export interface PlanTextContent {
  name: string;
  description: string | null;
  features: string[];
}

export interface PlanTextContentEn {
  name_en: string;
  description_en: string | null;
  features_en: string[];
}

function parseTranslationJson(raw: string, fallback: PlanTextContent): PlanTextContentEn {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      name_en?: string;
      description_en?: string | null;
      features_en?: unknown;
    };

    const features_en = Array.isArray(parsed.features_en)
      ? parsed.features_en
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];

    return {
      name_en: typeof parsed.name_en === 'string' && parsed.name_en.trim()
        ? parsed.name_en.trim()
        : fallback.name,
      description_en:
        typeof parsed.description_en === 'string'
          ? parsed.description_en.trim() || null
          : fallback.description,
      features_en:
        features_en.length === fallback.features.length
          ? features_en
          : fallback.features,
    };
  } catch {
    return {
      name_en: fallback.name,
      description_en: fallback.description,
      features_en: fallback.features,
    };
  }
}

export function planNeedsEnglishTranslation(
  plan: PlanTextContent & { name_en?: string | null; description_en?: string | null; features_en?: string[] }
): boolean {
  if (!plan.name_en?.trim()) return true;
  if (plan.description?.trim() && !plan.description_en?.trim()) return true;
  if (plan.features.length > 0 && plan.features_en?.length !== plan.features.length) {
    return true;
  }
  return false;
}

export async function translatePlanContentToEnglish(
  content: PlanTextContent
): Promise<PlanTextContentEn> {
  const payload = {
    name: content.name,
    description: content.description || '',
    features: content.features,
  };

  const completion = await createChatCompletion(
    [
      {
        role: 'system',
        content: `You translate SaaS subscription plan marketing copy from Turkish to English.
Return ONLY valid JSON with exactly these keys:
- name_en (string)
- description_en (string, empty string if no description)
- features_en (array of strings, SAME length and order as input features)

Rules:
- Preserve numbers, $ prices, emojis, and proper nouns (WhatsApp, Shopify, WooCommerce, Meta, CRM, API, SLA, AI, Webhook)
- Natural marketing English; do not add or remove bullet points
- If a line is already English, keep it`,
      },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    { maxTokens: 2500, temperature: 0, responseFormat: { type: 'json_object' } }
  );

  const raw = completion.choices[0]?.message?.content?.trim() || '';
  return parseTranslationJson(raw, content);
}

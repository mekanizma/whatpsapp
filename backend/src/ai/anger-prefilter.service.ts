/**
 * Öfke / küfür ön filtresi — LLM çağrısından önce doğrudan handoff
 */

import { normalizeForGate } from './ai-gate.service';
import { ConversationLang, detectConversationLanguage, t } from './language.service';
import { messagingPolicyConfig } from '../config/messaging-policy.config';

export interface AngerPrefilterResult {
  triggered: boolean;
  reason?: string;
  message?: string;
  lang: ConversationLang;
}

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildProfanityPattern(words: readonly string[]): RegExp | null {
  if (!words.length) return null;
  const escaped = words.map(escapeRegex).join('|');
  return new RegExp(`\\b(${escaped})\\b`, 'i');
}

const profanityPattern = buildProfanityPattern(messagingPolicyConfig.profanityWords);

function isAllCapsAnger(text: string): boolean {
  const letters = text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g);
  if (!letters || letters.length < messagingPolicyConfig.allCapsMinLetters) return false;
  return letters.every((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase());
}

function matchesProfanity(normalized: string): boolean {
  if (!profanityPattern) return false;
  return profanityPattern.test(normalized);
}

function matchesAngerPhrase(normalized: string): boolean {
  return messagingPolicyConfig.angerPhrasePatterns.some((p) => p.test(normalized));
}

function matchesExcessivePunctuation(text: string): boolean {
  return messagingPolicyConfig.excessivePunctuationRe.test(text);
}

export function detectAngerPrefilter(
  message: string,
  history: { sender_type: string; message: string }[] = [],
  lang?: ConversationLang
): AngerPrefilterResult {
  const trimmed = message.trim();
  const conversationLang = lang ?? detectConversationLanguage(trimmed, history);
  const normalized = normalizeForGate(trimmed);

  if (!trimmed) {
    return { triggered: false, lang: conversationLang };
  }

  let reason: string | undefined;

  if (matchesProfanity(normalized)) {
    reason = 'profanity';
  } else if (matchesAngerPhrase(normalized)) {
    reason = 'anger_phrase';
  } else if (isAllCapsAnger(trimmed)) {
    reason = 'all_caps';
  } else if (matchesExcessivePunctuation(trimmed)) {
    reason = 'excessive_punctuation';
  }

  if (!reason) {
    return { triggered: false, lang: conversationLang };
  }

  return {
    triggered: true,
    reason,
    message: t(conversationLang, 'anger_handoff'),
    lang: conversationLang,
  };
}

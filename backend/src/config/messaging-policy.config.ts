/**
 * WhatsApp mesajlaşma politikası — dedup, handoff, öfke ön filtresi
 * Tüm süreler ve eşikler env ile override edilebilir.
 */

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Türkçe küfür / hakaret kelimeleri — normalizeForGate ile eşleştirilir */
export const PROFANITY_WORDS = [
  'siktir',
  'sikeyim',
  'sikik',
  'amk',
  'amına',
  'amina',
  'aq',
  'orospu',
  'piç',
  'pic',
  'göt',
  'got',
  'götoş',
  'gotos',
  'salak',
  'aptal',
  'gerizekalı',
  'gerizekali',
  'ahmak',
  'dangalak',
  'bok',
  'kahpe',
  'pezevenk',
] as const;

/** Öfke / hayal kırıklığı kalıpları (normalize edilmiş metin üzerinde) */
export const ANGER_PHRASE_PATTERNS: RegExp[] = [
  /mal misin/,
  /mal mısın/,
  /\byeter\b/,
  /yeter artik/,
  /berbat/,
  /rezalet/,
  /anlamiyorsun/,
  /anlamadin/,
  /sacma/,
  /biktim/,
  /sinirliyim/,
  /sinir oldum/,
  /cildirdim/,
  /kotu hizmet/,
  /yardimci olmuyor/,
  /cevap vermiyor/,
  /hala ayni/,
  /ne sacmalik/,
  /dalga mi geciyor/,
];

/** Aşırı noktalama — öfke sinyali */
export const EXCESSIVE_PUNCTUATION_RE = /!{3,}|\?{3,}/;

export const messagingPolicyConfig = {
  /** Yinelenen AI yanıtı dedup TTL (ms) */
  dedupTtlMs: parseIntEnv('MSG_DEDUP_TTL_MS', 60_000),
  /** Aynı konuşmada bu kadar dedup skip sonrası otomatik handoff */
  dedupSkipHandoffThreshold: parseIntEnv('MSG_DEDUP_SKIP_HANDOFF_THRESHOLD', 2),
  /** transferred state otomatik sıfırlanma süresi (ms) */
  transferredStateTtlMs: parseIntEnv('MSG_TRANSFERRED_STATE_TTL_MS', 30 * 60 * 1000),
  /** ALL CAPS öfke sinyali için minimum harf sayısı */
  allCapsMinLetters: parseIntEnv('MSG_ANGER_ALL_CAPS_MIN_LETTERS', 10),
  profanityWords: [...PROFANITY_WORDS],
  angerPhrasePatterns: ANGER_PHRASE_PATTERNS,
  excessivePunctuationRe: EXCESSIVE_PUNCTUATION_RE,
} as const;

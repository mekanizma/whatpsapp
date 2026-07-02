/**
 * Sorgu genişletme — farklı kelimelerle sorulan aynı konular için RAG eşleşmesini güçlendirir
 */

interface ExpansionRule {
  /** Müşteri mesajında bu kalıp varsa genişletme uygulanır */
  pattern: RegExp;
  /** Embedding ve full-text aramasına eklenecek terimler */
  terms: string;
}

const EXPANSION_RULES: ExpansionRule[] = [
  {
    pattern:
      /fiyat|ücret|ucret|ne kadar|kaç tl|kac tl|maliyet|tarife|kaça|kaca|bedel|tutar|price|prices|pricing|cost|fee|fees|tuition|how much/i,
    terms: 'fiyat ücret tarife maliyet bedel price cost fee',
  },
  {
    pattern:
      /çalışma saat|calisma saat|açılış|acilis|kapanış|kapanis|mesai|ne zaman açık|ne zaman acik|working hours|opening hours|business hours|when are you open/i,
    terms: 'çalışma saatleri mesai açılış kapanış working hours',
  },
  {
    pattern: /adres|nerede|konum|yol tarifi|lokasyon|location|harita|address|where are you|directions/i,
    terms: 'adres konum yer yol tarifi address location',
  },
  {
    pattern: /randevu|rezervasyon|müsait|musait|boş saat|bos saat|uygun saat|appointment|book an appointment/i,
    terms: 'randevu rezervasyon müsaitlik appointment',
  },
  {
    pattern: /ağrı|agri|acı|aci|sız|siz|rahatsız|rahatsiz|pain|hurt|ache/i,
    terms: 'ağrı acı sızı rahatsızlık pain',
  },
  {
    pattern: /nasıl yapıl|nasil yapil|süreç|surec|işlem süreci|islem sureci|how is .* done|procedure/i,
    terms: 'nasıl yapılır süreç işlem procedure',
  },
];

/** RAG araması öncesi sorguyu eş anlamlılarla zenginleştir */
export function expandQueryForRetrieval(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;

  const extras: string[] = [];
  for (const rule of EXPANSION_RULES) {
    if (rule.pattern.test(trimmed)) {
      extras.push(rule.terms);
    }
  }

  if (!extras.length) return trimmed;
  return `${trimmed} ${extras.join(' ')}`.trim();
}

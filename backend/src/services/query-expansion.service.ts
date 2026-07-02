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
    pattern: /fiyat|ücret|ucret|ne kadar|kaç tl|kac tl|maliyet|tarife|kaça|kaca|bedel|tutar/i,
    terms: 'fiyat ücret tarife maliyet bedel',
  },
  {
    pattern: /çalışma saat|calisma saat|açılış|acilis|kapanış|kapanis|mesai|ne zaman açık|ne zaman acik/i,
    terms: 'çalışma saatleri mesai açılış kapanış',
  },
  {
    pattern: /adres|nerede|konum|yol tarifi|lokasyon|location|harita/i,
    terms: 'adres konum yer yol tarifi',
  },
  {
    pattern: /randevu|rezervasyon|müsait|musait|boş saat|bos saat|uygun saat/i,
    terms: 'randevu rezervasyon müsaitlik',
  },
  {
    pattern: /ağrı|agri|acı|aci|sız|siz|rahatsız|rahatsiz/i,
    terms: 'ağrı acı sızı rahatsızlık',
  },
  {
    pattern: /nasıl yapıl|nasil yapil|süreç|surec|işlem süreci|islem sureci/i,
    terms: 'nasıl yapılır süreç işlem',
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

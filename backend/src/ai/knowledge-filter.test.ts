import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRelevantKnowledge,
  isBroadKnowledgeQuery,
  isAppointmentIntent,
  isKnowledgeQuestion,
  extractKeywords,
} from './knowledge-filter.service';
import {
  formatConciseKnowledgeAnswer,
  extractRelevantSnippet,
  buildKnowledgeTopicMenu,
} from './kb-answer.service';
import { KnowledgeItem } from '../types';

const SAMPLE_KB: KnowledgeItem[] = [
  {
    title: 'Fiyat Bilgileri',
    content: 'Diş temizliği: 1500 TL\nDolgu: 2000 TL\nKanal tedavisi: 3500 TL',
    category: 'fiyat',
  },
  {
    title: 'genel bilgi',
    content: 'İlk Muayene\nAğız içi genel kontrol\n\nDolgu İşlemleri\nKompozit Dolgu\nBeyaz estetik dolgu',
    category: 'genel',
  },
  {
    title: 'işlem bilgisi',
    content:
      'Dolgu işlemi nasıl yapılır?\n\nÇürük diş dokusu temizlenir ve dolgu uygulanır.\n\nKanal tedavisi ağrılı mı?\n\nLokal anestezi altında yapılır.',
    category: 'sss',
  },
];

describe('knowledge-filter', () => {
  it('genel bilgi talebini algılar', () => {
    assert.equal(isBroadKnowledgeQuery('Diş kliniğiniz hakkında bilgi verin'), true);
    assert.equal(isBroadKnowledgeQuery('Dolgu fiyatı ne kadar'), false);
  });

  it('genel soruda tüm KB dökmez, konu menüsü döner', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Diş kliniğiniz hakkında bilgi verin');
    assert.equal(r.isBroadQuery, true);
    assert.equal(r.items.length, 3);
    const answer = formatConciseKnowledgeAnswer(r.items, 'Diş kliniğiniz hakkında bilgi verin', {
      isBroadQuery: true,
    });
    assert.match(answer, /hangi konuda/i);
    assert.match(answer, /Fiyat Bilgileri/);
    assert.ok(answer.length < 400);
    assert.doesNotMatch(answer, /Kanal tedavisi: 3500/);
  });

  it('spesifik soruda yalnızca ilgili kayıt seçilir', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Dolgu işlemi nasıl yapılır');
    assert.equal(r.isBroadQuery, false);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].title, 'işlem bilgisi');
  });

  it('fiyat sorusunda fiyat kaydı seçilir', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Dolgu ne kadar');
    assert.equal(r.items[0].title, 'Fiyat Bilgileri');
  });

  it('tek kelime eşleşmesinde de kayıt döner', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'diş tedavisi var mı');
    assert.equal(r.hasRelevantContent, true);
    assert.ok(r.items.length > 0);
  });

  it('Türkçe eklerle eşleşir (saatleriniz → saat)', () => {
    const kb: KnowledgeItem[] = [
      { title: 'Çalışma Saatleri', content: 'Pazartesi - Cuma: 09:00 - 18:00', category: 'genel' },
    ];
    const r = filterRelevantKnowledge(kb, 'çalışma saatleriniz nedir');
    assert.equal(r.hasRelevantContent, true);
    assert.equal(r.items[0].title, 'Çalışma Saatleri');
  });

  it('randevu geçmişinden sonra bilgi sorusu randevu sayılmaz', () => {
    const history = [
      { sender_type: 'ai', message: 'Randevu için ad soyad ve telefon alabilir miyim?' },
      { sender_type: 'customer', message: 'tamam' },
    ];
    assert.equal(isAppointmentIntent('dolgu fiyatı nedir', history), false);
    assert.equal(isKnowledgeQuestion('dolgu fiyatı nedir'), true);
  });
});

describe('kb-answer', () => {
  it('FAQ içinden yalnızca ilgili blok çıkarılır', () => {
    const content = SAMPLE_KB[2].content;
    const kw = extractKeywords('Dolgu işlemi nasıl yapılır');
    const snippet = extractRelevantSnippet(content, kw, 300);
    assert.match(snippet, /Dolgu işlemi nasıl yapılır/);
    assert.match(snippet, /Çürük diş dokusu/);
    assert.doesNotMatch(snippet, /Kanal tedavisi ağrılı/);
  });

  it('yanıt karakter limitini aşmaz', () => {
    const long = 'A'.repeat(2000);
    const item: KnowledgeItem = { title: 'Test', content: long, category: '' };
    const answer = formatConciseKnowledgeAnswer([item], 'test konu');
    assert.ok(answer.length <= 651);
  });

  it('konu menüsü kısa kalır', () => {
    const menu = buildKnowledgeTopicMenu(SAMPLE_KB, 'tr');
    assert.ok(menu.length < 350);
  });

  it('fiyat sorusunda yalnızca ilgili satır döner', () => {
    const answer = formatConciseKnowledgeAnswer([SAMPLE_KB[0]], 'Dolgu ne kadar');
    assert.match(answer, /Dolgu: 2000/);
    assert.doesNotMatch(answer, /Kanal tedavisi/);
  });
});

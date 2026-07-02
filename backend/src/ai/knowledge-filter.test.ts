import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterRelevantKnowledge,
  isBroadKnowledgeQuery,
  isAppointmentIntent,
  isKnowledgeQuestion,
  isPriceQuery,
  isGeneralPriceListQuery,
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
    content: 'Temel Paket: 1500 TL\nStandart Paket: 2000 TL\nPremium Paket: 3500 TL',
    category: 'fiyat',
  },
  {
    title: 'genel bilgi',
    content: 'İlk Görüşme\nGenel bilgilendirme\n\nDanışmanlık Hizmetleri\nBireysel danışmanlık\nKurumsal danışmanlık',
    category: 'genel',
  },
  {
    title: 'işlem bilgisi',
    content:
      'Kurulum nasıl yapılır?\n\nAdım adım kurulum rehberi uygulanır.\n\nBakım süreci ne kadar sürer?\n\nOrtalama süre hizmet türüne göre değişir.',
    category: 'sss',
  },
];

describe('knowledge-filter', () => {
  it('isBroadKnowledgeQuery yalnızca LLM bayrağını yansıtır', () => {
    assert.equal(isBroadKnowledgeQuery(true), true);
    assert.equal(isBroadKnowledgeQuery(false), false);
    assert.equal(isBroadKnowledgeQuery(), false);
  });

  it('genel soruda tüm KB dökmez, konu menüsü döner', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Şirketiniz hakkında bilgi verin', {
      isBroad: true,
    });
    assert.equal(r.isBroadQuery, true);
    assert.equal(r.items.length, 3);
    const answer = formatConciseKnowledgeAnswer(r.items, 'Şirketiniz hakkında bilgi verin', {
      isBroadQuery: true,
    });
    assert.match(answer, /hangi konuda/i);
    assert.match(answer, /Fiyat Bilgileri/);
    assert.ok(answer.length < 400);
    assert.doesNotMatch(answer, /Premium Paket: 3500/);
  });

  it('spesifik soruda yalnızca ilgili kayıt seçilir', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Kurulum nasıl yapılır');
    assert.equal(r.isBroadQuery, false);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].title, 'işlem bilgisi');
  });

  it('fiyat sorusunda fiyat kaydı seçilir', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'Standart paket ne kadar');
    assert.equal(r.items[0].title, 'Fiyat Bilgileri');
  });

  it('İngilizce fiyat sorusunda fiyat kaydı seçilir', () => {
    assert.equal(isPriceQuery('Could I get information about your prices?'), true);
    assert.equal(isGeneralPriceListQuery('Could I get information about your prices?'), true);
    assert.equal(isBroadKnowledgeQuery(false), false);

    const r = filterRelevantKnowledge(SAMPLE_KB, 'Could I get information about your prices?');
    assert.equal(r.isBroadQuery, false);
    assert.equal(r.items[0].title, 'Fiyat Bilgileri');
    assert.match(r.context, /1500 TL/);
  });

  it('İngilizce genel fiyat listesi talebini algılar', () => {
    assert.equal(isGeneralPriceListQuery('What are your prices?'), true);
    const r = filterRelevantKnowledge(SAMPLE_KB, 'What are your prices?');
    assert.equal(r.items[0].title, 'Fiyat Bilgileri');
  });

  it('İngilizce süre sorusu fiyat sayılmaz', () => {
    assert.equal(isPriceQuery('How long does setup take?'), false);
    assert.equal(isPriceQuery('How much does the standard package cost?'), true);
  });

  it('tek kelime eşleşmesinde de kayıt döner', () => {
    const r = filterRelevantKnowledge(SAMPLE_KB, 'danışmanlık hizmeti var mı');
    assert.equal(r.hasRelevantContent, true);
    assert.ok(r.items.length > 0);
  });

  it('"hakkında" ifadesindeki konu kelimesi anahtar sayılmaz', () => {
    const keywords = extractKeywords('şirketiniz hakkında bilgi verin');
    assert.ok(!keywords.includes('şirketiniz'));
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
    assert.equal(isAppointmentIntent('fiyat bilgisi nedir', history), false);
    assert.equal(isKnowledgeQuestion('fiyat bilgisi nedir'), true);
  });

  it('hem bilgi hem randevu niyetinde KB önceliklidir', () => {
    assert.equal(
      isAppointmentIntent('Standart paket fiyatı nedir, randevu da alabilir miyim?', []),
      false
    );
  });

  it('saf randevu talebi randevu moduna girer', () => {
    assert.equal(isAppointmentIntent('Randevu almak istiyorum', []), true);
  });
});

describe('kb-answer', () => {
  it('FAQ içeriğinin tamamı döner (LLM ilgili kısmı seçer)', () => {
    const content = SAMPLE_KB[2].content;
    const kw = extractKeywords('Kurulum nasıl yapılır');
    const snippet = extractRelevantSnippet(content, kw, 300);
    assert.match(snippet, /Kurulum nasıl yapılır/);
    assert.match(snippet, /Bakım süreci ne kadar/);
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

  it('fiyat sorusunda tam fiyat listesi döner (LLM ilgili satırı seçer)', () => {
    const answer = formatConciseKnowledgeAnswer([SAMPLE_KB[0]], 'Standart paket ne kadar');
    assert.match(answer, /Standart Paket: 2000/);
    assert.match(answer, /Premium Paket/);
  });

  it('İngilizce fiyat sorusunda fiyat listesi döner', () => {
    const answer = formatConciseKnowledgeAnswer(
      [SAMPLE_KB[0]],
      'Could I get information about your prices?'
    );
    assert.match(answer, /1500 TL/);
    assert.match(answer, /Standart Paket: 2000/);
  });
});

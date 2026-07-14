import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectConversationLanguage,
  t,
  getLanguagePromptBlock,
  getAppointmentProviderLabel,
  getLanguageHintName,
} from './language.service';
import { preAIGate } from './ai-gate.service';
import { promptForMissingField } from './appointment-collect.service';

const englishHistory = [
  { sender_type: 'customer', message: 'What are your working hours?' },
  { sender_type: 'ai', message: 'We are open 9-18' },
];

const turkishHistory = [
  { sender_type: 'customer', message: 'Çalışma saatleriniz nedir lütfen?' },
  { sender_type: 'ai', message: '09:00 - 18:00 arası açığız' },
];

describe('language.service', () => {
  it('İngilizce uzun mesajı algılar', () => {
    assert.equal(detectConversationLanguage('What are your tuition fees?', []), 'en');
    assert.equal(detectConversationLanguage('Do you have dormitories?', []), 'en');
  });

  it('Türkçe mesajı algılar', () => {
    assert.equal(detectConversationLanguage('Merhaba, evet teşekkürler', []), 'tr');
  });

  it('kısa mesaj konuşma dilini korur', () => {
    assert.equal(detectConversationLanguage('ok', englishHistory), 'en');
    assert.equal(detectConversationLanguage('tamam', turkishHistory), 'tr');
  });

  it('uzun güvenilir mesajla dil değişir', () => {
    const fromEnglish = [
      { sender_type: 'customer', message: 'What are your tuition fees?' },
      { sender_type: 'ai', message: 'Our fees start at 5000' },
    ];
    assert.equal(
      detectConversationLanguage('Randevu almak istiyorum lütfen yardım eder misiniz?', fromEnglish),
      'tr'
    );
  });

  it('Arapça ve Kiril script algısı değişmez', () => {
    assert.equal(detectConversationLanguage('مرحبا كيف يمكنني حجز موعد؟', []), 'ar');
    assert.equal(detectConversationLanguage('Здравствуйте, хочу записаться на приём', []), 'ru');
  });

  it('şablon dışı diller other döner', () => {
    assert.equal(
      detectConversationLanguage('Quali sono le tasse universitarie?', []),
      'other'
    );
    assert.equal(detectConversationLanguage('Ποια είναι τα δίδακτρά σας;', []), 'other');
  });

  it('other için şablonlar İngilizce kullanır', () => {
    assert.match(t('other', 'greeting'), /Hello/i);
    assert.equal(getAppointmentProviderLabel('other'), 'Staff');
  });

  it('şablon çevirileri doğru dilde döner', () => {
    assert.match(t('en', 'greeting'), /Hello/i);
    assert.match(t('tr', 'greeting'), /Merhaba/i);
    assert.match(promptForMissingField('name', 'en'), /first and last name/i);
    assert.match(promptForMissingField('name', 'tr'), /ad ve soyad/i);
    assert.match(promptForMissingField('title', 'tr'), /konu\/hizmet/i);
  });

  it('varsayılan personel etiketi nötr', () => {
    assert.equal(getAppointmentProviderLabel('tr'), 'İlgili kişi');
    assert.equal(getAppointmentProviderLabel('en'), 'Staff');
    assert.equal(getAppointmentProviderLabel('tr', undefined, 'klinik'), 'Doktor');
    assert.equal(getAppointmentProviderLabel('tr', undefined, 'universite'), 'İlgili kişi');
    assert.equal(getAppointmentProviderLabel('tr', undefined, 'dis_hekimi'), 'Diş hekimi');
  });

  it('dil promptu yoksa varsayılan ayna-kural bloğu döner', async () => {
    const block = await getLanguagePromptBlock('en');
    assert.match(block, /same language as the customer/i);
    assert.match(block, /English/);
  });

  it('other dil ipucu LLM ayna talimatı içerir', () => {
    assert.match(getLanguageHintName('other'), /mirror naturally/i);
  });

  it('kısa İngilizce/Türkçe selamları ilk mesajda doğru algılar', () => {
    assert.equal(detectConversationLanguage('Hello', []), 'en');
    assert.equal(detectConversationLanguage('Hi', []), 'en');
    assert.equal(detectConversationLanguage('Good morning', []), 'en');
    assert.equal(detectConversationLanguage('I need help', []), 'en');
    assert.equal(detectConversationLanguage('Merhaba', []), 'tr');
    assert.equal(detectConversationLanguage('Selam', []), 'tr');
  });

  it('belirsiz kısa ilk mesaj iş varsayılanı tr', () => {
    assert.equal(detectConversationLanguage('ok', []), 'tr');
    assert.equal(detectConversationLanguage('?', []), 'tr');
  });

  it('preAIGate İngilizce selamı ilk mesajda İngilizce şablonla verir', () => {
    const first = preAIGate('Hello', []);
    assert.equal(first.reason, 'greeting_template');
    assert.match(first.response!, /Hello/i);

    const g = preAIGate('Hello', englishHistory);
    assert.equal(g.reason, 'greeting_template');
    assert.match(g.response!, /Hello/i);
  });
});

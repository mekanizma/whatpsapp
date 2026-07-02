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
  });

  it('dil promptu yoksa varsayılan ayna-kural bloğu döner', async () => {
    const block = await getLanguagePromptBlock('en');
    assert.match(block, /same language as the customer/i);
    assert.match(block, /English/);
  });

  it('other dil ipucu LLM ayna talimatı içerir', () => {
    assert.match(getLanguageHintName('other'), /mirror naturally/i);
  });

  it('belirsiz kısa ilk mesaj iş varsayılanı tr', () => {
    assert.equal(detectConversationLanguage('Hello', []), 'tr');
  });

  it('preAIGate İngilizce konuşmada İngilizce selam şablonu verir', () => {
    const g = preAIGate('Hello', englishHistory);
    assert.equal(g.reason, 'greeting_template');
    assert.match(g.response!, /Hello/i);
  });
});

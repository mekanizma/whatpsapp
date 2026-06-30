import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectConversationLanguage,
  t,
  getLanguagePromptBlock,
} from './language.service';
import { preAIGate } from './ai-gate.service';
import { promptForMissingField } from './appointment-collect.service';

describe('language.service', () => {
  it('İngilizce mesajı algılar', () => {
    assert.equal(detectConversationLanguage('Hello, I want to book an appointment', []), 'en');
  });

  it('Türkçe mesajı algılar', () => {
    assert.equal(detectConversationLanguage('Merhaba randevu almak istiyorum', []), 'tr');
  });

  it('yalnızca son mesajın diline göre algılar — geçmiş önemsiz', () => {
    const history = [
      { sender_type: 'customer', message: 'Hello, what are your working hours?' },
      { sender_type: 'ai', message: 'We are open 9-18' },
    ];
    assert.equal(detectConversationLanguage('Teşekkürler', history), 'tr');
    assert.equal(detectConversationLanguage('Thanks', history), 'en');
  });

  it('şablon çevirileri doğru dilde döner', () => {
    assert.match(t('en', 'greeting'), /Hello/i);
    assert.match(t('tr', 'greeting'), /Merhaba/i);
    assert.match(promptForMissingField('name', 'en'), /first and last name/i);
    assert.match(promptForMissingField('name', 'tr'), /ad ve soyad/i);
  });

  it('dil promptu yoksa boş blok döner', async () => {
    assert.equal(await getLanguagePromptBlock('en'), '');
  });

  it('preAIGate İngilizce selamda İngilizce yanıt verir', () => {
    const g = preAIGate('Hello', []);
    assert.equal(g.reason, 'greeting_template');
    assert.match(g.response!, /Hello/i);
  });
});

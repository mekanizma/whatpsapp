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

  it('geçmişteki müşteri diline göre algılar', () => {
    const history = [
      { sender_type: 'customer', message: 'Hello, what are your working hours?' },
      { sender_type: 'ai', message: 'We are open 9-18' },
    ];
    assert.equal(detectConversationLanguage('Thanks', history), 'en');
  });

  it('şablon çevirileri doğru dilde döner', () => {
    assert.match(t('en', 'greeting'), /Hello/i);
    assert.match(t('tr', 'greeting'), /Merhaba/i);
    assert.match(promptForMissingField('name', 'en'), /first and last name/i);
    assert.match(promptForMissingField('name', 'tr'), /ad ve soyad/i);
  });

  it('prompt bloğu hedef dili içerir', () => {
    assert.match(getLanguagePromptBlock('en'), /English/i);
    assert.match(getLanguagePromptBlock('de'), /German/i);
  });

  it('preAIGate İngilizce selamda İngilizce yanıt verir', () => {
    const g = preAIGate('Hello', []);
    assert.equal(g.reason, 'greeting_template');
    assert.match(g.response!, /Hello/i);
  });
});

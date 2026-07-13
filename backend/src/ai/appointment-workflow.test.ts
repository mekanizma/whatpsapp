import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAvailabilityInquiry } from './appointment-workflow.service';
import {
  buildAllRequiredFieldsMessage,
  buildMissingFieldsMessage,
  getMissingRequiredFields,
  parseCollectedFields,
} from './appointment-collect.service';

describe('appointment-workflow.service', () => {
  it('müsaitlik sorusunu tanır', () => {
    assert.equal(isAvailabilityInquiry('müsait saatler var mı'), true);
    assert.equal(isAvailabilityInquiry('are there any available times'), true);
    assert.equal(isAvailabilityInquiry('pazartesi saat 10 randevu'), false);
  });

  it('ilk randevu talebinde tüm alanları ister', () => {
    const msg = buildAllRequiredFieldsMessage('tr');
    assert.match(msg, /ad soyad/i);
    assert.match(msg, /telefon/i);
    assert.match(msg, /randevu konusu/i);
    assert.match(msg, /tarih/i);
    assert.doesNotMatch(msg, /müsait/i);
  });

  it('eksik alanları listeler', () => {
    const msg = buildMissingFieldsMessage(['name', 'datetime'], 'tr');
    assert.match(msg, /Ad Soyad/);
    assert.match(msg, /Tarih ve Saat/);
  });

  it('tarih/saat olmadan tam alan sayılmaz', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyad?' },
      { sender_type: 'customer', message: 'Ali Yılmaz' },
      { sender_type: 'ai', message: 'Telefon?' },
      { sender_type: 'customer', message: '05551234567' },
      { sender_type: 'ai', message: 'Konu?' },
      { sender_type: 'customer', message: 'Danışmanlık' },
    ];
    const collected = parseCollectedFields(history, 'onaylıyorum');
    const missing = getMissingRequiredFields(collected, undefined, history, 'onaylıyorum');
    assert.ok(missing.includes('datetime'));
  });

  it('müşteri tarih/saat verdiğinde datetime tamam sayılır', () => {
    const history = [
      { sender_type: 'customer', message: 'Ali Yılmaz' },
      { sender_type: 'customer', message: '05551234567' },
      { sender_type: 'customer', message: 'Danışmanlık' },
    ];
    const missing = getMissingRequiredFields(
      parseCollectedFields(history, 'pazartesi saat 10'),
      undefined,
      history,
      'pazartesi saat 10'
    );
    assert.ok(!missing.includes('datetime'));
  });
});

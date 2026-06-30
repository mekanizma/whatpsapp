import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCollectedFields,
  blockBookingIfIncomplete,
  getMissingRequiredFields,
} from './appointment-collect.service';

describe('appointment-collect.service', () => {
  const fullHistory = [
    { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
    { sender_type: 'customer', message: 'Ali Yılmaz' },
    { sender_type: 'ai', message: 'Cep telefon numaranızı yazar mısınız?' },
    { sender_type: 'customer', message: '0555 123 45 67' },
    { sender_type: 'ai', message: 'Hangi işlem için randevu almak istiyorsunuz?' },
    { sender_type: 'customer', message: 'Diş temizliği' },
    { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
  ];

  it('tam konuşmadan ad, telefon ve işlem toplar', () => {
    const collected = parseCollectedFields(fullHistory, 'onaylıyorum');
    assert.equal(collected.customer_name, 'Ali Yılmaz');
    assert.equal(collected.customer_phone, '905551234567');
    assert.equal(collected.title, 'Diş temizliği');
  });

  it('eksik ad varken kaydı engeller', () => {
    const history = fullHistory.slice(2);
    const gate = blockBookingIfIncomplete(history, 'onaylıyorum');
    assert.equal(gate.blocked, true);
    assert.match(gate.message!, /ad ve soyad/i);
  });

  it('eksik telefon varken kaydı engeller', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyadınız?' },
      { sender_type: 'customer', message: 'Ali Yılmaz' },
      { sender_type: 'ai', message: 'İşlem?' },
      { sender_type: 'customer', message: 'Kontrol' },
    ];
    const missing = getMissingRequiredFields(parseCollectedFields(history, 'onaylıyorum'));
    assert.ok(missing.includes('phone'));
  });

  it('tüm zorunlu alanlar doluysa engellemez', () => {
    const gate = blockBookingIfIncomplete(fullHistory, 'onaylıyorum');
    assert.equal(gate.blocked, false);
    assert.equal(gate.message, null);
  });

  it('tek kelime adı kabul etmez', () => {
    const history = [
      { sender_type: 'ai', message: 'Adınız?' },
      { sender_type: 'customer', message: 'Ali' },
      { sender_type: 'ai', message: 'Telefon?' },
      { sender_type: 'customer', message: '05551234567' },
      { sender_type: 'ai', message: 'İşlem?' },
      { sender_type: 'customer', message: 'Muayene' },
    ];
    const gate = blockBookingIfIncomplete(history, 'onaylıyorum');
    assert.equal(gate.blocked, true);
  });

  it('kısıtlı geçmişte (son 4 mesaj) ad soyad yine bulunur', () => {
    const full = [
      { sender_type: 'ai', message: 'Randevu oluşturabilmem için önce ad ve soyadınızı yazar mısınız?' },
      { sender_type: 'customer', message: 'gurcem semercioglu' },
      { sender_type: 'ai', message: 'Teşekkürler. Randevu için cep telefon numaranızı yazar mısınız?' },
      { sender_type: 'customer', message: '05338507761' },
      { sender_type: 'ai', message: 'Hangi işlem veya muayene için randevu almak istediğinizi kısaca yazar mısınız?' },
    ];
    const truncated = full.slice(-4);
    const gate = blockBookingIfIncomplete(truncated, 'diş çekimi');
    assert.equal(gate.blocked, false);
    assert.equal(gate.collected.customer_name, 'gurcem semercioglu');
    assert.equal(gate.collected.title, 'diş çekimi');
  });
});

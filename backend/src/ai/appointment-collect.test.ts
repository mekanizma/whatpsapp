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
    { sender_type: 'ai', message: 'Hangi konu için randevu almak istiyorsunuz?' },
    { sender_type: 'customer', message: 'Teknik destek' },
    { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
  ];

  it('tam konuşmadan ad, telefon ve konu toplar', () => {
    const collected = parseCollectedFields(fullHistory, 'onaylıyorum');
    assert.equal(collected.customer_name, 'Ali Yılmaz');
    assert.equal(collected.customer_phone, '905551234567');
    assert.equal(collected.title, 'Teknik destek');
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
      { sender_type: 'ai', message: 'Hangi konu için randevu?' },
      { sender_type: 'customer', message: 'Genel bilgilendirme' },
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
      { sender_type: 'ai', message: 'Hangi konu?' },
      { sender_type: 'customer', message: 'Danışmanlık' },
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
      {
        sender_type: 'ai',
        message: 'Hangi konu/hizmet için randevu almak istediğinizi yazar mısınız?',
      },
    ];
    const truncated = full.slice(-4);
    const gate = blockBookingIfIncomplete(truncated, 'kurulum desteği');
    assert.equal(gate.blocked, false);
    assert.equal(gate.collected.customer_name, 'gurcem semercioglu');
    assert.equal(gate.collected.title, 'kurulum desteği');
  });

  it('sohbet cümleleri ad veya konu olarak alınmaz', () => {
    const history = [
      { sender_type: 'customer', message: 'Randevu verebilirmisin' },
      { sender_type: 'ai', message: 'Teşekkürler. Randevu için cep telefon numaranızı yazar mısınız?' },
      { sender_type: 'customer', message: '05338398293' },
      { sender_type: 'ai', message: 'Randevu için hangi işlem veya ziyaret sebebiyle gelmek istediğinizi belirtir misiniz?' },
      { sender_type: 'customer', message: 'Hocayla görüşücem' },
      { sender_type: 'customer', message: 'Ne diyosun' },
      { sender_type: 'customer', message: 'Vizyonunuz nedir peki' },
    ];
    const collected = parseCollectedFields(history, 'onaylıyorum');
    assert.equal(collected.customer_name, null);
    assert.equal(collected.title, 'Hocayla görüşücem');
    const gate = blockBookingIfIncomplete(history, 'onaylıyorum');
    assert.equal(gate.blocked, true);
    assert.match(gate.message!, /ad ve soyad/i);
  });
});

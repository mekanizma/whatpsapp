import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAppointmentAiResponse } from './appointment-response.service';
import { buildAppointmentCompanyContext } from './appointment-company-context';

const REF = new Date('2026-06-30T10:00:00.000Z');
const ctx = buildAppointmentCompanyContext({}, 'Europe/Istanbul');
const ctxWithRef = { ...ctx, parseRef: REF };

const baseHistory = [
  { sender_type: 'ai', message: 'Adınızı yazar mısınız?' },
  { sender_type: 'customer', message: 'Gurcem Semercioglu' },
  { sender_type: 'ai', message: 'Cep telefonunuzu yazar mısınız?' },
  { sender_type: 'customer', message: '05338507761' },
  { sender_type: 'ai', message: 'Hangi işlem için randevu almak istiyorsunuz?' },
  { sender_type: 'customer', message: 'Kontrol' },
  { sender_type: 'ai', message: 'Hangi gün ve saat uygun?' },
  { sender_type: 'customer', message: '15 gün sonra saat 17:00' },
];

describe('appointment-response.service', () => {
  it('göreceli tarihli AI yanıtını tam tarihli onay metniyle değiştirir', async () => {
    const raw =
      'Önümüzdeki 14 günde müsait saat yok. 15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?';
    const result = await reconcileAppointmentAiResponse(
      raw,
      baseHistory,
      '15 gün sonra saat 17:00',
      'tr',
      ctxWithRef
    );
    assert.match(result, /15\.07\.2026/);
    assert.match(result, /17:00/);
    assert.doesNotMatch(result, /15 gün sonra/i);
    assert.match(result, /Kontrol/);
  });

  it('tarih sorusuna tam tarih cevabı verir', async () => {
    const history = [
      ...baseHistory,
      {
        sender_type: 'ai',
        message: '15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?',
      },
    ];
    const raw = '15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?';
    const result = await reconcileAppointmentAiResponse(raw, history, 'Tarihi söyle', 'tr', ctxWithRef);
    assert.match(result, /15\.07\.2026/);
    assert.match(result, /17:00/);
    assert.doesNotMatch(result, /15 gün sonra/i);
  });

  it('şikayet mesajını konu olarak kullanmaz — özet doğru kalır', async () => {
    const history = [
      { sender_type: 'ai', message: 'Ad soyadınız?' },
      { sender_type: 'customer', message: 'Gurcem Semercioglu' },
      { sender_type: 'ai', message: 'Telefon?' },
      { sender_type: 'customer', message: '05338507761' },
      { sender_type: 'ai', message: 'Hangi işlem için randevu?' },
      { sender_type: 'customer', message: 'satım alma deneme' },
      { sender_type: 'ai', message: 'Hangi saat uygun?' },
      { sender_type: 'customer', message: '15 gün sonra saat 17:00' },
      {
        sender_type: 'ai',
        message:
          'Randevu özeti\nTarih/saat: 15.07.2026 17:00\nAd Soyad: konuyu yine değiştirmişsin\nKonu: konuyu yine değiştirmişsin\nOnaylıyor musunuz?',
      },
    ];
    const raw = history[history.length - 1].message;
    const result = await reconcileAppointmentAiResponse(
      raw,
      history,
      'konuyu yine değiştirdin',
      'tr',
      ctxWithRef
    );
    assert.match(result, /satım alma deneme/i);
    assert.match(result, /Gurcem Semercioglu/i);
    assert.doesNotMatch(result, /değiştirmiş/i);
  });
});

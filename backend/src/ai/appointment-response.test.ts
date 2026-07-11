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
  it('göreceli tarihli AI yanıtını tam tarihli onay metniyle değiştirir', () => {
    const raw =
      'Önümüzdeki 14 günde müsait saat yok. 15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?';
    const result = reconcileAppointmentAiResponse(
      raw,
      baseHistory,
      '15 gün sonra saat 17:00',
      'tr',
      ctxWithRef
    );
    assert.match(result, /15\.07\.2026/);
    assert.match(result, /17:00/);
    assert.doesNotMatch(result, /15 gün sonra/i);
  });

  it('tarih sorusuna tam tarih cevabı verir', () => {
    const history = [
      ...baseHistory,
      {
        sender_type: 'ai',
        message: '15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?',
      },
    ];
    const raw = '15 gün sonra saat 17:00 için randevu kaydedebilirim. Onaylıyor musunuz?';
    const result = reconcileAppointmentAiResponse(raw, history, 'Tarihi söyle', 'tr', ctxWithRef);
    assert.match(result, /15\.07\.2026/);
    assert.match(result, /17:00/);
    assert.doesNotMatch(result, /15 gün sonra/i);
  });
});

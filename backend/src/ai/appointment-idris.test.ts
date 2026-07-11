import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSlotFromTurkishText,
  extractSlotForConfirmation,
  buildAppointmentConfirmationPrompt,
  formatSlotTurkish,
  validateSlotWorkingHours,
} from './appointment-slot.service';
import { reconcileAppointmentAiResponse } from './appointment-response.service';
import { buildAppointmentCompanyContext } from './appointment-company-context';

// 1 Temmuz 2026 Çarşamba 18:50 TR ≈ 15:50 UTC
const REF = new Date('2026-07-01T15:50:00.000Z');

describe('idris senaryosu', () => {
  const history = [
    { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
    { sender_type: 'customer', message: 'İdris Yıldırım' },
    { sender_type: 'ai', message: 'Cep telefon numaranızı yazar mısınız?' },
    { sender_type: 'customer', message: '05338398293' },
    { sender_type: 'ai', message: 'Hangi konu için randevu?' },
    { sender_type: 'customer', message: 'genel bilgilendirme için' },
    { sender_type: 'ai', message: 'Uygun tarih ve saat belirtir misiniz?' },
    { sender_type: 'customer', message: 'yarın saat 3 de' },
    {
      sender_type: 'ai',
      message:
        "Üzgünüm, yarın saat 15:00'te randevu alamazsınız çünkü o saat diliminde randevu verilemiyor.",
    },
    { sender_type: 'customer', message: 'hangi saatler müsayit' },
    { sender_type: 'ai', message: 'Pazartesi–Cuma: 09:00 – 18:00...' },
    { sender_type: 'customer', message: 'perşembe 14:00' },
    {
      sender_type: 'ai',
      message:
        'Randevu almak istediğiniz tarih ve saat:\n- Tarih: 06 Temmuz 2026\n- Saat: 14:00\nBu bilgileri onaylıyor musunuz?',
    },
  ];

  it('yarın saat 3 de → 02.07.2026 15:00', () => {
    const slot = parseSlotFromTurkishText('yarın saat 3 de', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '02.07.2026 15:00-15:30');
    assert.equal(validateSlotWorkingHours(slot!).valid, true);
  });

  it('perşembe 14:00 → 02.07.2026 (gerçek perşembe, 06 değil)', () => {
    const slot = parseSlotFromTurkishText('perşembe 14:00', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '02.07.2026 14:00-14:30');
  });

  it('onayda AI yanlış tarih yazsa bile müşteri perşembesi kullanılır', () => {
    const slot = extractSlotForConfirmation(history, 'onaylıyorum', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '02.07.2026 14:00-14:30');
  });

  it('AI hatalı red yerine doğru onay özeti üretir', async () => {
    const slot = parseSlotFromTurkishText('yarın saat 3 de', REF)!;
    const dateLabel = formatSlotTurkish(slot.starts_at, slot.ends_at).split('-')[0].trim();
    const ctx = buildAppointmentCompanyContext({}, 'Europe/Istanbul');
    ctx.parseRef = REF;
    const fixed = await reconcileAppointmentAiResponse(
      "Üzgünüm, yarın saat 15:00'te randevu alamazsınız.",
      history.slice(0, 7),
      'yarın saat 3 de',
      'tr',
      ctx
    );
    assert.match(fixed, new RegExp(dateLabel.replace(/\./g, '\\.')));
    assert.match(fixed, /onaylıyor musunuz/i);
    assert.doesNotMatch(fixed, /alamazsınız/i);
    assert.match(fixed, /Konu:/);
  });

  it('onay özeti doğru gün adını içerir', () => {
    const slot = parseSlotFromTurkishText('perşembe 14:00', REF)!;
    const prompt = buildAppointmentConfirmationPrompt(
      {
        customer_name: 'İdris Yıldırım',
        customer_phone: '905338398293',
        title: 'genel bilgilendirme için',
      },
      slot,
      'tr'
    );
    assert.match(prompt, /02\.07\.2026 14:00/);
    assert.match(prompt, /Perşembe/i);
    assert.doesNotMatch(prompt, /06\.07/);
  });
});

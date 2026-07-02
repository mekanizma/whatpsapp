import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAppointmentConfirmation } from './appointment-extract.service';
import { validateAppointmentAction } from '../services/appointment.service';
import { extractOfferedSlotFromHistory, formatSlotTurkish } from './appointment-slot.service';
import { blockBookingIfIncomplete, parseCollectedFields } from './appointment-collect.service';

const REF = new Date('2026-06-30T10:00:00.000Z');

describe('randevu onay akışı (birim)', () => {
  it('onaylıyorum / evet / tamam tanınır', () => {
    assert.equal(isAppointmentConfirmation('onaylıyorum'), true);
    assert.equal(isAppointmentConfirmation('Evet'), true);
    assert.equal(isAppointmentConfirmation('tamam'), true);
    assert.equal(isAppointmentConfirmation('hayır'), false);
  });

  it('kullanıcı senaryosu: 12:30 teklif + onay → doğru slot ve geçerli veri', () => {
    const history = [
      { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
      { sender_type: 'customer', message: 'Mehmet Demir' },
      { sender_type: 'ai', message: 'Cep telefon numaranızı yazar mısınız?' },
      { sender_type: 'customer', message: '0532 111 22 33' },
      { sender_type: 'ai', message: 'Hangi konu için randevu?' },
      { sender_type: 'customer', message: 'Genel bilgilendirme' },
      { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
    ];

    assert.equal(isAppointmentConfirmation('onaylıyorum'), true);

    const gate = blockBookingIfIncomplete(history, 'onaylıyorum');
    assert.equal(gate.blocked, false);

    const slot = extractOfferedSlotFromHistory(history, REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');

    const collected = parseCollectedFields(history, 'onaylıyorum');
    const action = {
      customer_name: collected.customer_name!,
      customer_phone: collected.customer_phone!,
      title: collected.title!,
      starts_at: slot!.starts_at,
      ends_at: slot!.ends_at,
    };

    assert.equal(validateAppointmentAction(action), null);
  });

  it('AI 13:00 dese bile konuşma slotu 12:30 kalmalı', () => {
    const history = [
      { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsinuz. Onaylıyor musunuz?" },
    ];
    const offered = extractOfferedSlotFromHistory(history, REF);
    const aiWrongStart = '2026-07-01T10:00:00.000Z'; // 13:00 İstanbul
    assert.notEqual(offered!.starts_at, aiWrongStart);
    const startTr = new Date(offered!.starts_at).toLocaleTimeString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    });
    assert.equal(startTr, '12:30');
  });
});

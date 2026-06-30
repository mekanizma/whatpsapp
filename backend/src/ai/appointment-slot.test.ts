import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSlotFromTurkishText,
  extractOfferedSlotFromHistory,
  formatSlotTurkish,
  preferHistorySlot,
  slotsRoughlyMatch,
} from './appointment-slot.service';

const REF = new Date('2026-06-30T10:00:00.000Z'); // 30 Haziran 2026 TR öğlen

describe('appointment-slot.service', () => {
  it('yarın 12:30 teklifini doğru parse eder', () => {
    const slot = parseSlotFromTurkishText(
      "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?",
      REF
    );
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
  });

  it('12:30 teklifini 13:00 başlangıç olarak yorumlamaz', () => {
    const slot = parseSlotFromTurkishText('Yarın saat 12:30 da randevu', REF);
    assert.ok(slot);
    const startTr = new Date(slot!.starts_at).toLocaleTimeString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    });
    assert.equal(startTr, '12:30');
  });

  it('geçmişten son AI onay mesajındaki saati alır', () => {
    const history = [
      { sender_type: 'ai', message: 'Yarın 10:00 uygun mu?' },
      { sender_type: 'customer', message: 'hayır' },
      { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
      { sender_type: 'customer', message: 'onaylıyorum' },
    ];
    const slot = extractOfferedSlotFromHistory(history, REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
  });

  it('saat aralığı 12:30-13:00 olarak parse edilir', () => {
    const slot = parseSlotFromTurkishText('Yarın 12:30-13:00 arası uygun', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
  });

  it('preferHistorySlot LLM saatini konuşmadaki teklifle değiştirir', () => {
    const history = [
      {
        sender_type: 'ai',
        message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?",
      },
    ];
    const wrongLlm = {
      starts_at: '2026-07-01T10:00:00.000Z', // 13:00 TR
      ends_at: '2026-07-01T10:30:00.000Z',
    };
    const slot = preferHistorySlot(history, wrongLlm);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
    assert.equal(slotsRoughlyMatch(slot!.starts_at, wrongLlm.starts_at), false);
  });

  it('DD.MM.YYYY tarih formatını destekler', () => {
    const slot = parseSlotFromTurkishText('01.07.2026 saat 09:00 müsait', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 09:00/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSlotFromTurkishText,
  extractCustomerSlotFromConversation,
  extractSlotFromConversation,
  extractNumberedAlternative,
  formatSlotTurkish,
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

  it('müşteri mesajından slot çıkarır, AI teklifini yok sayar', () => {
    const history = [
      { sender_type: 'ai', message: 'Yarın 10:00 uygun mu?' },
      { sender_type: 'customer', message: 'hayır' },
      { sender_type: 'ai', message: "Yarın saat 12:30'da randevu alabilirsiniz. Onaylıyor musunuz?" },
      { sender_type: 'customer', message: 'yarın saat 12:30 uygun' },
    ];
    const slot = extractCustomerSlotFromConversation(history, 'onaylıyorum', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
  });

  it('saat aralığı 12:30-13:00 olarak parse edilir', () => {
    const slot = parseSlotFromTurkishText('Yarın 12:30-13:00 arası uygun', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
  });

  it('DD.MM.YYYY tarih formatını destekler', () => {
    const slot = parseSlotFromTurkishText('01.07.2026 saat 09:00 müsait', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 09:00/);
  });

  it('15 temmuz saat 3 formatını parse eder', () => {
    const slot = parseSlotFromTurkishText('15 temmuz saat 3 için randevu', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /15\.07\.2026 15:00/);
  });

  it('temmuz 15 14:30 formatını parse eder', () => {
    const slot = parseSlotFromTurkishText('temmuz 15 14:30 uygun mu', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /15\.07\.2026 14:30/);
  });

  it('pazartesi saat 10 ifadesini parse eder', () => {
    const slot = parseSlotFromTurkishText('pazartesi saat 10', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /06\.07\.2026 10:00/);
  });

  it('müşteri mesajından doğrudan slot çıkarır', () => {
    const history = [{ sender_type: 'ai', message: 'Hangi gün uygun?' }];
    const slot = extractSlotFromConversation(history, 'yarın saat 15:00', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 15:00/);
  });

  it('göreli Türkçe tarihleri parse eder', () => {
    const cases: [string, string][] = [
      ['yarın saat 10', '01.07.2026 10:00'],
      ['öbürgün saat 10', '02.07.2026 10:00'],
      ['oburgun saat 10', '02.07.2026 10:00'],
      ['haftaya saat 10', '07.07.2026 10:00'],
      ['5 gün sonra saat 10', '05.07.2026 10:00'],
      ['2 hafta sonra saat 10', '14.07.2026 10:00'],
      ['1 ay sonra saat 10', '30.07.2026 10:00'],
    ];
    for (const [input, expected] of cases) {
      const slot = parseSlotFromTurkishText(input, REF);
      assert.ok(slot, `slot null for: ${input}`);
      assert.match(
        formatSlotTurkish(slot!.starts_at, slot!.ends_at),
        new RegExp(expected.replace('-', '[-–]')),
        `failed for: ${input}`
      );
    }
  });

  it('numaralı alternatif 8 seçimini parse eder', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          'Müsait saatler:\n1) 09:00-09:30\n2) 09:30-10:00\n8) 16:30-17:00',
      },
    ];
    const slot = extractNumberedAlternative(history, '8', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /16:30/);
  });
});

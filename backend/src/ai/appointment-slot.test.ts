import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSlotFromTurkishText,
  extractOfferedSlotFromHistory,
  extractSlotFromConversation,
  formatSlotTurkish,
  preferHistorySlot,
  slotsRoughlyMatch,
  parseSlotFromText,
  parseDateFromText,
  hasDateOnlyIntent,
  localToUtcInTimezone,
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
    const slot = preferHistorySlot(history, wrongLlm, '', REF);
    assert.ok(slot);
    assert.equal(formatSlotTurkish(slot!.starts_at, slot!.ends_at), '01.07.2026 12:30-13:00');
    assert.equal(slotsRoughlyMatch(slot!.starts_at, wrongLlm.starts_at), false);
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

  it('15 gün sonra saat 17:00 ifadesini parse eder', () => {
    const slot = parseSlotFromTurkishText('15 gün sonra saat 17:00', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /15\.07\.2026 17:00/);
  });

  it('15 days later at 17:00 ifadesini parse eder', () => {
    const slot = parseSlotFromText('15 days later at 17:00', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /15\.07\.2026 17:00/);
  });

  it('ertesi gün saat 10 ifadesini yarın olarak parse eder', () => {
    const slot = parseSlotFromTurkishText('ertesi gün saat 10', REF);
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 10:00/);
  });

  it('salı günü 13.00 ifadesini doğru parse eder', () => {
    const slot = parseSlotFromTurkishText('salı günü 13.00 müsait misin', REF);
    assert.ok(slot);
    const startTr = new Date(slot!.starts_at).toLocaleTimeString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    });
    assert.equal(startTr, '13:00');
  });

  it('14 temmuz ifadesinden tarih çıkarır', () => {
    const date = parseDateFromText('14 temmuz boş saat varmı', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.equal(date!.day, 14);
    assert.equal(date!.month, 7);
  });

  it('tarih var saat yok mesajını date-only olarak işaretler', () => {
    const options = { ref: REF, timezone: 'Europe/Istanbul' };
    assert.equal(hasDateOnlyIntent('14 temmuz boş saat varmı', options), true);
    assert.equal(hasDateOnlyIntent('14 temmuz saat 10:00', options), false);
  });

  it('yeni tarih sorusunda geçmiş AI teklifini kullanmaz', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          '13 Temmuz 2026 tarihinde saat 09:00 ile 09:30 arasında bir randevu önerebilirim. Bu saat sizin için uygun mu?',
      },
    ];
    const slot = extractSlotFromConversation(history, '14 temmuz boş saat varmı', {
      ref: new Date('2026-07-11T10:00:00.000Z'),
      timezone: 'Europe/Istanbul',
    });
    assert.equal(slot, null);
  });

  it('salı günü hangi saatler müsait sorusunda geçmiş teklifi kullanmaz', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          '13 Temmuz 2026 tarihinde saat 09:00 ile 09:30 arasında bir randevu önerebilirim.',
      },
    ];
    const slot = extractSlotFromConversation(history, 'Salı günü hangi saatler müsait', {
      ref: new Date('2026-07-11T10:00:00.000Z'),
      timezone: 'Europe/Istanbul',
    });
    assert.equal(slot, null);
  });

  it('July 14 ifadesinden tarih çıkarır', () => {
    const date = parseDateFromText('any free slots on July 14', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.equal(date!.day, 14);
    assert.equal(date!.month, 7);
  });

  it('tomorrow at 10 ifadesini parse eder', () => {
    const slot = parseSlotFromText('tomorrow at 10', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 10:00/);
  });

  it('morgen um 10 ifadesini parse eder', () => {
    const slot = parseSlotFromText('morgen um 10', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(slot);
    assert.match(formatSlotTurkish(slot!.starts_at, slot!.ends_at), /01\.07\.2026 10:00/);
  });

  it('14 juillet ifadesinden tarih çıkarır', () => {
    const date = parseDateFromText('14 juillet créneaux disponibles', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.equal(date!.day, 14);
    assert.equal(date!.month, 7);
  });

  it('oburgun ifadesini öbür gün olarak parse eder', () => {
    const date = parseDateFromText('oburgun musait mi', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.match(
      formatSlotTurkish(
        localToUtcInTimezone(date!.year, date!.month, date!.day, 12, 0, 'Europe/Istanbul').toISOString(),
        localToUtcInTimezone(date!.year, date!.month, date!.day, 12, 30, 'Europe/Istanbul').toISOString()
      ),
      /02\.07\.2026/
    );
  });

  it('haftaya ifadesini gelecek hafta olarak parse eder', () => {
    const date = parseDateFromText('haftaya randevu', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.match(
      formatSlotTurkish(
        localToUtcInTimezone(date!.year, date!.month, date!.day, 12, 0, 'Europe/Istanbul').toISOString(),
        localToUtcInTimezone(date!.year, date!.month, date!.day, 12, 30, 'Europe/Istanbul').toISOString()
      ),
      /07\.07\.2026/
    );
  });

  it('1 ay sonra ifadesini parse eder', () => {
    const date = parseDateFromText('1 ay sonra', {
      ref: REF,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(date);
    assert.equal(date!.month, 7);
    assert.equal(date!.day, 30);
  });

  it('ASCII sali ve carsamba gün adlarını tanır', () => {
    const sali = parseDateFromText('sali musait mi', { ref: REF, timezone: 'Europe/Istanbul' });
    const cars = parseDateFromText('carsamba uygun mu', { ref: REF, timezone: 'Europe/Istanbul' });
    assert.ok(sali);
    assert.ok(cars);
    assert.notEqual(sali!.day, cars!.day);
  });
});

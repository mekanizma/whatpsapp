import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldQueryAppointmentAvailability,
  buildAppointmentAvailabilityContext,
  appointmentAvailabilityDeps,
  mergeAppointmentSystemNotes,
} from './appointment-llm-availability.service';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';
import { localToUtcInTimezone } from './appointment-slot.service';

const TZ = 'Asia/Nicosia';
const REF = new Date('2026-07-13T09:00:00.000Z');

function ctxAtRef() {
  return { ...DEFAULT_APPOINTMENT_CONTEXT, timezone: TZ, parseRef: REF };
}

const IDRIS_HISTORY = [
  { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
  { sender_type: 'customer', message: 'idris yıldırım' },
  { sender_type: 'ai', message: 'Randevu konusunu yazar mısınız?' },
  { sender_type: 'customer', message: 'genel bilgi almak demo nuz hakkında' },
  { sender_type: 'ai', message: 'Telefon numaranızı yazar mısınız?' },
  { sender_type: 'customer', message: '0533 839 82 93' },
  { sender_type: 'ai', message: 'Hangi tarihte randevu almak istersiniz?' },
];

describe('appointment-llm-availability.service', () => {
  const originalHasConflict = appointmentAvailabilityDeps.hasConflict;
  const originalList = appointmentAvailabilityDeps.listAvailableSlotsForDate;

  beforeEach(() => {
    appointmentAvailabilityDeps.hasConflict = async () => false;
    appointmentAvailabilityDeps.listAvailableSlotsForDate = async () => [];
  });

  afterEach(() => {
    appointmentAvailabilityDeps.hasConflict = originalHasConflict;
    appointmentAvailabilityDeps.listAvailableSlotsForDate = originalList;
  });

  it('tarih/saat veya müsaitlik sorusunda DB sorgusu tetikler', () => {
    assert.equal(shouldQueryAppointmentAvailability('yarın saat 3 müsaitmi'), true);
    assert.equal(shouldQueryAppointmentAvailability('randevu almak istiyorum'), false);
  });

  it('numaralı saat seçiminde DB sorgusu tetikler', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          'Müsait saatler:\n1) 09:00-09:30\n2) 09:30-10:00\n8) 16:30-17:00',
      },
    ];
    assert.equal(shouldQueryAppointmentAvailability('8', history), true);
    assert.equal(shouldQueryAppointmentAvailability('8', []), false);
  });

  it('müşteri 8 yazınca listedeki 8. saati seçer', async () => {
    const history = [
      ...IDRIS_HISTORY,
      { sender_type: 'customer', message: '14 temmuz' },
      {
        sender_type: 'ai',
        message:
          'Müsait saatler:\n1) 09:00-09:30\n2) 09:30-10:00\n8) 16:30-17:00\n\nHangi saati tercih edersiniz?',
      },
    ];

    const result = await buildAppointmentAvailabilityContext(
      'co1',
      history,
      '8',
      ctxAtRef(),
      'tr',
      { date: '2026-07-14' }
    );

    assert.ok(result.systemNote);
    assert.match(result.systemNote!, /MÜSAİT|DOLU/);
    assert.equal(result.statePatch?.date, '2026-07-14');
    assert.equal(result.statePatch?.time, '16:30');
  });

  it('yarın saat 3 müsaitmi → belirli slot müsait notu ve state patch', async () => {
    const result = await buildAppointmentAvailabilityContext(
      'co1',
      IDRIS_HISTORY,
      'yarın saat 3 müsaitmi',
      ctxAtRef(),
      'tr'
    );

    assert.ok(result.systemNote);
    assert.match(result.systemNote!, /MÜSAİT/);
    assert.match(result.systemNote!, /VERİTABANI MÜSAİTLİK SONUCU/);
    assert.equal(result.statePatch?.date, '2026-07-14');
    assert.equal(result.statePatch?.time, '15:00');
    assert.equal(result.dbError, false);
  });

  it('dolu slot için alternatif liste ekler', async () => {
    appointmentAvailabilityDeps.hasConflict = async () => true;
    appointmentAvailabilityDeps.listAvailableSlotsForDate = async () => [
      {
        starts_at: localToUtcInTimezone(2026, 7, 14, 10, 0, TZ).toISOString(),
        ends_at: localToUtcInTimezone(2026, 7, 14, 10, 30, TZ).toISOString(),
      },
    ];

    const result = await buildAppointmentAvailabilityContext(
      'co1',
      IDRIS_HISTORY,
      'yarın saat 3 müsaitmi',
      ctxAtRef(),
      'tr'
    );

    assert.match(result.systemNote!, /DOLU/);
    assert.match(result.systemNote!, /müsait saatler/i);
  });

  it('gün müsaitlik sorusunda slot listesi döner', async () => {
    appointmentAvailabilityDeps.listAvailableSlotsForDate = async () => [
      {
        starts_at: localToUtcInTimezone(2026, 7, 14, 10, 0, TZ).toISOString(),
        ends_at: localToUtcInTimezone(2026, 7, 14, 10, 30, TZ).toISOString(),
      },
      {
        starts_at: localToUtcInTimezone(2026, 7, 14, 11, 0, TZ).toISOString(),
        ends_at: localToUtcInTimezone(2026, 7, 14, 11, 30, TZ).toISOString(),
      },
    ];

    const result = await buildAppointmentAvailabilityContext(
      'co1',
      IDRIS_HISTORY,
      'yarın hangi saatler müsait',
      ctxAtRef(),
      'tr'
    );

    assert.match(result.systemNote!, /VERİTABANI MÜSAİTLİK SONUCU/);
    assert.match(result.systemNote!, /1\)/);
    assert.match(result.systemNote!, /2\)/);
  });

  it('sistem notlarını birleştirir', () => {
    const merged = mergeAppointmentSystemNotes('not-a', null, 'not-b', '  ');
    assert.equal(merged, 'not-a\n\nnot-b');
  });
});

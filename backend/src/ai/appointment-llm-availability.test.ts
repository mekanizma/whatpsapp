import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
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

describe('appointment-llm-availability.service (state-based)', () => {
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

  it('tarih/saat yoksa DB sorgusu yapmaz', async () => {
    const result = await buildAppointmentAvailabilityContext('co1', ctxAtRef(), 'tr', {
      date: null,
      time: null,
    });
    assert.equal(result.systemNote, null);
    assert.equal(result.dbError, false);
  });

  it('state date+time ile belirli slot müsait notu döner', async () => {
    const result = await buildAppointmentAvailabilityContext('co1', ctxAtRef(), 'tr', {
      date: '2026-07-14',
      time: '15:00',
    });

    assert.ok(result.systemNote);
    assert.match(result.systemNote!, /MÜSAİT/);
    assert.match(result.systemNote!, /VERİTABANI MÜSAİTLİK SONUCU/);
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

    const result = await buildAppointmentAvailabilityContext('co1', ctxAtRef(), 'tr', {
      date: '2026-07-14',
      time: '15:00',
    });

    assert.match(result.systemNote!, /DOLU/);
    assert.match(result.systemNote!, /müsait saatler/i);
  });

  it('yalnızca tarih ile gün müsaitlik listesi döner', async () => {
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

    const result = await buildAppointmentAvailabilityContext('co1', ctxAtRef(), 'tr', {
      date: '2026-07-14',
      time: null,
    });

    assert.match(result.systemNote!, /VERİTABANI MÜSAİTLİK SONUCU/);
    assert.match(result.systemNote!, /1\)/);
    assert.match(result.systemNote!, /2\)/);
  });

  it('sistem notlarını birleştirir', () => {
    const merged = mergeAppointmentSystemNotes('not-a', null, 'not-b', '  ');
    assert.equal(merged, 'not-a\n\nnot-b');
  });
});

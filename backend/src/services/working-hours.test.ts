import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKING_HOURS,
  parseWorkingHoursForRuntime,
  validateWorkingHoursForWrite,
  parseHm,
} from '../services/working-hours.service';
import { validateCompanyTimezoneForWrite } from '../services/company-timezone.service';
import {
  validateSlotWorkingHours,
  parseSlotFromText,
} from '../ai/appointment-slot.service';
import { buildAppointmentCompanyContext } from '../ai/appointment-company-context';
import { t } from '../ai/language.service';

describe('working-hours.service', () => {
  it('empty working_hours uses default schedule at runtime', () => {
    const schedule = parseWorkingHoursForRuntime({});
    assert.equal(schedule.mon?.open, DEFAULT_WORKING_HOURS.mon?.open);
    assert.equal(schedule.sun, null);
    assert.equal(schedule.sat?.close, '14:00');
  });

  it('rejects invalid HH:MM on write', () => {
    const result = validateWorkingHoursForWrite({
      mon: { open: '25:00', close: '18:00' },
    });
    assert.equal(result.ok, false);
  });

  it('rejects break outside open–close on write', () => {
    const result = validateWorkingHoursForWrite({
      mon: { open: '09:00', close: '18:00', breaks: [{ start: '08:00', end: '09:30' }] },
    });
    assert.equal(result.ok, false);
  });

  it('rejects unknown keys on write', () => {
    const result = validateWorkingHoursForWrite({
      mon: { open: '09:00', close: '18:00' },
      bogus: { open: '10:00', close: '11:00' },
    });
    assert.equal(result.ok, false);
  });

  it('rejects invalid timezone on write', () => {
    const result = validateCompanyTimezoneForWrite('Not/A/Timezone');
    assert.equal(result.ok, false);
  });
});

describe('tenant appointment hours', () => {
  const defaultCtx = buildAppointmentCompanyContext({}, null);

  it('default schedule accepts weekday slot for company with empty working_hours', () => {
    const slot = {
      starts_at: '2026-07-02T11:00:00.000Z',
      ends_at: '2026-07-02T11:30:00.000Z',
    };
    const result = validateSlotWorkingHours(slot, defaultCtx, 'tr');
    assert.equal(result.valid, true);
  });

  it('custom tenant open Sundays accepts Sunday slot', () => {
    const ctx = buildAppointmentCompanyContext(
      {
        sun: { open: '10:00', close: '16:00' },
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
      },
      'Europe/Istanbul'
    );
    const slot = parseSlotFromText('sunday at 11am', {
      ref: new Date('2026-07-04T08:00:00.000Z'),
      timezone: ctx.timezone,
    });
    assert.ok(slot);
    const hours = validateSlotWorkingHours(slot!, ctx, 'en');
    assert.equal(hours.valid, true);
  });

  it('custom closed day rejects with localized message', () => {
    const ctx = buildAppointmentCompanyContext(
      {
        sun: { open: '10:00', close: '16:00' },
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
      },
      'Europe/Istanbul'
    );
    const slot = parseSlotFromText('monday at 11am', {
      ref: new Date('2026-07-04T08:00:00.000Z'),
      timezone: ctx.timezone,
    });
    assert.ok(slot);
    const hours = validateSlotWorkingHours(slot!, ctx, 'en');
    assert.equal(hours.valid, false);
    assert.match(hours.reason || '', /Monday/i);
    assert.match(hours.reason || '', /not available/i);
  });

  it('tomorrow at 3pm in English parses in company timezone', () => {
    const ref = new Date('2026-06-30T10:00:00.000Z');
    const slot = parseSlotFromText('tomorrow at 3pm', {
      ref,
      timezone: 'Europe/Istanbul',
    });
    assert.ok(slot);
    const start = new Date(slot!.starts_at);
    const label = start.toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    assert.equal(label, '15:00');
  });

  it('default lunch break still blocks 12:30–13:30', () => {
    const slot = parseSlotFromText('yarın 12:45', {
      ref: new Date('2026-06-30T10:00:00.000Z'),
      timezone: 'Europe/Istanbul',
    });
    assert.ok(slot);
    const hours = validateSlotWorkingHours(slot!, defaultCtx, 'tr');
    assert.equal(hours.valid, false);
    assert.match(hours.reason || '', /12:30/);
    assert.match(hours.reason || '', /13:30/);
  });

  it('parseHm handles HH:MM', () => {
    assert.equal(parseHm('09:30'), 9 * 60 + 30);
  });

  it('localized closed-day template uses t()', () => {
    const msg = t('en', 'appointment_day_closed', { day: 'Monday' });
    assert.match(msg, /Monday/);
  });
});

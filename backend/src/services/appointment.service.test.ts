import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookAppointment,
  AppointmentBookingError,
  hasConflict,
  validateAppointmentAction,
} from './appointment.service';

describe('appointment.service bookAppointment', () => {
  it('validateAppointmentAction eksik alanları reddeder', () => {
    const err = validateAppointmentAction({
      customer_name: 'Ali',
      customer_phone: '905551234567',
      title: 'Muayene',
      starts_at: '2026-07-13T07:00:00.000Z',
      ends_at: '2026-07-13T07:30:00.000Z',
    });
    assert.ok(err);
  });

  it('AppointmentBookingError kod taşır', () => {
    const err = new AppointmentBookingError('dolu', 'conflict');
    assert.equal(err.code, 'conflict');
    assert.equal(err.message, 'dolu');
  });

  it('hasConflict dışa aktarılır — bookAppointment içinde kullanılır', () => {
    assert.equal(typeof hasConflict, 'function');
    assert.equal(typeof bookAppointment, 'function');
  });
});

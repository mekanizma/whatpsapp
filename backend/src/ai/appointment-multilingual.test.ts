import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasAvailabilityQuery, hasDateTimeIntent, weekdayInText } from './appointment-datetime-tokens';
import {
  STRONG_CONFIRM_PATTERN,
  CONFIRM_WORDS_PATTERN,
} from './appointment-confirm-tokens';
import { isAppointmentConfirmation } from './appointment-extract.service';

describe('appointment multilingual tokens', () => {
  it('İngilizce müsaitlik sorusunu algılar', () => {
    assert.equal(hasAvailabilityQuery('any free slots on July 14?'), true);
    assert.equal(hasAvailabilityQuery('what times are available on Tuesday?'), true);
  });

  it('Almanca müsaitlik sorusunu algılar', () => {
    assert.equal(hasAvailabilityQuery('freie Termine am 14. Juli'), true);
    assert.equal(hasAvailabilityQuery('welche Zeiten sind verfügbar'), true);
  });

  it('Fransızca müsaitlik sorusunu algılar', () => {
    assert.equal(hasAvailabilityQuery('créneaux disponibles mardi'), true);
  });

  it('çok dilli onay kelimelerini kabul eder', () => {
    assert.equal(STRONG_CONFIRM_PATTERN.test('ja'), true);
    assert.equal(STRONG_CONFIRM_PATTERN.test('oui'), true);
    assert.equal(STRONG_CONFIRM_PATTERN.test('sí'), true);
    assert.equal(CONFIRM_WORDS_PATTERN.test('да'), true);
    assert.equal(isAppointmentConfirmation('ja', [{ sender_type: 'ai', message: 'Do you confirm?' }]), true);
  });

  it('Almanca ve Fransızca tarih niyetini algılar', () => {
    assert.equal(hasDateTimeIntent('morgen um 10'), true);
    assert.equal(hasDateTimeIntent('demain à 14h'), true);
    assert.equal(weekdayInText('Dienstag available times'), 2);
    assert.equal(weekdayInText('mardi créneaux disponibles'), 2);
  });

  it('Türkçe göreli tarih ve ASCII gün adlarını algılar', () => {
    assert.equal(hasDateTimeIntent('yarın saat 10'), true);
    assert.equal(hasDateTimeIntent('oburgun musait'), true);
    assert.equal(hasDateTimeIntent('haftaya randevu'), true);
    assert.equal(hasDateTimeIntent('1 ay sonra'), true);
    assert.equal(hasDateTimeIntent('2 hafta sonra'), true);
    assert.equal(hasAvailabilityQuery('pazartesi musait mi'), true);
    assert.equal(hasAvailabilityQuery('sali hangi saatler bos'), true);
    assert.equal(weekdayInText('persembe uygun mu'), 4);
    assert.equal(weekdayInText('carsamba'), 3);
  });
});

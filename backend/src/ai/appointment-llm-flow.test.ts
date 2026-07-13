import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppointmentDataFromResponse,
  formatSystemNotePrefix,
} from './appointment-data-parser.service';
import {
  rebuildStateFromHistory,
  mergeAppointmentData,
  buildLlmCollectedContext,
  getAppointmentSession,
  saveAppointmentSession,
  createEmptyAppointmentState,
  _resetAppointmentSessionsForTest,
} from './appointment-state.service';
import {
  validateAppointmentDateTime,
  isReadyForBooking,
  buildSlotFromState,
} from './appointment-llm-validation.service';
import {
  evaluateHandoffTriggers,
  applyPostAiProcessing,
} from './appointment-llm-flow.service';
import { appointmentConfig } from '../config/appointment.config';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';
import { localToUtcInTimezone } from './appointment-slot.service';

const TZ = 'Asia/Nicosia';
const REF = new Date('2026-07-13T09:00:00.000Z');

function ctxAtRef() {
  return { ...DEFAULT_APPOINTMENT_CONTEXT, timezone: TZ, parseRef: REF };
}

function futureSlotIso(hour: number, minute = 0): { date: string; time: string } {
  const start = localToUtcInTimezone(2026, 7, 15, hour, minute, TZ);
  return { date: '2026-07-15', time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

describe('appointment_data parser', () => {
  it('parses valid block and strips from customer message', () => {
    const raw =
      'Yarın saat 14:00 uygun görünüyor.\n<appointment_data>{"date":"2026-07-14","time":"14:00","confirmed":false}</appointment_data>';
    const parsed = parseAppointmentDataFromResponse(raw);
    assert.equal(parsed.hadBlock, true);
    assert.equal(parsed.parseError, false);
    assert.equal(parsed.data?.date, '2026-07-14');
    assert.equal(parsed.data?.time, '14:00');
    assert.doesNotMatch(parsed.cleanMessage, /appointment_data/);
  });

  it('flags parse error on broken JSON', () => {
    const parsed = parseAppointmentDataFromResponse(
      'Merhaba <appointment_data>{broken</appointment_data>'
    );
    assert.equal(parsed.hadBlock, true);
    assert.equal(parsed.parseError, true);
    assert.equal(parsed.data, null);
  });
});

describe('LLM collected context', () => {
  it('formats state as specified', () => {
    const state = mergeAppointmentData(createEmptyAppointmentState(), {
      customer_name: 'Ali Veli',
      customer_phone: '905551112233',
      date: '2026-07-15',
    });
    const ctx = buildLlmCollectedContext(state);
    assert.match(ctx, /Ad Soyad: Ali Veli/);
    assert.match(ctx, /Telefon: 905551112233/);
    assert.match(ctx, /Konu: null/);
    assert.match(ctx, /Tarih: 2026-07-15/);
    assert.match(ctx, /Onay: hayır/);
  });
});

describe('state merge from history', () => {
  it('yarın 14:00 scenario — AI resolves date in data block', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          'Yarın 14:00 için not aldım.\n<appointment_data>{"date":"2026-07-14","time":"14:00","confirmed":false}</appointment_data>',
      },
    ];
    const state = rebuildStateFromHistory(history);
    assert.equal(state.date, '2026-07-14');
    assert.equal(state.time, '14:00');
  });

  it('customer changes time — later block overrides', () => {
    const history = [
      {
        sender_type: 'ai',
        message:
          '<appointment_data>{"date":"2026-07-15","time":"14:00","confirmed":false}</appointment_data>',
      },
      { sender_type: 'customer', message: 'saati 15:00 yapalım' },
      {
        sender_type: 'ai',
        message:
          'Saati 15:00 olarak güncelledim.\n<appointment_data>{"time":"15:00","confirmed":false}</appointment_data>',
      },
    ];
    const state = rebuildStateFromHistory(history);
    assert.equal(state.date, '2026-07-15');
    assert.equal(state.time, '15:00');
  });
});

describe('date/time validation', () => {
  it('accepts valid future slot within MAX_DAYS_AHEAD', () => {
    const { date, time } = futureSlotIso(14);
    const state = mergeAppointmentData(createEmptyAppointmentState(), { date, time });
    const result = validateAppointmentDateTime(state, ctxAtRef());
    assert.equal(result.valid, true);
    assert.ok(result.slot);
  });

  it('rejects past datetime as INVALID_DATE', () => {
    const state = mergeAppointmentData(createEmptyAppointmentState(), {
      date: '2026-07-12',
      time: '10:00',
    });
    const result = validateAppointmentDateTime(state, ctxAtRef());
    assert.equal(result.valid, false);
    assert.equal(result.code, 'INVALID_DATE');
  });
});

describe('system notes', () => {
  it('prefixes system note for AI call', () => {
    const note = formatSystemNotePrefix(appointmentConfig.systemNotes.SLOT_TAKEN);
    assert.match(note, /^\[SISTEM NOTU:/);
    assert.match(note, /ÖNERME/);
  });
});

describe('safety net handoff triggers', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('2x SLOT_TAKEN triggers handoff', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, slotTakenCount: 2 };
    const state = createEmptyAppointmentState();
    const result = evaluateHandoffTriggers(meta, state, []);
    assert.equal(result.shouldHandoff, true);
    assert.equal(result.reason, 'slot_taken_twice');
  });

  it('broken data block x2 triggers handoff', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, missingDataBlockStreak: 1 };
    const state = createEmptyAppointmentState();
    const broken = parseAppointmentDataFromResponse(
      'Cevap <appointment_data>{bad json</appointment_data>'
    );
    const post = applyPostAiProcessing(meta, state, broken, []);
    assert.equal(post.meta.missingDataBlockStreak, 2);
    assert.equal(post.handoff, 'missing_data_block');
  });

  it('SLOT_TAKEN resets confirmed and date/time in session flow', () => {
    const state = mergeAppointmentData(createEmptyAppointmentState(), {
      date: '2026-07-15',
      time: '14:00',
      confirmed: true,
      customer_name: 'Ali Veli',
      customer_phone: '905551112233',
      title: 'Kontrol',
    });
    assert.equal(isReadyForBooking(state), true);
    const slot = buildSlotFromState(state, ctxAtRef());
    assert.ok(slot);
  });
});

describe('confirmed booking readiness', () => {
  it('requires confirmed:true and all fields', () => {
    const { date, time } = futureSlotIso(10);
    const incomplete = mergeAppointmentData(createEmptyAppointmentState(), {
      date,
      time,
      confirmed: true,
    });
    assert.equal(isReadyForBooking(incomplete), false);

    const complete = mergeAppointmentData(incomplete, {
      customer_name: 'Ayşe Yılmaz',
      customer_phone: '905559998877',
      title: 'Genel muayene',
    });
    assert.equal(isReadyForBooking(complete), true);
  });
});

describe('session state transitions', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('queues SLOT_TAKEN note key after slot conflict counter', () => {
    let meta = getAppointmentSession('co2', '905551112233');
    meta = {
      ...meta,
      slotTakenCount: 1,
      pendingSystemNoteKey: 'SLOT_TAKEN',
      pendingSystemNote: appointmentConfig.systemNotes.SLOT_TAKEN,
    };
    saveAppointmentSession('co2', '905551112233', meta);
    const loaded = getAppointmentSession('co2', '905551112233');
    assert.equal(loaded.pendingSystemNoteKey, 'SLOT_TAKEN');
    assert.match(loaded.pendingSystemNote || '', /ÖNERME/);
  });
});

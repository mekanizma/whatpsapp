import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppointmentResponse,
  formatSystemNotePrefix,
  maskPhoneForLog,
  stateFromAppointmentResponse,
} from './appointment-response-parser.service';
import {
  buildLlmCollectedContext,
  getAppointmentSession,
  saveAppointmentSession,
  createEmptyAppointmentState,
  _resetAppointmentSessionsForTest,
  markSessionHandedOff,
  isAppointmentSessionRestartMessage,
  resetAppointmentSessionForRetry,
  resolveAppointmentState,
} from './appointment-state.service';
import {
  validateAppointmentDateTime,
  isReadyForBooking,
  buildSlotFromState,
} from './appointment-llm-validation.service';
import {
  evaluateHandoffTriggers,
  applyPostAiProcessing,
  allowAppointmentTransfer,
} from './appointment-llm-flow.service';
import { appointmentConfig } from '../config/appointment.config';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';

const TZ = 'Asia/Nicosia';
const REF = new Date('2026-07-13T09:00:00.000Z');

function ctxAtRef() {
  return { ...DEFAULT_APPOINTMENT_CONTEXT, timezone: TZ, parseRef: REF };
}

function futureSlotIso(hour: number, minute = 0): { date: string; time: string } {
  return {
    date: '2026-07-15',
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function withFields(
  partial: Partial<ReturnType<typeof createEmptyAppointmentState>>
): ReturnType<typeof createEmptyAppointmentState> {
  return { ...createEmptyAppointmentState(), ...partial };
}

function samplePayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    reply: 'Merhaba, size nasıl yardımcı olabilirim?',
    appointment: {
      name: 'gurcem semercioglu',
      phone: '905338507761',
      topic: 'demo talebi',
      date: '2026-07-15',
      time: '10:00',
    },
    action: 'collect',
    ...overrides,
  });
}

describe('appointment structured response parser', () => {
  it('parses valid JSON payload', () => {
    const parsed = parseAppointmentResponse(samplePayload());
    assert.equal(parsed.parseError, false);
    assert.equal(parsed.payload?.appointment.name, 'gurcem semercioglu');
    assert.equal(parsed.payload?.action, 'collect');
  });

  it('maps appointment fields to state', () => {
    const parsed = parseAppointmentResponse(samplePayload());
    const state = stateFromAppointmentResponse(parsed.payload!.appointment);
    assert.equal(state.customer_name, 'gurcem semercioglu');
    assert.equal(state.title, 'demo talebi');
  });
});

describe('session state', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('resolveAppointmentState uses session snapshot', () => {
    const session = withFields({ customer_name: 'Ada Lovelace' });
    const resolved = resolveAppointmentState(session);
    assert.equal(resolved.customer_name, 'Ada Lovelace');
    assert.equal(resolveAppointmentState(null).customer_name, null);
  });

  it('buildLlmCollectedContext is JSON snapshot', () => {
    const state = withFields({
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
      title: 'demo',
      date: '2026-07-15',
      time: '10:00',
    });
    const ctx = JSON.parse(buildLlmCollectedContext(state));
    assert.deepEqual(ctx, {
      name: 'gurcem semercioglu',
      phone: '905338507761',
      topic: 'demo',
      date: '2026-07-15',
      time: '10:00',
    });
  });

  it('oturum state DB mesajı olmadan korunur', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    const state = withFields({
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
    });
    saveAppointmentSession('co1', '905551112233', meta, state);
    meta = getAppointmentSession('co1', '905551112233');
    assert.equal(meta.llmState?.customer_name, 'gurcem semercioglu');
  });
});

describe('handoff triggers', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('json_parse_failed option triggers handoff', () => {
    const meta = getAppointmentSession('co1', '905551112233');
    const result = evaluateHandoffTriggers(meta, createEmptyAppointmentState(), [], {
      jsonParseFailed: true,
    });
    assert.equal(result.shouldHandoff, true);
    assert.equal(result.reason, 'json_parse_failed');
  });

  it('2x SLOT_TAKEN triggers handoff', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, slotTakenCount: 2 };
    const result = evaluateHandoffTriggers(meta, createEmptyAppointmentState(), []);
    assert.equal(result.reason, 'slot_taken_twice');
  });

  it('applyPostAiProcessing merges LLM appointment fields', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    const parsed = parseAppointmentResponse(samplePayload({ action: 'collect' }));
    const post = applyPostAiProcessing(meta, createEmptyAppointmentState(), parsed);
    assert.equal(post.handoff, null);
    assert.equal(post.state.customer_name, 'gurcem semercioglu');
    assert.equal(post.state.date, '2026-07-15');
  });

  it('applyPostAiProcessing handoff action marks session', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    const parsed = parseAppointmentResponse(samplePayload({ action: 'handoff' }));
    const post = applyPostAiProcessing(meta, createEmptyAppointmentState(), parsed);
    assert.equal(post.handoff, 'validation_failures');
    assert.equal(post.meta.status, 'handed_off');
  });

  it('handoff sonrası randevu yeniden başlatma mesajını algılar', () => {
    assert.equal(isAppointmentSessionRestartMessage('randevu almak istiyorum'), true);
    assert.equal(isAppointmentSessionRestartMessage('merhaba'), false);
  });

  it('handoff sonrası oturum sıfırlanır', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = markSessionHandedOff(meta, 'json_parse_failed');
    saveAppointmentSession('co1', '905551112233', meta, createEmptyAppointmentState());
    meta = resetAppointmentSessionForRetry('co1', '905551112233');
    assert.equal(meta.status, 'collecting');
    assert.equal(meta.lastHandoffReason, null);
  });
});

describe('date/time validation', () => {
  it('accepts valid future slot within MAX_DAYS_AHEAD', () => {
    const { date, time } = futureSlotIso(14);
    const state = withFields({ date, time });
    const result = validateAppointmentDateTime(state, ctxAtRef());
    assert.equal(result.valid, true);
  });
});

describe('booking readiness', () => {
  it('requires complete fields without confirmed flag', () => {
    const { date, time } = futureSlotIso(10);
    const complete = withFields({
      date,
      time,
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
      title: 'demo talebi',
    });
    assert.equal(isReadyForBooking(complete), true);
    assert.ok(buildSlotFromState(complete, ctxAtRef()));
  });
});

describe('system notes and logging helpers', () => {
  it('prefixes system note for AI call', () => {
    const note = formatSystemNotePrefix(appointmentConfig.systemNotes.SLOT_TAKEN);
    assert.match(note, /^\[SISTEM NOTU:/);
  });

  it('masks phone for logs', () => {
    assert.equal(maskPhoneForLog('905338507761'), '***7761');
    assert.equal(maskPhoneForLog(null), 'null');
  });

  it('kod handoff tetiklemediyse AI transfer markerını kabul etmez', () => {
    assert.equal(allowAppointmentTransfer(true, null), false);
    assert.equal(allowAppointmentTransfer(true, 'db_error'), true);
  });
});

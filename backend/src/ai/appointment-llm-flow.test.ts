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
  allowAppointmentTransfer,
} from './appointment-llm-flow.service';
import {
  resolveAppointmentState,
  detectNameCorrection,
  hydrateStateFromCustomerMessages,
  shouldExpectAppointmentDataBlock,
  isAppointmentTopicReply,
} from './appointment-customer-hydrate.service';
import { appointmentConfig } from '../config/appointment.config';
import { DEFAULT_APPOINTMENT_CONTEXT } from './appointment-company-context';
import { localToUtcInTimezone } from './appointment-slot.service';

const TZ = 'Asia/Nicosia';
const REF = new Date('2026-07-13T09:00:00.000Z');

function ctxAtRef() {
  return { ...DEFAULT_APPOINTMENT_CONTEXT, timezone: TZ, parseRef: REF };
}

function futureSlotIso(hour: number, minute = 0): { date: string; time: string } {
  return { date: '2026-07-15', time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

const GURCEM_HISTORY = [
  { sender_type: 'ai', message: 'Ad ve soyadınızı yazar mısınız?' },
  { sender_type: 'customer', message: 'gurcem semercioglu' },
  { sender_type: 'ai', message: 'Telefon numaranızı yazar mısınız?' },
  { sender_type: 'customer', message: '0533 850 7761' },
  { sender_type: 'ai', message: 'Hangi konuda randevu almak istiyorsunuz?' },
];

describe('appointment_data parser', () => {
  it('parses valid block and strips from customer message', () => {
    const raw =
      'Yarın saat 14:00 uygun görünüyor.\n<appointment_data>{"date":"2026-07-14","time":"14:00","confirmed":false}</appointment_data>';
    const parsed = parseAppointmentDataFromResponse(raw);
    assert.equal(parsed.hadBlock, true);
    assert.equal(parsed.parseError, false);
    assert.equal(parsed.data?.date, '2026-07-14');
    assert.doesNotMatch(parsed.cleanMessage, /appointment_data/);
  });

  it('DB promptundaki name/phone/topic alanlarını destekler', () => {
    const parsed = parseAppointmentDataFromResponse(
      '<appointment_data>{"name":"İdris Yıldırım","phone":"05338398293","topic":"Demo sistemleri","date":null,"time":null,"confirmed":false}</appointment_data>'
    );
    assert.equal(parsed.data?.customer_name, 'İdris Yıldırım');
    assert.equal(parsed.data?.customer_phone, '05338398293');
    assert.equal(parsed.data?.title, 'Demo sistemleri');
  });
});

describe('gurcem senaryosu — müşteri hydrate', () => {
  it('müşteri adını AI düzeltmesi olmadan aynen alır', () => {
    const state = resolveAppointmentState(null, GURCEM_HISTORY, '0533 850 7761');
    assert.equal(state.customer_name, 'gurcem semercioglu');
    assert.equal(state.customer_phone, '905338507761');
  });

  it('ismim düzeltmesini algılar', () => {
    const corrected = detectNameCorrection('ismim gurcem semercioglu');
    assert.equal(corrected, 'gurcem semercioglu');
  });

  it('konu cevabını tam mesaj olarak alır', () => {
    const topic = 'sisteminizle ilgili demo talep ediyorum';
    const state = resolveAppointmentState(null, GURCEM_HISTORY, topic);
    assert.equal(state.title, topic);
    assert.equal(state.customer_name, 'gurcem semercioglu');
    assert.equal(isAppointmentTopicReply(GURCEM_HISTORY, topic), true);
  });

  it('collectedContext ad düzeltme uyarısı içerir', () => {
    const state = hydrateStateFromCustomerMessages(createEmptyAppointmentState(), GURCEM_HISTORY, 'x');
    state.customer_name = 'gurcem semercioglu';
    const ctx = buildLlmCollectedContext(state);
    assert.match(ctx, /gurcem semercioglu/);
    assert.match(ctx, /AYNEN/);
  });
});

describe('state merge from history', () => {
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

describe('session state persistence', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('oturum state DB mesajı olmadan korunur', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    const state = mergeAppointmentData(createEmptyAppointmentState(), {
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
    });
    saveAppointmentSession('co1', '905551112233', meta, state);
    meta = getAppointmentSession('co1', '905551112233');
    assert.equal(meta.llmState?.customer_name, 'gurcem semercioglu');
  });
});

describe('safety net handoff triggers', () => {
  beforeEach(() => {
    _resetAppointmentSessionsForTest();
  });

  it('bilgi toplama aşamasında eksik blok handoff tetiklemez', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, missingDataBlockStreak: 5 };
    const state = createEmptyAppointmentState();
    const parsed = parseAppointmentDataFromResponse('Adınızı yazar mısınız?');
    const post = applyPostAiProcessing(meta, state, parsed, [], 'merhaba');
    assert.equal(post.handoff, null);
    assert.equal(post.meta.missingDataBlockStreak, 0);
  });

  it('temel alanlar doluyken 2x bozuk blok handoff tetikler', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, missingDataBlockStreak: 1 };
    const state = mergeAppointmentData(createEmptyAppointmentState(), {
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
      title: 'demo talebi',
    });
    assert.equal(shouldExpectAppointmentDataBlock(state), true);
    const broken = parseAppointmentDataFromResponse(
      'Özet <appointment_data>{bad</appointment_data>'
    );
    const post = applyPostAiProcessing(meta, state, broken, GURCEM_HISTORY, 'demo');
    assert.equal(post.handoff, 'missing_data_block');
  });

  it('2x SLOT_TAKEN triggers handoff', () => {
    let meta = getAppointmentSession('co1', '905551112233');
    meta = { ...meta, slotTakenCount: 2 };
    const result = evaluateHandoffTriggers(meta, createEmptyAppointmentState(), []);
    assert.equal(result.reason, 'slot_taken_twice');
  });
});

describe('date/time validation', () => {
  it('accepts valid future slot within MAX_DAYS_AHEAD', () => {
    const { date, time } = futureSlotIso(14);
    const state = mergeAppointmentData(createEmptyAppointmentState(), { date, time });
    const result = validateAppointmentDateTime(state, ctxAtRef());
    assert.equal(result.valid, true);
  });
});

describe('confirmed booking readiness', () => {
  it('requires confirmed:true and all fields', () => {
    const { date, time } = futureSlotIso(10);
    const complete = mergeAppointmentData(createEmptyAppointmentState(), {
      date,
      time,
      confirmed: true,
      customer_name: 'gurcem semercioglu',
      customer_phone: '905338507761',
      title: 'demo talebi',
    });
    assert.equal(isReadyForBooking(complete), true);
    assert.ok(buildSlotFromState(complete, ctxAtRef()));
  });
});

describe('system notes', () => {
  it('prefixes system note for AI call', () => {
    const note = formatSystemNotePrefix(appointmentConfig.systemNotes.SLOT_TAKEN);
    assert.match(note, /^\[SISTEM NOTU:/);
  });

  it('kod handoff tetiklemediyse AI transfer markerını kabul etmez', () => {
    assert.equal(allowAppointmentTransfer(true, null), false);
    assert.equal(allowAppointmentTransfer(true, 'db_error'), true);
  });
});

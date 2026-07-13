/**
 * Hibrit randevu akışı — AI konuşur, kod doğrular ve kaydeder
 */

import type OpenAI from 'openai';
import { config } from '../config';
import { appointmentConfig, type AppointmentSystemNoteKey } from '../config/appointment.config';
import { Company, KnowledgeItem, Appointment } from '../types';
import { createChatCompletion } from './openai-client';
import {
  buildStaticSystemPrompt,
  buildDynamicUserMessage,
  buildLanguageBlockForTurn,
  buildAppointmentRolePrompt,
} from './admin-prompt-builder';
import { detectConversationLanguage, ConversationLang } from './language.service';
import { stripTransferMarker } from './transfer.service';
import { retrieveKnowledgeContext } from '../services/knowledge-retrieval.service';
import { buildKnowledgeNoMatchHint } from './kb-answer.service';
import { prepareConversationHistoryForChat } from './conversation-history.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import {
  parseAppointmentDataFromResponse,
  formatSystemNotePrefix,
} from './appointment-data-parser.service';
import {
  buildLlmCollectedContext,
  getAppointmentSession,
  saveAppointmentSession,
  countAppointmentAiTurns,
  applySlotTakenReset,
  markSessionHandedOff,
  incrementValidationFailure,
  mergeAppointmentData,
  type AppointmentLlmState,
  type AppointmentSessionMeta,
} from './appointment-state.service';
import {
  validateAppointmentDateTime,
  isReadyForBooking,
} from './appointment-llm-validation.service';
import {
  bookAppointment,
  AppointmentBookingError,
  logAppointmentEvent,
} from '../services/appointment.service';
import { buildScheduleSummary } from '../services/working-hours.service';
import { buildDateTimePlaceholders } from './appointment-datetime-context';
import type { HistoryMsg } from './appointment-collect.service';
import {
  resolveAppointmentState,
  mergeAiDataPreferCustomer,
  extractCustomerFields,
  shouldExpectAppointmentDataBlock,
  hasNameCorrectionInMessage,
} from './appointment-customer-hydrate.service';

export interface AppointmentLlmFlowInput {
  companyId: string;
  customerPhone: string;
  customerMessage: string;
  history: HistoryMsg[];
  company: Company;
  allKnowledge: KnowledgeItem[];
  appointmentCtx: AppointmentCompanyContext;
}

export interface AppointmentLlmFlowResult {
  message: string;
  shouldTransfer: boolean;
  tokensUsed: number;
  appointmentBooked: boolean;
  appointment: Appointment | null;
  skipReason: string;
}

export const appointmentLlmFlowDeps = {
  createChatCompletion,
  retrieveKnowledgeContext,
};

function logFlow(action: string, details: Record<string, unknown>): void {
  console.log(
    `[Randevu:llm:${action}]`,
    JSON.stringify({ mode: appointmentConfig.mode, ...details, ts: new Date().toISOString() })
  );
}

function buildAppointmentContextSection(
  appointmentCtx: AppointmentCompanyContext,
  lang: ConversationLang
): string {
  const schedule = buildScheduleSummary(appointmentCtx.schedule, lang);
  const placeholders = buildDateTimePlaceholders(
    appointmentCtx.timezone,
    lang,
    appointmentCtx.parseRef || new Date()
  );
  return [
    `Saat dilimi: ${appointmentCtx.timezone}`,
    `Bugün: ${placeholders.currentDate} (${placeholders.currentDayName}), saat ${placeholders.currentTime}`,
    `Çalışma saatleri: ${schedule}`,
    `En fazla ${appointmentConfig.maxDaysAhead} gün ileri tarih kabul edilir.`,
  ].join('\n');
}

function queueSystemNote(
  meta: AppointmentSessionMeta,
  key: AppointmentSystemNoteKey
): AppointmentSessionMeta {
  return {
    ...meta,
    pendingSystemNoteKey: key,
    pendingSystemNote: appointmentConfig.systemNotes[key],
  };
}

export type HandoffTrigger =
  | 'validation_failures'
  | 'slot_taken_twice'
  | 'missing_data_block'
  | 'max_turns'
  | 'db_error';

export function evaluateHandoffTriggers(
  meta: AppointmentSessionMeta,
  state: AppointmentLlmState,
  history: HistoryMsg[],
  options?: {
    missingDataBlock?: boolean;
    dbError?: boolean;
  }
): { shouldHandoff: boolean; reason: HandoffTrigger | null } {
  if (meta.status === 'handed_off') {
    return { shouldHandoff: true, reason: 'validation_failures' };
  }

  if (options?.dbError) {
    return { shouldHandoff: true, reason: 'db_error' };
  }

  const invalidCount = meta.validationFailures.INVALID_DATE || 0;
  if (invalidCount >= appointmentConfig.maxValidationFailures) {
    return { shouldHandoff: true, reason: 'validation_failures' };
  }

  if (meta.slotTakenCount >= appointmentConfig.maxSlotTaken) {
    return { shouldHandoff: true, reason: 'slot_taken_twice' };
  }

  if (
    options?.missingDataBlock &&
    shouldExpectAppointmentDataBlock(state) &&
    meta.missingDataBlockStreak >= appointmentConfig.maxMissingDataBlocks
  ) {
    return { shouldHandoff: true, reason: 'missing_data_block' };
  }

  const turns = countAppointmentAiTurns(history) + 1;
  if (turns > appointmentConfig.maxTurns && !state.confirmed && meta.status !== 'saved') {
    return { shouldHandoff: true, reason: 'max_turns' };
  }

  return { shouldHandoff: false, reason: null };
}

async function tryBookAppointment(
  companyId: string,
  customerPhone: string,
  state: AppointmentLlmState,
  appointmentCtx: AppointmentCompanyContext,
  lang: ConversationLang
): Promise<
  | { ok: true; appointment: Appointment }
  | { ok: false; code: 'INVALID_DATE' | 'SLOT_TAKEN' | 'DB_ERROR'; state: AppointmentLlmState }
> {
  const validation = validateAppointmentDateTime(state, appointmentCtx, lang);
  if (!validation.valid || !validation.slot) {
    return { ok: false, code: 'INVALID_DATE', state };
  }

  if (!isReadyForBooking(state)) {
    return { ok: false, code: 'INVALID_DATE', state };
  }

  try {
    const appointment = await bookAppointment(
      companyId,
      {
        customer_phone: state.customer_phone || customerPhone,
        customer_name: state.customer_name,
        title: state.title || 'Randevu',
        preferred_doctor: state.preferred_doctor,
        starts_at: validation.slot.starts_at,
        ends_at: validation.slot.ends_at,
        status: 'pending',
        source: 'ai',
      },
      lang
    );
    return { ok: true, appointment };
  } catch (err) {
    if (err instanceof AppointmentBookingError) {
      if (err.code === 'conflict') {
        return { ok: false, code: 'SLOT_TAKEN', state: applySlotTakenReset(state) };
      }
      if (err.code === 'validation' || err.code === 'working_hours') {
        return { ok: false, code: 'INVALID_DATE', state };
      }
    }
    return { ok: false, code: 'DB_ERROR', state };
  }
}

export function applyPostAiProcessing(
  meta: AppointmentSessionMeta,
  state: AppointmentLlmState,
  parsed: ReturnType<typeof parseAppointmentDataFromResponse>,
  history: HistoryMsg[],
  latestMessage: string
): { meta: AppointmentSessionMeta; state: AppointmentLlmState; handoff: HandoffTrigger | null } {
  let nextMeta = { ...meta };
  let nextState = { ...state };
  const customer = extractCustomerFields(history, latestMessage);
  const expectBlock = shouldExpectAppointmentDataBlock(nextState);

  if (parsed.hadBlock && parsed.parseError) {
    if (expectBlock) {
      nextMeta = { ...nextMeta, missingDataBlockStreak: nextMeta.missingDataBlockStreak + 1 };
      logFlow('missing_data_block', { streak: nextMeta.missingDataBlockStreak });
    }
  } else if (parsed.hadBlock && parsed.data) {
    nextMeta = { ...nextMeta, missingDataBlockStreak: 0 };
    nextState = mergeAiDataPreferCustomer(nextState, parsed.data, customer, history, latestMessage);
    logFlow('state_merge', { state: nextState });
  } else if (!parsed.hadBlock && expectBlock) {
    nextMeta = { ...nextMeta, missingDataBlockStreak: nextMeta.missingDataBlockStreak + 1 };
    logFlow('missing_data_block', { streak: nextMeta.missingDataBlockStreak, expectBlock: true });
  } else if (!parsed.hadBlock) {
    // Bilgi toplama aşamasında blok beklenmez — streak artırma
    nextMeta = { ...nextMeta, missingDataBlockStreak: 0 };
  }

  const handoffCheck = evaluateHandoffTriggers(nextMeta, nextState, history, {
    missingDataBlock:
      expectBlock && (!parsed.hadBlock || parsed.parseError),
  });

  if (handoffCheck.shouldHandoff && handoffCheck.reason) {
    nextMeta = markSessionHandedOff(nextMeta, handoffCheck.reason);
    nextMeta = queueSystemNote(nextMeta, 'HANDOFF');
    logFlow('handoff_triggered', {
      reason: handoffCheck.reason,
      state: nextState,
      collected: buildLlmCollectedContext(nextState),
    });
    return { meta: nextMeta, state: nextState, handoff: handoffCheck.reason };
  }

  return { meta: nextMeta, state: nextState, handoff: null };
}

async function callAppointmentLlm(
  input: AppointmentLlmFlowInput,
  systemNote: string | null,
  lang: ConversationLang,
  knowledge: string,
  allKnowledge: KnowledgeItem[],
  state: AppointmentLlmState,
  appointmentCtx: AppointmentCompanyContext
): Promise<{ raw: string; tokensUsed: number }> {
  const chatHistory = prepareConversationHistoryForChat(input.history, input.customerMessage);
  const languageBlock = await buildLanguageBlockForTurn(lang);
  const collectedContext = buildLlmCollectedContext(state);
  const appointmentContext = buildAppointmentContextSection(appointmentCtx, lang);

  const [staticSystemPrompt, appointmentRolePrompt] = await Promise.all([
    buildStaticSystemPrompt(input.companyId, input.company),
    buildAppointmentRolePrompt(input.company, {
      collectedContext,
      appointmentContext,
      knowledge,
      knowledgeTitles: allKnowledge.map((k) => k.title),
      lang,
      languageBlock,
      appointmentCtx,
    }),
  ]);

  const systemContent = [staticSystemPrompt, appointmentRolePrompt].filter(Boolean).join('\n\n');

  let customerContent = input.customerMessage.trim().slice(0, 1000);
  if (systemNote) {
    customerContent = `${formatSystemNotePrefix(systemNote)}\n\n${customerContent}`;
    logFlow('system_note_sent', { note: systemNote.slice(0, 120) });
  }

  const dynamicUserContent = buildDynamicUserMessage(customerContent, {
    knowledge,
    knowledgeTitles: allKnowledge.map((k) => k.title),
    collectedContext,
    appointmentContext,
    lang,
    languageBlock,
  });

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemContent) {
    chatMessages.push({ role: 'system', content: systemContent });
  }

  chatMessages.push(
    ...chatHistory.map((m) => ({
      role: (m.sender_type === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.message,
    })),
    { role: 'user', content: dynamicUserContent }
  );

  const completion = await appointmentLlmFlowDeps.createChatCompletion(chatMessages, {
    maxTokens: config.ai.maxTokens,
    temperature: config.ai.temperature,
    usageLog: {
      companyId: input.companyId,
      customerPhone: input.customerPhone,
      skipped: false,
      cached: false,
    },
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '';
  const tokensUsed = completion.usage?.total_tokens || 0;
  return { raw, tokensUsed };
}

async function runHandoffAiTurn(
  input: AppointmentLlmFlowInput,
  lang: ConversationLang,
  knowledge: string,
  allKnowledge: KnowledgeItem[],
  state: AppointmentLlmState,
  appointmentCtx: AppointmentCompanyContext
): Promise<{ message: string; shouldTransfer: boolean; tokensUsed: number }> {
  const handoffCall = await callAppointmentLlm(
    input,
    appointmentConfig.systemNotes.HANDOFF,
    lang,
    knowledge,
    allKnowledge,
    state,
    appointmentCtx
  );
  const handoffParsed = parseAppointmentDataFromResponse(handoffCall.raw);
  const { message, shouldTransfer } = stripTransferMarker(handoffParsed.cleanMessage);
  return { message, shouldTransfer, tokensUsed: handoffCall.tokensUsed };
}

export async function runAppointmentLlmFlow(
  input: AppointmentLlmFlowInput
): Promise<AppointmentLlmFlowResult> {
  const lang = detectConversationLanguage(input.customerMessage, input.history);
  let meta = getAppointmentSession(input.companyId, input.customerPhone);
  let state = resolveAppointmentState(meta.llmState, input.history, input.customerMessage);

  if (hasNameCorrectionInMessage(input.customerMessage)) {
    meta = queueSystemNote(meta, 'NAME_CORRECTION');
    logFlow('name_correction', { message: input.customerMessage.slice(0, 80), state });
  }

  if (meta.status === 'handed_off') {
    meta = queueSystemNote(meta, 'HANDOFF');
  }

  meta = { ...meta, turnCount: meta.turnCount + 1 };
  logFlow('turn_start', { turn: meta.turnCount, state, pendingNote: meta.pendingSystemNoteKey });

  const retrieval = await appointmentLlmFlowDeps.retrieveKnowledgeContext(
    input.companyId,
    input.customerMessage,
    input.allKnowledge
  );
  let knowledge = retrieval.context;
  if (retrieval.kbHasNoMatch && input.allKnowledge.length > 0) {
    knowledge = buildKnowledgeNoMatchHint(input.allKnowledge, lang);
  }

  const noteForAi =
    meta.pendingSystemNote ||
    (meta.pendingSystemNoteKey ? appointmentConfig.systemNotes[meta.pendingSystemNoteKey] : null);
  meta = { ...meta, pendingSystemNote: null, pendingSystemNoteKey: null };

  if (meta.status !== 'saved' && isReadyForBooking(state)) {
    const preBook = await tryBookAppointment(
      input.companyId,
      input.customerPhone,
      state,
      input.appointmentCtx,
      lang
    );
    if (preBook.ok) {
      meta = queueSystemNote({ ...meta, status: 'saved' }, 'SAVED_OK');
      saveAppointmentSession(input.companyId, input.customerPhone, meta, state);
      logFlow('book_success_pre_ai', { appointmentId: preBook.appointment.id });
    } else if (preBook.code === 'INVALID_DATE') {
      meta = incrementValidationFailure(queueSystemNote(meta, 'INVALID_DATE'), 'INVALID_DATE');
      state = preBook.state;
    } else if (preBook.code === 'SLOT_TAKEN') {
      meta = queueSystemNote(
        { ...meta, slotTakenCount: meta.slotTakenCount + 1 },
        'SLOT_TAKEN'
      );
      state = preBook.state;
    } else if (preBook.code === 'DB_ERROR') {
      meta = queueSystemNote(markSessionHandedOff(meta, 'db_error'), 'HANDOFF');
    }
  }

  const preHandoff = evaluateHandoffTriggers(meta, state, input.history);
  if (preHandoff.shouldHandoff && preHandoff.reason) {
    meta = queueSystemNote(markSessionHandedOff(meta, preHandoff.reason), 'HANDOFF');
  }

  const effectiveNote =
    meta.pendingSystemNote ||
    (meta.pendingSystemNoteKey ? appointmentConfig.systemNotes[meta.pendingSystemNoteKey] : null);

  let totalTokens = 0;
  let { raw, tokensUsed } = await callAppointmentLlm(
    input,
    effectiveNote,
    lang,
    knowledge,
    input.allKnowledge,
    state,
    input.appointmentCtx
  );
  totalTokens += tokensUsed;

  const parsed = parseAppointmentDataFromResponse(raw);
  const post = applyPostAiProcessing(
    meta,
    state,
    parsed,
    input.history,
    input.customerMessage
  );
  meta = post.meta;
  state = post.state;

  let message: string;
  let shouldTransfer: boolean;

  if (post.handoff) {
    const handoff = await runHandoffAiTurn(
      input,
      lang,
      knowledge,
      input.allKnowledge,
      state,
      input.appointmentCtx
    );
    totalTokens += handoff.tokensUsed;
    message = handoff.message;
    shouldTransfer = handoff.shouldTransfer;
  } else {
    ({ message, shouldTransfer } = stripTransferMarker(parsed.cleanMessage));
  }

  if (meta.status !== 'saved' && isReadyForBooking(state)) {
    const validation = validateAppointmentDateTime(state, input.appointmentCtx, lang);
    if (!validation.valid) {
      meta = incrementValidationFailure(queueSystemNote(meta, 'INVALID_DATE'), 'INVALID_DATE');
      logFlow('validation_failed', { code: 'INVALID_DATE', state });
    } else {
      const bookResult = await tryBookAppointment(
        input.companyId,
        input.customerPhone,
        state,
        input.appointmentCtx,
        lang
      );
      if (bookResult.ok) {
        meta = queueSystemNote({ ...meta, status: 'saved' }, 'SAVED_OK');
        logAppointmentEvent('llm_book_success', {
          companyId: input.companyId,
          appointmentId: bookResult.appointment.id,
          phone: input.customerPhone,
        });
        saveAppointmentSession(input.companyId, input.customerPhone, meta, state);
        return {
          message,
          shouldTransfer,
          tokensUsed: totalTokens,
          appointmentBooked: true,
          appointment: bookResult.appointment,
          skipReason: 'appointment_llm',
        };
      }

      if (bookResult.code === 'SLOT_TAKEN') {
        meta = queueSystemNote(
          { ...meta, slotTakenCount: meta.slotTakenCount + 1 },
          'SLOT_TAKEN'
        );
        state = bookResult.state;
        logFlow('slot_taken', { count: meta.slotTakenCount });
      } else if (bookResult.code === 'INVALID_DATE') {
        meta = incrementValidationFailure(queueSystemNote(meta, 'INVALID_DATE'), 'INVALID_DATE');
        state = bookResult.state;
      } else if (bookResult.code === 'DB_ERROR') {
        meta = queueSystemNote(markSessionHandedOff(meta, 'db_error'), 'HANDOFF');
        const handoff = await runHandoffAiTurn(
          input,
          lang,
          knowledge,
          input.allKnowledge,
          state,
          input.appointmentCtx
        );
        totalTokens += handoff.tokensUsed;
        message = handoff.message;
        shouldTransfer = handoff.shouldTransfer;
      }
    }
  }

  const postHandoff = evaluateHandoffTriggers(meta, state, [
    ...input.history,
    { sender_type: 'ai', message: raw },
  ]);
  if (postHandoff.shouldHandoff && !shouldTransfer) {
    meta = markSessionHandedOff(meta, postHandoff.reason || 'max_turns');
    logFlow('handoff_triggered_post', { reason: postHandoff.reason, state });
    const handoff = await runHandoffAiTurn(
      input,
      lang,
      knowledge,
      input.allKnowledge,
      state,
      input.appointmentCtx
    );
    totalTokens += handoff.tokensUsed;
    message = handoff.message;
    shouldTransfer = handoff.shouldTransfer;
  }

  saveAppointmentSession(input.companyId, input.customerPhone, meta, state);
  logFlow('turn_end', {
    status: meta.status,
    state,
    shouldTransfer,
    pendingNext: meta.pendingSystemNoteKey,
  });

  return {
    message,
    shouldTransfer,
    tokensUsed: totalTokens,
    appointmentBooked: false,
    appointment: null,
    skipReason: 'appointment_llm',
  };
}

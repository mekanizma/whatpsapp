/**
 * Hibrit randevu akışı — yapılandırılmış LLM JSON + kod doğrulama/kayıt
 */

import type OpenAI from 'openai';
import { config } from '../config';
import { appointmentConfig, type AppointmentSystemNoteKey } from '../config/appointment.config';
import { Company, KnowledgeItem, Appointment } from '../types';
import { createChatCompletion } from './openai-client';
import {
  buildDynamicUserMessage,
  buildLanguageBlockForTurn,
  buildAppointmentRolePrompt,
} from './admin-prompt-builder';
import { detectConversationLanguage, ConversationLang } from './language.service';
import { stripTransferMarker } from './transfer.service';
import { retrieveKnowledgeContext } from '../services/knowledge-retrieval.service';
import { prepareConversationHistoryForChat } from './conversation-history.service';
import type { AppointmentCompanyContext } from './appointment-company-context';
import { appointmentResponseFormat } from './appointment-response-schema';
import {
  parseAppointmentResponse,
  stateFromAppointmentResponse,
  maskPhoneForLog,
  formatSystemNotePrefix,
  type ParsedAppointmentResponse,
} from './appointment-response-parser.service';
import {
  buildLlmCollectedContext,
  getAppointmentSession,
  saveAppointmentSession,
  countAppointmentAiTurns,
  applySlotTakenReset,
  markSessionHandedOff,
  incrementValidationFailure,
  resolveAppointmentState,
  isAppointmentSessionRestartMessage,
  resetAppointmentSessionForRetry,
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
  buildAppointmentConfirmationMessage,
  fetchCompanyCategory,
} from '../services/appointment.service';
import { buildScheduleSummary } from '../services/working-hours.service';
import { buildDateTimePlaceholders } from './appointment-datetime-context';
import type { HistoryMsg } from './appointment-collect.service';
import {
  buildAppointmentAvailabilityContext,
  mergeAppointmentSystemNotes,
} from './appointment-llm-availability.service';

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
  key: AppointmentSystemNoteKey,
  overrideText?: string
): AppointmentSessionMeta {
  return {
    ...meta,
    pendingSystemNoteKey: key,
    pendingSystemNote: overrideText ?? appointmentConfig.systemNotes[key],
  };
}

function formatSaveFailedNote(reason: string): string {
  return appointmentConfig.systemNotes.SAVE_FAILED.replace('{reason}', reason);
}

function mergeStateFromLlm(
  state: AppointmentLlmState,
  parsed: ParsedAppointmentResponse
): AppointmentLlmState {
  if (!parsed.payload) return state;
  const fromLlm = stateFromAppointmentResponse(parsed.payload.appointment);
  return {
    ...state,
    ...fromLlm,
    status: state.status,
    preferred_doctor: state.preferred_doctor,
  };
}

export type HandoffTrigger =
  | 'validation_failures'
  | 'slot_taken_twice'
  | 'max_turns'
  | 'db_error'
  | 'json_parse_failed';

export function allowAppointmentTransfer(
  requestedByAi: boolean,
  handoffReason: HandoffTrigger | null
): boolean {
  return requestedByAi && handoffReason !== null;
}

export function evaluateHandoffTriggers(
  meta: AppointmentSessionMeta,
  state: AppointmentLlmState,
  history: HistoryMsg[],
  options?: {
    dbError?: boolean;
    jsonParseFailed?: boolean;
  }
): { shouldHandoff: boolean; reason: HandoffTrigger | null } {
  if (meta.status === 'handed_off') {
    return { shouldHandoff: true, reason: 'validation_failures' };
  }

  if (options?.jsonParseFailed) {
    return { shouldHandoff: true, reason: 'json_parse_failed' };
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

  const turns = countAppointmentAiTurns(history) + 1;
  if (turns > appointmentConfig.maxTurns && meta.status !== 'saved') {
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
        status: 'confirmed',
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

async function buildBookedConfirmationMessage(
  companyId: string,
  appointment: Appointment,
  lang: ConversationLang
): Promise<string> {
  const category = await fetchCompanyCategory(companyId);
  return buildAppointmentConfirmationMessage(appointment, lang, category);
}

export function applyPostAiProcessing(
  meta: AppointmentSessionMeta,
  state: AppointmentLlmState,
  parsed: ParsedAppointmentResponse
): { meta: AppointmentSessionMeta; state: AppointmentLlmState; handoff: HandoffTrigger | null } {
  let nextMeta = { ...meta };
  let nextState = { ...state };

  if (parsed.parseError || !parsed.payload) {
    const handoffCheck = evaluateHandoffTriggers(nextMeta, nextState, [], { jsonParseFailed: true });
    if (handoffCheck.shouldHandoff && handoffCheck.reason) {
      nextMeta = markSessionHandedOff(nextMeta, handoffCheck.reason);
      nextMeta = queueSystemNote(nextMeta, 'HANDOFF');
      return { meta: nextMeta, state: nextState, handoff: handoffCheck.reason };
    }
    return { meta: nextMeta, state: nextState, handoff: null };
  }

  nextState = mergeStateFromLlm(nextState, parsed);
  logFlow('llm_parsed', {
    action: parsed.payload.action,
    phone: maskPhoneForLog(nextState.customer_phone),
  });

  if (parsed.payload.action === 'handoff') {
    nextMeta = markSessionHandedOff(nextMeta, 'validation_failures');
    nextMeta = queueSystemNote(nextMeta, 'HANDOFF');
    return { meta: nextMeta, state: nextState, handoff: 'validation_failures' };
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

  const appointmentRolePrompt = await buildAppointmentRolePrompt(input.company, {
    collectedContext,
    appointmentContext,
    knowledge,
    knowledgeTitles: allKnowledge.map((k) => k.title),
    lang,
    languageBlock,
    appointmentCtx,
  });

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
  if (appointmentRolePrompt) {
    chatMessages.push({ role: 'system', content: appointmentRolePrompt });
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
    responseFormat: appointmentResponseFormat(),
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
  const handoffParsed = parseAppointmentResponse(handoffCall.raw);
  const reply = handoffParsed.payload?.reply || appointmentConfig.handoffFallbackMessage;
  const { message, shouldTransfer } = stripTransferMarker(reply);
  return {
    message,
    shouldTransfer: allowAppointmentTransfer(shouldTransfer, 'validation_failures'),
    tokensUsed: handoffCall.tokensUsed,
  };
}

async function parseLlmTurnWithRetry(
  input: AppointmentLlmFlowInput,
  systemNote: string | null,
  lang: ConversationLang,
  knowledge: string,
  allKnowledge: KnowledgeItem[],
  state: AppointmentLlmState,
  appointmentCtx: AppointmentCompanyContext
): Promise<{
  parsed: ParsedAppointmentResponse;
  tokensUsed: number;
  handoffFallback: boolean;
}> {
  let totalTokens = 0;
  let call = await callAppointmentLlm(
    input,
    systemNote,
    lang,
    knowledge,
    allKnowledge,
    state,
    appointmentCtx
  );
  totalTokens += call.tokensUsed;
  let parsed = parseAppointmentResponse(call.raw);

  if (!parsed.parseError && parsed.payload) {
    logFlow('llm_turn', {
      action: parsed.payload.action,
      phone: maskPhoneForLog(state.customer_phone),
    });
    return { parsed, tokensUsed: totalTokens, handoffFallback: false };
  }

  logFlow('json_parse_failed', { phone: maskPhoneForLog(state.customer_phone), retry: true });
  const retryNote = mergeAppointmentSystemNotes(systemNote, appointmentConfig.systemNotes.JSON_RETRY);
  call = await callAppointmentLlm(
    input,
    retryNote,
    lang,
    knowledge,
    allKnowledge,
    state,
    appointmentCtx
  );
  totalTokens += call.tokensUsed;
  parsed = parseAppointmentResponse(call.raw);

  if (!parsed.parseError && parsed.payload) {
    logFlow('llm_turn', {
      action: parsed.payload.action,
      phone: maskPhoneForLog(state.customer_phone),
    });
    return { parsed, tokensUsed: totalTokens, handoffFallback: false };
  }

  logFlow('json_parse_failed', { phone: maskPhoneForLog(state.customer_phone), retry: false });
  return { parsed, tokensUsed: totalTokens, handoffFallback: true };
}

export async function runAppointmentLlmFlow(
  input: AppointmentLlmFlowInput
): Promise<AppointmentLlmFlowResult> {
  const lang = detectConversationLanguage(input.customerMessage, input.history);
  let meta = getAppointmentSession(input.companyId, input.customerPhone);
  let state = resolveAppointmentState(meta.llmState);

  if (meta.status === 'handed_off') {
    if (isAppointmentSessionRestartMessage(input.customerMessage)) {
      meta = resetAppointmentSessionForRetry(input.companyId, input.customerPhone);
      state = resolveAppointmentState(null);
      logFlow('session_reset_after_handoff', { message: input.customerMessage.slice(0, 80) });
    } else {
      meta = queueSystemNote(meta, 'HANDOFF');
    }
  }

  meta = { ...meta, turnCount: meta.turnCount + 1 };
  logFlow('turn_start', {
    turn: meta.turnCount,
    phone: maskPhoneForLog(state.customer_phone),
    pendingNote: meta.pendingSystemNoteKey,
  });

  const retrieval = await appointmentLlmFlowDeps.retrieveKnowledgeContext(
    input.companyId,
    input.customerMessage,
    input.allKnowledge
  );
  const knowledge = retrieval.context;
  const appointmentKnowledge = input.allKnowledge;

  const pendingNote =
    meta.pendingSystemNote ||
    (meta.pendingSystemNoteKey ? appointmentConfig.systemNotes[meta.pendingSystemNoteKey] : null);
  meta = { ...meta, pendingSystemNote: null, pendingSystemNoteKey: null };

  const availability = await buildAppointmentAvailabilityContext(
    input.companyId,
    input.appointmentCtx,
    lang,
    { date: state.date, time: state.time }
  );
  if (availability.systemNote) {
    logFlow('availability_checked', { dbError: availability.dbError });
  }

  const noteForAi = mergeAppointmentSystemNotes(pendingNote, availability.systemNote);

  const preHandoff = evaluateHandoffTriggers(meta, state, input.history, {
    dbError: availability.dbError,
  });
  if (preHandoff.shouldHandoff && preHandoff.reason) {
    meta = queueSystemNote(markSessionHandedOff(meta, preHandoff.reason), 'HANDOFF');
  }

  const effectiveNote = mergeAppointmentSystemNotes(
    noteForAi,
    meta.pendingSystemNote ||
      (meta.pendingSystemNoteKey ? appointmentConfig.systemNotes[meta.pendingSystemNoteKey] : null)
  );

  const llmResult = await parseLlmTurnWithRetry(
    input,
    effectiveNote,
    lang,
    knowledge,
    appointmentKnowledge,
    state,
    input.appointmentCtx
  );
  let totalTokens = llmResult.tokensUsed;

  if (llmResult.handoffFallback) {
    meta = markSessionHandedOff(meta, 'json_parse_failed');
    saveAppointmentSession(input.companyId, input.customerPhone, meta, state);
    const { message, shouldTransfer } = stripTransferMarker(appointmentConfig.handoffFallbackMessage);
    return {
      message,
      shouldTransfer: allowAppointmentTransfer(shouldTransfer, 'json_parse_failed'),
      tokensUsed: totalTokens,
      appointmentBooked: false,
      appointment: null,
      skipReason: 'appointment_llm',
    };
  }

  const post = applyPostAiProcessing(meta, state, llmResult.parsed);
  meta = post.meta;
  state = post.state;

  const payload = llmResult.parsed.payload!;
  let message = payload.reply;
  let shouldTransfer = false;

  if (post.handoff) {
    const handoff = await runHandoffAiTurn(
      input,
      lang,
      knowledge,
      appointmentKnowledge,
      state,
      input.appointmentCtx
    );
    totalTokens += handoff.tokensUsed;
    message = handoff.message;
    shouldTransfer = handoff.shouldTransfer;
  } else {
    const stripped = stripTransferMarker(message);
    message = stripped.message;
    if (stripped.shouldTransfer) {
      logFlow('unauthorized_transfer_suppressed', { phone: maskPhoneForLog(state.customer_phone) });
      shouldTransfer = allowAppointmentTransfer(stripped.shouldTransfer, null);
    }
  }

  if (meta.status !== 'saved' && payload.action === 'save' && isReadyForBooking(state)) {
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
      const confirmMessage = await buildBookedConfirmationMessage(
        input.companyId,
        bookResult.appointment,
        lang
      );
      return {
        message: confirmMessage,
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
      logFlow('book_rejected', { code: 'SLOT_TAKEN', phone: maskPhoneForLog(state.customer_phone) });
      const failNote = formatSaveFailedNote('SLOT_TAKEN');
      const retry = await parseLlmTurnWithRetry(
        input,
        failNote,
        lang,
        knowledge,
        appointmentKnowledge,
        state,
        input.appointmentCtx
      );
      totalTokens += retry.tokensUsed;
      if (!retry.handoffFallback && retry.parsed.payload) {
        state = mergeStateFromLlm(state, retry.parsed);
        message = retry.parsed.payload.reply;
        logFlow('model_turn_after_save_fail', {
          action: retry.parsed.payload.action,
          phone: maskPhoneForLog(state.customer_phone),
        });
      }
    } else if (bookResult.code === 'INVALID_DATE') {
      meta = incrementValidationFailure(queueSystemNote(meta, 'INVALID_DATE'), 'INVALID_DATE');
      state = bookResult.state;
      logFlow('book_rejected', { code: 'INVALID_DATE', phone: maskPhoneForLog(state.customer_phone) });
      const failNote = formatSaveFailedNote('INVALID_DATE');
      const retry = await parseLlmTurnWithRetry(
        input,
        failNote,
        lang,
        knowledge,
        appointmentKnowledge,
        state,
        input.appointmentCtx
      );
      totalTokens += retry.tokensUsed;
      if (!retry.handoffFallback && retry.parsed.payload) {
        state = mergeStateFromLlm(state, retry.parsed);
        message = retry.parsed.payload.reply;
        logFlow('model_turn_after_save_fail', {
          action: retry.parsed.payload.action,
          phone: maskPhoneForLog(state.customer_phone),
        });
      }
    } else if (bookResult.code === 'DB_ERROR') {
      meta = queueSystemNote(markSessionHandedOff(meta, 'db_error'), 'HANDOFF');
      const handoff = await runHandoffAiTurn(
        input,
        lang,
        knowledge,
        appointmentKnowledge,
        state,
        input.appointmentCtx
      );
      totalTokens += handoff.tokensUsed;
      message = handoff.message;
      shouldTransfer = handoff.shouldTransfer;
    }
  } else if (payload.action === 'save' && !isReadyForBooking(state)) {
    meta = queueSystemNote(meta, 'SAVE_FAILED');
    logFlow('save_incomplete', { phone: maskPhoneForLog(state.customer_phone) });
  }

  const postHandoff = evaluateHandoffTriggers(meta, state, [
    ...input.history,
    { sender_type: 'ai', message: payload.reply },
  ]);
  if (postHandoff.shouldHandoff && !shouldTransfer && meta.status !== 'saved') {
    meta = markSessionHandedOff(meta, postHandoff.reason || 'max_turns');
    logFlow('handoff_triggered_post', { reason: postHandoff.reason, phone: maskPhoneForLog(state.customer_phone) });
    const handoff = await runHandoffAiTurn(
      input,
      lang,
      knowledge,
      appointmentKnowledge,
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
    phone: maskPhoneForLog(state.customer_phone),
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

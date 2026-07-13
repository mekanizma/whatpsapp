/**
 * Randevu LLM yapılandırılmış çıktı şeması — API response_format için
 */

import type OpenAI from 'openai';

export const APPOINTMENT_ACTIONS = ['collect', 'save', 'handoff', 'none'] as const;
export type AppointmentAction = (typeof APPOINTMENT_ACTIONS)[number];

export interface AppointmentResponsePayload {
  reply: string;
  appointment: {
    name: string | null;
    phone: string | null;
    topic: string | null;
    date: string | null;
    time: string | null;
  };
  action: AppointmentAction;
}

export const APPOINTMENT_RESPONSE_JSON_SCHEMA = {
  name: 'appointment_turn',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'appointment', 'action'],
    properties: {
      reply: {
        type: 'string',
        description: 'Müşteriye gönderilecek mesaj (müşterinin dilinde)',
      },
      appointment: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'phone', 'topic', 'date', 'time'],
        properties: {
          name: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          topic: { type: ['string', 'null'] },
          date: { type: ['string', 'null'], description: 'YYYY-MM-DD veya null' },
          time: { type: ['string', 'null'], description: 'HH:MM veya null' },
        },
      },
      action: { type: 'string', enum: [...APPOINTMENT_ACTIONS] },
    },
  },
} as const;

export function appointmentResponseFormat(): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format'] {
  return { type: 'json_schema', json_schema: APPOINTMENT_RESPONSE_JSON_SCHEMA };
}

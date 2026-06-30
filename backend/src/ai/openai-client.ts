/**
 * OpenAI chat completion — model ailesine göre parametre uyumu
 * gpt-5*: max_completion_tokens kullanır, temperature=0 desteklenmez
 */

import OpenAI from 'openai';
import { config } from '../config';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

function isGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model);
}

export async function createChatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    responseFormat?: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format'];
  }
): Promise<OpenAI.Chat.ChatCompletion> {
  const model = config.openai.model;
  const maxTokens = options?.maxTokens ?? config.ai.maxTokens;

  if (isGpt5Family(model)) {
    return openai.chat.completions.create({
      model,
      messages,
      max_completion_tokens: maxTokens,
      ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
    });
  }

  return openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: options?.temperature ?? config.ai.temperature,
    ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
  });
}

export { openai };

/**
 * OpenAI chat completion — model ailesine göre parametre uyumu
 * gpt-5*: max_completion_tokens kullanır, temperature=0 desteklenmez
 */

import OpenAI from 'openai';
import { config } from '../config';
import { logAIUsage } from './ai-quota.service';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface AIUsageLogContext {
  companyId: string;
  customerPhone?: string;
  skipped?: boolean;
  cached?: boolean;
  skipReason?: string;
}

function isGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model);
}

export async function createChatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    responseFormat?: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming['response_format'];
    usageLog?: AIUsageLogContext;
  }
): Promise<OpenAI.Chat.ChatCompletion> {
  const model = config.openai.model;
  const maxTokens = options?.maxTokens ?? config.ai.maxTokens;

  const completion = isGpt5Family(model)
    ? await openai.chat.completions.create({
        model,
        messages,
        max_completion_tokens: maxTokens,
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
      })
    : await openai.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: options?.temperature ?? config.ai.temperature,
        ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
      });

  if (options?.usageLog) {
    const usage = completion.usage;
    await logAIUsage({
      companyId: options.usageLog.companyId,
      customerPhone: options.usageLog.customerPhone || '',
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      cached: options.usageLog.cached ?? false,
      skipped: options.usageLog.skipped ?? false,
      skipReason: options.usageLog.skipReason,
      model,
    });
  }

  return completion;
}

export { openai };

/**
 * Destek talebi departman yönlendirme — AI sınıflandırma ve müşteri seçimi
 */

import { createChatCompletion } from './openai-client';
import { detectConversationLanguage, type ConversationLang } from '../ai/language.service';
import type { Department } from '../types';

const PENDING_TTL_MS = 15 * 60_000;

interface PendingDepartmentSelection {
  departments: Department[];
  subject: string;
  customerName: string | null;
  expiresAt: number;
}

const pendingSelections = new Map<string, PendingDepartmentSelection>();

function pendingKey(companyId: string, phone: string): string {
  return `${companyId}:${phone}`;
}

export function setPendingDepartmentSelection(
  companyId: string,
  phone: string,
  payload: Omit<PendingDepartmentSelection, 'expiresAt'>
): void {
  pendingSelections.set(pendingKey(companyId, phone), {
    ...payload,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

export function clearPendingDepartmentSelection(companyId: string, phone: string): void {
  pendingSelections.delete(pendingKey(companyId, phone));
}

export function getPendingDepartmentSelection(
  companyId: string,
  phone: string
): PendingDepartmentSelection | null {
  const entry = pendingSelections.get(pendingKey(companyId, phone));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pendingSelections.delete(pendingKey(companyId, phone));
    return null;
  }
  return entry;
}

export function buildDepartmentSelectionPrompt(
  departments: Department[],
  lang: ConversationLang
): string {
  const lines = departments.map((d, i) => `${i + 1}. ${d.name}`);
  if (lang === 'en') {
    return [
      'To connect you with the right team, please tell us which department your request is for:',
      '',
      ...lines,
      '',
      'Reply with the number or department name.',
    ].join('\n');
  }
  return [
    'Sizi doğru ekibe yönlendirebilmemiz için lütfen talebinizin hangi departmanla ilgili olduğunu belirtin:',
    '',
    ...lines,
    '',
    'Numara veya departman adıyla yanıt verebilirsiniz.',
  ].join('\n');
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function matchDepartmentFromReply(
  reply: string,
  departments: Department[]
): Department | null {
  const trimmed = reply.trim();
  if (!trimmed || !departments.length) return null;

  const num = parseInt(trimmed, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= departments.length) {
    return departments[num - 1];
  }

  const norm = normalizeForMatch(trimmed);
  const exact = departments.find((d) => normalizeForMatch(d.name) === norm);
  if (exact) return exact;

  const partial = departments.find((d) => {
    const name = normalizeForMatch(d.name);
    return name.includes(norm) || norm.includes(name);
  });
  return partial || null;
}

export interface DepartmentRoutingResult {
  departmentId: string | null;
  awaitingSelection: boolean;
  promptMessage?: string;
}

export async function resolveTransferDepartment(
  companyId: string,
  customerMessage: string,
  history: { sender_type: string; message: string }[],
  departments: Department[],
  customerPhone?: string
): Promise<DepartmentRoutingResult> {
  if (!departments.length) {
    return { departmentId: null, awaitingSelection: false };
  }

  if (departments.length === 1) {
    return { departmentId: departments[0].id, awaitingSelection: false };
  }

  const lang = detectConversationLanguage(customerMessage, history);
  const deptList = departments
    .map((d) => `- ${d.id}: ${d.name}${d.description ? ` (${d.description})` : ''}`)
    .join('\n');

  const transcript = history
    .slice(-8)
    .map((m) => `${m.sender_type === 'customer' ? 'Müşteri' : 'Asistan'}: ${m.message}`)
    .join('\n');

  try {
    const completion = await createChatCompletion(
      [
        {
          role: 'system',
          content: `Müşteri destek talebini doğru departmana yönlendir. JSON yanıt:
{"department_id":"uuid veya null","confidence":"high|low"}
Yalnızca confidence:high ise department_id doldur. Belirsizse null ve confidence:low.`,
        },
        {
          role: 'user',
          content: `Departmanlar:\n${deptList}\n\nKonuşma:\n${transcript}\nMüşteri: ${customerMessage}`,
        },
      ],
      {
        maxTokens: 120,
        temperature: 0,
        responseFormat: { type: 'json_object' },
        usageLog: {
          companyId,
          customerPhone: customerPhone || '',
          skipped: false,
          cached: false,
          skipReason: 'department_routing',
        },
      }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as { department_id?: string | null; confidence?: string };
      const validId =
        parsed.department_id &&
        departments.some((d) => d.id === parsed.department_id) &&
        parsed.confidence === 'high';

      if (validId && parsed.department_id) {
        return { departmentId: parsed.department_id, awaitingSelection: false };
      }
    }
  } catch (err) {
    console.error(
      '[DeptRouting] AI sınıflandırma hatası:',
      err instanceof Error ? err.message : err
    );
  }

  return {
    departmentId: null,
    awaitingSelection: true,
    promptMessage: buildDepartmentSelectionPrompt(departments, lang),
  };
}

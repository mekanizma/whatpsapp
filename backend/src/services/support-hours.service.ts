/**
 * WhatsApp hattı başına destek mesai saatleri
 */

import { adminClient } from '../database/supabase';
import { parseCompanyTimezone } from './company-timezone.service';
import {
  DEFAULT_WORKING_HOURS,
  isWithinWorkingHours,
  parseWorkingHoursForRuntime,
  type WorkingHoursSchedule,
} from './working-hours.service';

export interface AccountSupportHours {
  enabled: boolean;
  schedule: WorkingHoursSchedule;
  timezone: string;
  outOfHoursMessage: string | null;
  createTicket: boolean;
}

const DEFAULT_OUT_OF_HOURS_MESSAGE =
  'Şu an mesai saatlerimiz dışındayız. Mesajınız alındı; mesai içinde size dönüş yapılacaktır.';

export async function getAccountSupportHours(
  companyId: string,
  whatsappAccountId?: string | null
): Promise<AccountSupportHours | null> {
  let accountId = whatsappAccountId || null;

  if (!accountId) {
    const { data: defaultAccount } = await adminClient
      .from('whatsapp_configs')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_default', true)
      .maybeSingle();
    accountId = defaultAccount?.id ?? null;
  }

  if (!accountId) return null;

  const { data: account } = await adminClient
    .from('whatsapp_configs')
    .select(
      'support_hours_enabled, support_working_hours, support_timezone, out_of_hours_message, out_of_hours_create_ticket'
    )
    .eq('id', accountId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!account?.support_hours_enabled) return null;

  const { data: company } = await adminClient
    .from('companies')
    .select('timezone')
    .eq('id', companyId)
    .maybeSingle();

  const timezone = parseCompanyTimezone(
    account.support_timezone || company?.timezone || null
  );

  const rawHours = account.support_working_hours;
  const hasCustomHours =
    rawHours &&
    typeof rawHours === 'object' &&
    !Array.isArray(rawHours) &&
    Object.keys(rawHours as object).length > 0;

  return {
    enabled: true,
    schedule: hasCustomHours
      ? parseWorkingHoursForRuntime(rawHours)
      : { ...DEFAULT_WORKING_HOURS },
    timezone,
    outOfHoursMessage:
      typeof account.out_of_hours_message === 'string' && account.out_of_hours_message.trim()
        ? account.out_of_hours_message.trim()
        : DEFAULT_OUT_OF_HOURS_MESSAGE,
    createTicket: account.out_of_hours_create_ticket !== false,
  };
}

export async function resolveSupportHandoffPolicy(
  companyId: string,
  whatsappAccountId?: string | null
): Promise<{
  outsideHours: boolean;
  createTicket: boolean;
  replyMessage: string | null;
}> {
  const hours = await getAccountSupportHours(companyId, whatsappAccountId);
  if (!hours) {
    return { outsideHours: false, createTicket: true, replyMessage: null };
  }

  const inside = isWithinWorkingHours(hours.schedule, hours.timezone);
  if (inside) {
    return { outsideHours: false, createTicket: true, replyMessage: null };
  }

  return {
    outsideHours: true,
    createTicket: hours.createTicket,
    replyMessage: hours.outOfHoursMessage,
  };
}

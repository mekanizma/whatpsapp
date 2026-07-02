/**
 * Fatura şablonu ayarları — platform_invoice_settings.template_config
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';
import {
  DEFAULT_INVOICE_TEMPLATE,
  mergeInvoiceTemplate,
  type InvoiceTemplateConfig,
} from '../types/invoice-template';

export type { InvoiceTemplateConfig } from '../types/invoice-template';
export { DEFAULT_INVOICE_TEMPLATE, INVOICE_FIELD_OPTIONS } from '../types/invoice-template';

export async function getInvoiceTemplateConfig(): Promise<InvoiceTemplateConfig> {
  if (config.demoMode) {
    return mergeInvoiceTemplate(null);
  }

  const { data, error } = await adminClient
    .from('platform_invoice_settings')
    .select('template_config')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data) {
    return mergeInvoiceTemplate(null);
  }

  return mergeInvoiceTemplate(data.template_config as Partial<InvoiceTemplateConfig>);
}

export async function updateInvoiceTemplateConfig(
  input: Partial<InvoiceTemplateConfig>,
  userId?: string
): Promise<InvoiceTemplateConfig> {
  if (config.demoMode) {
    throw new Error('Demo modda fatura şablonu kaydedilemez');
  }

  const current = await getInvoiceTemplateConfig();
  const merged = mergeInvoiceTemplate({ ...current, ...input });

  const { data: existing } = await adminClient
    .from('platform_invoice_settings')
    .select('id')
    .eq('id', 'default')
    .maybeSingle();

  if (!existing) {
    const { error } = await adminClient.from('platform_invoice_settings').insert({
      id: 'default',
      template_config: merged,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    });
    if (error) throw new Error(error.message);
    return merged;
  }

  const { data, error } = await adminClient
    .from('platform_invoice_settings')
    .update({
      template_config: merged,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    })
    .eq('id', 'default')
    .select('template_config')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mergeInvoiceTemplate(data.template_config as Partial<InvoiceTemplateConfig>);
}

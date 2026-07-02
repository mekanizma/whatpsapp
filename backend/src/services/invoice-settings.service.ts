/**
 * Platform fatura satıcı bilgileri — admin panelden düzenlenir, PDF'de kullanılır
 */

import { config } from '../config';
import { adminClient } from '../database/supabase';

export interface InvoiceIssuerSettings {
  name: string;
  legalName: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  email: string;
  phone: string;
  website: string;
  vatRate: number;
  footerNote: string | null;
}

const ENV_DEFAULTS: InvoiceIssuerSettings = {
  name: process.env.INVOICE_ISSUER_NAME || 'MEKANİZMA',
  legalName: process.env.INVOICE_ISSUER_LEGAL_NAME || 'MEKANİZMA Yazılım ve Teknoloji A.Ş.',
  address: process.env.INVOICE_ISSUER_ADDRESS || 'Türkiye',
  taxOffice: process.env.INVOICE_ISSUER_TAX_OFFICE || '—',
  taxNumber: process.env.INVOICE_ISSUER_TAX_NUMBER || '—',
  email: process.env.INVOICE_ISSUER_EMAIL || 'fatura@mekanizma.com',
  phone: process.env.INVOICE_ISSUER_PHONE || '—',
  website: process.env.INVOICE_ISSUER_WEBSITE || 'mekanizma.com',
  vatRate: Number(process.env.INVOICE_VAT_RATE) || 0,
  footerNote: process.env.INVOICE_FOOTER_NOTE || null,
};

function mapRow(row: Record<string, unknown>): InvoiceIssuerSettings {
  return {
    name: String(row.issuer_name || ENV_DEFAULTS.name),
    legalName: String(row.legal_name || ENV_DEFAULTS.legalName),
    address: String(row.address || ENV_DEFAULTS.address),
    taxOffice: String(row.tax_office || ENV_DEFAULTS.taxOffice),
    taxNumber: String(row.tax_number || ENV_DEFAULTS.taxNumber),
    email: String(row.email || ENV_DEFAULTS.email),
    phone: String(row.phone || ENV_DEFAULTS.phone),
    website: String(row.website || ENV_DEFAULTS.website),
    vatRate: Number(row.vat_rate ?? ENV_DEFAULTS.vatRate),
    footerNote: row.footer_note ? String(row.footer_note) : null,
  };
}

export function getDefaultInvoiceIssuerSettings(): InvoiceIssuerSettings {
  return { ...ENV_DEFAULTS };
}

export async function getInvoiceIssuerSettings(): Promise<InvoiceIssuerSettings> {
  if (config.demoMode) {
    return getDefaultInvoiceIssuerSettings();
  }

  const { data, error } = await adminClient
    .from('platform_invoice_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error || !data) {
    return getDefaultInvoiceIssuerSettings();
  }

  return mapRow(data as Record<string, unknown>);
}

export interface UpdateInvoiceIssuerInput {
  name?: string;
  legalName?: string;
  address?: string;
  taxOffice?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  website?: string;
  vatRate?: number;
  footerNote?: string | null;
}

export async function updateInvoiceIssuerSettings(
  input: UpdateInvoiceIssuerInput,
  userId?: string
): Promise<InvoiceIssuerSettings> {
  if (config.demoMode) {
    throw new Error('Demo modda fatura ayarları kaydedilemez');
  }

  const current = await getInvoiceIssuerSettings();
  const payload = {
    id: 'default',
    issuer_name: input.name?.trim() || current.name,
    legal_name: input.legalName?.trim() || current.legalName,
    address: input.address?.trim() || current.address,
    tax_office: input.taxOffice?.trim() || current.taxOffice,
    tax_number: input.taxNumber?.trim() || current.taxNumber,
    email: input.email?.trim() || current.email,
    phone: input.phone?.trim() || current.phone,
    website: input.website?.trim() || current.website,
    vat_rate: input.vatRate ?? current.vatRate,
    footer_note: input.footerNote === undefined ? current.footerNote : input.footerNote,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  };

  const { data, error } = await adminClient
    .from('platform_invoice_settings')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRow(data as Record<string, unknown>);
}

/**
 * E-Fatura PDF oluşturma — MEKANİZMA
 */

import { randomUUID } from 'crypto';
import { adminClient } from '../database/supabase';
import {
  getInvoiceIssuerSettings,
  type InvoiceIssuerSettings,
} from './invoice-settings.service';
import { getInvoiceTemplateConfig } from './invoice-template.service';
import {
  buildPreviewInvoiceData,
  generateInvoicePdfFromTemplate,
} from './invoice-pdf-renderer';
import { mergeInvoiceTemplate, type InvoiceTemplateConfig } from '../types/invoice-template';

export type BillingPeriod = 'monthly' | 'yearly';

export interface InvoiceLineItem {
  description: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
}

export interface InvoiceOptions {
  billingPeriod?: BillingPeriod;
  /** Faturaya özel tek seferlik kurulum ücreti */
  setupFee?: number;
  setupFeeDescription?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  ettn: string;
  issueDate: Date;
  billingPeriod: BillingPeriod;
  issuer: InvoiceIssuerSettings;
  buyer: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  subscription: {
    planName: string;
    planType: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    messagesLimit: number;
    usersLimit: number;
    messagesUsed: number;
    features: string[];
  };
  lineItems: InvoiceLineItem[];
  subtotal: number;
  grandTotal: number;
  currency: string;
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Başlangıç',
  business: 'İşletme',
  enterprise: 'Kurumsal',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  trial: 'Deneme',
  cancelled: 'İptal',
  expired: 'Süresi Doldu',
};

function formatMoney(amount: number, currency: string): string {
  const code = (currency || 'TRY').toUpperCase();
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function resolveBillingEnd(startsAt: Date, period: BillingPeriod, endsAt: Date | null): Date {
  if (endsAt) return endsAt;
  return period === 'yearly' ? addYears(startsAt, 1) : addMonths(startsAt, 1);
}

function generateInvoiceNumber(companyId: string, prefix = 'MKZ'): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const shortId = companyId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}-${datePart}-${shortId}`;
}

export async function buildInvoiceData(
  companyId: string,
  options: InvoiceOptions = {}
): Promise<InvoiceData> {
  const billingPeriod = options.billingPeriod ?? 'monthly';
  const setupFee = Math.max(0, Number(options.setupFee) || 0);
  const setupFeeDescription = options.setupFeeDescription?.trim() || 'Kurulum Ücreti (tek seferlik)';

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (companyError || !company) {
    throw new Error('Şirket bulunamadı');
  }

  const { data: subscription, error: subError } = await adminClient
    .from('subscriptions')
    .select(
      '*, subscription_plans(plan_type, name, description, features, message_limit, user_limit, price_monthly, price_yearly, currency)'
    )
    .eq('company_id', companyId)
    .single();

  if (subError || !subscription) {
    throw new Error('Abonelik bulunamadı');
  }

  const plan = Array.isArray(subscription.subscription_plans)
    ? subscription.subscription_plans[0]
    : subscription.subscription_plans;

  if (!plan) {
    throw new Error('Paket bilgisi bulunamadı');
  }

  const startsAt = new Date(subscription.starts_at || subscription.created_at);
  const endsAt = resolveBillingEnd(
    startsAt,
    billingPeriod,
    subscription.ends_at ? new Date(subscription.ends_at) : null
  );

  const currency = (plan.currency || 'TRY').toUpperCase();
  const unitPrice =
    billingPeriod === 'yearly'
      ? Number(plan.price_yearly) > 0
        ? Number(plan.price_yearly)
        : Number(plan.price_monthly) * 10
      : Number(plan.price_monthly) || 0;

  const planLabel = plan.name || PLAN_LABELS[plan.plan_type] || plan.plan_type;
  const periodLabel = billingPeriod === 'yearly' ? 'Yıllık' : 'Aylık';
  const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];

  const lineItems: InvoiceLineItem[] = [
    {
      description: `${planLabel} — ${periodLabel} Abonelik`,
      detail: [
        `${subscription.messages_limit.toLocaleString('tr-TR')} AI görüşme hakkı`,
        `${subscription.users_limit} panel kullanıcısı`,
        `Abonelik: ${formatDate(startsAt)} — ${formatDate(endsAt)}`,
        `Durum: ${STATUS_LABELS[subscription.status] || subscription.status}`,
      ].join(' · '),
      quantity: 1,
      unitPrice,
      total: unitPrice,
      currency,
    },
  ];

  if (setupFee > 0) {
    lineItems.push({
      description: setupFeeDescription,
      detail: 'Tek seferlik kurulum ve devreye alma hizmeti',
      quantity: 1,
      unitPrice: setupFee,
      total: setupFee,
      currency,
    });
  }

  const { data: addonPurchases } = await adminClient
    .from('ai_conversation_addon_purchases')
    .select('id, conversation_count, price_paid, currency, created_at, ai_conversation_addons(name)')
    .eq('company_id', companyId)
    .gte('created_at', startsAt.toISOString())
    .lte('created_at', endsAt.toISOString())
    .order('created_at', { ascending: true });

  for (const purchase of addonPurchases || []) {
    const addon = Array.isArray(purchase.ai_conversation_addons)
      ? purchase.ai_conversation_addons[0]
      : purchase.ai_conversation_addons;
    const addonName = addon?.name || 'Ek AI Görüşme Paketi';
    const price = Number(purchase.price_paid) || 0;
    const purchaseCurrency = (purchase.currency || currency).toUpperCase();

    lineItems.push({
      description: addonName,
      detail: `${purchase.conversation_count.toLocaleString('tr-TR')} ek AI görüşme · ${formatDateTime(new Date(purchase.created_at))}`,
      quantity: 1,
      unitPrice: price,
      total: price,
      currency: purchaseCurrency,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const issuer = await getInvoiceIssuerSettings();
  const template = await getInvoiceTemplateConfig();

  return {
    invoiceNumber: generateInvoiceNumber(companyId, template.invoiceNumberPrefix || 'MKZ'),
    ettn: randomUUID().toUpperCase(),
    issueDate: new Date(),
    billingPeriod,
    issuer,
    buyer: {
      name: company.company_name,
      email: company.email,
      phone: company.phone,
      address: company.address,
    },
    subscription: {
      planName: planLabel,
      planType: plan.plan_type,
      status: subscription.status,
      startsAt,
      endsAt,
      messagesLimit: subscription.messages_limit,
      usersLimit: subscription.users_limit,
      messagesUsed: subscription.messages_used,
      features,
    },
    lineItems,
    subtotal,
    grandTotal: subtotal,
    currency,
  };
}

export function generateInvoicePdf(
  data: InvoiceData,
  template?: InvoiceTemplateConfig
): Promise<Buffer> {
  if (template) {
    return generateInvoicePdfFromTemplate(data, template);
  }
  return generateInvoicePdfFromTemplate(data, getDefaultTemplateSync());
}

function getDefaultTemplateSync(): InvoiceTemplateConfig {
  return mergeInvoiceTemplate(null);
}

export async function createPreviewInvoicePdf(): Promise<{ buffer: Buffer; filename: string }> {
  const issuer = await getInvoiceIssuerSettings();
  const template = await getInvoiceTemplateConfig();
  const data = buildPreviewInvoiceData(issuer);
  const buffer = await generateInvoicePdfFromTemplate(data, template);
  const filename = `${template.filenamePrefix || 'MEKANIZMA-Fatura'}-Onizleme.pdf`;
  return { buffer, filename };
}

export async function createCompanyInvoicePdf(
  companyId: string,
  options: InvoiceOptions = {}
): Promise<{ buffer: Buffer; filename: string; invoiceNumber: string }> {
  const data = await buildInvoiceData(companyId, options);
  const template = await getInvoiceTemplateConfig();
  const buffer = await generateInvoicePdfFromTemplate(data, template);
  const safeName = data.buyer.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const prefix = template.filenamePrefix || 'MEKANIZMA-Fatura';
  const filename = `${prefix}-${data.invoiceNumber}-${safeName || 'sirket'}.pdf`;

  return { buffer, filename, invoiceNumber: data.invoiceNumber };
}

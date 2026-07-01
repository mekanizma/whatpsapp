/**
 * E-Fatura PDF oluşturma — MEKANİZMA
 */

import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import { randomUUID } from 'crypto';
import { adminClient } from '../database/supabase';

const VAT_RATE = 0.2;

const ISSUER = {
  name: process.env.INVOICE_ISSUER_NAME || 'MEKANİZMA',
  legalName: process.env.INVOICE_ISSUER_LEGAL_NAME || 'MEKANİZMA Yazılım ve Teknoloji A.Ş.',
  address: process.env.INVOICE_ISSUER_ADDRESS || 'Türkiye',
  taxOffice: process.env.INVOICE_ISSUER_TAX_OFFICE || '—',
  taxNumber: process.env.INVOICE_ISSUER_TAX_NUMBER || '—',
  email: process.env.INVOICE_ISSUER_EMAIL || 'fatura@mekanizma.com',
  phone: process.env.INVOICE_ISSUER_PHONE || '—',
  website: process.env.INVOICE_ISSUER_WEBSITE || 'mekanizma.com',
};

export type BillingPeriod = 'monthly' | 'yearly';

export interface InvoiceLineItem {
  description: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  total: number;
  currency: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  ettn: string;
  issueDate: Date;
  billingPeriod: BillingPeriod;
  issuer: typeof ISSUER;
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
  vatAmount: number;
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

function generateInvoiceNumber(companyId: string): string {
  const now = new Date();
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const shortId = companyId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `MKZ-${datePart}-${shortId}`;
}

export async function buildInvoiceData(
  companyId: string,
  billingPeriod: BillingPeriod = 'monthly'
): Promise<InvoiceData> {
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
  const vatAmount = subtotal * VAT_RATE;
  const grandTotal = subtotal + vatAmount;

  return {
    invoiceNumber: generateInvoiceNumber(companyId),
    ettn: randomUUID().toUpperCase(),
    issueDate: new Date(),
    billingPeriod,
    issuer: ISSUER,
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
    vatAmount,
    grandTotal,
    currency,
  };
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  cols: { x: number; width: number; text: string; align?: 'left' | 'right' | 'center' }[],
  y: number,
  options?: { bold?: boolean; fill?: string }
): number {
  const rowHeight = 22;
  if (options?.fill) {
    doc.rect(40, y, 515, rowHeight).fill(options.fill);
  }
  doc.fillColor('#111827').font(options?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  for (const col of cols) {
    doc.text(col.text, col.x, y + 6, {
      width: col.width,
      align: col.align || 'left',
      lineBreak: false,
    });
  }
  return y + rowHeight;
}

export function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const periodLabel = data.billingPeriod === 'yearly' ? 'Yıllık' : 'Aylık';

    // Header band
    doc.rect(0, 0, 595.28, 90).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('MEKANİZMA', 40, 28);
    doc.font('Helvetica').fontSize(10).text('E-FATURA / E-ARŞİV FATURA', 40, 58);
    doc.fontSize(9).text(`Fatura No: ${data.invoiceNumber}`, 350, 30, { width: 205, align: 'right' });
    doc.text(`ETTN: ${data.ettn}`, 350, 44, { width: 205, align: 'right' });
    doc.text(`Tarih: ${formatDate(data.issueDate)}`, 350, 58, { width: 205, align: 'right' });
    doc.text(`Senaryo: TEMELFATURA`, 350, 72, { width: 205, align: 'right' });

    let y = 110;

    // Seller / Buyer blocks
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('SATICI BİLGİLERİ', 40, y);
    doc.text('ALICI BİLGİLERİ', 310, y);
    y += 18;

    doc.rect(40, y, 250, 95).stroke('#e2e8f0');
    doc.rect(310, y, 245, 95).stroke('#e2e8f0');

    doc.font('Helvetica-Bold').fontSize(10).text(data.issuer.name, 48, y + 8);
    doc.font('Helvetica').fontSize(8.5);
    doc.text(data.issuer.legalName, 48, y + 22, { width: 234 });
    doc.text(`Adres: ${data.issuer.address}`, 48, y + 36, { width: 234 });
    doc.text(`Vergi Dairesi: ${data.issuer.taxOffice}`, 48, y + 50, { width: 234 });
    doc.text(`VKN: ${data.issuer.taxNumber}`, 48, y + 64, { width: 234 });
    doc.text(`${data.issuer.email} · ${data.issuer.phone}`, 48, y + 78, { width: 234 });

    doc.font('Helvetica-Bold').fontSize(10).text(data.buyer.name, 318, y + 8);
    doc.font('Helvetica').fontSize(8.5);
    if (data.buyer.address) doc.text(`Adres: ${data.buyer.address}`, 318, y + 24, { width: 229 });
    if (data.buyer.email) doc.text(`E-posta: ${data.buyer.email}`, 318, y + 40, { width: 229 });
    if (data.buyer.phone) doc.text(`Telefon: ${data.buyer.phone}`, 318, y + 56, { width: 229 });

    y += 110;

    // Subscription summary
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('ABONELİK DETAYLARI', 40, y);
    y += 16;
    doc.rect(40, y, 515, 72).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#334155').font('Helvetica').fontSize(8.5);
    doc.text(`Paket: ${data.subscription.planName} (${data.subscription.planType})`, 48, y + 8);
    doc.text(`Dönem: ${periodLabel}`, 48, y + 22);
    doc.text(
      `Abonelik Başlangıç: ${formatDateTime(data.subscription.startsAt)}`,
      48,
      y + 36
    );
    doc.text(`Abonelik Bitiş: ${formatDateTime(data.subscription.endsAt)}`, 48, y + 50);
    doc.text(
      `Durum: ${STATUS_LABELS[data.subscription.status] || data.subscription.status} · Kullanım: ${data.subscription.messagesUsed.toLocaleString('tr-TR')} / ${data.subscription.messagesLimit.toLocaleString('tr-TR')} AI görüşme · ${data.subscription.usersLimit} kullanıcı`,
      48,
      y + 64,
      { width: 500 }
    );

    y += 88;

    if (data.subscription.features.length > 0) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('Paket Özellikleri:', 40, y);
      y += 14;
      doc.font('Helvetica').fontSize(8).fillColor('#475569');
      const featureText = data.subscription.features.map((f) => `• ${f}`).join('\n');
      doc.text(featureText, 48, y, { width: 500 });
      y += doc.heightOfString(featureText, { width: 500 }) + 12;
    }

    // Line items table
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text('FATURA KALEMLERİ', 40, y);
    y += 14;

    y = drawTableRow(
      doc,
      [
        { x: 48, width: 24, text: '#', align: 'center' },
        { x: 72, width: 200, text: 'Açıklama' },
        { x: 280, width: 40, text: 'Adet', align: 'center' },
        { x: 330, width: 80, text: 'Birim Fiyat', align: 'right' },
        { x: 420, width: 80, text: 'Tutar', align: 'right' },
      ],
      y,
      { bold: true, fill: '#e2e8f0' }
    );

    data.lineItems.forEach((item, index) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      y = drawTableRow(
        doc,
        [
          { x: 48, width: 24, text: String(index + 1), align: 'center' },
          { x: 72, width: 200, text: item.description },
          { x: 280, width: 40, text: String(item.quantity), align: 'center' },
          { x: 330, width: 80, text: formatMoney(item.unitPrice, item.currency), align: 'right' },
          { x: 420, width: 80, text: formatMoney(item.total, item.currency), align: 'right' },
        ],
        y
      );
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(item.detail, 72, y - 4, { width: 200 });
      y += 6;
    });

    y += 10;
    doc.rect(330, y, 225, 70).stroke('#e2e8f0');
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text('Ara Toplam:', 340, y + 10);
    doc.text(formatMoney(data.subtotal, data.currency), 420, y + 10, { width: 125, align: 'right' });
    doc.text(`KDV (%${VAT_RATE * 100}):`, 340, y + 26);
    doc.text(formatMoney(data.vatAmount, data.currency), 420, y + 26, { width: 125, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a');
    doc.text('GENEL TOPLAM:', 340, y + 46);
    doc.text(formatMoney(data.grandTotal, data.currency), 420, y + 46, { width: 125, align: 'right' });

    y += 90;
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(
      'Bu belge elektronik ortamda oluşturulmuş olup 5070 sayılı Elektronik İmza Kanunu kapsamında geçerlidir. ' +
        'MEKANİZMA WhatsApp AI SaaS abonelik hizmeti faturasıdır.',
      40,
      y,
      { width: 515, align: 'center' }
    );
    doc.text(`${data.issuer.website} · ${data.issuer.email}`, 40, y + 24, { width: 515, align: 'center' });

    doc.end();
  });
}

export async function createCompanyInvoicePdf(
  companyId: string,
  billingPeriod: BillingPeriod = 'monthly'
): Promise<{ buffer: Buffer; filename: string; invoiceNumber: string }> {
  const data = await buildInvoiceData(companyId, billingPeriod);
  const buffer = await generateInvoicePdf(data);
  const safeName = data.buyer.name
    .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const filename = `MEKANIZMA-Fatura-${data.invoiceNumber}-${safeName || 'sirket'}.pdf`;

  return { buffer, filename, invoiceNumber: data.invoiceNumber };
}

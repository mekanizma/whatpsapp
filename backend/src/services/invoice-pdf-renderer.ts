/**
 * Şablon tabanlı fatura PDF çizimi
 */

import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import type { InvoiceData } from './invoice.service';
import type {
  InvoiceCustomBlock,
  InvoiceCustomBlockPosition,
  InvoiceLineItemColumn,
  InvoiceTemplateConfig,
  InvoiceTemplateField,
  InvoiceTemplateSection,
} from '../types/invoice-template';
import { INVOICE_FONT, INVOICE_FONT_BOLD, registerInvoiceFonts } from '../utils/invoice-fonts';

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

function getSection(template: InvoiceTemplateConfig, key: string): InvoiceTemplateSection | undefined {
  return template.sections.find((s) => s.key === key);
}

function resolveFieldValue(
  field: InvoiceTemplateField,
  data: InvoiceData,
  template: InvoiceTemplateConfig
): string | null {
  if (!field.enabled) return null;

  const periodLabel = data.billingPeriod === 'yearly' ? 'Yıllık' : 'Aylık';

  if (field.dataKey === 'static') {
    return field.customValue?.trim() || null;
  }

  const values: Record<string, string | null> = {
    'issuer.name': data.issuer.name,
    'issuer.legalName': data.issuer.legalName,
    'issuer.address': data.issuer.address,
    'issuer.taxOffice': data.issuer.taxOffice,
    'issuer.taxNumber': data.issuer.taxNumber,
    'issuer.email': data.issuer.email,
    'issuer.phone': data.issuer.phone,
    'issuer.contact': `${data.issuer.email} · ${data.issuer.phone}`,
    'buyer.name': data.buyer.name,
    'buyer.address': data.buyer.address,
    'buyer.email': data.buyer.email,
    'buyer.phone': data.buyer.phone,
    'meta.invoiceNumber': data.invoiceNumber,
    'meta.ettn': data.ettn,
    'meta.issueDate': formatDate(data.issueDate),
    'meta.scenario': template.scenario,
    'subscription.plan': `${data.subscription.planName} (${data.subscription.planType})`,
    'subscription.period': periodLabel,
    'subscription.startsAt': formatDateTime(data.subscription.startsAt),
    'subscription.endsAt': formatDateTime(data.subscription.endsAt),
    'subscription.status': STATUS_LABELS[data.subscription.status] || data.subscription.status,
    'subscription.messagesLimit': `${data.subscription.messagesLimit.toLocaleString('tr-TR')} AI görüşme hakkı`,
    'subscription.usersLimit': `${data.subscription.usersLimit} panel kullanıcısı`,
    'subscription.messagesUsed': `${data.subscription.messagesUsed.toLocaleString('tr-TR')} kullanılan görüşme`,
  };

  const raw = values[field.dataKey];
  if (raw === null || raw === undefined || raw === '') return null;
  return field.label ? `${field.label} ${raw}` : raw;
}

function drawMetaLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options?: { fontSize?: number; bold?: boolean }
): number {
  const fontSize = options?.fontSize ?? 9;
  doc
    .fillColor('#ffffff')
    .font(options?.bold ? INVOICE_FONT_BOLD : INVOICE_FONT)
    .fontSize(fontSize);
  doc.text(text, x, y, { width, align: 'right' });
  return y + doc.heightOfString(text, { width }) + 3;
}

function drawPartyBlock(
  doc: PDFKit.PDFDocument,
  section: InvoiceTemplateSection,
  data: InvoiceData,
  template: InvoiceTemplateConfig,
  x: number,
  y: number,
  width: number,
  boxHeight: number
): void {
  doc.rect(x, y, width, boxHeight).stroke('#e2e8f0');

  let lineY = y + 8;
  let isFirst = true;

  for (const field of section.fields) {
    const value = resolveFieldValue(field, data, template);
    if (!value) continue;

    const isNameField =
      field.dataKey === 'issuer.name' || field.dataKey === 'buyer.name' || field.dataKey === 'issuer.legalName';

    doc
      .fillColor('#111827')
      .font(isFirst && isNameField ? INVOICE_FONT_BOLD : INVOICE_FONT)
      .fontSize(isFirst && isNameField ? 10 : 8.5);

    doc.text(value, x + 8, lineY, { width: width - 16 });
    lineY += isFirst && isNameField ? 14 : 13;
    isFirst = false;
  }
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
  doc
    .fillColor('#111827')
    .font(options?.bold ? INVOICE_FONT_BOLD : INVOICE_FONT)
    .fontSize(9);
  for (const col of cols) {
    doc.text(col.text, col.x, y + 6, {
      width: col.width,
      align: col.align || 'left',
      lineBreak: false,
    });
  }
  return y + rowHeight;
}

function drawTotalRow(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  value: string,
  template: InvoiceTemplateConfig,
  options?: { bold?: boolean }
): number {
  const labelX = 340;
  const valueX = 455;
  const valueW = 90;
  const labelW = 108;

  doc
    .fillColor(options?.bold ? template.primaryColor : '#334155')
    .font(options?.bold ? INVOICE_FONT_BOLD : INVOICE_FONT)
    .fontSize(options?.bold ? 10 : 9);
  doc.text(label, labelX, y, { width: labelW, lineBreak: false });
  doc.text(value, valueX, y, { width: valueW, align: 'right', lineBreak: false });
  return y + (options?.bold ? 20 : 18);
}

function drawCustomBlocks(
  doc: PDFKit.PDFDocument,
  blocks: InvoiceCustomBlock[],
  position: InvoiceCustomBlockPosition,
  y: number
): number {
  const active = blocks.filter((b) => b.enabled && b.position === position);
  for (const block of active) {
    if (block.title.trim()) {
      doc.fillColor('#0f172a').font(INVOICE_FONT_BOLD).fontSize(11).text(block.title, 40, y);
      y += 16;
    }
    if (block.content.trim()) {
      doc.fillColor('#334155').font(INVOICE_FONT).fontSize(8.5).text(block.content, 48, y, { width: 500 });
      y += doc.heightOfString(block.content, { width: 500 }) + 12;
    }
  }
  return y;
}

const COLUMN_LAYOUT: Record<string, { x: number; width: number; align?: 'left' | 'right' | 'center' }> = {
  index: { x: 48, width: 24, align: 'center' },
  description: { x: 72, width: 200 },
  quantity: { x: 280, width: 40, align: 'center' },
  unitPrice: { x: 330, width: 80, align: 'right' },
  total: { x: 420, width: 80, align: 'right' },
};

function getLineItemCell(
  col: InvoiceLineItemColumn,
  item: InvoiceData['lineItems'][0],
  index: number
): string {
  switch (col.key) {
    case 'index':
      return String(index + 1);
    case 'description':
      return item.description;
    case 'quantity':
      return String(item.quantity);
    case 'unitPrice':
      return formatMoney(item.unitPrice, item.currency);
    case 'total':
      return formatMoney(item.total, item.currency);
    default:
      return '';
  }
}

export function generateInvoicePdfFromTemplate(
  data: InvoiceData,
  template: InvoiceTemplateConfig
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    registerInvoiceFonts(doc);

    const sellerSection = getSection(template, 'seller');
    const buyerSection = getSection(template, 'buyer');
    const subscriptionSection = getSection(template, 'subscription');
    const featuresSection = getSection(template, 'features');
    const lineItemsSection = getSection(template, 'lineItems');
    const totalsSection = getSection(template, 'totals');
    const footerSection = getSection(template, 'footer');

    const metaX = 300;
    const metaW = 275;

    doc.rect(0, 0, 595.28, 90).fill(template.headerBgColor);
    doc.fillColor('#ffffff').font(INVOICE_FONT_BOLD).fontSize(26).text(data.issuer.name, 40, 28);
    if (template.documentTitle.trim()) {
      doc.font(INVOICE_FONT).fontSize(10).text(template.documentTitle, 40, 62);
    }

    let metaY = 20;
    metaY = drawMetaLine(
      doc,
      `${template.invoiceNumberLabel}: ${data.invoiceNumber}`,
      metaX,
      metaY,
      metaW,
      { bold: true }
    );
    metaY = drawMetaLine(doc, `${template.dateLabel}: ${formatDate(data.issueDate)}`, metaX, metaY, metaW);
    if (template.showEttn) {
      metaY = drawMetaLine(doc, `${template.ettnLabel}: ${data.ettn}`, metaX, metaY, metaW);
    }
    drawMetaLine(doc, `${template.scenarioLabel}: ${template.scenario}`, metaX, metaY, metaW);

    let y = 110;

    if (sellerSection?.enabled || buyerSection?.enabled) {
      if (sellerSection?.enabled) {
        doc.fillColor('#111827').font(INVOICE_FONT_BOLD).fontSize(11).text(sellerSection.title, 40, y);
      }
      if (buyerSection?.enabled) {
        doc.text(buyerSection.title, 310, y);
      }
      y += 18;

      const boxHeight = 95;
      if (sellerSection?.enabled) {
        drawPartyBlock(doc, sellerSection, data, template, 40, y, 250, boxHeight);
      }
      if (buyerSection?.enabled) {
        drawPartyBlock(doc, buyerSection, data, template, 310, y, 245, boxHeight);
      }
      y += boxHeight + 15;
    }

    if (subscriptionSection?.enabled) {
      doc.fillColor(template.primaryColor).font(INVOICE_FONT_BOLD).fontSize(11).text(subscriptionSection.title, 40, y);
      y += 16;
      doc.rect(40, y, 515, 58).fill('#f8fafc').stroke('#e2e8f0');
      doc.fillColor('#334155').font(INVOICE_FONT).fontSize(8.5);

      let subY = y + 8;
      for (const field of subscriptionSection.fields) {
        const value = resolveFieldValue(field, data, template);
        if (!value) continue;
        doc.text(value, 48, subY, { width: 500 });
        subY += 14;
      }
      y += 74;
    }

    y = drawCustomBlocks(doc, template.customBlocks, 'after_subscription', y);

    if (featuresSection?.enabled && data.subscription.features.length > 0) {
      const title = featuresSection.title || template.featuresTitle;
      doc.font(INVOICE_FONT_BOLD).fontSize(9).fillColor('#111827').text(title, 40, y);
      y += 14;
      doc.font(INVOICE_FONT).fontSize(8).fillColor('#475569');
      const featureText = data.subscription.features.map((f) => `• ${f}`).join('\n');
      doc.text(featureText, 48, y, { width: 500 });
      y += doc.heightOfString(featureText, { width: 500 }) + 12;
    }

    y = drawCustomBlocks(doc, template.customBlocks, 'before_line_items', y);

    const enabledColumns = template.lineItemColumns.filter((c) => c.enabled);
    if (lineItemsSection?.enabled && enabledColumns.length > 0) {
      doc.fillColor(template.primaryColor).font(INVOICE_FONT_BOLD).fontSize(11).text(lineItemsSection.title, 40, y);
      y += 14;

      y = drawTableRow(
        doc,
        enabledColumns.map((col) => ({
          ...COLUMN_LAYOUT[col.key],
          text: col.label,
        })),
        y,
        { bold: true, fill: '#e2e8f0' }
      );

      data.lineItems.forEach((item, index) => {
        if (y > 700) {
          doc.addPage();
          registerInvoiceFonts(doc);
          y = 50;
        }
        y = drawTableRow(
          doc,
          enabledColumns.map((col) => ({
            ...COLUMN_LAYOUT[col.key],
            text: getLineItemCell(col, item, index),
          })),
          y
        );
        if (enabledColumns.some((c) => c.key === 'description') && item.detail) {
          doc.font(INVOICE_FONT).fontSize(7.5).fillColor('#64748b').text(item.detail, 72, y - 4, { width: 200 });
          y += 6;
        }
      });
    }

    y = drawCustomBlocks(doc, template.customBlocks, 'after_line_items', y);

    if (totalsSection?.enabled) {
      y += 10;
      const totalsTop = y;
      const boxHeight = template.showVatSuffix ? 62 : 50;
      doc.rect(330, totalsTop, 225, boxHeight).stroke('#e2e8f0');
      let totalsY = totalsTop + 10;
      totalsY = drawTotalRow(
        doc,
        totalsY,
        template.subtotalLabel,
        formatMoney(data.subtotal, data.currency),
        template
      );

      doc.fillColor(template.primaryColor).font(INVOICE_FONT_BOLD).fontSize(10);
      doc.text(template.grandTotalLabel, 340, totalsY, { width: 95, lineBreak: false });
      doc.text(formatMoney(data.grandTotal, data.currency), 455, totalsY, {
        width: 90,
        align: 'right',
        lineBreak: false,
      });
      if (template.showVatSuffix && template.vatSuffixText.trim()) {
        doc.fillColor('#64748b').font(INVOICE_FONT).fontSize(7.5);
        doc.text(template.vatSuffixText, 340, totalsY + 13, { width: 95, lineBreak: false });
      }
      y = totalsTop + boxHeight + 10;
    }

    y = drawCustomBlocks(doc, template.customBlocks, 'before_footer', y);

    if (footerSection?.enabled) {
      doc.font(INVOICE_FONT).fontSize(7.5).fillColor('#94a3b8');
      const footerText = (
        data.issuer.footerNote ||
        template.defaultFooterText.replace(/\{issuerName\}/g, data.issuer.name)
      ).trim();
      if (footerText) {
        doc.text(footerText, 40, y, { width: 515, align: 'center' });
        y += doc.heightOfString(footerText, { width: 515 }) + 8;
      }
      if (template.showFooterContact) {
        doc.text(`${data.issuer.website} · ${data.issuer.email}`, 40, y, { width: 515, align: 'center' });
      }
    }

    doc.end();
  });
}

export function buildPreviewInvoiceData(issuer: InvoiceData['issuer']): InvoiceData {
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 1);

  return {
    invoiceNumber: 'MKZ-20260702-ORNEK01',
    ettn: 'ORNEK-ETTN-00000000-0000-0000-0000-000000000001',
    issueDate: now,
    billingPeriod: 'monthly',
    issuer,
    buyer: {
      name: 'Örnek Diş Kliniği A.Ş.',
      email: 'ornek@klinik.com',
      phone: '0532 000 00 00',
      address: 'Örnek Mah. Demo Cad. No:1 İstanbul',
    },
    subscription: {
      planName: 'İşletme',
      planType: 'business',
      status: 'active',
      startsAt: now,
      endsAt,
      messagesLimit: 5000,
      usersLimit: 10,
      messagesUsed: 1250,
      features: ['WhatsApp AI yanıt', 'Randevu modülü', 'Bilgi bankası RAG', 'Canlı temsilci aktarımı'],
    },
    lineItems: [
      {
        description: 'İşletme — Aylık Abonelik',
        detail: '5.000 AI görüşme hakkı · 10 panel kullanıcısı',
        quantity: 1,
        unitPrice: 2990,
        total: 2990,
        currency: 'TRY',
      },
      {
        description: 'Kurulum Ücreti (tek seferlik)',
        detail: 'Tek seferlik kurulum ve devreye alma hizmeti',
        quantity: 1,
        unitPrice: 1500,
        total: 1500,
        currency: 'TRY',
      },
    ],
    subtotal: 4490,
    grandTotal: 4490,
    currency: 'TRY',
  };
}

/**
 * Fatura PDF şablonu — admin panelden tam düzenlenebilir
 */

export type InvoiceFieldDataKey =
  | 'static'
  | 'issuer.name'
  | 'issuer.legalName'
  | 'issuer.address'
  | 'issuer.taxOffice'
  | 'issuer.taxNumber'
  | 'issuer.email'
  | 'issuer.phone'
  | 'issuer.contact'
  | 'buyer.name'
  | 'buyer.address'
  | 'buyer.email'
  | 'buyer.phone'
  | 'meta.invoiceNumber'
  | 'meta.ettn'
  | 'meta.issueDate'
  | 'meta.scenario'
  | 'subscription.plan'
  | 'subscription.period'
  | 'subscription.startsAt'
  | 'subscription.endsAt'
  | 'subscription.status'
  | 'subscription.messagesLimit'
  | 'subscription.usersLimit'
  | 'subscription.messagesUsed';

export type InvoiceSectionKey =
  | 'seller'
  | 'buyer'
  | 'subscription'
  | 'features'
  | 'lineItems'
  | 'totals'
  | 'footer';

export type InvoiceCustomBlockPosition =
  | 'after_subscription'
  | 'before_line_items'
  | 'after_line_items'
  | 'before_footer';

export interface InvoiceTemplateField {
  id: string;
  label: string;
  dataKey: InvoiceFieldDataKey;
  enabled: boolean;
  /** dataKey === 'static' ise sabit metin */
  customValue?: string;
}

export interface InvoiceTemplateSection {
  key: InvoiceSectionKey;
  title: string;
  enabled: boolean;
  fields: InvoiceTemplateField[];
}

export type InvoiceLineItemColumnKey = 'index' | 'description' | 'quantity' | 'unitPrice' | 'total';

export interface InvoiceLineItemColumn {
  id: string;
  key: InvoiceLineItemColumnKey;
  label: string;
  enabled: boolean;
}

export interface InvoiceCustomBlock {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  position: InvoiceCustomBlockPosition;
}

export interface InvoiceTemplateConfig {
  documentTitle: string;
  scenario: string;
  scenarioLabel: string;
  invoiceNumberLabel: string;
  dateLabel: string;
  ettnLabel: string;
  showEttn: boolean;
  invoiceNumberPrefix: string;
  filenamePrefix: string;
  primaryColor: string;
  headerBgColor: string;
  vatSuffixText: string;
  showVatSuffix: boolean;
  subtotalLabel: string;
  grandTotalLabel: string;
  featuresTitle: string;
  defaultFooterText: string;
  showFooterContact: boolean;
  sections: InvoiceTemplateSection[];
  lineItemColumns: InvoiceLineItemColumn[];
  customBlocks: InvoiceCustomBlock[];
}

function field(
  id: string,
  label: string,
  dataKey: InvoiceFieldDataKey,
  enabled = true,
  customValue?: string
): InvoiceTemplateField {
  return { id, label, dataKey, enabled, customValue };
}

export const INVOICE_FIELD_OPTIONS: { key: InvoiceFieldDataKey; label: string }[] = [
  { key: 'static', label: 'Sabit metin' },
  { key: 'issuer.name', label: 'Satıcı — Ticari unvan' },
  { key: 'issuer.legalName', label: 'Satıcı — Yasal unvan' },
  { key: 'issuer.address', label: 'Satıcı — Adres' },
  { key: 'issuer.taxOffice', label: 'Satıcı — Vergi dairesi' },
  { key: 'issuer.taxNumber', label: 'Satıcı — VKN' },
  { key: 'issuer.email', label: 'Satıcı — E-posta' },
  { key: 'issuer.phone', label: 'Satıcı — Telefon' },
  { key: 'issuer.contact', label: 'Satıcı — E-posta · Telefon' },
  { key: 'buyer.name', label: 'Alıcı — Unvan' },
  { key: 'buyer.address', label: 'Alıcı — Adres' },
  { key: 'buyer.email', label: 'Alıcı — E-posta' },
  { key: 'buyer.phone', label: 'Alıcı — Telefon' },
  { key: 'meta.invoiceNumber', label: 'Fatura numarası' },
  { key: 'meta.ettn', label: 'ETTN' },
  { key: 'meta.issueDate', label: 'Fatura tarihi' },
  { key: 'meta.scenario', label: 'Senaryo' },
  { key: 'subscription.plan', label: 'Abonelik — Paket' },
  { key: 'subscription.period', label: 'Abonelik — Dönem' },
  { key: 'subscription.startsAt', label: 'Abonelik — Başlangıç' },
  { key: 'subscription.endsAt', label: 'Abonelik — Bitiş' },
  { key: 'subscription.status', label: 'Abonelik — Durum' },
  { key: 'subscription.messagesLimit', label: 'Abonelik — Mesaj limiti' },
  { key: 'subscription.usersLimit', label: 'Abonelik — Kullanıcı limiti' },
  { key: 'subscription.messagesUsed', label: 'Abonelik — Kullanılan mesaj' },
];

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplateConfig = {
  documentTitle: 'E-FATURA / E-ARŞİV FATURA',
  scenario: 'TEMELFATURA',
  scenarioLabel: 'Senaryo',
  invoiceNumberLabel: 'Fatura No',
  dateLabel: 'Tarih',
  ettnLabel: 'ETTN',
  showEttn: false,
  invoiceNumberPrefix: 'MKZ',
  filenamePrefix: 'MEKANIZMA-Fatura',
  primaryColor: '#0f172a',
  headerBgColor: '#0f172a',
  vatSuffixText: '(KDV Hariç)',
  showVatSuffix: true,
  subtotalLabel: 'Ara Toplam:',
  grandTotalLabel: 'GENEL TOPLAM',
  featuresTitle: 'Paket Özellikleri:',
  defaultFooterText:
    'Bu belge elektronik ortamda oluşturulmuş olup 5070 sayılı Elektronik İmza Kanunu kapsamında geçerlidir. {issuerName} WhatsApp AI SaaS abonelik hizmeti faturasıdır.',
  showFooterContact: true,
  sections: [
    {
      key: 'seller',
      title: 'SATICI BİLGİLERİ',
      enabled: true,
      fields: [
        field('s1', '', 'issuer.name'),
        field('s2', '', 'issuer.legalName'),
        field('s3', 'Adres:', 'issuer.address'),
        field('s4', 'Vergi Dairesi:', 'issuer.taxOffice'),
        field('s5', 'VKN:', 'issuer.taxNumber'),
        field('s6', '', 'issuer.contact'),
      ],
    },
    {
      key: 'buyer',
      title: 'ALICI BİLGİLERİ',
      enabled: true,
      fields: [
        field('b1', '', 'buyer.name'),
        field('b2', 'Adres:', 'buyer.address'),
        field('b3', 'E-posta:', 'buyer.email'),
        field('b4', 'Telefon:', 'buyer.phone'),
      ],
    },
    {
      key: 'subscription',
      title: 'ABONELİK DETAYLARI',
      enabled: true,
      fields: [
        field('sub1', 'Paket:', 'subscription.plan'),
        field('sub2', 'Dönem:', 'subscription.period'),
        field('sub3', 'Abonelik Başlangıç:', 'subscription.startsAt'),
        field('sub4', 'Abonelik Bitiş:', 'subscription.endsAt'),
      ],
    },
    {
      key: 'features',
      title: 'Paket Özellikleri',
      enabled: true,
      fields: [],
    },
    {
      key: 'lineItems',
      title: 'FATURA KALEMLERİ',
      enabled: true,
      fields: [],
    },
    {
      key: 'totals',
      title: 'Toplamlar',
      enabled: true,
      fields: [],
    },
    {
      key: 'footer',
      title: 'Alt bilgi',
      enabled: true,
      fields: [],
    },
  ],
  lineItemColumns: [
    { id: 'c1', key: 'index', label: '#', enabled: true },
    { id: 'c2', key: 'description', label: 'Açıklama', enabled: true },
    { id: 'c3', key: 'quantity', label: 'Adet', enabled: true },
    { id: 'c4', key: 'unitPrice', label: 'Birim Fiyat', enabled: true },
    { id: 'c5', key: 'total', label: 'Tutar', enabled: true },
  ],
  customBlocks: [],
};

export function mergeInvoiceTemplate(
  partial: Partial<InvoiceTemplateConfig> | null | undefined
): InvoiceTemplateConfig {
  if (!partial || typeof partial !== 'object') {
    return structuredClone(DEFAULT_INVOICE_TEMPLATE);
  }

  const base = structuredClone(DEFAULT_INVOICE_TEMPLATE);
  const merged: InvoiceTemplateConfig = {
    ...base,
    ...partial,
    sections: partial.sections?.length ? partial.sections : base.sections,
    lineItemColumns: partial.lineItemColumns?.length ? partial.lineItemColumns : base.lineItemColumns,
    customBlocks: partial.customBlocks ?? base.customBlocks,
  };

  return merged;
}

/**
 * Super admin — Fatura düzenleme (şablon + satıcı bilgileri)
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Save,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import { api } from '@/services/api';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
  Textarea,
  Badge,
} from '@/components/ui';
import type {
  InvoiceCustomBlock,
  InvoiceCustomBlockPosition,
  InvoiceIssuerSettings,
  InvoiceSettingsResponse,
  InvoiceTemplateConfig,
  InvoiceTemplateField,
  InvoiceTemplateSection,
} from '@/types';
import { cn } from '@/lib/utils';

const emptyIssuer: InvoiceIssuerSettings = {
  name: '',
  legalName: '',
  address: '',
  taxOffice: '',
  taxNumber: '',
  email: '',
  phone: '',
  website: '',
  vatRate: 0,
  footerNote: '',
};

const SECTION_LABEL_KEYS: Record<string, string> = {
  seller: 'admin.invoiceEditor.sectionSeller',
  buyer: 'admin.invoiceEditor.sectionBuyer',
  subscription: 'admin.invoiceEditor.sectionSubscription',
  features: 'admin.invoiceEditor.sectionFeatures',
  lineItems: 'admin.invoiceEditor.sectionLineItems',
  totals: 'admin.invoiceEditor.sectionTotals',
  footer: 'admin.invoiceEditor.sectionFooter',
};

const BLOCK_POSITION_KEYS: { value: InvoiceCustomBlockPosition; labelKey: string }[] = [
  { value: 'after_subscription', labelKey: 'admin.invoiceEditor.posAfterSubscription' },
  { value: 'before_line_items', labelKey: 'admin.invoiceEditor.posBeforeLineItems' },
  { value: 'after_line_items', labelKey: 'admin.invoiceEditor.posAfterLineItems' },
  { value: 'before_footer', labelKey: 'admin.invoiceEditor.posBeforeFooter' },
];

function newId(): string {
  return crypto.randomUUID();
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
      />
      {label}
    </label>
  );
}

export function AdminInvoiceEditorPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [issuer, setIssuer] = useState<InvoiceIssuerSettings>(emptyIssuer);
  const [template, setTemplate] = useState<InvoiceTemplateConfig | null>(null);
  const [fieldOptions, setFieldOptions] = useState<InvoiceSettingsResponse['fieldOptions']>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ document: true, issuer: true });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invoice-settings'],
    queryFn: () => api.get<InvoiceSettingsResponse>('/admin/invoice-settings'),
  });

  useEffect(() => {
    if (data) {
      setIssuer({ ...data.issuer, footerNote: data.issuer.footerNote || '' });
      setTemplate(data.template);
      setFieldOptions(data.fieldOptions || []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<InvoiceSettingsResponse>('/admin/invoice-settings', {
        issuer: { ...issuer, footerNote: issuer.footerNote?.trim() || null },
        template,
      }),
    onSuccess: (saved) => {
      setFeedback({ type: 'success', text: t('admin.invoiceEditor.saved') });
      setIssuer({ ...saved.issuer, footerNote: saved.issuer.footerNote || '' });
      setTemplate(saved.template);
      queryClient.invalidateQueries({ queryKey: ['admin-invoice-settings'] });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('admin.invoiceEditor.saveError'),
      });
    },
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateTemplate = (patch: Partial<InvoiceTemplateConfig>) => {
    if (!template) return;
    setTemplate({ ...template, ...patch });
  };

  const updateSection = (key: string, patch: Partial<InvoiceTemplateSection>) => {
    if (!template) return;
    setTemplate({
      ...template,
      sections: template.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    });
  };

  const updateSectionField = (sectionKey: string, fieldId: string, patch: Partial<InvoiceTemplateField>) => {
    if (!template) return;
    setTemplate({
      ...template,
      sections: template.sections.map((s) =>
        s.key === sectionKey
          ? {
              ...s,
              fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
            }
          : s
      ),
    });
  };

  const addSectionField = (sectionKey: string) => {
    if (!template) return;
    const field: InvoiceTemplateField = {
      id: newId(),
      label: '',
      dataKey: 'static',
      enabled: true,
      customValue: '',
    };
    updateSection(sectionKey, {
      fields: [...(template.sections.find((s) => s.key === sectionKey)?.fields || []), field],
    });
  };

  const removeSectionField = (sectionKey: string, fieldId: string) => {
    if (!template) return;
    const section = template.sections.find((s) => s.key === sectionKey);
    if (!section) return;
    updateSection(sectionKey, { fields: section.fields.filter((f) => f.id !== fieldId) });
  };

  const moveField = (sectionKey: string, fieldId: string, dir: -1 | 1) => {
    if (!template) return;
    const section = template.sections.find((s) => s.key === sectionKey);
    if (!section) return;
    const idx = section.fields.findIndex((f) => f.id === fieldId);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= section.fields.length) return;
    const fields = [...section.fields];
    [fields[idx], fields[next]] = [fields[next], fields[idx]];
    updateSection(sectionKey, { fields });
  };

  const addCustomBlock = () => {
    if (!template) return;
    const block: InvoiceCustomBlock = {
      id: newId(),
      title: '',
      content: '',
      enabled: true,
      position: 'before_footer',
    };
    updateTemplate({ customBlocks: [...template.customBlocks, block] });
  };

  const updateCustomBlock = (id: string, patch: Partial<InvoiceCustomBlock>) => {
    if (!template) return;
    updateTemplate({
      customBlocks: template.customBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  };

  const removeCustomBlock = (id: string) => {
    if (!template) return;
    updateTemplate({ customBlocks: template.customBlocks.filter((b) => b.id !== id) });
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setFeedback(null);
    try {
      await api.downloadBlob('/admin/invoice-preview', 'Fatura-Onizleme.pdf');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : t('admin.invoiceEditor.previewError'),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  if (isLoading || !template) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.invoiceEditor.title')}
        description={t('admin.invoiceEditor.description')}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={handlePreview}
              disabled={previewLoading || saveMutation.isPending}
            >
              {previewLoading ? <Spinner /> : <Download className="h-4 w-4" />}
              {t('admin.invoiceEditor.preview')}
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setFeedback(null);
                saveMutation.mutate();
              }}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
              {t('admin.invoiceEditor.save')}
            </Button>
          </div>
        }
      />

      {feedback && (
        <p className={`text-sm ${feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {feedback.text}
        </p>
      )}

      {/* Belge ayarları */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4 text-left"
          onClick={() => toggleSection('document')}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            {t('admin.invoiceEditor.documentSettings')}
          </CardTitle>
          {openSections.document ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
        {openSections.document && (
          <CardContent className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('admin.invoiceEditor.documentTitle')}</Label>
                <Input
                  value={template.documentTitle}
                  onChange={(e) => updateTemplate({ documentTitle: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.scenario')}</Label>
                <Input value={template.scenario} onChange={(e) => updateTemplate({ scenario: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.scenarioLabel')}</Label>
                <Input
                  value={template.scenarioLabel}
                  onChange={(e) => updateTemplate({ scenarioLabel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.invoiceNumberLabel')}</Label>
                <Input
                  value={template.invoiceNumberLabel}
                  onChange={(e) => updateTemplate({ invoiceNumberLabel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.dateLabel')}</Label>
                <Input value={template.dateLabel} onChange={(e) => updateTemplate({ dateLabel: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.ettnLabel')}</Label>
                <Input value={template.ettnLabel} onChange={(e) => updateTemplate({ ettnLabel: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.invoicePrefix')}</Label>
                <Input
                  value={template.invoiceNumberPrefix}
                  onChange={(e) => updateTemplate({ invoiceNumberPrefix: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.filenamePrefix')}</Label>
                <Input
                  value={template.filenamePrefix}
                  onChange={(e) => updateTemplate({ filenamePrefix: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.primaryColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={template.primaryColor}
                    onChange={(e) => updateTemplate({ primaryColor: e.target.value })}
                    className="h-10 w-14 shrink-0 p-1"
                  />
                  <Input
                    value={template.primaryColor}
                    onChange={(e) => updateTemplate({ primaryColor: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.headerColor')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={template.headerBgColor}
                    onChange={(e) => updateTemplate({ headerBgColor: e.target.value })}
                    className="h-10 w-14 shrink-0 p-1"
                  />
                  <Input
                    value={template.headerBgColor}
                    onChange={(e) => updateTemplate({ headerBgColor: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <Toggle
                checked={template.showEttn}
                onChange={(v) => updateTemplate({ showEttn: v })}
                label={t('admin.invoiceEditor.showEttn')}
              />
              <Toggle
                checked={template.showVatSuffix}
                onChange={(v) => updateTemplate({ showVatSuffix: v })}
                label={t('admin.invoiceEditor.showVatSuffix')}
              />
              <Toggle
                checked={template.showFooterContact}
                onChange={(v) => updateTemplate({ showFooterContact: v })}
                label={t('admin.invoiceEditor.showFooterContact')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.subtotalLabel')}</Label>
                <Input
                  value={template.subtotalLabel}
                  onChange={(e) => updateTemplate({ subtotalLabel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.grandTotalLabel')}</Label>
                <Input
                  value={template.grandTotalLabel}
                  onChange={(e) => updateTemplate({ grandTotalLabel: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.vatSuffix')}</Label>
                <Input
                  value={template.vatSuffixText}
                  onChange={(e) => updateTemplate({ vatSuffixText: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.featuresTitle')}</Label>
                <Input
                  value={template.featuresTitle}
                  onChange={(e) => updateTemplate({ featuresTitle: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('admin.invoiceEditor.defaultFooter')}</Label>
                <Textarea
                  rows={3}
                  value={template.defaultFooterText}
                  onChange={(e) => updateTemplate({ defaultFooterText: e.target.value })}
                  placeholder="{issuerName}"
                />
                <p className="text-xs text-slate-500">{t('admin.invoiceEditor.footerHint')}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Satıcı bilgileri */}
      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between px-6 py-4 text-left"
          onClick={() => toggleSection('issuer')}
        >
          <CardTitle className="text-base">{t('admin.invoiceEditor.issuerTitle')}</CardTitle>
          {openSections.issuer ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>
        {openSections.issuer && (
          <CardContent className="space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('admin.settings.issuerName')}</Label>
                <Input value={issuer.name} onChange={(e) => setIssuer({ ...issuer, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.legalName')}</Label>
                <Input value={issuer.legalName} onChange={(e) => setIssuer({ ...issuer, legalName: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('admin.settings.address')}</Label>
                <Input value={issuer.address} onChange={(e) => setIssuer({ ...issuer, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.taxOffice')}</Label>
                <Input value={issuer.taxOffice} onChange={(e) => setIssuer({ ...issuer, taxOffice: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.taxNumber')}</Label>
                <Input value={issuer.taxNumber} onChange={(e) => setIssuer({ ...issuer, taxNumber: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.email')}</Label>
                <Input type="email" value={issuer.email} onChange={(e) => setIssuer({ ...issuer, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.phone')}</Label>
                <Input value={issuer.phone} onChange={(e) => setIssuer({ ...issuer, phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.settings.website')}</Label>
                <Input value={issuer.website} onChange={(e) => setIssuer({ ...issuer, website: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.vatRate')}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={issuer.vatRate}
                  onChange={(e) => setIssuer({ ...issuer, vatRate: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t('admin.settings.footerNote')}</Label>
                <Textarea
                  rows={2}
                  value={issuer.footerNote || ''}
                  onChange={(e) => setIssuer({ ...issuer, footerNote: e.target.value })}
                  placeholder={t('admin.settings.footerNotePlaceholder')}
                />
                <p className="text-xs text-slate-500">{t('admin.invoiceEditor.footerNoteHint')}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Bölümler */}
      {template.sections.map((section) => (
        <Card key={section.key}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
            onClick={() => toggleSection(section.key)}
          >
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">
                {t(SECTION_LABEL_KEYS[section.key] || section.key)}
              </CardTitle>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant={section.enabled ? 'success' : 'default'}>
                  {section.enabled ? t('admin.invoiceEditor.enabled') : t('admin.invoiceEditor.disabled')}
                </Badge>
                {section.fields.length > 0 && (
                  <Badge variant="info">{section.fields.length} {t('admin.invoiceEditor.fields')}</Badge>
                )}
              </div>
            </div>
            {openSections[section.key] ? <ChevronUp className="h-5 w-5 shrink-0" /> : <ChevronDown className="h-5 w-5 shrink-0" />}
          </button>
          {openSections[section.key] && (
            <CardContent className="space-y-4 border-t border-slate-100 pt-4">
              <Toggle
                checked={section.enabled}
                onChange={(v) => updateSection(section.key, { enabled: v })}
                label={t('admin.invoiceEditor.sectionVisible')}
              />
              <div className="space-y-2">
                <Label>{t('admin.invoiceEditor.sectionTitle')}</Label>
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(section.key, { title: e.target.value })}
                />
              </div>

              {section.key !== 'lineItems' && section.key !== 'totals' && section.key !== 'footer' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t('admin.invoiceEditor.sectionFields')}</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => addSectionField(section.key)}>
                      <Plus className="h-4 w-4" />
                      {t('admin.invoiceEditor.addField')}
                    </Button>
                  </div>
                  {section.fields.length === 0 && (
                    <p className="text-sm text-slate-500">{t('admin.invoiceEditor.noFields')}</p>
                  )}
                  {section.fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className={cn(
                        'rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3',
                        !field.enabled && 'opacity-60'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-slate-400">
                          <GripVertical className="h-4 w-4" />
                          <span className="text-xs font-medium">#{idx + 1}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === 0}
                            onClick={() => moveField(section.key, field.id, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={idx === section.fields.length - 1}
                            onClick={() => moveField(section.key, field.id, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-rose-600"
                            onClick={() => removeSectionField(section.key, field.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <Toggle
                        checked={field.enabled}
                        onChange={(v) => updateSectionField(section.key, field.id, { enabled: v })}
                        label={t('admin.invoiceEditor.fieldVisible')}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('admin.invoiceEditor.fieldLabel')}</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => updateSectionField(section.key, field.id, { label: e.target.value })}
                            placeholder={t('admin.invoiceEditor.fieldLabelPlaceholder')}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('admin.invoiceEditor.fieldData')}</Label>
                          <select
                            value={field.dataKey}
                            onChange={(e) =>
                              updateSectionField(section.key, field.id, {
                                dataKey: e.target.value as InvoiceTemplateField['dataKey'],
                              })
                            }
                            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                          >
                            {fieldOptions.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        {field.dataKey === 'static' && (
                          <div className="space-y-2 sm:col-span-2">
                            <Label>{t('admin.invoiceEditor.staticText')}</Label>
                            <Input
                              value={field.customValue || ''}
                              onChange={(e) =>
                                updateSectionField(section.key, field.id, { customValue: e.target.value })
                              }
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* Tablo sütunları */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.invoiceEditor.columnsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {template.lineItemColumns.map((col) => (
            <div key={col.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
              <Toggle
                checked={col.enabled}
                onChange={(v) =>
                  updateTemplate({
                    lineItemColumns: template.lineItemColumns.map((c) =>
                      c.id === col.id ? { ...c, enabled: v } : c
                    ),
                  })
                }
                label={col.key}
              />
              <div className="space-y-1 sm:col-span-2">
                <Label>{t('admin.invoiceEditor.columnLabel')}</Label>
                <Input
                  value={col.label}
                  onChange={(e) =>
                    updateTemplate({
                      lineItemColumns: template.lineItemColumns.map((c) =>
                        c.id === col.id ? { ...c, label: e.target.value } : c
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Özel bloklar */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">{t('admin.invoiceEditor.customBlocksTitle')}</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={addCustomBlock}>
            <Plus className="h-4 w-4" />
            {t('admin.invoiceEditor.addBlock')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {template.customBlocks.length === 0 && (
            <p className="text-sm text-slate-500">{t('admin.invoiceEditor.noBlocks')}</p>
          )}
          {template.customBlocks.map((block) => (
            <div key={block.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <Toggle
                  checked={block.enabled}
                  onChange={(v) => updateCustomBlock(block.id, { enabled: v })}
                  label={t('admin.invoiceEditor.blockVisible')}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-rose-600"
                  onClick={() => removeCustomBlock(block.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('admin.invoiceEditor.blockTitle')}</Label>
                  <Input
                    value={block.title}
                    onChange={(e) => updateCustomBlock(block.id, { title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.invoiceEditor.blockPosition')}</Label>
                  <select
                    value={block.position}
                    onChange={(e) =>
                      updateCustomBlock(block.id, {
                        position: e.target.value as InvoiceCustomBlockPosition,
                      })
                    }
                    className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  >
                    {BLOCK_POSITION_KEYS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {t(p.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t('admin.invoiceEditor.blockContent')}</Label>
                  <Textarea
                    rows={3}
                    value={block.content}
                    onChange={(e) => updateCustomBlock(block.id, { content: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 pb-8 sm:flex-row">
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={handlePreview}
          disabled={previewLoading || saveMutation.isPending}
        >
          {previewLoading ? <Spinner /> : <Download className="h-4 w-4" />}
          {t('admin.invoiceEditor.preview')}
        </Button>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setFeedback(null);
            saveMutation.mutate();
          }}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? <Spinner /> : <Save className="h-4 w-4" />}
          {t('admin.invoiceEditor.save')}
        </Button>
      </div>
    </div>
  );
}

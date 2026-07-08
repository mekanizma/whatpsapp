/**
 * Açılır paket seçici — başvuru formu (sektör alanı ile uyumlu)
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BillingPeriodToggle } from '@/components/BillingPeriodToggle';
import { Spinner } from '@/components/ui';
import {
  formatPlanPrice,
  isHighlightedPlan,
  planHasYearlyPrice,
  resolvePlanDisplayPrice,
} from '@/lib/plan-format';
import { localizePlan, resolveLocaleFromLanguage } from '@/lib/plan-localize';
import type { BillingPeriod } from '@/lib/plan-format';
import type { PlanCardData } from '@/components/PlanCard';
import { cn } from '@/lib/utils';

const triggerClassName =
  'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-primary/20';

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

interface PlanPickerProps {
  id?: string;
  plans: PlanCardData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  billingPeriod: BillingPeriod;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  loading?: boolean;
  className?: string;
}

export function PlanPicker({
  id,
  plans,
  selectedId,
  onSelect,
  billingPeriod,
  onBillingPeriodChange,
  loading,
  className,
}: PlanPickerProps) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocaleFromLanguage(i18n.language);
  const fallbackId = useId();
  const pickerId = id || fallbackId;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

  const showBillingToggle = useMemo(() => plans.some(planHasYearlyPrice), [plans]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedId) ?? null,
    [plans, selectedId]
  );

  const selectedSummary = useMemo(() => {
    if (!selectedPlan) return t('auth.selectPlanPlaceholder');
    const displayPlan = localizePlan(selectedPlan, i18n.language);
    const { price, period } = resolvePlanDisplayPrice(selectedPlan, billingPeriod);
    const formattedPrice = formatPlanPrice(price, selectedPlan.currency || 'TRY', locale);
    const periodLabel = period === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth');
    return `${displayPlan.name} · ${formattedPrice} ${periodLabel}`;
  }, [selectedPlan, billingPeriod, i18n.language, locale, t]);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 4;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    const maxHeight = Math.min(
      280,
      Math.max(160, (openUp ? spaceAbove : spaceBelow) - gap)
    );

    setPanelPosition({
      top: openUp ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
      placement: openUp ? 'top' : 'bottom',
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelPosition(null);
      return;
    }

    updatePanelPosition();
    const handleLayout = () => updatePanelPosition();

    window.addEventListener('resize', handleLayout);
    window.addEventListener('scroll', handleLayout, true);
    return () => {
      window.removeEventListener('resize', handleLayout);
      window.removeEventListener('scroll', handleLayout, true);
    };
  }, [open, updatePanelPosition, billingPeriod, plans.length]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (planId: string) => {
    onSelect(planId);
    setOpen(false);
  };

  if (loading) {
    return (
      <div
        className={cn(
          'flex h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-500',
          className
        )}
      >
        <Spinner className="h-4 w-4" />
        <span className="truncate">{t('auth.plansLoading')}</span>
      </div>
    );
  }

  if (!plans.length) {
    return (
      <p
        className={cn(
          'rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800',
          className
        )}
      >
        {t('auth.plansUnavailable')}
      </p>
    );
  }

  const panel =
    open && panelPosition
      ? createPortal(
          <div
            ref={panelRef}
            id={`${pickerId}-listbox`}
            role="listbox"
            aria-label={t('auth.selectPlan')}
            style={{
              position: 'fixed',
              top: panelPosition.top,
              left: panelPosition.left,
              width: panelPosition.width,
              maxHeight: panelPosition.maxHeight,
              transform: panelPosition.placement === 'top' ? 'translateY(-100%)' : undefined,
              zIndex: 200,
            }}
            className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-300/30"
          >
            {showBillingToggle && (
              <div className="shrink-0 border-b border-slate-100 bg-slate-50/90 p-2">
                <BillingPeriodToggle
                  value={billingPeriod}
                  onChange={onBillingPeriodChange}
                  className="w-full max-w-none"
                />
              </div>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              {plans.map((plan) => {
                const displayPlan = localizePlan(plan, i18n.language);
                const selected = plan.id === selectedId;
                const highlighted = isHighlightedPlan(plan, plans);
                const { price, period } = resolvePlanDisplayPrice(plan, billingPeriod);
                const formattedPrice = formatPlanPrice(price, plan.currency || 'TRY', locale);
                const periodLabel =
                  period === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth');

                const messageLabel =
                  plan.message_limit >= 999999
                    ? t('subscription.unlimitedMessages')
                    : plan.message_limit === 1
                      ? t('subscription.messageOne')
                      : t('subscription.messages', {
                          count: plan.message_limit.toLocaleString(locale),
                        });

                return (
                  <li key={plan.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => plan.id && handleSelect(plan.id)}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition',
                        selected ? 'bg-primary/8' : 'hover:bg-slate-50'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-primary bg-primary text-white' : 'border-slate-300 bg-white'
                        )}
                        aria-hidden
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className="truncate font-medium text-slate-900">{displayPlan.name}</span>
                          {highlighted && (
                            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-emerald-700">
                              {t('pricing.mostPopular')}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="truncate">{messageLabel}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                            {formattedPrice}
                            <span className="ml-1 font-normal text-slate-400">{periodLabel}</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={cn('min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={pickerId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${pickerId}-listbox`}
        onClick={() => setOpen((value) => !value)}
        className={cn(triggerClassName, open && 'border-primary/40 ring-2 ring-primary/15')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Package className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className={cn('truncate', !selectedPlan && 'text-slate-500')}>
            {selectedSummary}
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {panel}
    </div>
  );
}

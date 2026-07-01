/**
 * Ek AI görüşme paketi kartı
 */

import { MessageSquare, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import { formatPlanPrice } from '@/lib/plan-format';
import type { AiConversationAddon } from '@/types';
import { cn } from '@/lib/utils';

interface AiAddonCardProps {
  addon: AiConversationAddon;
  locale: string;
  onPurchase?: (addonId: string) => void;
  purchasing?: boolean;
  className?: string;
}

export function AiAddonCard({
  addon,
  locale,
  onPurchase,
  purchasing,
  className,
}: AiAddonCardProps) {
  const { t } = useTranslation();

  return (
    <Card className={cn('flex h-full flex-col overflow-hidden', className)}>
      <CardContent className="flex h-full flex-col p-5 sm:p-6">
        <Badge variant="info" className="mb-3 w-fit">
          {t('subscription.addonBadge')}
        </Badge>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">{addon.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {t('subscription.addonConversations', {
                count: addon.conversation_count.toLocaleString(locale),
              })}
            </p>
          </div>
        </div>

        <div className="mb-5 border-b border-slate-100 pb-5">
          <p className="text-2xl font-bold text-slate-900">
            {formatPlanPrice(addon.price, addon.currency, locale)}
          </p>
          <p className="text-sm text-slate-500">{t('subscription.addonOneTime')}</p>
        </div>

        {onPurchase && (
          <Button
            className="mt-auto w-full"
            onClick={() => onPurchase(addon.id)}
            disabled={purchasing}
          >
            <ShoppingCart className="h-4 w-4" />
            {purchasing ? t('subscription.addonPurchasing') : t('subscription.addonPurchase')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

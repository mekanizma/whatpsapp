/**
 * Super admin firma panelinde impersonation uyarı bandı
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';

export function ImpersonationBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isImpersonating, impersonatedCompanyName, stopImpersonation } = useAuthStore();

  if (!isImpersonating) return null;

  const handleExit = async () => {
    await stopImpersonation();
    navigate('/admin');
  };

  return (
    <div className="sticky top-0 z-40 border-b border-amber-300/80 bg-amber-50 px-3 py-2.5 sm:px-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 sm:mt-0" />
          <p className="text-sm text-amber-950">
            <span className="font-semibold">{t('admin.impersonation.bannerTitle')}</span>
            {' — '}
            <span className="font-medium">{impersonatedCompanyName}</span>
            <span className="mt-0.5 block text-xs text-amber-800/90 sm:mt-0 sm:inline sm:ml-1">
              {t('admin.impersonation.bannerDesc')}
            </span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full min-h-[40px] shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 sm:w-auto"
          onClick={handleExit}
        >
          <X className="h-4 w-4" />
          {t('admin.impersonation.exit')}
        </Button>
      </div>
    </div>
  );
}

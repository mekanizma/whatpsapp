/**
 * TR / EN dil seçici — auth ve panel layout'larda kullanılır
 */

import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'light' | 'dark' | 'auth' | 'header';

interface LanguageSwitcherProps {
  variant?: Variant;
  className?: string;
}

export function LanguageSwitcher({ variant = 'light', className }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.startsWith('en') ? 'en' : 'tr';

  const setLang = (lng: 'tr' | 'en') => {
    if (lng !== current) i18n.changeLanguage(lng);
  };

  const baseBtn =
    variant === 'header'
      ? 'text-slate-400 hover:text-slate-200'
      : variant === 'dark'
        ? 'text-slate-400 hover:text-white hover:bg-white/10'
        : variant === 'auth'
          ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  const activeBtn =
    variant === 'header'
      ? 'bg-white/12 text-white shadow-sm shadow-black/20'
      : variant === 'dark'
        ? 'bg-white/15 text-white'
        : variant === 'auth'
          ? 'bg-primary/10 text-primary font-semibold'
          : 'bg-primary/10 text-primary font-semibold';

  const borderClass =
    variant === 'dark' || variant === 'header'
      ? 'border-white/10'
      : 'border-slate-200/80';

  if (variant === 'header') {
    return (
      <div
        className={cn('site-header-lang', className)}
        role="group"
        aria-label={t('common.language')}
      >
        <div className="site-header-lang-track">
          {(['tr', 'en'] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              onClick={() => setLang(lng)}
              className={cn(
                'site-header-lang-btn',
                current === lng ? activeBtn : baseBtn
              )}
            >
              {lng}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="group"
      aria-label={t('common.language')}
    >
      <Globe className={cn('h-4 w-4 shrink-0', variant === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
      <div className={cn('flex rounded-lg border p-0.5', borderClass)}>
        {(['tr', 'en'] as const).map((lng) => (
          <button
            key={lng}
            type="button"
            onClick={() => setLang(lng)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium uppercase transition-colors',
              current === lng ? activeBtn : baseBtn
            )}
          >
            {lng}
          </button>
        ))}
      </div>
    </div>
  );
}

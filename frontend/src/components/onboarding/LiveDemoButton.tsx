import { ArrowUpRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { buildLiveDemoWhatsAppUrl } from '@/lib/platform';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

type LiveDemoVariant = 'card' | 'button';

interface LiveDemoButtonProps {
  className?: string;
  variant?: LiveDemoVariant;
  showHint?: boolean;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function LiveDemoButton({
  className,
  variant = 'card',
  showHint = true,
}: LiveDemoButtonProps) {
  const { t } = useTranslation();
  const href = buildLiveDemoWhatsAppUrl(t('onboarding.liveDemo.prefillMessage'));
  const label = t('onboarding.liveDemo.button');

  if (variant === 'button') {
    return (
      <Button
        asChild
        size="lg"
        className={cn(
          'landing-live-demo-btn group h-12 w-full rounded-full px-8 text-sm font-semibold sm:w-auto',
          className
        )}
      >
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
          <WhatsAppIcon className="h-4 w-4 shrink-0" />
          {label}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-70 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
        </a>
      </Button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={cn('landing-live-demo-card group', className)}
    >
      <span className="landing-live-demo-card-glow" aria-hidden />
      <span className="landing-live-demo-card-shine" aria-hidden />

      <span className="landing-live-demo-card-inner">
        <span className="landing-live-demo-badge">
          <Sparkles className="h-3 w-3 text-[#6ee7b7]" aria-hidden />
          <span className="landing-live-demo-live-dot" aria-hidden />
          {t('onboarding.liveDemo.badge')}
        </span>

        {showHint && (
          <span className="landing-live-demo-copy">
            <span className="landing-live-demo-lead">{t('onboarding.liveDemo.hintLead')}</span>
            <span className="landing-live-demo-body">{t('onboarding.liveDemo.hintBody')}</span>
          </span>
        )}

        <span className="landing-live-demo-cta">
          <span className="landing-live-demo-cta-icon">
            <WhatsAppIcon className="h-4 w-4" />
          </span>
          <span className="landing-live-demo-cta-label">{label}</span>
          <ArrowUpRight
            className="landing-live-demo-cta-arrow h-4 w-4"
            aria-hidden
          />
        </span>
      </span>
    </a>
  );
}

export function LiveDemoHint({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <p className={cn('landing-live-demo-hint', className)}>
      <span className="block font-medium text-slate-300">{t('onboarding.liveDemo.hintLead')}</span>
      <span className="mt-1 block">{t('onboarding.liveDemo.hintBody')}</span>
    </p>
  );
}

/**
 * Şirket logosu — görüntüleme ve yedek (fallback) avatar
 */

import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

type CompanyLogoSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<CompanyLogoSize, string> = {
  sm: 'h-11 w-11 rounded-xl text-sm',
  md: 'h-16 w-16 rounded-2xl text-lg',
  lg: 'h-24 w-24 rounded-2xl text-2xl',
};

interface CompanyLogoProps {
  logo?: string | null;
  companyName?: string | null;
  size?: CompanyLogoSize;
  className?: string;
  imageClassName?: string;
  showFallbackIcon?: boolean;
}

export function CompanyLogo({
  logo,
  companyName,
  size = 'sm',
  className,
  imageClassName,
  showFallbackIcon = true,
}: CompanyLogoProps) {
  const initial = companyName?.trim().charAt(0)?.toUpperCase() || '?';
  const sizeClass = sizeClasses[size];

  if (logo) {
    return (
      <div
        className={cn(
          'sidebar-premium-logo shrink-0 overflow-hidden p-0.5',
          sizeClass,
          className,
        )}
      >
        <img
          src={logo}
          alt={companyName || 'Logo'}
          className={cn('h-full w-full rounded-[inherit] object-cover', imageClassName)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'sidebar-premium-logo flex shrink-0 items-center justify-center font-bold text-accent',
        sizeClass,
        className,
      )}
    >
      {showFallbackIcon ? (
        <MessageSquare className={cn(size === 'sm' ? 'h-5 w-5' : size === 'md' ? 'h-7 w-7' : 'h-10 w-10', 'text-white drop-shadow-[0_0_10px_rgb(37_211_102/0.6)]')} />
      ) : (
        <span className="text-white">{initial}</span>
      )}
    </div>
  );
}

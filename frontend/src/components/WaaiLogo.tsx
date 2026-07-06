/**
 * WAAI marka logosu
 */

import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'h-10 max-w-[8rem]',
  md: 'h-12 max-w-[10rem]',
  lg: 'h-14 max-w-[12rem]',
  xl: 'h-16 max-w-[14rem]',
  '2xl': 'h-20 max-w-[17rem]',
} as const;

interface WaaiLogoProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function WaaiLogo({ size = 'md', className }: WaaiLogoProps) {
  return (
    <img
      src="/waai-logo.png"
      alt="WAAI AI Assistant"
      className={cn('w-auto object-contain object-left', SIZES[size], className)}
      draggable={false}
      loading="eager"
      fetchPriority="high"
    />
  );
}

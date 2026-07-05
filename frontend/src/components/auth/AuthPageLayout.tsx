/**
 * Auth sayfa düzeni — sabit iki kolon (desktop), kaydırılabilir mobil
 */

import type { ReactNode } from 'react';
import { AuthMobileBanner, AuthShowcase, type AuthVariant } from './AuthShowcase';

interface AuthPageLayoutProps {
  variant: AuthVariant;
  children: ReactNode;
}

export function AuthPageLayout({ variant, children }: AuthPageLayoutProps) {
  return (
    <div className="auth-page app-shell fixed inset-0 flex min-h-[100dvh] w-full max-w-[100dvw] flex-col overflow-x-clip overflow-y-auto overscroll-y-contain lg:h-[100dvh] lg:flex-row lg:overflow-hidden">
      <AuthMobileBanner variant={variant} />

      <div className="hidden h-[100dvh] w-1/2 shrink-0 lg:block">
        <AuthShowcase variant={variant} />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-y-contain lg:h-full lg:w-1/2 lg:overscroll-contain">
        {children}
      </div>
    </div>
  );
}

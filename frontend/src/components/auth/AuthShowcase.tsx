/**
 * Auth sayfaları — animasyonlu showcase paneli
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot, Headphones, MessageSquare, BarChart3, Shield,
  Sparkles, Clock, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SiteHeader } from '@/components/SiteHeader';

export type AuthVariant = 'customer' | 'admin';

interface AuthShowcaseProps {
  variant: AuthVariant;
}

const CUSTOMER_ICONS = [Bot, Headphones, Clock, Sparkles];
const ADMIN_ICONS = [Users, BarChart3, Shield, Sparkles];

interface ChatMessage {
  from: string;
  text: string;
}

function MarqueeRow({ items, reverse = false, className }: { items: string[]; reverse?: boolean; className?: string }) {
  const doubled = [...items, ...items];
  return (
    <div className={cn('overflow-hidden', className)}>
      <div
        className={cn(
          'flex w-max gap-3',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        )}
      >
        {doubled.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChatMockup({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const chatMessages = t('showcase.chatMessages', { returnObjects: true }) as ChatMessage[];
  const [shown, setShown] = useState(1);

  useEffect(() => {
    if (shown >= chatMessages.length) {
      const timer = setTimeout(() => setShown(1), 2500);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setShown((s) => s + 1), 1400);
    return () => clearTimeout(timer);
  }, [shown, chatMessages.length]);

  return (
    <div
      className={cn(
        'relative z-20 mx-auto w-full',
        compact ? 'max-w-[280px]' : 'max-w-sm'
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-teal-400/30 bg-slate-900 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="flex items-center gap-2 border-b border-white/10 bg-teal-900/40 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-[#25d366]" />
            <span className="text-xs font-semibold text-white">{t('showcase.whatsappAi')}</span>
          </div>
        </div>
        <div
          className={cn(
            'flex flex-col justify-end space-y-2.5 bg-slate-900 p-3',
            compact ? 'min-h-[180px]' : 'min-h-[220px]'
          )}
        >
          {chatMessages.slice(0, shown).map((msg, i) => (
            <div
              key={`${msg.text}-${i}`}
              className={cn(
                'max-w-[88%] animate-chat-in rounded-2xl px-3 py-2 text-sm leading-snug',
                msg.from === 'customer'
                  ? 'ml-auto rounded-br-sm bg-[#25d366] text-white'
                  : 'mr-auto rounded-bl-sm bg-slate-700 text-white'
              )}
            >
              {msg.text}
            </div>
          ))}
          {shown < chatMessages.length && shown > 0 && (
            <div className="mr-auto flex gap-1 rounded-2xl rounded-bl-sm bg-slate-700 px-3 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/60 [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminDashboardMockup() {
  const { t } = useTranslation();
  const bars = [40, 65, 45, 80, 55, 90, 70];
  const stats = [
    { label: t('showcase.company'), val: '12' },
    { label: t('showcase.message'), val: '4.2K' },
    { label: t('showcase.aiToken'), val: '89K' },
  ];

  return (
    <div className="relative z-20 mx-auto w-full max-w-sm">
      <div className="overflow-hidden rounded-2xl border border-amber-400/30 bg-slate-900 p-5 shadow-2xl shadow-black/50 ring-1 ring-white/10">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-400">{t('showcase.platformSummary')}</span>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">{t('showcase.live')}</span>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-800 p-2 text-center">
              <p className="text-lg font-bold text-white">{s.val}</p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-amber-600/40 to-amber-400/80 animate-bar-grow"
              style={{ height: `${h}%`, animationDelay: `${i * 100}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShowcaseBackground({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={cn(
          'absolute inset-0',
          isAdmin
            ? 'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
            : 'bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-900'
        )}
      />
      <div className={cn('auth-orb auth-orb-1', isAdmin && 'auth-orb-amber')} />
      <div className={cn('auth-orb auth-orb-2', isAdmin && 'auth-orb-amber')} />
      <div className="auth-grid-pattern absolute inset-0 opacity-20" />
    </div>
  );
}

export function AuthShowcase({ variant }: AuthShowcaseProps) {
  const { t } = useTranslation();
  const isAdmin = variant === 'admin';
  const marquee = t(isAdmin ? 'showcase.adminMarquee' : 'showcase.customerMarquee', { returnObjects: true }) as string[];
  const featureData = t(isAdmin ? 'showcase.adminFeatures' : 'showcase.customerFeatures', { returnObjects: true }) as { title: string; desc: string }[];
  const icons = isAdmin ? ADMIN_ICONS : CUSTOMER_ICONS;
  const features = featureData.map((f, i) => ({ ...f, icon: icons[i] || Sparkles }));

  return (
    <div className="auth-page relative flex h-full min-h-0 flex-col overflow-y-auto text-white scrollbar-thin">
      <ShowcaseBackground isAdmin={isAdmin} />

      <div className="relative z-10 shrink-0">
        {isAdmin ? (
          <div className="space-y-5 p-6 sm:p-8 lg:p-10 lg:pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30">
                <Shield className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <span className="text-lg font-bold text-white">{t('showcase.platformAdmin')}</span>
                <p className="text-xs text-slate-400">{t('showcase.adminHeadline')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
                {t('showcase.adminDesc')}
              </h2>
              <p className="max-w-md text-sm text-slate-300">{t('showcase.adminSub')}</p>
            </div>
          </div>
        ) : (
          <>
            <SiteHeader />
            <div className="space-y-3 px-6 pb-2 sm:px-8 lg:px-10">
              <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
                {t('showcase.customerDesc')}
              </h2>
              <p className="max-w-md text-sm text-slate-300">{t('showcase.customerSub')}</p>
            </div>
          </>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-center px-6 py-4 sm:px-8">
        {isAdmin ? <AdminDashboardMockup /> : <ChatMockup />}
      </div>

      <div className="relative z-10 mt-auto shrink-0 space-y-3 p-6 pt-0 sm:p-8 sm:pt-0 lg:p-10 lg:pt-0">
        <div className="grid grid-cols-2 gap-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm"
            >
              <f.icon className={cn('mb-1.5 h-4 w-4', isAdmin ? 'text-amber-400' : 'text-[#25d366]')} />
              <p className="text-xs font-semibold text-white">{f.title}</p>
              <p className="text-[10px] text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <MarqueeRow items={marquee} />
          <MarqueeRow items={[...marquee].reverse()} reverse />
        </div>

        <p className="text-xs text-slate-500">
          © {new Date().getFullYear()} {t('showcase.copyright')}
        </p>
      </div>
    </div>
  );
}

export function AuthMobileBanner({ variant }: AuthShowcaseProps) {
  const { t } = useTranslation();
  const isAdmin = variant === 'admin';

  if (!isAdmin) {
    return (
      <div className="auth-page relative shrink-0 overflow-x-clip lg:hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#020617]">
          <ShowcaseBackground isAdmin={false} />
        </div>
        <div className="relative z-10">
          <SiteHeader />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'auth-page relative shrink-0 overflow-hidden text-white lg:hidden',
        'bg-gradient-to-br from-slate-950 via-stone-950 to-slate-900'
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <ShowcaseBackground isAdmin />
      </div>
      <div className="relative z-10 flex items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 sm:h-11 sm:w-11">
          <Shield className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white sm:text-lg">
            {t('showcase.platformAdmin')}
          </h2>
          <p className="truncate text-xs text-slate-400 sm:text-sm">
            {t('showcase.mobileAdmin')}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Landing — premium görsel bileşenler
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot, BookOpen, Calendar, Headphones,
  BarChart3, Sparkles, Zap, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WaaiLogo } from '@/components/WaaiLogo';

function useTilt3D(intensity = 5) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty('--tilt-x', `${-y * intensity}deg`);
      el.style.setProperty('--tilt-y', `${x * intensity}deg`);
    };

    const onLeave = () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [intensity]);

  return ref;
}

export function HeroShowcase({ className }: { className?: string }) {
  const { t } = useTranslation();
  const tiltRef = useTilt3D(5);

  return (
    <div ref={tiltRef} className={cn('landing-hero-showcase', className)}>
      <div className="landing-hero-ring landing-hero-ring-1" />
      <div className="landing-hero-ring landing-hero-ring-2" />
      <div className="landing-hero-orb" />

      <div className="landing-hero-phone">
        <div className="landing-hero-phone-header">
          <WaaiLogo size="sm" />
          <span className="relative ml-auto flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        </div>
        <div className="space-y-2.5 p-4">
          <div className="landing-bubble landing-bubble-in">{t('onboarding.heroBubble1')}</div>
          <div className="landing-bubble landing-bubble-out">{t('onboarding.heroBubble2')}</div>
          <div className="landing-bubble landing-bubble-in">{t('onboarding.heroBubble3')}</div>
          <div className="landing-bubble landing-bubble-out">{t('onboarding.heroBubble4')}</div>
        </div>
      </div>

      <div className="landing-hero-float landing-hero-float-ai">
        <Bot className="h-4 w-4 text-[#25d366]" />
        <div>
          <p className="text-[10px] font-semibold text-white">{t('onboarding.aiAgentLabel')}</p>
          <p className="text-[9px] text-slate-400">Aktif</p>
        </div>
      </div>
    </div>
  );
}

export function AiEngineGraphic({ className }: { className?: string }) {
  const { t } = useTranslation();
  const items = [
    { icon: Sparkles, label: t('onboarding.aiNode2') },
    { icon: Bot, label: t('onboarding.aiNode1') },
    { icon: Zap, label: t('onboarding.aiNode3') },
  ];

  return (
    <div className={cn('landing-ai-graphic', className)}>
      <div className="landing-ai-ring" />
      <div className="landing-ai-center">
        <Bot className="h-7 w-7 text-[#25d366]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {t('onboarding.aiCore')}
        </span>
      </div>
      {items.map((item, i) => (
        <div key={item.label} className={cn('landing-ai-pill', `landing-ai-pill-${i + 1}`)}>
          <item.icon className="h-3 w-3 text-teal-300" />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function KnowledgeGraphic({ className }: { className?: string }) {
  const { t } = useTranslation();
  const docs = t('onboarding.knowledgeDocs', { returnObjects: true }) as string[];

  return (
    <div className={cn('landing-knowledge-panel', className)}>
      <div className="landing-knowledge-header">
        <BookOpen className="h-3.5 w-3.5 text-teal-400" />
        <span>{t('onboarding.knowledgePanelTitle')}</span>
      </div>
      {docs.map((doc) => (
        <div key={doc} className="landing-knowledge-row">
          <span className="truncate text-xs text-slate-200">{doc}</span>
          <CheckCircle2 className="ml-2 h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
        </div>
      ))}
    </div>
  );
}

export function DashboardPreview({ className }: { className?: string }) {
  const { t } = useTranslation();
  const bars = [32, 58, 44, 76, 52, 88, 64];

  return (
    <div className={cn('landing-dash-panel', className)}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-teal-400" />
          <span className="text-xs font-medium text-white">{t('onboarding.dashTitle')}</span>
        </div>
        <span className="landing-live-dot">{t('showcase.live')}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        {[
          { val: '98%', label: t('onboarding.dashStat1') },
          { val: '4.2K', label: t('onboarding.dashStat2') },
          { val: '<3s', label: t('onboarding.dashStat3') },
        ].map((s) => (
          <div key={s.label} className="landing-dash-metric">
            <p className="text-sm font-bold text-white">{s.val}</p>
            <p className="text-[9px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="flex h-16 items-end gap-1 px-4 pb-3">
        {bars.map((h, i) => (
          <div
            key={i}
            className="landing-dash-bar flex-1 rounded-sm bg-gradient-to-t from-teal-700/80 to-[#25d366]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex gap-2 border-t border-white/[0.06] px-4 py-2.5">
        <span className="landing-dash-tag">
          <Headphones className="h-3 w-3" />
          {t('onboarding.dashFloat1')}
        </span>
        <span className="landing-dash-tag">
          <Calendar className="h-3 w-3" />
          {t('onboarding.dashFloat2')}
        </span>
      </div>
    </div>
  );
}

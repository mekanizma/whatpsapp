/**
 * Landing istatistik — animasyonlu metrik kartları
 */

import { Bot, MessageSquare, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

const STAT_ICONS = [Bot, Timer, MessageSquare] as const;

interface StatItem {
  value: string;
  label: string;
}

interface LandingStatCardsProps {
  stats: StatItem[];
  className?: string;
}

export function LandingStatCards({ stats, className }: LandingStatCardsProps) {
  return (
    <div className={cn('landing-stat-grid', className)}>
      {stats.map((stat, i) => {
        const Icon = STAT_ICONS[i] ?? Bot;
        return (
          <div
            key={stat.label}
            className={cn('landing-stat-card', `landing-stat-card-${i + 1}`)}
          >
            <div className="landing-stat-card-shine" aria-hidden />
            <div className="landing-stat-card-orb" aria-hidden />
            <div className="landing-stat-card-icon" aria-hidden>
              <Icon className="h-5 w-5" />
            </div>
            <p className="landing-stat-value">{stat.value}</p>
            <p className="landing-stat-label">{stat.label}</p>
          </div>
        );
      })}
    </div>
  );
}

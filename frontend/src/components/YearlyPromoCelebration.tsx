/**
 * Yıllık paket seçilince konfeti + havai fişek efekti ile promosyon mesajı.
 * Harici bağımlılık yok — canvas tabanlı, mobil uyumlu.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  life: number;
  maxLife: number;
  shape: 'rect' | 'circle';
}

const COLORS = [
  '#22d3ee', '#0ea5e9', '#14b8a6', '#34d399', '#a3e635',
  '#facc15', '#fb923c', '#f472b6', '#c084fc', '#f87171',
];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function spawnBurst(cx: number, cy: number, count: number, particles: Particle[]) {
  for (let i = 0; i < count; i++) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(2, 9);
    const maxLife = randomBetween(60, 110);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - randomBetween(1, 3),
      size: randomBetween(5, 11),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: randomBetween(0, Math.PI * 2),
      spin: randomBetween(-0.25, 0.25),
      life: 0,
      maxLife,
      shape: Math.random() > 0.5 ? 'rect' : 'circle',
    });
  }
}

interface YearlyPromoCelebrationProps {
  /** Her artışta yeni bir kutlama tetiklenir. */
  trigger: number;
}

export function YearlyPromoCelebration({ trigger }: YearlyPromoCelebrationProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireworkTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger <= 0) return;

    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setVisible(false), 3200);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [trigger]);

  useEffect(() => {
    if (!visible || trigger <= 0) return;
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let cancelled = false;

    const startAnimation = () => {
      if (cancelled) return;

      const canvas = canvasRef.current;
      if (!canvas) {
        requestAnimationFrame(startAnimation);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const particles: Particle[] = [];

      // Hemen patlayan havai fişekler
      const fireworks = [
        { x: width * 0.5, y: height * 0.22, count: 90 },
        { x: width * 0.28, y: height * 0.3, count: 65 },
        { x: width * 0.72, y: height * 0.28, count: 65 },
      ];
      for (const fw of fireworks) {
        spawnBurst(fw.x, fw.y, fw.count, particles);
      }

      // Kısa gecikmeyle ek patlamalar
      fireworkTimersRef.current.forEach(clearTimeout);
      fireworkTimersRef.current = [
        setTimeout(() => spawnBurst(width * 0.4, height * 0.18, 55, particles), 180),
        setTimeout(() => spawnBurst(width * 0.6, height * 0.2, 55, particles), 320),
      ];

      // Alt köşelerden konfeti
      spawnBurst(width * 0.12, height * 0.88, 45, particles);
      spawnBurst(width * 0.88, height * 0.88, 45, particles);

      const gravity = 0.16;
      const drag = 0.985;

      const render = () => {
        if (cancelled) return;

        ctx.clearRect(0, 0, width, height);
        let alive = 0;

        for (const p of particles) {
          if (p.life >= p.maxLife) continue;
          alive++;

          p.life++;
          p.vx *= drag;
          p.vy = p.vy * drag + gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.spin;

          const alpha = Math.max(0, 1 - p.life / p.maxLife);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;

          if (p.shape === 'rect') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.globalAlpha = 1;

        if (alive > 0) {
          rafRef.current = requestAnimationFrame(render);
        } else {
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(render);
    };

    requestAnimationFrame(startAnimation);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      fireworkTimersRef.current.forEach(clearTimeout);
      fireworkTimersRef.current = [];
    };
  }, [visible, trigger]);

  if (!visible) return null;

  return (
    <div className="yearly-promo-overlay" aria-live="polite">
      <canvas ref={canvasRef} className="yearly-promo-canvas" aria-hidden />
      <div className="yearly-promo-banner" role="status">
        <Sparkles className="yearly-promo-icon" aria-hidden />
        <div className="yearly-promo-banner-text">
          <span className="yearly-promo-banner-prefix">{t('subscription.yearlyPromoPrefix')}</span>
          <strong className="yearly-promo-banner-highlight">{t('subscription.yearlyPromoHighlight')}</strong>
        </div>
        <Sparkles className="yearly-promo-icon yearly-promo-icon--end" aria-hidden />
      </div>
    </div>
  );
}

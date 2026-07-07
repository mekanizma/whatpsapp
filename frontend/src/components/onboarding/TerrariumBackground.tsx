/**
 * Terrarium (GASTROPODA) atmosferi — onboarding sayfası için canlı orman arka planı.
 * Sisli katmanlar, süzülen sporlar, yosun parıltısı ve çiy damlalarından oluşur.
 * Mobil için parçacık sayısı azaltılır ve prefers-reduced-motion desteklenir.
 */

import { useEffect, useRef } from 'react';

interface FogLayer {
  x: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  alpha: number;
}

interface Spore {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  green: boolean;
}

const MOSS_SHAPES = [
  { w: '38vw', h: '30vw', top: '18%', left: '46%' },
  { w: '26vw', h: '22vw', top: '62%', left: '8%' },
  { w: '30vw', h: '26vw', top: '78%', left: '70%' },
];

const DEW_DROPS = [
  { top: '24%', left: '58%', w: 6, h: 8, delay: '0s' },
  { top: '40%', left: '78%', w: 4, h: 6, delay: '0.8s' },
  { top: '58%', left: '30%', w: 8, h: 10, delay: '1.4s' },
  { top: '32%', left: '18%', w: 5, h: 7, delay: '2.1s' },
  { top: '70%', left: '52%', w: 3, h: 4, delay: '0.5s' },
  { top: '15%', left: '88%', w: 6, h: 9, delay: '1.8s' },
];

export function TerrariumBackground() {
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const sporeCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const fogCanvas = fogCanvasRef.current;
    const sporeCanvas = sporeCanvasRef.current;
    if (!fogCanvas || !sporeCanvas) return;

    const fogCtx = fogCanvas.getContext('2d');
    const sporeCtx = sporeCanvas.getContext('2d');
    if (!fogCtx || !sporeCtx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let fogLayers: FogLayer[] = [];
    let spores: Spore[] = [];
    let fogTime = 0;
    let sporeTimer = 0;
    let rafId = 0;

    const setupCanvas = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      setupCanvas(fogCanvas, fogCtx);
      setupCanvas(sporeCanvas, sporeCtx);

      const layerCount = isMobile ? 4 : 6;
      fogLayers = Array.from({ length: layerCount }, () => ({
        x: Math.random() * width,
        y: height * (0.3 + Math.random() * 0.55),
        r: (isMobile ? 90 : 130) + Math.random() * (isMobile ? 140 : 220),
        speed: 0.08 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.022 + Math.random() * 0.026,
      }));
    };

    const spawnSpore = () => {
      spores.push({
        x: Math.random() * width,
        y: height + 10,
        r: 1.2 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.25 - Math.random() * 0.5,
        life: 1,
        decay: 0.0016 + Math.random() * 0.0022,
        green: Math.random() > 0.4,
      });
    };

    const maxSpores = isMobile ? 26 : 90;

    const spawnSporeAt = (x: number, y: number) => {
      spores.push({
        x,
        y,
        r: 1.4 + Math.random() * 2.4,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.3 - Math.random() * 0.6,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        green: Math.random() > 0.4,
      });
    };

    const glow = glowRef.current;
    let targetX = width / 2;
    let targetY = height / 2;
    let glowX = targetX;
    let glowY = targetY;
    let glowVisible = false;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      targetX = e.clientX;
      targetY = e.clientY;
      if (glow && !glowVisible) {
        glow.style.opacity = '1';
        glowVisible = true;
      }
      if (Math.random() > 0.5) return;
      spawnSporeAt(e.clientX, e.clientY);
      if (spores.length > maxSpores) spores.shift();
    };

    const onPointerLeave = () => {
      if (glow) glow.style.opacity = '0';
      glowVisible = false;
    };

    const trackGlow = () => {
      if (glow) {
        glowX += (targetX - glowX) * 0.14;
        glowY += (targetY - glowY) * 0.14;
        glow.style.transform = `translate(${glowX}px, ${glowY}px) translate(-50%, -50%)`;
      }
    };

    const drawFog = () => {
      fogCtx.clearRect(0, 0, width, height);
      fogTime += 0.003;
      for (const layer of fogLayers) {
        const xOff = Math.sin(fogTime * layer.speed + layer.phase) * 60;
        const yOff = Math.cos(fogTime * layer.speed * 0.7 + layer.phase) * 20;
        const cx = layer.x + xOff;
        const cy = layer.y + yOff;
        const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, layer.r);
        grad.addColorStop(0, `rgba(199,242,208,${layer.alpha})`);
        grad.addColorStop(0.5, `rgba(219,231,216,${layer.alpha * 0.5})`);
        grad.addColorStop(1, 'rgba(219,231,216,0)');
        fogCtx.beginPath();
        fogCtx.arc(cx, cy, layer.r, 0, Math.PI * 2);
        fogCtx.fillStyle = grad;
        fogCtx.fill();
      }
    };

    const drawSpores = () => {
      sporeCtx.clearRect(0, 0, width, height);
      sporeTimer += 1;
      if (sporeTimer % (isMobile ? 26 : 14) === 0 && spores.length < maxSpores) {
        spawnSpore();
      }
      spores = spores.filter((s) => s.life > 0 && s.y > -20);
      for (const s of spores) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy *= 0.995;
        s.life -= s.decay;
        const alpha = Math.min(s.life, 1) * 0.5;
        sporeCtx.beginPath();
        sporeCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sporeCtx.fillStyle = s.green
          ? `rgba(95,139,76,${alpha})`
          : `rgba(199,242,208,${alpha})`;
        sporeCtx.shadowBlur = 8;
        sporeCtx.shadowColor = s.green ? 'rgba(95,139,76,0.4)' : 'rgba(199,242,208,0.4)';
        sporeCtx.fill();
        sporeCtx.shadowBlur = 0;
      }
    };

    const loop = () => {
      drawFog();
      if (!reduceMotion) {
        drawSpores();
        trackGlow();
      }
      rafId = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduceMotion) {
      drawFog();
    } else {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerout', onPointerLeave);
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerLeave);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="terrarium-bg" />
      <div className="terrarium-texture" />
      {MOSS_SHAPES.map((shape, i) => (
        <div
          key={i}
          className="terrarium-moss"
          style={{ width: shape.w, height: shape.h, top: shape.top, left: shape.left }}
        />
      ))}
      <canvas ref={fogCanvasRef} className="terrarium-fog-canvas" />
      <canvas ref={sporeCanvasRef} className="terrarium-spore-canvas" />
      {DEW_DROPS.map((drop, i) => (
        <div
          key={i}
          className="terrarium-dew"
          style={{
            top: drop.top,
            left: drop.left,
            width: drop.w,
            height: drop.h,
            animationDelay: drop.delay,
          }}
        />
      ))}
      <div className="terrarium-vignette" />
      <div ref={glowRef} className="terrarium-cursor-glow" />
    </div>
  );
}

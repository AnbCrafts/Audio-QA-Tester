import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { prefersReducedMotion } from '@/lib/animations';

interface SpiralStrand {
  phase: number;
  twist: number;
  radiusOffset: number;
  width: number;
  baseAlpha: number;
}

interface DustSpark {
  angle: number;
  yNorm: number;
  speed: number;
  radialSpread: number;
  size: number;
  alpha: number;
  isEmber: boolean;
}

/**
 * Tall, sharp 3D helical tornado / acoustic vortex with dense continuous spiral curves
 * and focal ember energy. Adapts to Day (Deep Navy + Tangerine on Sand) and Night
 * (Ivory / Dusty Purple + Gold / Crimson on Charcoal).
 */
export const AcousticVortexCanvas: React.FC<{ className?: string }> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const reduced = prefersReducedMotion();

    // 52 continuous helical spiral strands for crisp tornado geometry
    const strands: SpiralStrand[] = Array.from({ length: 52 }, (_, i) => ({
      phase: (i / 52) * Math.PI * 2 + (Math.random() - 0.5) * 0.14,
      twist: 11.5 + (i % 5) * 0.9,
      radiusOffset: 0.86 + Math.random() * 0.28,
      width: i % 4 === 0 ? 1.15 : 0.65,
      baseAlpha: i % 4 === 0 ? 0.34 : 0.16,
    }));

    // 2,000 crisp acoustic dust particles + ember burst around focal throat
    const sparks: DustSpark[] = [];
    for (let i = 0; i < 2000; i++) {
      const yNorm = Math.random();
      const nearFocal = Math.abs(yNorm - 0.52) < 0.085;
      const isEmber = nearFocal && Math.random() < 0.52;
      sparks.push({
        angle: Math.random() * Math.PI * 2,
        yNorm,
        speed: (0.005 + (1 - Math.abs(yNorm - 0.55)) * 0.011) * (0.7 + Math.random() * 0.6),
        radialSpread: isEmber ? (Math.random() - 0.5) * 0.72 : (Math.random() - 0.5) * 0.22,
        size: isEmber ? Math.random() * 2.1 + 1.0 : Math.random() * 1.15 + 0.35,
        alpha: isEmber ? Math.random() * 0.75 + 0.25 : Math.random() * 0.45 + 0.12,
        isEmber,
      });
    }

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerRef.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerRef.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    let time = 0;

    // Funnel profile: dramatic tall narrow waist at y=0.68, concentric ripples at y=0.68..1.0
    const radiusProfile = (yn: number, maxR: number): number => {
      if (yn < 0.70) {
        const t = yn / 0.70;
        return maxR * (0.14 + 0.86 * Math.pow(1 - t, 2.2));
      }
      const b = (yn - 0.70) / 0.30;
      return maxR * (0.14 + Math.pow(b, 0.85) * 1.15);
    };

    const renderFrame = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const isDay = theme === 'day';
      // Offset vortex slightly right on desktop so left-aligned overlapped typography reads crisply
      const desktopShift = w >= 768 ? w * 0.12 : 0;
      const cx = w * 0.5 + desktopShift + pointerRef.current.x * 10;
      const topY = -h * 0.02;
      const spanY = h * 0.96;
      const maxR = Math.min(w * 0.34, 350);

      // Focal ember halo around the escalation throat
      const focalY = topY + spanY * 0.52;
      const halo = ctx.createRadialGradient(cx, focalY, 6, cx, focalY, maxR * 0.65);
      if (isDay) {
        halo.addColorStop(0, 'rgba(249, 115, 22, 0.20)');
        halo.addColorStop(0.45, 'rgba(15, 23, 42, 0.04)');
        halo.addColorStop(1, 'rgba(248, 250, 252, 0)');
      } else {
        halo.addColorStop(0, 'rgba(249, 115, 22, 0.24)');
        halo.addColorStop(0.35, 'rgba(59, 130, 246, 0.10)');
        halo.addColorStop(0.7, 'rgba(15, 23, 42, 0.04)');
        halo.addColorStop(1, 'rgba(10, 14, 23, 0)');
      }
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // 1. Draw sharp helical continuous spiral ribbons
      const steps = 64;
      for (let s = 0; s < strands.length; s++) {
        const st = strands[s];
        ctx.beginPath();
        for (let k = 0; k <= steps; k++) {
          const yn = k / steps;
          const r = radiusProfile(yn, maxR) * st.radiusOffset;
          const tilt = 0.20 + yn * 0.09 + pointerRef.current.y * 0.015;
          const theta = st.phase + yn * st.twist - time * 0.014;
          const x = cx + Math.cos(theta) * r;
          const y = topY + yn * spanY + Math.sin(theta) * r * tilt;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = st.width;
        ctx.strokeStyle = isDay
          ? `rgba(11, 22, 40, ${st.baseAlpha * 1.15})`
          : `rgba(232, 222, 248, ${st.baseAlpha})`;
        ctx.stroke();
      }

      // 2. Draw crisp concentric base ripples under the vortex funnel
      for (let rIdx = 0; rIdx < 8; rIdx++) {
        const yn = 0.72 + (rIdx / 7) * 0.26;
        const r = radiusProfile(yn, maxR);
        const y = topY + yn * spanY;
        const tilt = 0.24 + yn * 0.05;
        ctx.beginPath();
        ctx.ellipse(cx, y, r, r * tilt, 0, 0, Math.PI * 2);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = isDay
          ? 'rgba(11, 22, 40, 0.14)'
          : 'rgba(166, 153, 190, 0.16)';
        ctx.stroke();
      }

      // 3. Draw dense rotating particles & focal ember sparks
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i];
        if (!reduced) {
          p.angle += p.speed;
        }
        const yn = p.yNorm;
        const baseR = radiusProfile(yn, maxR);
        const r = Math.max(8, baseR * (1 + p.radialSpread));
        const tilt = 0.20 + yn * 0.09 + pointerRef.current.y * 0.015;

        const x = cx + Math.cos(p.angle) * r;
        const y = topY + yn * spanY + Math.sin(p.angle) * r * tilt;
        const depth = (Math.sin(p.angle) + 1) * 0.5;
        const alpha = p.alpha * (0.38 + depth * 0.62);

        if (p.isEmber) {
          ctx.fillStyle = isDay
            ? i % 3 === 0
              ? `rgba(220, 38, 38, ${alpha})`
              : `rgba(249, 115, 22, ${alpha})`
            : i % 2 === 0
            ? `rgba(244, 63, 94, ${alpha})`
            : `rgba(229, 185, 78, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = isDay
            ? `rgba(11, 22, 40, ${alpha * 0.9})`
            : `rgba(242, 236, 252, ${alpha * 0.85})`;
          ctx.fillRect(x, y, p.size, p.size);
        }
      }

      if (!reduced) {
        time += 1;
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [theme]);

  return (
    <div className={`relative w-full overflow-hidden select-none ${className}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      {/* Directional bottom gradient fade for razor-sharp overlapped text legibility */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64"
        style={{
          background:
            'linear-gradient(to top, var(--bg-surface) 18%, color-mix(in srgb, var(--bg-surface) 80%, transparent) 55%, transparent 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-3/5 hidden md:block"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, color-mix(in srgb, var(--bg-surface) 85%, transparent) 0%, transparent 70%)',
        }}
      />
    </div>
  );
};

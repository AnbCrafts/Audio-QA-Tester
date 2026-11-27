import React, { useEffect, useRef } from 'react';
import { animateEqualizerBars } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface EqualizerLoaderProps {
  className?: string;
  bars?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const EqualizerLoader: React.FC<EqualizerLoaderProps> = ({
  className,
  bars = 7,
  size = 'md',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const nodes = Array.from(rootRef.current.querySelectorAll('.eq-bar'));
    if (!nodes.length) return;
    const anim = animateEqualizerBars(nodes);
    return () => {
      if (anim && typeof anim.pause === 'function') {
        anim.pause();
      }
    };
  }, [bars]);

  const heightCls = size === 'sm' ? 'h-4' : size === 'lg' ? 'h-12' : 'h-8';
  const widthCls = size === 'sm' ? 'w-1' : size === 'lg' ? 'w-1.5' : 'w-1.5';

  return (
    <div
      ref={rootRef}
      className={cn('inline-flex items-end justify-center gap-1', heightCls, className)}
      aria-label="Audio waveform processing"
    >
      {Array.from({ length: bars }).map((_, idx) => (
        <span
          key={idx}
          className={cn(
            'eq-bar h-full rounded-full bg-accent origin-bottom transition-colors',
            widthCls
          )}
          style={{ transform: 'scaleY(0.35)' }}
        />
      ))}
    </div>
  );
};

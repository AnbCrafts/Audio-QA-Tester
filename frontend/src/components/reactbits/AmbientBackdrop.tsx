import React from 'react';
import { cn } from '@/lib/utils';

interface AmbientBackdropProps {
  className?: string;
  intensity?: 'hero' | 'subtle';
}

/**
 * React Bits inspired Ambient DotGrid + Aurora backdrop driven strictly
 * by Day (Navy / Sand / Tangerine) and Night (Charcoal / Dusty Purple / Gold) CSS tokens.
 */
export const AmbientBackdrop: React.FC<AmbientBackdropProps> = ({
  className,
  intensity = 'hero',
}) => {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 overflow-hidden -z-10', className)}
    >
      {/* Subtle architectural dot matrix */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(var(--backdrop-grid) 1.25px, transparent 1.25px)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Primary Accent Aura */}
      <div
        className={cn(
          'absolute -top-36 -left-24 rounded-full blur-3xl transition-colors duration-500',
          intensity === 'hero' ? 'h-[460px] w-[460px] opacity-90' : 'h-[320px] w-[320px] opacity-55'
        )}
        style={{ background: 'radial-gradient(circle, var(--backdrop-blob-1) 0%, transparent 72%)' }}
      />

      {/* Secondary Anchor Aura */}
      <div
        className={cn(
          'absolute top-1/3 -right-28 rounded-full blur-3xl transition-colors duration-500',
          intensity === 'hero' ? 'h-[520px] w-[520px] opacity-85' : 'h-[340px] w-[340px] opacity-50'
        )}
        style={{ background: 'radial-gradient(circle, var(--backdrop-blob-2) 0%, transparent 70%)' }}
      />
    </div>
  );
};

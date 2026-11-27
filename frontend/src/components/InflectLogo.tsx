import React from 'react';
import { cn } from '@/lib/utils';

interface InflectLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Custom Inflect geometric brand mark: acoustic pulse turning into an inflection peak.
 * Adapts to Day (Tangerine/Navy on Sand) and Night (Gold/Charcoal) themes automatically.
 */
export const InflectLogo: React.FC<InflectLogoProps> = ({ size = 'md', className }) => {
  const boxCls =
    size === 'sm'
      ? 'h-8 w-8 rounded-lg'
      : size === 'lg'
      ? 'h-12 w-12 rounded-2xl'
      : 'h-10 w-10 rounded-xl';

  const svgCls =
    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-7 w-7' : 'h-6 w-6';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center bg-anchor text-ink-anchor border border-subtle shadow-xs',
        boxCls,
        className
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className={svgCls}>
        <path
          d="M7.5 11.5V20.5"
          stroke="var(--accent-primary)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M12.5 19.5C14.5 19.5 15.8 9.5 18.5 9.5C21.2 9.5 22 22.5 24.5 13.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18.5" cy="9.5" r="2.2" fill="var(--accent-primary)" />
      </svg>
    </div>
  );
};

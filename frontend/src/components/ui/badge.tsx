import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-subtle bg-surface-elevated text-ink-muted',
        accent: 'border-accent/35 bg-accent-soft text-accent',
        green: 'border-status-green/35 bg-status-green-soft text-status-green',
        red: 'border-status-red/35 bg-status-red-soft text-status-red',
        anchor: 'border-transparent bg-anchor text-ink-anchor',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

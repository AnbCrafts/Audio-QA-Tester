import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-bold transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-[0.99]',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-fg shadow-sm hover:bg-accent-hover',
        secondary:
          'bg-anchor text-ink-anchor border border-subtle hover:opacity-90',
        outline:
          'border border-subtle bg-surface text-ink hover:border-accent hover:text-accent',
        ghost:
          'text-ink-muted hover:bg-accent-soft hover:text-ink',
        destructive:
          'bg-status-red-soft text-status-red border border-status-red/30 hover:bg-status-red hover:text-white',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-[11px]',
        lg: 'h-11 rounded-xl px-6 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = 'Button';

export { buttonVariants };

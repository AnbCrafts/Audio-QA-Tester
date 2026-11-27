import React from 'react';
import { cn } from '@/lib/utils';

interface ShinyTextProps {
  children: React.ReactNode;
  className?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({ children, className }) => {
  return (
    <span
      className={cn(
        'inline-block bg-clip-text text-transparent animate-shiny-text font-extrabold',
        className
      )}
      style={{
        backgroundImage:
          'linear-gradient(110deg, var(--accent-primary) 20%, var(--text-primary) 48%, var(--accent-primary) 75%)',
      }}
    >
      {children}
    </span>
  );
};

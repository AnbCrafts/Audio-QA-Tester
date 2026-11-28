import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className, compact = false }) => {
  const { theme, toggleTheme } = useTheme();
  const isDay = theme === 'day';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDay ? 'Switch to Dark Mode (Obsidian & Amber)' : 'Switch to Light Mode (Slate & Tangerine)'}
      title={isDay ? 'Light Mode — Click for Dark Mode' : 'Dark Mode — Click for Light Mode'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-elevated px-2.5 py-1.5 text-[11px] font-bold text-ink hover:border-accent transition-all cursor-pointer shadow-xs',
        className
      )}
    >
      {isDay ? (
        <Sun className="h-3.5 w-3.5 text-accent" />
      ) : (
        <Moon className="h-3.5 w-3.5 text-accent" />
      )}
      {!compact && (
        <span className="hidden sm:inline">{isDay ? 'Day' : 'Night'}</span>
      )}
    </button>
  );
};

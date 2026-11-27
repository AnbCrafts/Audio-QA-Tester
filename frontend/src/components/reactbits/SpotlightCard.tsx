import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className,
  onMouseMove,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 50, y: 50, active: false });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setCoords({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      });
    }
    onMouseMove?.(e);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCoords((prev) => ({ ...prev, active: false }))}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-subtle bg-surface transition-all duration-300 hover:border-accent/50',
        className
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: coords.active ? 1 : 0,
          background: `radial-gradient(280px circle at ${coords.x}px ${coords.y}px, var(--accent-glow), transparent 72%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};

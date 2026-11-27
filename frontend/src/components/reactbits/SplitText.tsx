import React, { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';
import { prefersReducedMotion } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface SplitTextProps {
  text: string;
  className?: string;
  delayPerWord?: number;
}

export const SplitText: React.FC<SplitTextProps> = ({
  text,
  className,
  delayPerWord = 45,
}) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || prefersReducedMotion()) return;
    const words = containerRef.current.querySelectorAll('.rb-split-word');
    if (!words.length) return;
    try {
      animate(words, {
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 520,
        delay: stagger(delayPerWord),
        ease: 'outExpo',
      });
    } catch {
      // ignore fallback
    }
  }, [text, delayPerWord]);

  const parts = text.split(' ');
  return (
    <span ref={containerRef} className={cn('inline-block', className)}>
      {parts.map((word, i) => (
        <span key={`${word}-${i}`} className="rb-split-word inline-block mr-[0.26em]">
          {word}
        </span>
      ))}
    </span>
  );
};

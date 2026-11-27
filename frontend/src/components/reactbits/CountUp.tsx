import React, { useEffect, useState } from 'react';
import { animateCountValue } from '@/lib/animations';

interface CountUpProps {
  to: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  to,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}) => {
  const [display, setDisplay] = useState(() => to.toFixed(decimals));

  useEffect(() => {
    const anim = animateCountValue(0, to, decimals, setDisplay, 700);
    return () => {
      if (anim && typeof anim.pause === 'function') {
        anim.pause();
      }
    };
  }, [to, decimals]);

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
};

import { animate, stagger } from 'animejs';

/**
 * Checks whether the user has requested reduced motion at system level.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Staggers in elements from bottom with opacity fade-in.
 */
export function animateStaggerIn(
  targets: string | Element | Element[] | NodeListOf<Element>,
  delayStep = 65
) {
  if (prefersReducedMotion()) {
    return;
  }

  try {
    return animate(targets, {
      opacity: [0, 1],
      translateY: [18, 0],
      duration: 520,
      delay: stagger(delayStep),
      ease: 'outQuad',
    });
  } catch (err) {
    console.debug('Failed to run stagger-in animation:', err);
    return null;
  }
}

/**
 * Animates a numeric counter smoothly from start to end with given decimal precision.
 */
export function animateCountValue(
  start: number,
  end: number,
  decimals = 0,
  onUpdate: (val: string) => void,
  duration = 700
) {
  if (prefersReducedMotion()) {
    onUpdate(end.toFixed(decimals));
    return { pause: () => {} };
  }

  const obj = { value: start };

  try {
    const anim = animate(obj, {
      value: end,
      duration,
      ease: 'outQuad',
      onUpdate: () => {
        onUpdate(obj.value.toFixed(decimals));
      },
    });

    return anim;
  } catch (err) {
    console.debug('Failed to run count animation:', err);
    onUpdate(end.toFixed(decimals));
    return { pause: () => {} };
  }
}

/**
 * Animates equalizer bars in a continuous oscillating waveform.
 */
export function animateEqualizerBars(
  bars: Element[] | HTMLElement[] | NodeListOf<Element>
) {
  if (prefersReducedMotion()) {
    return { pause: () => {} };
  }

  try {
    const anim = animate(bars, {
      scaleY: [
        { to: 1.0, duration: 260 },
        { to: 0.22, duration: 320 },
      ],
      delay: stagger(55, { from: 'center' }),
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });

    return anim;
  } catch (err) {
    console.debug('Failed to run equalizer animation:', err);
    return { pause: () => {} };
  }
}

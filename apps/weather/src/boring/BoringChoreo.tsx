/**
 * Drives the Boring Mode crossfade from the settle progress (virtual-clocked
 * boring.mix): the atmosphere files into the grid, THEN the DOM heatmap fades
 * up over it and the canvas dims beneath — reversed symmetrically on the way
 * back. Imperative styles, zero re-renders.
 */
import { useEffect } from 'react';
import { boring } from '../state/boring';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function BoringChoreo(): null {
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const scene = document.querySelector<HTMLElement>('.scene');
      const wrap = document.querySelector<HTMLElement>('.boring-wrap');
      if (wrap) {
        wrap.style.opacity = String(smoothstep(0.72, 0.97, boring.mix));
        wrap.style.pointerEvents = boring.mix > 0.6 ? 'auto' : 'none';
      }
      if (scene) scene.style.opacity = String(1 - 0.96 * smoothstep(0.86, 0.995, boring.mix));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      const scene = document.querySelector<HTMLElement>('.scene');
      if (scene) scene.style.opacity = '';
    };
  }, []);
  return null;
}

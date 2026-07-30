/**
 * Global input wiring: title skip, shortcuts (Space/B/R/Escape), pointer
 * hover → region tint + name label, click → focus flight. The canvas itself
 * is never a focus target; pointer math mirrors the shader's view transform.
 */
import { useEffect, useRef } from 'react';
import { useWeather, dayFor } from '../state/store';
import { titleSkip, titleCurrentMix } from '../acts/titleTimeline';
import { virtualNow } from '../state/clock';
import { hover } from '../state/hover';
import { buildLayout, sectorAt } from '../scene/layout';
import { currentView } from '../scene/camera';

export function Interactions(): React.JSX.Element {
  const seed = useWeather((s) => s.seed);
  const labelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layout = buildLayout(seed);
    const st = (): ReturnType<typeof useWeather.getState> => useWeather.getState();

    const skipTitle = (): void => {
      const s = st();
      if (s.act !== 'title') return;
      if (s.reducedMotion) {
        s.setAct('field');
        s.setPaused(false);
        return;
      }
      titleSkip(virtualNow(), titleCurrentMix(virtualNow()));
    };

    const onKey = (e: KeyboardEvent): void => {
      const s = st();
      const target = e.target as HTMLElement | null;
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (inInput) return;
      if (s.act === 'title') {
        skipTitle();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        s.setPaused(!s.paused);
      } else if (e.key === 'b' || e.key === 'B') {
        s.setMode(s.mode === 'field' ? 'boring' : 'field');
      } else if (e.key === 'r' || e.key === 'R') {
        s.setMinute(0, { scrub: true });
        s.setAct('field');
        s.setPaused(false);
      } else if (e.key === 'Escape') {
        if (s.helpOpen) s.setHelpOpen(false);
        else if (s.focus) s.setFocus(null);
      }
    };

    const fieldPoint = (e: PointerEvent | MouseEvent): { x: number; y: number } | null => {
      const el = document.querySelector('.scene');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const view = currentView();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1 - (e.clientY - rect.top) / rect.height;
      return {
        x: (nx - 0.5) / view.zoom + view.cx,
        y: (ny - 0.5) / view.zoom + view.cy,
      };
    };

    const onMove = (e: PointerEvent): void => {
      const s = st();
      const label = labelRef.current;
      if (s.act !== 'field' || s.mode !== 'field') {
        hover.sector = -1;
        if (label) label.style.opacity = '0';
        return;
      }
      const target = e.target as HTMLElement | null;
      const overScene = target?.closest('.scene') !== null && target?.closest('.hud, .scrubber, .focus-panel, .help-sheet, .review-panel') === null;
      if (!overScene) {
        hover.sector = -1;
        if (label) label.style.opacity = '0';
        return;
      }
      const p = fieldPoint(e);
      if (!p) return;
      const idx = sectorAt(layout, p.x, p.y);
      hover.sector = idx;
      if (label) {
        const day = dayFor(s.seed);
        label.textContent = day.sectors[idx]?.name ?? '';
        label.style.opacity = '1';
        label.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 10}px)`;
      }
    };

    const onClick = (e: MouseEvent): void => {
      const s = st();
      if (s.act === 'title') {
        skipTitle();
        return;
      }
      if (s.act !== 'field' || s.mode !== 'field') return;
      const target = e.target as HTMLElement | null;
      const overScene = target?.closest('.scene') !== null && target?.closest('.hud, .scrubber, .focus-panel, .help-sheet, .review-panel, .sector-overlay') === null;
      if (!overScene) return;
      const p = fieldPoint(e);
      if (!p) return;
      const idx = sectorAt(layout, p.x, p.y);
      const slug = dayFor(s.seed).sectors[idx]?.slug ?? null;
      // Click the focused region again → release; another region → retarget.
      s.setFocus(s.focus === slug ? null : slug);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('click', onClick);
    };
  }, [seed]);

  return <div ref={labelRef} className="hover-label" aria-hidden="true" />;
}

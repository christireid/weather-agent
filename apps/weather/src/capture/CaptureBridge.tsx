/**
 * The capture-harness hooks (spec §1.1, §8). Active only with ?capture=1:
 * exposes window.__mw so the Playwright harness can address any scene state
 * and step the virtual clock deterministically. Also exposes the renderer
 * entity counts for the Loop E bounded-entities audit.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { stepVirtual } from '../state/clock';
import { useWeather } from '../state/store';

declare global {
  interface Window {
    __mw?: {
      setMinute(m: number): void;
      setMode(mode: 'field' | 'boring'): void;
      setFocus(slug: string | null): void;
      setAct(act: 'title' | 'field' | 'review'): void;
      setPaused(p: boolean): void;
      step(ms: number): void;
      nextFrame(): Promise<number>;
      frames(): number;
      info(): { geometries: number; textures: number; programs: number; nodes: number };
      state(): { minute: number; mode: string; act: string; tier: string; seed: number };
    };
    __mwFrames?: number;
    __mwGlyphsReady?: boolean;
  }
}

export function CaptureBridge(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const frames = useRef(0);

  useFrame(() => {
    frames.current += 1;
    window.__mwFrames = frames.current;
  });

  useEffect(() => {
    const s = useWeather.getState();
    if (!s.captureMode && !new URLSearchParams(window.location.search).has('capture')) {
      // Entity audit stays available even outside capture mode (perf tests).
    }
    window.__mw = {
      setMinute: (m) => useWeather.getState().setMinute(m, { scrub: true }),
      setMode: (mode) => useWeather.getState().setMode(mode),
      setFocus: (slug) => useWeather.getState().setFocus(slug),
      setAct: (act) => useWeather.getState().setAct(act),
      setPaused: (p) => useWeather.getState().setPaused(p),
      step: (ms) => stepVirtual(ms),
      nextFrame: () => {
        const target = frames.current + 2; // wait for a full render after changes
        return new Promise<number>((resolve) => {
          const check = (): void => {
            if (frames.current >= target) resolve(frames.current);
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
      },
      frames: () => frames.current,
      info: () => {
        let nodes = 0;
        scene.traverse(() => {
          nodes += 1;
        });
        return {
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
          nodes,
        };
      },
      state: () => {
        const st = useWeather.getState();
        return { minute: st.minute, mode: st.mode, act: st.act, tier: st.tier, seed: st.seed };
      },
    };
    return () => {
      delete window.__mw;
    };
  }, [gl, scene]);

  return null;
}

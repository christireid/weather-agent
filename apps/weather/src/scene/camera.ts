/**
 * The one camera: a zoom/center over field space, animated by a critically-
 * damped-ish spring (interruptible by construction — a new target simply
 * retargets mid-flight, Escape always returns). Read by the particle and sky
 * shaders as uView = (zoom, cx, cy).
 */

export interface ViewState {
  zoom: number;
  cx: number;
  cy: number;
}

const state = { zoom: 1, cx: 0.5, cy: 0.5 };
const vel = { zoom: 0, cx: 0, cy: 0 };
const target = { zoom: 1, cx: 0.5, cy: 0.5 };

/** Camera-flight spring: ~1.1s settle with a long drift tail (§7 --drift feel). */
const STIFFNESS = 42;
const DAMPING = 13;

export function setViewTarget(zoom: number, cx: number, cy: number): void {
  target.zoom = zoom;
  // Keep the visible window inside the field (plus the wrap margin).
  const half = 0.5 / zoom;
  target.cx = Math.min(1.02 - half, Math.max(-0.02 + half, cx));
  target.cy = Math.min(1.02 - half, Math.max(-0.02 + half, cy));
}

export function snapView(zoom: number, cx: number, cy: number): void {
  setViewTarget(zoom, cx, cy);
  state.zoom = target.zoom;
  state.cx = target.cx;
  state.cy = target.cy;
  vel.zoom = vel.cx = vel.cy = 0;
}

export function tickView(dt: number): ViewState {
  const step = Math.min(dt, 1 / 20);
  for (const k of ['zoom', 'cx', 'cy'] as const) {
    const x = state[k];
    const v = vel[k];
    const a = STIFFNESS * (target[k] - x) - DAMPING * v;
    vel[k] = v + a * step;
    state[k] = x + vel[k] * step;
  }
  return state;
}

export function currentView(): ViewState {
  return state;
}

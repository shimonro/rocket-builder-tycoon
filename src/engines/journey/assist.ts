import type { JourneyState } from './journey';

/** "Fast mode": three quick taps on forward hold full throttle until backward is tapped once. */
export interface ForwardLock {
  on: boolean;
  /** Times (seconds) of recent forward taps. */
  taps: number[];
}

export const TAPS_TO_LOCK = 3;
export const TAP_WINDOW = 0.6;
export const NO_LOCK: ForwardLock = { on: false, taps: [] };

export function tapForward(lock: ForwardLock, now: number): ForwardLock {
  if (lock.on) return lock;
  const taps = [...lock.taps.filter((t) => now - t <= TAP_WINDOW), now];
  return taps.length >= TAPS_TO_LOCK ? { on: true, taps: [] } : { on: false, taps };
}

export function tapBackward(): ForwardLock {
  return NO_LOCK;
}

export type IntroKind = 'hoop' | 'obstacle' | 'coin' | 'fuel' | 'gem';

export interface IntroTarget {
  kind: IntroKind;
  /** Obstacle kind (e.g. asteroid) or the pickup/hoop kind. */
  name: string;
  x: number;
  y: number;
}

/**
 * The nearest thing ahead of the rocket, within `range` meters, whose kind the tutorial flight has not
 * introduced yet. The flight pauses on it to explain what it is.
 */
export function nextIntro(state: JourneyState, seen: readonly IntroKind[], range: number): IntroTarget | null {
  const ahead = (y: number) => y > state.y && y - state.y <= range;
  const candidates: IntroTarget[] = [
    ...state.hoops.filter((h) => !h.crossed).map((h) => ({ kind: 'hoop' as const, name: 'hoop', x: h.x, y: h.y })),
    ...state.obstacles.map((o) => ({ kind: 'obstacle' as const, name: o.kind, x: o.x, y: o.y })),
    ...state.pickups.map((p) => ({ kind: p.kind, name: p.kind, x: p.x, y: p.y })),
  ];
  return candidates.filter((c) => ahead(c.y) && !seen.includes(c.kind)).sort((a, b) => a.y - b.y)[0] ?? null;
}

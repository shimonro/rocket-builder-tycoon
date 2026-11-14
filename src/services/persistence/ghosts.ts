/** Seconds between recorded ghost positions. */
export const GHOST_INTERVAL = 0.1;

export interface Ghost {
  distance: number;
  /** Flattened [x, y, x, y, …] every GHOST_INTERVAL seconds. */
  points: number[];
}

export const GHOST_KEY = 'rocket-builder-tycoon.ghosts.v1';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const isGhost = (v: unknown): v is Ghost =>
  typeof v === 'object' && v !== null && typeof (v as Ghost).distance === 'number' && Array.isArray((v as Ghost).points);

/** The best run per level, kept on this device so flights can show it as a ghost. */
export function createGhostStore(storage: KeyValueStorage, key = GHOST_KEY) {
  function all(): Record<string, Ghost> {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? '{}');
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, Ghost>) : {};
    } catch {
      return {};
    }
  }
  return {
    get(levelId: number): Ghost | null {
      const ghost = all()[levelId];
      return isGhost(ghost) ? ghost : null;
    },
    /** Keeps the run only if it went further than the stored one. Returns whether it was kept. */
    offer(levelId: number, ghost: Ghost): boolean {
      const ghosts = all();
      const current = ghosts[levelId];
      if (isGhost(current) && current.distance >= ghost.distance) return false;
      try {
        storage.setItem(key, JSON.stringify({ ...ghosts, [levelId]: ghost }));
        return true;
      } catch {
        return false; // Storage full: ghosts are a nice-to-have.
      }
    },
  };
}

/** Where the ghost was `time` seconds into its flight, or null past its end. */
export function ghostPosition(ghost: Ghost, time: number): { x: number; y: number } | null {
  const i = time / GHOST_INTERVAL;
  const a = Math.floor(i);
  if (a < 0 || 2 * a + 3 >= ghost.points.length) return null;
  const t = i - a;
  const p = ghost.points;
  return { x: p[2 * a] + (p[2 * a + 2] - p[2 * a]) * t, y: p[2 * a + 1] + (p[2 * a + 3] - p[2 * a + 1]) * t };
}

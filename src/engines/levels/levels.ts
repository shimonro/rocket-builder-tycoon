export interface Level {
  id: number;
  name: string;
  targetDistance: number;
  obstacleDensity: number;
  obstacleTypes: string[];
  hoopDensity: number;
  payoutMultiplier: number;
  minRanking: number;
  unlockFee: number;
  completionBonus: number;
  skyColor: string;
}

export interface Progress {
  unlocked: number[];
  completed: number[];
  /** Best distance per level id. */
  best: Record<string, number>;
}

const NUMERIC_FIELDS = [
  'targetDistance',
  'obstacleDensity',
  'hoopDensity',
  'payoutMultiplier',
  'minRanking',
  'unlockFee',
  'completionBonus',
] as const;

/** Validates level JSON. Ids must run 1, 2, 3, … in order. */
export function parseLevels(raw: unknown): Level[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid levels: expected a non-empty array');
  return (raw as Level[]).map((level, index) => {
    if (level.id !== index + 1) throw new Error(`Invalid levels: expected id ${index + 1}`);
    for (const key of NUMERIC_FIELDS) {
      if (typeof level[key] !== 'number' || level[key] < 0) {
        throw new Error(`Invalid levels: level ${level.id} ${key} must be a non-negative number`);
      }
    }
    if (!Array.isArray(level.obstacleTypes) || level.obstacleTypes.length === 0) {
      throw new Error(`Invalid levels: level ${level.id} needs obstacleTypes`);
    }
    return level;
  });
}

export function initialProgress(): Progress {
  return { unlocked: [1], completed: [], best: {} };
}

export function highestUnlocked(progress: Progress): number {
  return Math.max(1, ...progress.unlocked);
}

/** Part levels 1–5 open up two game levels at a time. */
export function partLevelCap(progress: Progress): number {
  return Math.min(5, Math.ceil(highestUnlocked(progress) / 2));
}

export interface UnlockCheck {
  alreadyUnlocked: boolean;
  previousCompleted: boolean;
  rankingMet: boolean;
  canAfford: boolean;
  /** All three gates pass and the level is still locked. */
  canUnlock: boolean;
}

export function evaluateUnlock(level: Level, progress: Progress, ranking: number, cash: number): UnlockCheck {
  const alreadyUnlocked = progress.unlocked.includes(level.id);
  const previousCompleted = level.id === 1 || progress.completed.includes(level.id - 1);
  const rankingMet = ranking >= level.minRanking;
  const canAfford = cash >= level.unlockFee;
  return {
    alreadyUnlocked,
    previousCompleted,
    rankingMet,
    canAfford,
    canUnlock: !alreadyUnlocked && previousCompleted && rankingMet && canAfford,
  };
}

export type UnlockResult = { ok: true; progress: Progress; cash: number } | { ok: false; check: UnlockCheck };

export function unlockLevel(level: Level, progress: Progress, ranking: number, cash: number): UnlockResult {
  const check = evaluateUnlock(level, progress, ranking, cash);
  if (!check.canUnlock) return { ok: false, check };
  return {
    ok: true,
    cash: cash - level.unlockFee,
    progress: { ...progress, unlocked: [...progress.unlocked, level.id].sort((a, b) => a - b) },
  };
}

export function recordFlight(progress: Progress, levelId: number, distance: number, targetReached: boolean): Progress {
  const key = String(levelId);
  const completed =
    targetReached && !progress.completed.includes(levelId)
      ? [...progress.completed, levelId].sort((a, b) => a - b)
      : progress.completed;
  return {
    ...progress,
    completed,
    best: { ...progress.best, [key]: Math.max(progress.best[key] ?? 0, Math.floor(distance)) },
  };
}

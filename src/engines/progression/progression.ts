import { createRng, hashString } from '../../core/rng';

/** Lifetime numbers achievements are measured against. */
export interface ProgressSnapshot {
  flights: number;
  totalDistance: number;
  hoops: number;
  destroyed: number;
  coins: number;
  guardians: number;
  gemsFound: number;
  levelsCompleted: number;
  highestUnlocked: number;
  bestDistance: number;
  upgrades: number;
  cosmetics: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  metric: keyof ProgressSnapshot;
  threshold: number;
  gems: number;
}

/** Achievements the snapshot has earned that are not unlocked yet, in definition order. */
export function newAchievements(defs: readonly Achievement[], snapshot: ProgressSnapshot, unlocked: readonly string[]): Achievement[] {
  return defs.filter((a) => !unlocked.includes(a.id) && snapshot[a.metric] >= a.threshold);
}

/** What one flight contributes to daily missions. */
export interface FlightSummary {
  distance: number;
  hoops: number;
  destroyed: number;
  coins: number;
  flights: number;
  targets: number;
  fuelCans: number;
}

export interface MissionTemplate {
  id: string;
  metric: keyof FlightSummary;
  /** `{n}` is replaced with the target. */
  text: string;
  base: number;
  /** Extra target per unlocked level above the first. */
  perLevel: number;
  gems: number;
}

export interface Mission {
  id: string;
  metric: keyof FlightSummary;
  text: string;
  target: number;
  progress: number;
  gems: number;
  claimed: boolean;
}

export interface DailyMissions {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  list: Mission[];
}

/** The same day always offers the same missions; targets grow with progress. */
export function dailyMissions(day: string, templates: readonly MissionTemplate[], highestUnlocked: number, count: number): DailyMissions {
  const rng = createRng(hashString(day));
  const pool = [...templates];
  const list: Mission[] = [];
  while (list.length < count && pool.length > 0) {
    const [t] = pool.splice(Math.floor(rng() * pool.length), 1);
    const target = Math.round(t.base + t.perLevel * (highestUnlocked - 1));
    list.push({ id: t.id, metric: t.metric, text: t.text.replace('{n}', target.toLocaleString('en-US')), target, progress: 0, gems: t.gems, claimed: false });
  }
  return { day, list };
}

/** Keeps today's missions, or deals a new set when the day changed. */
export function refreshMissions(
  current: DailyMissions | null,
  day: string,
  templates: readonly MissionTemplate[],
  highestUnlocked: number,
  count: number,
): DailyMissions {
  return current?.day === day ? current : dailyMissions(day, templates, highestUnlocked, count);
}

export function applyFlight(missions: DailyMissions, flight: FlightSummary): DailyMissions {
  return {
    ...missions,
    list: missions.list.map((m) => ({ ...m, progress: Math.min(m.target, m.progress + Math.max(0, flight[m.metric])) })),
  };
}

export function claimMission(missions: DailyMissions, id: string): { missions: DailyMissions; gems: number } | null {
  const mission = missions.list.find((m) => m.id === id);
  if (!mission || mission.claimed || mission.progress < mission.target) return null;
  return { missions: { ...missions, list: missions.list.map((m) => (m === mission ? { ...m, claimed: true } : m)) }, gems: mission.gems };
}

export const COSMETIC_TYPES = ['paint', 'flame', 'trail', 'decal'] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

/** Cosmetics only change how the rocket looks; they never affect stats. Decals are drawn by id. */
export interface Cosmetic {
  id: string;
  type: CosmeticType;
  name: string;
  price: number;
  color: string;
}

export type CosmeticResult = { ok: true; gems: number; owned: string[] } | { ok: false; error: 'owned' | 'insufficient_gems' };

export function buyCosmetic(wallet: { gems: number; owned: readonly string[] }, item: Cosmetic): CosmeticResult {
  if (wallet.owned.includes(item.id)) return { ok: false, error: 'owned' };
  if (wallet.gems < item.price) return { ok: false, error: 'insufficient_gems' };
  return { ok: true, gems: wallet.gems - item.price, owned: [...wallet.owned, item.id] };
}

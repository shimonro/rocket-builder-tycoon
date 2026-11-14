import { effectiveStat, STAT_KEYS, type Catalog, type Category, type Part, type StatKey } from '../parts/parts';

/** One slot per category; the first four are required to launch. */
export const SLOTS: readonly { category: Category; required: boolean }[] = [
  { category: 'body', required: true },
  { category: 'fuel_tank', required: true },
  { category: 'engine', required: true },
  { category: 'fins', required: true },
  { category: 'booster', required: false },
  { category: 'shield', required: false },
  { category: 'weapon', required: false },
];

export type Rocket = Partial<Record<Category, string>>;

export type RocketStats = Record<StatKey, number> & { mass: number };

export type RankingWeights = Partial<Record<StatKey, number>>;

export function rocketParts(rocket: Rocket, catalog: Catalog): Part[] {
  return SLOTS.flatMap(({ category }) => {
    const id = rocket[category];
    const part = id === undefined ? undefined : catalog.get(id);
    return part ? [part] : [];
  });
}

/** Sums rarity-adjusted stats over the given parts. */
export function rocketStats(parts: readonly Part[]): RocketStats {
  const stats = { mass: 0 } as RocketStats;
  for (const key of STAT_KEYS) stats[key] = 0;
  for (const part of parts) {
    stats.mass += part.mass;
    for (const key of STAT_KEYS) stats[key] += effectiveStat(part, key);
  }
  return stats;
}

/** Ranking = Σ (stat_weight × part_stat × rarity_multiplier), rounded to an integer. */
export function ranking(stats: RocketStats, weights: RankingWeights): number {
  let total = 0;
  for (const key of STAT_KEYS) total += (weights[key] ?? 0) * stats[key];
  return Math.max(0, Math.round(total));
}

export function missingSlots(rocket: Rocket): Category[] {
  return SLOTS.filter((s) => s.required && rocket[s.category] === undefined).map((s) => s.category);
}

export function isLaunchable(rocket: Rocket): boolean {
  return missingSlots(rocket).length === 0;
}

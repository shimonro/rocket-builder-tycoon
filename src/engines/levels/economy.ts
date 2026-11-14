import type { Level } from './levels';

export interface EconomyConfig {
  startingCash: number;
  rankingBonusPerPoint: number;
  maxRankingBonus: number;
  softCapTargetMultiple: number;
  /** Ordered by fromTargetMultiple; distance beyond each threshold pays `rate` of full value. */
  diminishingReturns: { fromTargetMultiple: number; rate: number }[];
  repeatCompletionBonusFactor: number;
  sellBackFactor: number;
  shieldsAndWeaponsFromLevel: number;
}

/** Distance weighted by diminishing returns: full value up to the target, then the configured rates. */
export function effectiveDistance(distance: number, target: number, cfg: EconomyConfig): number {
  const bands = [{ fromTargetMultiple: 0, rate: 1 }, ...cfg.diminishingReturns];
  let total = 0;
  bands.forEach((band, i) => {
    const start = band.fromTargetMultiple * target;
    const next = bands[i + 1];
    const end = next ? next.fromTargetMultiple * target : Infinity;
    if (distance > start) total += (Math.min(distance, end) - start) * band.rate;
  });
  return total;
}

/** Bonus for out-ranking the level requirement, capped. */
export function rankingBonus(ranking: number, minRanking: number, cfg: EconomyConfig): number {
  return Math.min(cfg.maxRankingBonus, Math.max(0, ranking - minRanking) * cfg.rankingBonusPerPoint);
}

export interface PayoutInput {
  distance: number;
  level: Level;
  ranking: number;
  targetReached: boolean;
  /** True when this flight completes the level for the first time. */
  firstCompletion: boolean;
}

export interface PayoutBreakdown {
  distance: number;
  effectiveDistance: number;
  multiplier: number;
  rankingBonus: number;
  /** Distance pay before the soft cap. */
  uncappedPay: number;
  softCap: number;
  distancePay: number;
  capped: boolean;
  completionBonus: number;
  total: number;
}

/** payout = min(effectiveDistance × payoutMultiplier × (1 + rankingBonus), softCap) + completion bonus */
export function computePayout(input: PayoutInput, cfg: EconomyConfig): PayoutBreakdown {
  const { level } = input;
  const distance = Math.max(0, Math.floor(input.distance));
  const effective = effectiveDistance(distance, level.targetDistance, cfg);
  const bonus = rankingBonus(input.ranking, level.minRanking, cfg);
  const uncappedPay = effective * level.payoutMultiplier * (1 + bonus);
  const softCap = level.targetDistance * level.payoutMultiplier * cfg.softCapTargetMultiple;
  const distancePay = Math.round(Math.min(uncappedPay, softCap));
  const completionBonus = input.targetReached
    ? Math.round(level.completionBonus * (input.firstCompletion ? 1 : cfg.repeatCompletionBonusFactor))
    : 0;
  return {
    distance,
    effectiveDistance: effective,
    multiplier: level.payoutMultiplier,
    rankingBonus: bonus,
    uncappedPay,
    softCap,
    distancePay,
    capped: uncappedPay > softCap,
    completionBonus,
    total: distancePay + completionBonus,
  };
}

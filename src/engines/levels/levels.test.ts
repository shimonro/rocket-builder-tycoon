import { describe, expect, it } from 'vitest';
import levelsJson from '../../data/levels/levels.json';
import economyJson from '../../data/config/economy.json';
import { computePayout, effectiveDistance, rankingBonus, type EconomyConfig } from './economy';
import {
  evaluateUnlock,
  highestUnlocked,
  initialProgress,
  parseLevels,
  partLevelCap,
  recordFlight,
  unlockLevel,
  type Level,
} from './levels';

const levels = parseLevels(levelsJson);
const economy: EconomyConfig = economyJson;
const level2 = levels[1];

describe('parseLevels', () => {
  it('accepts the shipped levels', () => {
    expect(levels.length).toBeGreaterThanOrEqual(5);
  });

  it.each([
    ['empty', []],
    ['out-of-order ids', [{ ...levels[1] }]],
    ['negative fee', [{ ...levels[0], unlockFee: -1 }]],
    ['missing obstacle types', [{ ...levels[0], obstacleTypes: [] }]],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseLevels(raw)).toThrow(/Invalid levels/);
  });
});

describe('unlock gate', () => {
  const progress = { unlocked: [1], completed: [1], best: {} };

  it('requires the previous level, the ranking and the fee', () => {
    expect(evaluateUnlock(level2, progress, level2.minRanking, level2.unlockFee).canUnlock).toBe(true);
    expect(evaluateUnlock(level2, initialProgress(), level2.minRanking, level2.unlockFee)).toMatchObject({
      previousCompleted: false,
      canUnlock: false,
    });
    expect(evaluateUnlock(level2, progress, level2.minRanking - 1, level2.unlockFee)).toMatchObject({
      rankingMet: false,
      canUnlock: false,
    });
    expect(evaluateUnlock(level2, progress, level2.minRanking, level2.unlockFee - 1)).toMatchObject({
      canAfford: false,
      canUnlock: false,
    });
  });

  it('treats level 1 as having no previous level and refuses to unlock twice', () => {
    expect(evaluateUnlock(levels[0], { unlocked: [], completed: [], best: {} }, 0, 0).canUnlock).toBe(true);
    expect(evaluateUnlock(levels[0], initialProgress(), 0, 0)).toMatchObject({ alreadyUnlocked: true, canUnlock: false });
  });

  it('charges the fee and records the unlock', () => {
    const result = unlockLevel(level2, progress, 999, level2.unlockFee + 5);
    expect(result).toEqual({ ok: true, cash: 5, progress: { unlocked: [1, 2], completed: [1], best: {} } });
    expect(unlockLevel(level2, progress, 0, 1e9)).toMatchObject({ ok: false, check: { rankingMet: false } });
  });

  it('opens a new part level every two game levels', () => {
    expect(partLevelCap(initialProgress())).toBe(1);
    expect(partLevelCap({ ...progress, unlocked: [1, 2] })).toBe(1);
    expect(partLevelCap({ ...progress, unlocked: [1, 2, 3] })).toBe(2);
    expect(partLevelCap({ ...progress, unlocked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })).toBe(5);
    expect(highestUnlocked({ ...progress, unlocked: [] })).toBe(1);
  });

  it('records completion once and keeps the best distance', () => {
    let p = recordFlight(initialProgress(), 1, 800.9, false);
    expect(p).toEqual({ unlocked: [1], completed: [], best: { '1': 800 } });
    p = recordFlight(p, 1, 1200, true);
    p = recordFlight(p, 1, 500, true);
    expect(p).toEqual({ unlocked: [1], completed: [1], best: { '1': 1200 } });
    expect(recordFlight({ ...p, completed: [3] }, 2, 10, true).completed).toEqual([2, 3]);
  });
});

describe('economy', () => {
  const level: Level = { ...levels[0], targetDistance: 1000, payoutMultiplier: 0.5, minRanking: 100, completionBonus: 300 };

  it('pays full value to the target, 50% to 2× target, then 25%', () => {
    expect(effectiveDistance(800, 1000, economy)).toBe(800);
    expect(effectiveDistance(1500, 1000, economy)).toBe(1250);
    expect(effectiveDistance(2500, 1000, economy)).toBe(1000 + 500 + 125);
  });

  it('gives a capped bonus for out-ranking the requirement', () => {
    expect(rankingBonus(50, 100, economy)).toBe(0);
    expect(rankingBonus(150, 100, economy)).toBeCloseTo(0.1);
    expect(rankingBonus(10000, 100, economy)).toBe(0.5);
  });

  it('computes payout = effective distance × multiplier × (1 + ranking bonus)', () => {
    const p = computePayout({ distance: 2500.7, level, ranking: 150, targetReached: true, firstCompletion: true, coins: 0 }, economy);
    // 1625 × 0.5 × 1.1 = 893.75
    expect(p).toMatchObject({ distance: 2500, distancePay: 894, capped: false, completionBonus: 300, total: 1194, softCap: 1500 });
  });

  it('hard-stops distance pay at the soft cap', () => {
    const p = computePayout({ distance: 50000, level, ranking: 100, targetReached: true, firstCompletion: false, coins: 0 }, economy);
    expect(p).toMatchObject({ distancePay: 1500, capped: true, completionBonus: 75, total: 1575 });
  });

  it('pays no completion bonus short of the target and never pays for negative distance', () => {
    const p = computePayout({ distance: -5, level, ranking: 0, targetReached: false, firstCompletion: false, coins: 0 }, economy);
    expect(p.total).toBe(0);
  });
});

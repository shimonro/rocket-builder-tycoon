import { describe, expect, it } from 'vitest';
import achievementsJson from '../../data/progression/achievements.json';
import cosmeticsJson from '../../data/progression/cosmetics.json';
import missionsJson from '../../data/progression/missions.json';
import {
  applyFlight,
  buyCosmetic,
  claimMission,
  COSMETIC_TYPES,
  dailyMissions,
  newAchievements,
  refreshMissions,
  type Achievement,
  type Cosmetic,
  type FlightSummary,
  type MissionTemplate,
  type ProgressSnapshot,
} from './progression';

const templates = missionsJson as MissionTemplate[];
const zero: ProgressSnapshot = {
  flights: 0, totalDistance: 0, hoops: 0, destroyed: 0, coins: 0, guardians: 0, gemsFound: 0,
  levelsCompleted: 0, highestUnlocked: 1, bestDistance: 0, upgrades: 0, cosmetics: 0,
};
const flight: FlightSummary = { distance: 0, hoops: 0, destroyed: 0, coins: 0, flights: 0, targets: 0, fuelCans: 0 };

describe('achievements', () => {
  const defs = achievementsJson as Achievement[];

  it('unlocks every achievement whose threshold is met, once', () => {
    expect(newAchievements(defs, zero, [])).toEqual([]);
    const snapshot = { ...zero, flights: 25, totalDistance: 9999 };
    expect(newAchievements(defs, snapshot, []).map((a) => a.id)).toEqual(['first_flight', 'frequent_flyer']);
    expect(newAchievements(defs, snapshot, ['first_flight']).map((a) => a.id)).toEqual(['frequent_flyer']);
  });

  it('ships achievements with unique ids, known metrics and gem rewards', () => {
    expect(new Set(defs.map((a) => a.id)).size).toBe(defs.length);
    for (const a of defs) {
      expect(Object.keys(zero)).toContain(a.metric);
      expect(a.gems).toBeGreaterThan(0);
    }
  });
});

describe('daily missions', () => {
  it('deals the same distinct missions for a day and scales targets with progress', () => {
    const a = dailyMissions('2026-11-14', templates, 1, 3);
    expect(a).toEqual(dailyMissions('2026-11-14', templates, 1, 3));
    expect(new Set(a.list.map((m) => m.id)).size).toBe(3);
    const days = ['2026-11-15', '2026-11-16', '2026-11-17'].map((d) => dailyMissions(d, templates, 1, 3).list.map((m) => m.id).join());
    expect(new Set([a.list.map((m) => m.id).join(), ...days]).size).toBeGreaterThan(1);

    const distance = templates.find((t) => t.id === 'fly_distance')!;
    const late = dailyMissions('d', [distance], 5, 3);
    expect(late.list).toHaveLength(1);
    expect(late.list[0]).toMatchObject({ target: 2500 + 4 * 1500, text: 'Fly 8,500 m in total', progress: 0, claimed: false });
  });

  it('keeps today’s missions and renews them the next day', () => {
    const today = dailyMissions('2026-11-14', templates, 1, 3);
    expect(refreshMissions(today, '2026-11-14', templates, 1, 3)).toBe(today);
    expect(refreshMissions(today, '2026-11-15', templates, 1, 3).day).toBe('2026-11-15');
    expect(refreshMissions(null, '2026-11-15', templates, 1, 3).list).toHaveLength(3);
  });

  it('counts flights towards missions, capped at the target, and pays gems once', () => {
    const hoops = {
      day: 'd',
      list: [
        { id: 'h', metric: 'hoops' as const, text: '', target: 5, progress: 0, gems: 7, claimed: false },
        { id: 'c', metric: 'coins' as const, text: '', target: 500, progress: 0, gems: 5, claimed: false },
      ],
    };
    const partway = applyFlight(hoops, { ...flight, hoops: 3, coins: 50 });
    expect(partway.list[0].progress).toBe(3);
    expect(claimMission(partway, 'h')).toBeNull();
    const done = applyFlight(partway, { ...flight, hoops: 9 });
    expect(done.list[0].progress).toBe(5);
    expect(applyFlight(done, { ...flight, hoops: -4 }).list[0].progress).toBe(5);
    const claimed = claimMission(done, 'h')!;
    expect(claimed.gems).toBe(7);
    expect(claimed.missions.list.map((m) => m.claimed)).toEqual([true, false]);
    expect(claimMission(claimed.missions, 'h')).toBeNull();
    expect(claimMission(done, 'nope')).toBeNull();
  });
});

describe('cosmetics', () => {
  const items = cosmeticsJson as Cosmetic[];
  const gold = items.find((c) => c.id === 'paint_gold')!;

  it('sells each cosmetic once, for gems', () => {
    expect(buyCosmetic({ gems: gold.price - 1, owned: [] }, gold)).toEqual({ ok: false, error: 'insufficient_gems' });
    expect(buyCosmetic({ gems: 100, owned: [] }, gold)).toEqual({ ok: true, gems: 100 - gold.price, owned: ['paint_gold'] });
    expect(buyCosmetic({ gems: 100, owned: ['paint_gold'] }, gold)).toEqual({ ok: false, error: 'owned' });
  });

  it('ships cosmetics of known types', () => {
    for (const c of items) expect(COSMETIC_TYPES).toContain(c.type);
    expect(new Set(items.map((c) => c.id)).size).toBe(items.length);
  });
});

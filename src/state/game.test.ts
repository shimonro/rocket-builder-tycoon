import { beforeEach, describe, expect, it } from 'vitest';
import { rocketParts, rocketStats } from '../core/rocket/rocket';
import { catalog, economy, journeyConfig, levels } from '../data';
import { deriveFlightStats } from '../engines/journey/config';
import { createJourney, journeyDistance, stepJourney, type JourneyState } from '../engines/journey/journey';
import { defaultSave } from '../services/persistence/save';
import { useGame } from './game';

const STARTER = ['body_tin_can_hull', 'fuel_tank_jerrycan_tank', 'engine_sparrow_e1', 'fins_stub_fins'];

/** Dodges obstacles ahead and lines up with hoops. Good enough to prove a level is flyable. */
function autopilot(s: JourneyState) {
  const threat = s.obstacles
    .filter((o) => o.y > s.y - 2 && o.y - s.y < 35 && Math.abs(o.x - s.x) < o.r + 4)
    .sort((a, b) => a.y - b.y)[0];
  let steer: number;
  if (threat) steer = s.x < 5 ? 1 : s.x > journeyConfig.worldWidth - 5 ? -1 : threat.x > s.x ? -1 : 1;
  else {
    const hoop = s.hoops.find((h) => !h.crossed && h.y > s.y && h.y - s.y < 60);
    steer = Math.max(-1, Math.min(1, ((hoop ? hoop.x : journeyConfig.worldWidth / 2) - s.x) / 4));
  }
  return { steer, forward: false, backward: false, turbo: false, fire: !!threat };
}

function fly(levelId: number, densityFactor: number) {
  const { save, flightNumber } = useGame.getState();
  const stats = deriveFlightStats(rocketStats(rocketParts(save.rocket, catalog)), journeyConfig, false);
  const ctx = { stats, level: levels[levelId - 1], cfg: journeyConfig, seed: flightNumber, densityFactor };
  let s = createJourney(ctx);
  while (s.status !== 'ended') s = stepJourney(s, autopilot(s), 1 / 60, ctx).state;
  return s;
}

describe('game flow: purchase → assemble → launch → payout', () => {
  beforeEach(() => useGame.getState().loadSave(defaultSave(economy.startingCash)));

  it('plays the locked tutorial from $600 to the first payout', () => {
    const game = () => useGame.getState();

    game().buyPart('engine_sparrow_e1'); // locked: the tutorial wants the welcome step first
    expect(game().save.cash).toBe(600);
    game().tutorialNext();
    expect(game().screen).toBe('shop');

    game().buyPart('fins_stub_fins'); // out of order: still locked
    expect(game().save.inventory).toEqual({});
    for (const id of STARTER) game().buyPart(id);
    expect(game().save.cash).toBe(0);

    game().navigate('hangar');
    for (const id of STARTER) game().equip(id);
    expect(game().save.inventory).toEqual({});
    expect(game().save.tutorialStep).toBe('launch');

    game().launch();
    expect(game().screen).toBe('journey');

    const flight = fly(1, journeyConfig.tutorialDensityFactor);
    expect(flight.targetReached).toBe(true);
    game().finishFlight({
      distance: journeyDistance(flight),
      targetReached: flight.targetReached,
      endReason: flight.endReason ?? 'aborted',
      hoops: flight.hoopsCollected,
      destroyed: flight.obstaclesDestroyed,
      coins: flight.coins,
      fuelCans: flight.fuelCans,
      guardianDefeated: flight.guardianDefeated,
    });

    const { save, lastResult, screen } = game();
    expect(screen).toBe('results');
    expect(lastResult?.firstCompletion).toBe(true);
    expect(lastResult?.payout.completionBonus).toBe(levels[0].completionBonus);
    expect(save.cash).toBe(lastResult?.payout.total);
    expect(lastResult?.achievements.map((a) => a.id)).toContain('first_flight');
    expect(save.gems).toBeGreaterThanOrEqual(5);
    expect(save.missions).toBeNull();
    expect(save.progress.completed).toEqual([1]);

    game().continueFromResults('retry');
    expect(game().save.tutorialStep).toBe('done');
    expect(game().screen).toBe('hangar');
  });

  it('unlocks level 2 only after completion, ranking and fee', () => {
    const game = () => useGame.getState();
    const done = { ...defaultSave(economy.startingCash), tutorialStep: 'done' as const };
    const rocket = { body: STARTER[0], fuel_tank: STARTER[1], engine: STARTER[2], fins: STARTER[3] };
    game().loadSave({ ...done, cash: 10_000, rocket, inventory: { booster_bottle_rocket: 1 }, progress: { unlocked: [1], completed: [1], best: {} } });

    game().unlockLevel(2); // ranking 152 < 170
    expect(game().save.progress.unlocked).toEqual([1]);

    game().equip('booster_bottle_rocket');
    game().unlockLevel(2);
    expect(game().save.progress.unlocked).toEqual([1, 2]);
    expect(game().save.cash).toBe(10_000 - levels[1].unlockFee);
    expect(game().save.selectedLevel).toBe(2);

    // Shields and weapons open up with level 2.
    game().buyPart('shield_bubble_shield');
    expect(game().save.inventory).toHaveProperty('shield_bubble_shield', 1);
  });

  it('upgrades parts for ranking, sells cosmetics for gems and pays missions once', () => {
    const game = () => useGame.getState();
    const rocket = { body: STARTER[0], fuel_tank: STARTER[1], engine: STARTER[2], fins: STARTER[3] };
    game().loadSave({ ...defaultSave(economy.startingCash), tutorialStep: 'done', cash: 1000, rocket, gems: 20 });
    expect(game().save.missions?.list).toHaveLength(3);

    // The $200 engine's first upgrade costs $100 and adds 10% thrust: 60 → 66 ranking points from thrust.
    const before = game().save;
    game().upgradePart('engine_sparrow_e1');
    expect(game().save.cash).toBe(900);
    expect(game().save.upgrades).toEqual({ engine_sparrow_e1: 1 });
    game().upgradePart('booster_bottle_rocket'); // not owned
    expect(game().notice).toMatch(/do not own/);
    expect(game().save.cash).toBe(900);
    expect(before.upgrades).toEqual({});

    game().buyCosmetic('paint_gold'); // 60 gems
    expect(game().save.cosmetics.owned).toEqual([]);
    game().buyCosmetic('paint_crimson');
    expect(game().save).toMatchObject({ gems: 5, cosmetics: { owned: ['paint_crimson'], equipped: { paint: 'paint_crimson' } } });
    game().equipCosmetic('paint', null);
    expect(game().save.cosmetics.equipped).toEqual({});
    game().equipCosmetic('flame', 'flame_ice'); // not owned
    expect(game().save.cosmetics.equipped).toEqual({});

    const mission = game().save.missions!.list[0];
    game().claimMission(mission.id); // not done yet
    expect(game().save.gems).toBe(5);
    useGame.setState({ save: { ...game().save, missions: { ...game().save.missions!, list: game().save.missions!.list.map((m) => ({ ...m, progress: m.target })) } } });
    game().claimMission(mission.id);
    game().claimMission(mission.id);
    expect(game().save.gems).toBe(5 + mission.gems);
  });

  it('lets returning players skip the tutorial and remembers dismissed tips', () => {
    const game = () => useGame.getState();
    game().skipTutorial();
    expect(game().save).toMatchObject({ tutorialStep: 'done', cash: economy.startingCash });
    expect(game().screen).toBe('shop');
    game().buyPart('engine_sparrow_e1');
    expect(game().save.inventory).toEqual({ engine_sparrow_e1: 1 });
    game().markTip('missions');
    game().markTip('missions');
    expect(game().save.tips).toEqual(['missions']);
  });
});

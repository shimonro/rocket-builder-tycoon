import { describe, expect, it } from 'vitest';
import { rocketParts, rocketStats } from '../../../src/core/rocket/rocket';
import { catalog, economy, journeyConfig, levels, RULES_VERSION } from '../../../src/data';
import { deriveFlightStats } from '../../../src/engines/journey/config';
import { createJourney, FIXED_STEP, journeyDistance, stepJourney, type JourneyState } from '../../../src/engines/journey/journey';
import { appendInput, decodeInput, encodeInput } from '../../../src/engines/journey/replay';
import { defaultSave, type SaveData } from '../../../src/services/persistence/save';
import { MAX_STEPS, pilotName, verifyRun, type RunBody } from './verify';

const rocket = {
  body: 'body_tin_can_hull',
  fuel_tank: 'fuel_tank_jerrycan_tank',
  engine: 'engine_sparrow_e1',
  fins: 'fins_stub_fins',
  booster: 'booster_bottle_rocket',
};
const save: SaveData = {
  ...defaultSave(economy.startingCash),
  tutorialStep: 'done',
  rocket,
  upgrades: { engine_sparrow_e1: 2 },
  progress: { unlocked: [1, 2], completed: [1], best: {} },
};

/** Flies level 2 the way the client does: fixed steps, quantized input, recorded log. */
function flyLevel2(seed: number) {
  const stats = deriveFlightStats(rocketStats(rocketParts(rocket, catalog), save.upgrades), journeyConfig, true);
  const ctx = { stats, level: levels[1], cfg: journeyConfig, seed, densityFactor: 1 };
  const log: number[] = [];
  let s: JourneyState = createJourney(ctx);
  for (let i = 0; s.status !== 'ended'; i++) {
    const threat = s.obstacles.find((o) => o.y > s.y && o.y - s.y < 30 && Math.abs(o.x - s.x) < o.r + 3);
    const code = encodeInput({ steer: threat ? (threat.x > s.x ? -1 : 1) : (25 - s.x) / 10, forward: i % 400 < 300, backward: false, turbo: i % 240 === 0, fire: !!threat });
    appendInput(log, code);
    s = stepJourney(s, decodeInput(code), FIXED_STEP, ctx).state;
  }
  return { distance: journeyDistance(s), run: { levelId: 2, seed, log, aborted: false, rulesVersion: RULES_VERSION, name: 'Ace' } as RunBody };
}

describe('verifyRun', () => {
  const { distance, run } = flyLevel2(4242);

  it('scores a run by replaying it with the saved rocket', () => {
    expect(distance).toBeGreaterThan(500);
    expect(verifyRun(run, save)).toEqual({ ok: true, distance });
  });

  it('ignores how the client describes the flight: a weaker saved rocket replays shorter', () => {
    const r = verifyRun(run, { ...save, upgrades: {} });
    expect(r.ok && r.distance).not.toBe(distance);
  });

  it.each([
    ['an outdated client', { ...run, rulesVersion: 'old' }, save, 409],
    ['an unknown level', { ...run, levelId: 99 }, save, 400],
    ['a fractional seed', { ...run, seed: 1.5 }, save, 400],
    ['a missing abort flag', { ...run, aborted: undefined }, save, 400],
    ['a malformed log', { ...run, log: [1] }, save, 400],
    ['an overlong log', { ...run, log: [0, MAX_STEPS + 1] }, save, 400],
    ['no cloud save', run, null, 403],
    ['a locked level', run, { ...save, progress: { ...save.progress, unlocked: [1] } }, 403],
    ['an unfinished tutorial', run, { ...save, tutorialStep: 'launch' as const }, 403],
    ['an incomplete rocket', run, { ...save, rocket: { body: rocket.body } }, 403],
    ['an unknown part', run, { ...save, rocket: { ...rocket, weapon: 'laser_9000' } }, 403],
    ['a part above the level cap', run, { ...save, rocket: { ...rocket, engine: 'engine_helios_e4' } }, 403],
    ['a replay that never ends', { ...run, log: run.log.slice(0, 2) }, save, 400],
  ])('rejects %s', (_label, body, cloudSave, status) => {
    expect(verifyRun(body as Partial<RunBody>, cloudSave)).toMatchObject({ ok: false, status });
  });

  it('accepts an aborted run at the distance it reached', () => {
    const r = verifyRun({ ...run, log: [run.log[0], 300], aborted: true }, save);
    expect(r).toMatchObject({ ok: true });
  });
});

describe('pilotName', () => {
  it('cleans names and falls back to one derived from the user id', () => {
    expect(pilotName('  Ace <script>  ', 'abcd-1234')).toBe('Ace script');
    expect(pilotName('Zoë_The-Great 123456789', 'x')).toBe('Zoë_The-Great 12');
    expect(pilotName('', 'abcd-1234')).toBe('Pilot ABCD');
    expect(pilotName(42, 'abcd-1234')).toBe('Pilot ABCD');
  });
});

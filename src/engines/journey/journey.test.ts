import { describe, expect, it } from 'vitest';
import journeyJson from '../../data/config/journey.json';
import { deriveFlightStats, type FlightStats, type JourneyConfig } from './config';
import {
  abortJourney,
  createJourney,
  journeyDistance,
  FIXED_STEP,
  MAX_STEP,
  NO_INPUT,
  stepJourney,
  type JourneyContext,
  type JourneyEvent,
  type JourneyInput,
  type JourneyState,
} from './journey';
import { appendInput, decodeInput, encodeInput, isValidLog, replayJourney } from './replay';
import { NO_LOCK, nextIntro, tapBackward, tapForward, TAP_WINDOW } from './assist';
import { generateChunk, type JourneyLevel, type Obstacle } from './spawner';

const cfg: JourneyConfig = journeyJson;
const stats: FlightStats = {
  maxSpeed: 40,
  accel: 36,
  lateralMax: 20,
  lateralAccel: 60,
  fuelCapacity: 30,
  burnRate: 1,
  hull: 60,
  shield: 0,
  weaponDamage: 0,
  ammo: 0,
};
const emptyLevel: JourneyLevel = { id: 1, targetDistance: 1000, obstacleDensity: 0, obstacleTypes: ['asteroid'], hoopDensity: 0 };

function context(overrides: Partial<FlightStats> = {}, level: Partial<JourneyLevel> = {}): JourneyContext {
  return { stats: { ...stats, ...overrides }, level: { ...emptyLevel, ...level }, cfg, seed: 7, densityFactor: 1 };
}

function run(state: JourneyState, ctx: JourneyContext, seconds: number, input: JourneyInput = NO_INPUT) {
  const events: JourneyEvent[] = [];
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    const r = stepJourney(s, input, 1 / 60, ctx);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

function obstacle(o: Partial<Obstacle>): Obstacle {
  return { id: 999, kind: 'asteroid', x: 25, y: 10, r: 2, vx: 0, vy: 0, wobble: 0, phase: 0, hp: 30, maxHp: 30, damage: 25, ...o };
}

describe('deriveFlightStats', () => {
  const rocket = { thrust: 40, mass: 50, fuelCapacity: 30, fuelEfficiency: 5, maneuverability: 20, hull: 60, shield: 30, weaponDamage: 20 };

  it('turns rocket stats into speed, steering and fuel burn', () => {
    const f = deriveFlightStats(rocket, cfg, true);
    expect(f.maxSpeed).toBeCloseTo(40);
    expect(f.accel).toBeCloseTo(36);
    expect(f.burnRate).toBeCloseTo(1 / 1.05);
    expect(f.lateralMax).toBeCloseTo(20);
    expect(f.lateralAccel).toBeCloseTo(60);
    expect(f).toMatchObject({ fuelCapacity: 30, hull: 60, shield: 30, weaponDamage: 20, ammo: 12 });
  });

  it('drops shields and weapons when they are not allowed yet', () => {
    expect(deriveFlightStats(rocket, cfg, false)).toMatchObject({ shield: 0, weaponDamage: 0, ammo: 0 });
  });

  it('heavier rockets are slower and steer worse', () => {
    const heavy = deriveFlightStats({ ...rocket, mass: 100 }, cfg, true);
    expect(heavy.maxSpeed).toBeLessThan(40);
    expect(heavy.lateralMax).toBeLessThan(20);
  });

  it('guards against zero mass, zero hull and extreme inefficiency', () => {
    const f = deriveFlightStats({ ...rocket, mass: 0, hull: 0, fuelEfficiency: -500 }, cfg, true);
    expect(Number.isFinite(f.maxSpeed)).toBe(true);
    expect(f.hull).toBe(1);
    expect(f.burnRate).toBeCloseTo(2);
  });
});

describe('generateChunk', () => {
  const level: JourneyLevel = { id: 3, targetDistance: 1000, obstacleDensity: 4.5, obstacleTypes: ['asteroid', 'debris'], hoopDensity: 1 };

  it('is deterministic for a seed and chunk index', () => {
    expect(generateChunk(2, level, cfg, 11, 1, 1)).toEqual(generateChunk(2, level, cfg, 11, 1, 1));
    expect(generateChunk(2, level, cfg, 11, 1, 1)).not.toEqual(generateChunk(3, level, cfg, 11, 1, 1));
  });

  it('places everything inside the chunk and the world', () => {
    const chunk = generateChunk(2, level, cfg, 11, 1, 100);
    const y0 = cfg.firstChunkY + 2 * cfg.chunkSize;
    expect(chunk.obstacles.length).toBeGreaterThanOrEqual(4);
    expect(chunk.obstacles.length).toBeLessThanOrEqual(5);
    expect(chunk.hoops).toHaveLength(1);
    for (const o of chunk.obstacles) {
      expect(o.y).toBeGreaterThanOrEqual(y0);
      expect(o.y).toBeLessThan(y0 + cfg.chunkSize);
      expect(o.x - o.r).toBeGreaterThanOrEqual(0);
      expect(o.x + o.r).toBeLessThanOrEqual(cfg.worldWidth);
      expect(level.obstacleTypes).toContain(o.kind);
    }
    const ids = [...chunk.obstacles, ...chunk.hoops, ...chunk.pickups, ...chunk.winds].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(chunk.nextId).toBe(100 + ids.length);
  });

  it('scales obstacle strength with the level and thins them for the tutorial', () => {
    const l1 = generateChunk(0, { ...level, id: 1, obstacleTypes: ['asteroid'] }, cfg, 5, 1, 1).obstacles[0];
    const l5 = generateChunk(0, { ...level, id: 5, obstacleTypes: ['asteroid'] }, cfg, 5, 1, 1).obstacles[0];
    expect(l1.damage).toBe(25);
    expect(l5.damage).toBeCloseTo(25 * (1 + 4 * cfg.obstacleScalePerLevel));
    let full = 0;
    let thin = 0;
    for (let i = 0; i < 40; i++) {
      full += generateChunk(i, level, cfg, 5, 1, 1).obstacles.length;
      thin += generateChunk(i, level, cfg, 5, cfg.tutorialDensityFactor, 1).obstacles.length;
    }
    expect(full).toBeGreaterThanOrEqual(160);
    expect(full).toBeLessThanOrEqual(200);
    expect(thin).toBeGreaterThan(40);
    expect(thin).toBeLessThan(80);
  });
});

describe('stepJourney: thrust and fuel', () => {
  it('climbs at cruise speed and burns fuel proportional to throttle', () => {
    const ctx = context();
    const { state } = run(createJourney(ctx), ctx, 3);
    expect(state.vy).toBeCloseTo(28);
    expect(state.fuel).toBeCloseTo(30 - 3 * 0.7, 1);
    expect(state.status).toBe('flying');
  });

  it('flies faster forward and reverses when braking', () => {
    const ctx = context();
    expect(run(createJourney(ctx), ctx, 3, { ...NO_INPUT, forward: true }).state.vy).toBeCloseTo(40);
    expect(run(createJourney(ctx), ctx, 3, { ...NO_INPUT, backward: true }).state.vy).toBeCloseTo(-12);
  });

  it('glides when the fuel runs out and ends once it stops climbing', () => {
    const ctx = context({ fuelCapacity: 1 });
    const { state, events } = run(createJourney(ctx), ctx, 20);
    const types = events.map((e) => e.type);
    expect(types.indexOf('fuelEmpty')).toBeGreaterThan(-1);
    expect(types.at(-1)).toBe('ended');
    expect(state).toMatchObject({ status: 'ended', endReason: 'fuel', vy: 0, fuel: 0 });
    expect(journeyDistance(state)).toBe(Math.floor(state.maxY));
    expect(state.y).toBeGreaterThan(5);
  });

  it('ends immediately when the fuel runs out while reversing', () => {
    const ctx = context({ fuelCapacity: 0.05 });
    const { state } = run(createJourney(ctx), ctx, 1, { ...NO_INPUT, backward: true });
    expect(state.endReason).toBe('fuel');
  });
});

describe('stepJourney: turbo', () => {
  it('costs a little fuel, boosts speed and then cools down', () => {
    const ctx = context();
    const cruising = run(createJourney(ctx), ctx, 3).state;
    const first = stepJourney(cruising, { ...NO_INPUT, turbo: true }, 1 / 60, ctx);
    expect(first.events).toContainEqual({ type: 'turbo' });
    expect(cruising.fuel - first.state.fuel).toBeCloseTo(30 * cfg.turbo.fuelCost + 0.7 / 60);
    const boosted = run(first.state, ctx, 1, { ...NO_INPUT, turbo: true });
    expect(boosted.events.filter((e) => e.type === 'turbo')).toHaveLength(0);
    expect(boosted.state.vy).toBeGreaterThan(28 * 1.4);
    const recovered = run(boosted.state, ctx, cfg.turbo.cooldown + 1);
    expect(recovered.state.vy).toBeCloseTo(28, 0);
    expect(stepJourney(recovered.state, { ...NO_INPUT, turbo: true }, 1 / 60, ctx).events).toContainEqual({ type: 'turbo' });
  });

  it('is not available while gliding', () => {
    const ctx = context();
    const gliding = { ...createJourney(ctx), status: 'gliding' as const, vy: 30 };
    expect(stepJourney(gliding, { ...NO_INPUT, turbo: true }, 1 / 60, ctx).events).toEqual([]);
  });
});

describe('stepJourney: steering', () => {
  it('steers toward the input and stops at the walls', () => {
    const ctx = context();
    const left = run(createJourney(ctx), ctx, 0.25, { ...NO_INPUT, steer: -1 }).state;
    expect(left.x).toBeLessThan(25);
    const wall = run(createJourney(ctx), ctx, 5, { ...NO_INPUT, steer: 5 }).state;
    expect(wall.x).toBe(cfg.worldWidth - cfg.rocketRadius);
    expect(wall.vx).toBeLessThanOrEqual(stats.lateralAccel / 60);
  });
});

describe('stepJourney: collisions', () => {
  it('lets the shield absorb damage before the hull', () => {
    const ctx = context({ shield: 10 });
    const s = { ...createJourney(ctx), obstacles: [obstacle({ y: 1 })] };
    const { state, events } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(events).toContainEqual({ type: 'hit', x: 25, y: 1, damage: 25, absorbed: 10 });
    expect(state).toMatchObject({ shield: 0, hull: 45, obstacles: [] });
    expect(state.invulnerable).toBeCloseTo(cfg.invulnerability);
  });

  it('ignores hits while briefly invulnerable', () => {
    const ctx = context();
    const s = { ...createJourney(ctx), invulnerable: 0.5, obstacles: [obstacle({ y: 0 })] };
    const { state } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state.hull).toBe(60);
    expect(state.obstacles).toHaveLength(1);
  });

  it('misses obstacles that are just out of reach', () => {
    const ctx = context();
    const s = { ...createJourney(ctx), obstacles: [obstacle({ x: 25 + 2 + cfg.rocketRadius + 0.01, y: 0 })] };
    expect(stepJourney(s, NO_INPUT, 1 / 60, ctx).state.hull).toBe(60);
  });

  it('destroys the rocket when the hull reaches zero', () => {
    const ctx = context({ hull: 20 });
    const s = { ...createJourney(ctx), hull: 20, obstacles: [obstacle({ y: 0.2 })] };
    const { state, events } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state).toMatchObject({ hull: 0, status: 'ended', endReason: 'destroyed' });
    expect(events.at(-1)).toEqual({ type: 'ended', reason: 'destroyed' });
  });

  it('bounces drifting obstacles off the walls and weaves wobblers', () => {
    const ctx = context();
    const s = {
      ...createJourney(ctx),
      obstacles: [obstacle({ id: 1, x: 2.05, y: 80, vx: -10 }), obstacle({ id: 2, x: 30, y: 80, wobble: 10 })],
    };
    const { state } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state.obstacles[0]).toMatchObject({ x: 2, vx: 10 });
    expect(state.obstacles[1].x).toBeGreaterThan(30);
  });

  it('drops obstacles and hoops far below the rocket', () => {
    const ctx = context();
    const s = {
      ...createJourney(ctx),
      y: 500,
      maxY: 500,
      obstacles: [obstacle({ y: 500 - cfg.despawnBelow - 1 })],
      hoops: [{ id: 5, x: 25, y: 10, crossed: true, collected: false }],
    };
    const { state } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state.obstacles.filter((o) => o.id === 999)).toEqual([]);
    expect(state.hoops.filter((h) => h.id === 5)).toEqual([]);
  });
});

describe('stepJourney: weapons', () => {
  const armed = context({ weaponDamage: 20, ammo: 3 });

  it('fires a shot that destroys a weak obstacle ahead', () => {
    const s = { ...createJourney(armed), obstacles: [obstacle({ y: 20, hp: 15 })] };
    const { state, events } = run(s, armed, 0.3, { ...NO_INPUT, fire: true });
    expect(events.filter((e) => e.type === 'fire')).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'obstacleDestroyed', kind: 'asteroid' }));
    expect(state).toMatchObject({ ammo: 2, obstaclesDestroyed: 1, obstacles: [], projectiles: [] });
  });

  it('chips tougher obstacles and respects cooldown and ammo', () => {
    const s = { ...createJourney(armed), obstacles: [obstacle({ y: 60, hp: 100 })] };
    const { state, events } = run(s, armed, 2, { ...NO_INPUT, fire: true });
    expect(events.filter((e) => e.type === 'fire')).toHaveLength(3);
    expect(state.ammo).toBe(0);
    expect(state.obstacles[0].hp).toBe(40);
  });

  it('cannot fire without a weapon and lets shots expire', () => {
    const unarmed = context();
    expect(stepJourney(createJourney(unarmed), { ...NO_INPUT, fire: true }, 1 / 60, unarmed).events).toEqual([]);
    const { state } = run(createJourney(armed), armed, cfg.weapon.projectileLife + 0.1, { ...NO_INPUT, fire: true });
    expect(state.projectiles.length).toBeLessThan(3);
    expect(run(state, armed, cfg.weapon.projectileLife + 0.1).state.projectiles).toEqual([]);
  });
});

describe('stepJourney: hoops, target and spawning', () => {
  it('boosts speed for free through a hoop and marks missed hoops', () => {
    const ctx = context();
    const s = {
      ...createJourney(ctx),
      vy: 28,
      hoops: [
        { id: 1, x: 25, y: 2, crossed: false, collected: false },
        { id: 2, x: 5, y: 3, crossed: false, collected: false },
      ],
    };
    const { state, events } = run(s, ctx, 0.2);
    expect(events.filter((e) => e.type === 'hoop')).toHaveLength(1);
    expect(state.hoops).toMatchObject([{ collected: true, crossed: true }, { collected: false, crossed: true }]);
    expect(state.hoopsCollected).toBe(1);
    expect(state.hoopTime).toBeGreaterThan(0);
    const boosted = run(state, ctx, 1.5).state;
    expect(boosted.vy).toBeGreaterThan(28 * 1.25);
  });

  it('reports the target once and keeps flying past it', () => {
    const ctx = context({}, { targetDistance: 20 });
    const { state, events } = run(createJourney(ctx), ctx, 3);
    expect(events.filter((e) => e.type === 'targetReached')).toHaveLength(1);
    expect(state.targetReached).toBe(true);
    expect(state.status).toBe('flying');
  });

  it('generates sky ahead of the rocket as it climbs', () => {
    const ctx = context({}, { obstacleDensity: 3, hoopDensity: 1 });
    const first = stepJourney(createJourney(ctx), NO_INPUT, 1 / 60, ctx).state;
    expect(first.nextChunk).toBe(2);
    const later = run(first, ctx, 10, { ...NO_INPUT, steer: -1 }).state;
    expect(later.nextChunk).toBeGreaterThan(3);
    expect(Math.max(...later.obstacles.map((o) => o.y))).toBeGreaterThan(later.y);
  });
});

describe('stepJourney: lifecycle', () => {
  it('clamps long frames and ignores negative ones', () => {
    const ctx = context();
    expect(stepJourney(createJourney(ctx), NO_INPUT, 5, ctx).state.time).toBeCloseTo(MAX_STEP);
    expect(stepJourney(createJourney(ctx), NO_INPUT, -1, ctx).state.time).toBe(0);
  });

  it('can be aborted and does nothing once ended', () => {
    const ctx = context();
    const aborted = abortJourney(createJourney(ctx));
    expect(aborted).toMatchObject({ status: 'ended', endReason: 'aborted' });
    expect(abortJourney(aborted)).toBe(aborted);
    expect(stepJourney(aborted, NO_INPUT, 1 / 60, ctx)).toEqual({ state: aborted, events: [] });
  });
});

describe('generateChunk: variety', () => {
  const base: JourneyLevel = { id: 1, targetDistance: 1000, obstacleDensity: 0, obstacleTypes: ['asteroid'], hoopDensity: 0 };
  const chunks = (level: JourneyLevel, n = 60) => Array.from({ length: n }, (_, i) => generateChunk(i, level, cfg, 3, 1, 1));

  it('adds meteor showers from their level on, falling towards the rocket', () => {
    expect(chunks(base).some((c) => c.shower)).toBe(false);
    const showers = chunks({ ...base, id: cfg.meteorShower.fromLevel }).filter((c) => c.shower);
    expect(showers.length).toBeGreaterThan(2);
    const meteors = showers[0].obstacles.filter((o) => o.kind === 'meteor');
    expect(meteors).toHaveLength(cfg.meteorShower.count);
    for (const m of meteors) {
      expect(-m.vy).toBeGreaterThanOrEqual(cfg.meteorShower.speed[0]);
      expect(-m.vy).toBeLessThanOrEqual(cfg.meteorShower.speed[1]);
    }
  });

  it('places one guardian just before the finish line from its level on', () => {
    const guardians = (level: JourneyLevel) => chunks(level).flatMap((c) => c.obstacles.filter((o) => o.kind === 'guardian'));
    expect(guardians(base)).toEqual([]);
    const found = guardians({ ...base, id: cfg.guardian.fromLevel });
    expect(found).toHaveLength(1);
    expect(found[0].y).toBe(1000 - cfg.guardian.offset);
  });

  it('adds wind bands inside the chunk from their level on', () => {
    expect(chunks(base).flatMap((c) => c.winds)).toEqual([]);
    const level = { ...base, id: cfg.wind.fromLevel };
    const all = chunks(level);
    const winds = all.flatMap((c) => c.winds);
    expect(winds.length).toBeGreaterThan(4);
    expect(winds.some((w) => w.force < 0) && winds.some((w) => w.force > 0)).toBe(true);
    all.forEach((c, i) => {
      const y0 = cfg.firstChunkY + i * cfg.chunkSize;
      for (const w of c.winds) {
        expect(w.y0).toBeGreaterThanOrEqual(y0);
        expect(w.y1).toBeLessThanOrEqual(y0 + cfg.chunkSize);
        expect(Math.abs(w.force)).toBeGreaterThanOrEqual(cfg.wind.force[0]);
      }
    });
  });

  it('lays coin trails, the odd fuel can and rare gems (none when the sky density is zero)', () => {
    const pickups = chunks(base).flatMap((c) => c.pickups);
    const coins = pickups.filter((p) => p.kind === 'coin');
    const cans = pickups.filter((p) => p.kind === 'fuel');
    const gems = pickups.filter((p) => p.kind === 'gem');
    expect(gems.length).toBeGreaterThan(0);
    expect(gems.length).toBeLessThan(cans.length);
    const sparse = Array.from({ length: 60 }, (_, i) => generateChunk(i, base, { ...cfg, gem: { ...cfg.gem, chance: 0.05 } }, 3, 0, 1));
    expect(sparse.flatMap((c) => c.pickups).some((p) => p.kind === 'gem')).toBe(false);
    expect(coins.length % cfg.coins.rowSize).toBe(0);
    expect(coins.length / cfg.coins.rowSize).toBeGreaterThan(60 * cfg.coins.rowsPer100m * 0.6);
    expect(cans.length).toBeGreaterThan(2);
    expect(cans.length).toBeLessThan(20);
    for (const p of pickups) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(cfg.worldWidth);
    }
  });
});

describe('stepJourney: variety', () => {
  it('lets wind push the rocket sideways only inside the band', () => {
    const ctx = context();
    const s = { ...createJourney(ctx), winds: [{ id: 1, y0: -5, y1: 5, force: 10 }] };
    expect(stepJourney(s, NO_INPUT, 0.1 / 3, ctx).state.x).toBeCloseTo(25 + 10 / 30);
    const above = { ...s, winds: [{ id: 1, y0: 50, y1: 60, force: 10 }] };
    expect(stepJourney(above, NO_INPUT, 0.1 / 3, ctx).state.x).toBe(25);
  });

  it('moves meteors down and announces showers as they spawn', () => {
    const ctx = context();
    const s = { ...createJourney(ctx), obstacles: [obstacle({ y: 100, vy: -15 })] };
    expect(stepJourney(s, NO_INPUT, 0.1, ctx).state.obstacles[0].y).toBeCloseTo(100 - 15 * MAX_STEP);
    const stormy = context({}, { id: cfg.meteorShower.fromLevel });
    const { events } = run(createJourney(stormy), stormy, 60, { ...NO_INPUT, forward: true });
    expect(events.some((e) => e.type === 'meteorShower')).toBe(true);
  });

  it('collects coins and refills fuel from cans, even while gliding', () => {
    const ctx = context();
    const s = {
      ...createJourney(ctx),
      fuel: 0,
      status: 'gliding' as const,
      vy: 20,
      pickups: [
        { id: 1001, kind: 'coin' as const, x: 25, y: 1 },
        { id: 1002, kind: 'fuel' as const, x: 26, y: 0.5 },
        { id: 1003, kind: 'coin' as const, x: 40, y: 1 },
      ],
    };
    const { state, events } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state).toMatchObject({ coins: 1, fuelCans: 1, status: 'flying' });
    expect(state.fuel).toBeCloseTo(stats.fuelCapacity * cfg.fuelCan.refill);
    expect(state.pickups.map((p) => p.id)).not.toContain(1001);
    expect(state.pickups.map((p) => p.id)).toContain(1003);
    expect(events.map((e) => e.type)).toEqual(['coin', 'fuelCan']);
  });

  it('catches gems within reach and leaves ones just out of reach', () => {
    const ctx = context();
    const reach = cfg.rocketRadius + cfg.gem.radius;
    const s = {
      ...createJourney(ctx),
      pickups: [
        { id: 9001, kind: 'gem' as const, x: 25 + reach - 0.05, y: 0 },
        { id: 9002, kind: 'gem' as const, x: 25 - reach - 0.05, y: 0 },
      ],
    };
    const { state, events } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state.gems).toBe(1);
    expect(state.pickups.filter((p) => p.id > 9000).map((p) => p.id)).toEqual([9002]);
    expect(events).toContainEqual({ type: 'gem', x: s.pickups[0].x, y: 0 });
  });

  it('never overfills the tank and drops pickups left far behind', () => {
    const ctx = context();
    const s = {
      ...createJourney(ctx),
      y: 500,
      maxY: 500,
      nextChunk: 100,
      pickups: [
        { id: 1, kind: 'fuel' as const, x: 25, y: 500 },
        { id: 2, kind: 'coin' as const, x: 25, y: 500 - cfg.despawnBelow - 1 },
      ],
      winds: [{ id: 3, y0: 0, y1: 10, force: 5 }],
    };
    const { state } = stepJourney(s, NO_INPUT, 1 / 60, ctx);
    expect(state.fuel).toBeCloseTo(stats.fuelCapacity);
    expect(state).toMatchObject({ pickups: [], winds: [], coins: 0 });
  });

  it('keeps the guardian after a ram, but pays coins when it is shot down', () => {
    const ctx = context({ weaponDamage: 200, ammo: 3 });
    const guardian = obstacle({ kind: 'guardian', y: 0.5, r: 6, hp: 100, damage: 45 });
    const rammed = stepJourney({ ...createJourney(ctx), obstacles: [guardian] }, NO_INPUT, 1 / 60, ctx).state;
    expect(rammed.hull).toBe(15);
    expect(rammed.obstacles).toHaveLength(1);

    const s = { ...createJourney(ctx), obstacles: [{ ...guardian, y: 30 }] };
    const { state, events } = run(s, ctx, 0.5, { ...NO_INPUT, fire: true });
    expect(state).toMatchObject({ guardianDefeated: true, coins: cfg.guardian.coinReward, obstacles: [] });
    expect(events).toContainEqual(expect.objectContaining({ type: 'guardianDefeated' }));
  });
});

describe('replay', () => {
  it('packs inputs losslessly at tenth-step steering', () => {
    const input = { steer: -0.43, forward: true, backward: false, turbo: true, fire: true };
    expect(decodeInput(encodeInput(input))).toEqual({ ...input, steer: -0.4 });
    expect(decodeInput(encodeInput({ ...NO_INPUT, steer: 7, backward: true }))).toEqual({ ...NO_INPUT, steer: 1, backward: true });
    expect(decodeInput(encodeInput(NO_INPUT))).toEqual(NO_INPUT);
  });

  it('run-length encodes the log and validates untrusted logs', () => {
    const log: number[] = [];
    for (const code of [5, 5, 5, 9, 5]) appendInput(log, code);
    expect(log).toEqual([5, 3, 9, 1, 5, 1]);
    expect(isValidLog(log, 5)).toBe(true);
    expect(isValidLog(log, 4)).toBe(false);
    expect(isValidLog('x', 9)).toBe(false);
    expect(isValidLog([5], 9)).toBe(false);
    expect(isValidLog([21 << 4, 1], 9)).toBe(false);
    expect(isValidLog([-1, 1], 9)).toBe(false);
    expect(isValidLog([5, 0], 9)).toBe(false);
    expect(isValidLog([5, 1.5], 9)).toBe(false);
  });

  it('reproduces a live flight exactly from its log', () => {
    const ctx = context({ weaponDamage: 20, ammo: 12 }, { id: 5, obstacleDensity: 3, hoopDensity: 1, obstacleTypes: ['asteroid', 'mine'] });
    const log: number[] = [];
    let live = createJourney(ctx);
    for (let i = 0; live.status !== 'ended' && i < 4000; i++) {
      const raw = { steer: Math.sin(i / 40) * 0.77, forward: i % 300 < 200, backward: false, turbo: i % 500 === 0, fire: i % 90 < 3 };
      const code = encodeInput(raw);
      appendInput(log, code);
      live = stepJourney(live, decodeInput(code), FIXED_STEP, ctx).state;
    }
    const replayed = replayJourney(ctx, log, live.status !== 'ended');
    expect(journeyDistance(replayed)).toBe(journeyDistance(live));
    expect(replayed.coins).toBe(live.coins);
    expect(replayed.status).toBe('ended');
    // A log that stops early without an abort leaves the flight running.
    expect(replayJourney(ctx, log.slice(0, 2), false).status).not.toBe('ended');
    expect(replayJourney(ctx, log.slice(0, 2), true)).toMatchObject({ status: 'ended', endReason: 'aborted' });
  });
});

describe('flight assists', () => {
  it('locks forward after three quick taps and unlocks on one backward tap', () => {
    let lock = tapForward(NO_LOCK, 10);
    lock = tapForward(lock, 10.2);
    expect(lock.on).toBe(false);
    lock = tapForward(lock, 10 + TAP_WINDOW - 0.1);
    expect(lock).toEqual({ on: true, taps: [] });
    expect(tapForward(lock, 11)).toBe(lock);
    expect(tapBackward()).toEqual({ on: false, taps: [] });
  });

  it('does not lock when the taps are spread out', () => {
    let lock = tapForward(NO_LOCK, 0);
    lock = tapForward(lock, 0.5);
    // The first tap is now older than the window, so this is only the second tap in it.
    lock = tapForward(lock, TAP_WINDOW + 0.1);
    expect(lock.on).toBe(false);
    expect(lock.taps).toEqual([0.5, TAP_WINDOW + 0.1]);
  });

  it('introduces the nearest new kind of thing ahead, once per kind', () => {
    const ctx = context();
    const s: JourneyState = {
      ...createJourney(ctx),
      y: 100,
      hoops: [
        { id: 1, x: 10, y: 140, crossed: false, collected: false },
        { id: 2, x: 12, y: 105, crossed: true, collected: false },
      ],
      obstacles: [obstacle({ y: 120 }), obstacle({ id: 5, y: 95 })],
      pickups: [{ id: 3, kind: 'coin', x: 30, y: 130 }, { id: 4, kind: 'gem', x: 30, y: 300 }],
    };
    expect(nextIntro(s, [], 60)).toEqual({ kind: 'obstacle', name: 'asteroid', x: 25, y: 120 });
    expect(nextIntro(s, ['obstacle'], 60)).toMatchObject({ kind: 'coin', y: 130 });
    expect(nextIntro(s, ['obstacle', 'coin'], 60)).toMatchObject({ kind: 'hoop', y: 140 });
    // The gem is beyond range and the crossed hoop does not count.
    expect(nextIntro(s, ['obstacle', 'coin', 'hoop'], 60)).toBeNull();
    expect(nextIntro(s, ['obstacle', 'coin', 'hoop'], 250)).toMatchObject({ kind: 'gem' });
  });
});

import type { FlightStats, JourneyConfig } from './config';
import { generateChunk, type Hoop, type JourneyLevel, type Obstacle } from './spawner';

export interface JourneyInput {
  /** -1 (left) … 1 (right). */
  steer: number;
  forward: boolean;
  backward: boolean;
  turbo: boolean;
  fire: boolean;
}

export const NO_INPUT: JourneyInput = { steer: 0, forward: false, backward: false, turbo: false, fire: false };

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vy: number;
  life: number;
}

export type JourneyStatus = 'flying' | 'gliding' | 'ended';
export type EndReason = 'destroyed' | 'fuel' | 'aborted';

export interface JourneyState {
  time: number;
  x: number;
  y: number;
  maxY: number;
  vx: number;
  vy: number;
  throttle: number;
  fuel: number;
  hull: number;
  shield: number;
  ammo: number;
  turboTime: number;
  turboCooldown: number;
  hoopTime: number;
  weaponCooldown: number;
  invulnerable: number;
  obstacles: Obstacle[];
  hoops: Hoop[];
  projectiles: Projectile[];
  nextChunk: number;
  nextId: number;
  status: JourneyStatus;
  endReason: EndReason | null;
  targetReached: boolean;
  hoopsCollected: number;
  obstaclesDestroyed: number;
}

export type JourneyEvent =
  | { type: 'turbo' }
  | { type: 'fire' }
  | { type: 'hoop'; x: number; y: number }
  | { type: 'hit'; x: number; y: number; damage: number; absorbed: number }
  | { type: 'obstacleDestroyed'; x: number; y: number; kind: string }
  | { type: 'fuelEmpty' }
  | { type: 'targetReached' }
  | { type: 'ended'; reason: EndReason };

export interface JourneyContext {
  stats: FlightStats;
  level: JourneyLevel;
  cfg: JourneyConfig;
  seed: number;
  /** 1 normally; lower for the forgiving tutorial flight. */
  densityFactor: number;
}

/** Largest step that keeps collisions from tunnelling; callers subdivide longer frames. */
export const MAX_STEP = 1 / 30;

export function createJourney(ctx: JourneyContext): JourneyState {
  const { stats, cfg } = ctx;
  return {
    time: 0,
    x: cfg.worldWidth / 2,
    y: 0,
    maxY: 0,
    vx: 0,
    vy: 0,
    throttle: 0,
    fuel: stats.fuelCapacity,
    hull: stats.hull,
    shield: stats.shield,
    ammo: stats.ammo,
    turboTime: 0,
    turboCooldown: 0,
    hoopTime: 0,
    weaponCooldown: 0,
    invulnerable: 0,
    obstacles: [],
    hoops: [],
    projectiles: [],
    nextChunk: 0,
    nextId: 1,
    status: 'flying',
    endReason: null,
    targetReached: false,
    hoopsCollected: 0,
    obstaclesDestroyed: 0,
  };
}

function approach(value: number, target: number, maxDelta: number): number {
  return value + Math.max(-maxDelta, Math.min(maxDelta, target - value));
}

/** Payout distance: the highest altitude reached, in whole meters. */
export function journeyDistance(state: JourneyState): number {
  return Math.floor(state.maxY);
}

export function abortJourney(state: JourneyState): JourneyState {
  return state.status === 'ended' ? state : { ...state, status: 'ended', endReason: 'aborted' };
}

/** Advances the simulation by dt seconds (clamped to MAX_STEP). Pure: returns a new state and what happened. */
export function stepJourney(
  prev: JourneyState,
  input: JourneyInput,
  rawDt: number,
  ctx: JourneyContext,
): { state: JourneyState; events: JourneyEvent[] } {
  if (prev.status === 'ended') return { state: prev, events: [] };
  const { stats, cfg, level } = ctx;
  const dt = Math.min(Math.max(rawDt, 0), MAX_STEP);
  const events: JourneyEvent[] = [];
  const s: JourneyState = { ...prev, time: prev.time + dt };

  s.turboTime = Math.max(0, s.turboTime - dt);
  s.turboCooldown = Math.max(0, s.turboCooldown - dt);
  s.hoopTime = Math.max(0, s.hoopTime - dt);
  s.weaponCooldown = Math.max(0, s.weaponCooldown - dt);
  s.invulnerable = Math.max(0, s.invulnerable - dt);

  // Turbo: a short burst that costs a little fuel.
  if (input.turbo && s.status === 'flying' && s.turboCooldown === 0) {
    s.turboTime = cfg.turbo.duration;
    s.turboCooldown = cfg.turbo.duration + cfg.turbo.cooldown;
    s.fuel = Math.max(0, s.fuel - stats.fuelCapacity * cfg.turbo.fuelCost);
    events.push({ type: 'turbo' });
  }

  // Vertical motion.
  if (s.status === 'flying') {
    s.throttle = input.forward ? 1 : input.backward ? cfg.reverseThrottle : cfg.cruiseThrottle;
    const boost = 1 + (s.turboTime > 0 ? cfg.turbo.speedBonus : 0) + (s.hoopTime > 0 ? cfg.hoop.speedBonus : 0);
    const target = stats.maxSpeed * s.throttle * (s.throttle > 0 ? boost : 1);
    s.vy = approach(s.vy, target, stats.accel * (boost > 1 ? 2 : 1) * dt);
    s.fuel = Math.max(0, s.fuel - stats.burnRate * Math.abs(s.throttle) * dt);
    if (s.fuel === 0) {
      s.status = 'gliding';
      events.push({ type: 'fuelEmpty' });
    }
  } else {
    s.throttle = 0;
    s.vy -= cfg.glideDecel * dt;
  }

  // Horizontal motion.
  const steer = Math.max(-1, Math.min(1, input.steer));
  s.vx = approach(s.vx, steer * stats.lateralMax, stats.lateralAccel * dt);
  const minX = cfg.rocketRadius;
  const maxX = cfg.worldWidth - cfg.rocketRadius;
  s.x += s.vx * dt;
  if (s.x < minX || s.x > maxX) {
    s.x = Math.max(minX, Math.min(maxX, s.x));
    s.vx = 0;
  }

  const prevY = s.y;
  s.y += s.vy * dt;
  s.maxY = Math.max(s.maxY, s.y);
  if (!s.targetReached && s.maxY >= level.targetDistance) {
    s.targetReached = true;
    events.push({ type: 'targetReached' });
  }

  // Spawn sky ahead.
  let obstacles = s.obstacles;
  let hoops = s.hoops;
  while (cfg.firstChunkY + s.nextChunk * cfg.chunkSize < s.y + cfg.lookahead) {
    const chunk = generateChunk(s.nextChunk, level, cfg, ctx.seed, ctx.densityFactor, s.nextId);
    obstacles = [...obstacles, ...chunk.obstacles];
    hoops = [...hoops, ...chunk.hoops];
    s.nextId = chunk.nextId;
    s.nextChunk += 1;
  }

  // Drift obstacles, bouncing off the walls; drop what fell far behind.
  const floor = s.y - cfg.despawnBelow;
  obstacles = obstacles
    .filter((o) => o.y >= floor)
    .map((o) => {
      const vx = o.vx + Math.cos(s.time * 1.5 + o.phase) * o.wobble;
      let x = o.x + vx * dt;
      let ovx = o.vx;
      if (x < o.r || x > cfg.worldWidth - o.r) {
        x = Math.max(o.r, Math.min(cfg.worldWidth - o.r, x));
        ovx = -ovx;
      }
      return { ...o, x, vx: ovx };
    });

  // Weapons.
  let projectiles = s.projectiles;
  if (input.fire && s.ammo > 0 && s.weaponCooldown === 0) {
    projectiles = [
      ...projectiles,
      { id: s.nextId++, x: s.x, y: s.y + cfg.rocketRadius, vy: Math.max(0, s.vy) + cfg.weapon.projectileSpeed, life: cfg.weapon.projectileLife },
    ];
    s.ammo -= 1;
    s.weaponCooldown = cfg.weapon.cooldown;
    events.push({ type: 'fire' });
  }
  const destroyed = new Set<number>();
  projectiles = projectiles.flatMap((p) => {
    const y = p.y + p.vy * dt;
    const target = obstacles.find(
      (o) => !destroyed.has(o.id) && Math.abs(o.x - p.x) < o.r && o.y + o.r >= p.y && o.y - o.r <= y,
    );
    if (target) {
      target.hp -= stats.weaponDamage;
      if (target.hp <= 0) {
        destroyed.add(target.id);
        s.obstaclesDestroyed += 1;
        events.push({ type: 'obstacleDestroyed', x: target.x, y: target.y, kind: target.kind });
      }
      return [];
    }
    const life = p.life - dt;
    return life > 0 ? [{ ...p, y, life }] : [];
  });

  // Rocket collisions: the shield absorbs damage first, then the hull.
  for (const o of obstacles) {
    if (destroyed.has(o.id) || s.invulnerable > 0) continue;
    if (Math.hypot(o.x - s.x, o.y - s.y) >= o.r + cfg.rocketRadius) continue;
    destroyed.add(o.id);
    const absorbed = Math.min(s.shield, o.damage);
    s.shield -= absorbed;
    s.hull = Math.max(0, s.hull - (o.damage - absorbed));
    s.invulnerable = cfg.invulnerability;
    events.push({ type: 'hit', x: o.x, y: o.y, damage: o.damage, absorbed });
  }
  obstacles = obstacles.filter((o) => !destroyed.has(o.id));

  // Hoops: a free speed boost when flown through on the way up.
  hoops = hoops
    .filter((h) => h.y >= floor)
    .map((h) => {
      if (h.crossed || !(prevY < h.y && s.y >= h.y)) return h;
      const collected = Math.abs(s.x - h.x) <= cfg.hoop.halfWidth;
      if (collected) {
        s.hoopTime = cfg.hoop.duration;
        s.hoopsCollected += 1;
        events.push({ type: 'hoop', x: h.x, y: h.y });
      }
      return { ...h, crossed: true, collected };
    });

  s.obstacles = obstacles;
  s.hoops = hoops;
  s.projectiles = projectiles;

  if (s.hull === 0) {
    s.status = 'ended';
    s.endReason = 'destroyed';
  } else if (s.status === 'gliding' && s.vy <= 0) {
    s.vy = 0;
    s.status = 'ended';
    s.endReason = 'fuel';
  }
  if (s.endReason) events.push({ type: 'ended', reason: s.endReason });

  return { state: s, events };
}

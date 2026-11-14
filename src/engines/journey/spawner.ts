import { createRng, mixSeed } from '../../core/rng';
import type { JourneyConfig } from './config';

/** The subset of a level the flight needs. */
export interface JourneyLevel {
  id: number;
  targetDistance: number;
  obstacleDensity: number;
  obstacleTypes: string[];
  hoopDensity: number;
}

export interface Obstacle {
  id: number;
  kind: string;
  x: number;
  y: number;
  r: number;
  vx: number;
  /** Vertical speed; meteors fall towards the rocket. */
  vy: number;
  wobble: number;
  phase: number;
  hp: number;
  maxHp: number;
  damage: number;
}

export interface Hoop {
  id: number;
  x: number;
  y: number;
  /** Set once the rocket has crossed the hoop's line, whether or not it went through. */
  crossed: boolean;
  collected: boolean;
}

export interface Pickup {
  id: number;
  kind: 'coin' | 'fuel';
  x: number;
  y: number;
}

export interface WindZone {
  id: number;
  y0: number;
  y1: number;
  /** Sideways push in m/s; negative blows left. */
  force: number;
}

export interface Chunk {
  obstacles: Obstacle[];
  hoops: Hoop[];
  pickups: Pickup[];
  winds: WindZone[];
  /** True when this chunk holds a meteor shower. */
  shower: boolean;
  nextId: number;
}

const between = (range: number[], rng: () => number) => range[0] + rng() * (range[1] - range[0]);

function countFor(perHundredMeters: number, chunkSize: number, rng: () => number): number {
  const expected = (perHundredMeters * chunkSize) / 100;
  return Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
}

/** Deterministically generates the obstacles and hoops of one chunk of sky. */
export function generateChunk(
  index: number,
  level: JourneyLevel,
  cfg: JourneyConfig,
  seed: number,
  densityFactor: number,
  firstId: number,
): Chunk {
  const rng = createRng(mixSeed(seed, index));
  const y0 = cfg.firstChunkY + index * cfg.chunkSize;
  const scale = 1 + cfg.obstacleScalePerLevel * (level.id - 1);
  let nextId = firstId;

  const obstacles: Obstacle[] = [];
  const addObstacle = (kind: string, y: number, vy = 0) => {
    const def = cfg.obstacles[kind];
    const r = between(def.radius, rng);
    const hp = def.hp * scale;
    obstacles.push({
      id: nextId++,
      kind,
      x: r + rng() * (cfg.worldWidth - 2 * r),
      y,
      r,
      vx: (rng() * 2 - 1) * def.drift,
      vy,
      wobble: def.wobble,
      phase: rng() * Math.PI * 2,
      hp,
      maxHp: hp,
      damage: def.damage * scale,
    });
  };
  const obstacleCount = countFor(level.obstacleDensity * densityFactor, cfg.chunkSize, rng);
  for (let i = 0; i < obstacleCount; i++) {
    const kind = level.obstacleTypes[Math.floor(rng() * level.obstacleTypes.length)];
    addObstacle(kind, y0 + rng() * cfg.chunkSize);
  }

  const hoops: Hoop[] = [];
  const hoopCount = countFor(level.hoopDensity, cfg.chunkSize, rng);
  const margin = cfg.hoop.halfWidth + 1;
  for (let i = 0; i < hoopCount; i++) {
    hoops.push({
      id: nextId++,
      x: margin + rng() * (cfg.worldWidth - 2 * margin),
      y: y0 + rng() * cfg.chunkSize,
      crossed: false,
      collected: false,
    });
  }

  // Meteor showers: a burst of small rocks falling towards the rocket.
  const shower = level.id >= cfg.meteorShower.fromLevel && rng() < cfg.meteorShower.chance * densityFactor;
  if (shower) {
    for (let i = 0; i < cfg.meteorShower.count; i++) {
      addObstacle('meteor', y0 + rng() * cfg.chunkSize, -between(cfg.meteorShower.speed, rng));
    }
  }

  // The guardian patrols just before the finish line.
  const guardY = level.targetDistance - cfg.guardian.offset;
  if (level.id >= cfg.guardian.fromLevel && guardY >= y0 && guardY < y0 + cfg.chunkSize) addObstacle('guardian', guardY);

  const winds: WindZone[] = [];
  if (level.id >= cfg.wind.fromLevel && rng() < cfg.wind.chance) {
    const height = between(cfg.wind.height, rng);
    const start = y0 + rng() * (cfg.chunkSize - height);
    winds.push({ id: nextId++, y0: start, y1: start + height, force: between(cfg.wind.force, rng) * (rng() < 0.5 ? -1 : 1) });
  }

  // Coins come in short vertical trails that weave a little; fuel cans are rare.
  const pickups: Pickup[] = [];
  const rows = countFor(cfg.coins.rowsPer100m, cfg.chunkSize, rng);
  for (let row = 0; row < rows; row++) {
    const x = 4 + rng() * (cfg.worldWidth - 8);
    const y = y0 + rng() * (cfg.chunkSize - cfg.coins.rowSize * cfg.coins.spacing);
    const sway = (rng() * 2 - 1) * 1.5;
    for (let i = 0; i < cfg.coins.rowSize; i++) {
      pickups.push({ id: nextId++, kind: 'coin', x: x + Math.sin(i * 0.8) * sway, y: y + i * cfg.coins.spacing });
    }
  }
  if (rng() < cfg.fuelCan.chance) {
    pickups.push({ id: nextId++, kind: 'fuel', x: 3 + rng() * (cfg.worldWidth - 6), y: y0 + rng() * cfg.chunkSize });
  }

  return { obstacles, hoops, pickups, winds, shower, nextId };
}

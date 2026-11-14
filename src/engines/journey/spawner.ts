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

export interface Chunk {
  obstacles: Obstacle[];
  hoops: Hoop[];
  nextId: number;
}

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
  const obstacleCount = countFor(level.obstacleDensity * densityFactor, cfg.chunkSize, rng);
  for (let i = 0; i < obstacleCount; i++) {
    const kind = level.obstacleTypes[Math.floor(rng() * level.obstacleTypes.length)];
    const def = cfg.obstacles[kind];
    const r = def.radius[0] + rng() * (def.radius[1] - def.radius[0]);
    const hp = def.hp * scale;
    obstacles.push({
      id: nextId++,
      kind,
      x: r + rng() * (cfg.worldWidth - 2 * r),
      y: y0 + rng() * cfg.chunkSize,
      r,
      vx: (rng() * 2 - 1) * def.drift,
      wobble: def.wobble,
      phase: rng() * Math.PI * 2,
      hp,
      maxHp: hp,
      damage: def.damage * scale,
    });
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

  return { obstacles, hoops, nextId };
}

import type { RocketStats } from '../../core/rocket/rocket';

export interface ObstacleDef {
  /** [min, max] in meters. */
  radius: number[];
  damage: number;
  hp: number;
  /** Max horizontal drift speed (m/s). */
  drift: number;
  /** Amplitude of sideways weaving (m/s). */
  wobble: number;
}

export interface JourneyConfig {
  worldWidth: number;
  rocketRadius: number;
  speedK: number;
  referenceThrustToMass: number;
  accelFactor: number;
  cruiseThrottle: number;
  reverseThrottle: number;
  burnBase: number;
  burnReferenceThrust: number;
  glideDecel: number;
  lateralBase: number;
  lateralPerManeuverability: number;
  referenceMass: number;
  turbo: { duration: number; speedBonus: number; fuelCost: number; cooldown: number };
  hoop: { speedBonus: number; duration: number; halfWidth: number };
  weapon: { ammo: number; cooldown: number; projectileSpeed: number; projectileLife: number };
  invulnerability: number;
  chunkSize: number;
  firstChunkY: number;
  lookahead: number;
  despawnBelow: number;
  tutorialDensityFactor: number;
  obstacleScalePerLevel: number;
  coins: { rowsPer100m: number; rowSize: number; spacing: number; radius: number };
  /** Refill is a share of the tank's capacity. */
  fuelCan: { chance: number; refill: number; radius: number };
  /** Rare floating gems: each one caught adds a 💎 to the player's wallet. */
  gem: { chance: number; radius: number };
  /** Wind bands push the rocket sideways by `force` m/s while it is inside them. */
  wind: { fromLevel: number; chance: number; force: number[]; height: number[] };
  meteorShower: { fromLevel: number; chance: number; count: number; speed: number[] };
  /** A boss obstacle guarding the finish line; destroying it pays coinReward coins. */
  guardian: { fromLevel: number; coinReward: number; offset: number };
  obstacles: Record<string, ObstacleDef>;
}

/** Flight-ready numbers derived once from the assembled rocket. */
export interface FlightStats {
  maxSpeed: number;
  accel: number;
  lateralMax: number;
  lateralAccel: number;
  fuelCapacity: number;
  /** Fuel per second at full throttle. */
  burnRate: number;
  hull: number;
  shield: number;
  weaponDamage: number;
  ammo: number;
}

export function deriveFlightStats(
  stats: RocketStats,
  cfg: JourneyConfig,
  allowShieldsAndWeapons: boolean,
): FlightStats {
  const mass = Math.max(1, stats.mass);
  const maxSpeed = cfg.speedK * Math.sqrt(stats.thrust / mass / cfg.referenceThrustToMass);
  const efficiency = Math.max(-50, stats.fuelEfficiency);
  const massFactor = Math.sqrt(cfg.referenceMass / mass);
  const lateralMax = (cfg.lateralBase + stats.maneuverability * cfg.lateralPerManeuverability) * massFactor;
  const weaponDamage = allowShieldsAndWeapons ? stats.weaponDamage : 0;
  return {
    maxSpeed,
    accel: maxSpeed * cfg.accelFactor,
    lateralMax,
    lateralAccel: lateralMax * (2 + stats.maneuverability / 20),
    fuelCapacity: stats.fuelCapacity,
    burnRate: (cfg.burnBase * Math.sqrt(stats.thrust / cfg.burnReferenceThrust)) / (1 + efficiency / 100),
    hull: Math.max(1, stats.hull),
    shield: allowShieldsAndWeapons ? stats.shield : 0,
    weaponDamage,
    ammo: weaponDamage > 0 ? cfg.weapon.ammo : 0,
  };
}

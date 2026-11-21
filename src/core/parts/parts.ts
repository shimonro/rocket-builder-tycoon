export const CATEGORIES = ['body', 'fuel_tank', 'engine', 'booster', 'fins', 'shield', 'weapon'] as const;
export type Category = (typeof CATEGORIES)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_MULTIPLIER: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 1.25,
  rare: 1.6,
  epic: 2.1,
  legendary: 2.8,
};

/** Stats that scale with rarity. Mass does not. */
export const STAT_KEYS = [
  'thrust',
  'fuelCapacity',
  'fuelEfficiency',
  'maneuverability',
  'hull',
  'shield',
  'weaponDamage',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export interface Part {
  id: string;
  name: string;
  category: Category;
  rarity: Rarity;
  level: number;
  price: number;
  mass: number;
  thrust: number;
  fuelCapacity: number;
  fuelEfficiency: number;
  maneuverability: number;
  hull: number;
  shield: number;
  weaponDamage: number;
  /** Only obtainable as part of a prebuilt rocket. */
  prebuiltOnly: boolean;
}

export type Catalog = ReadonlyMap<string, Part>;

/** Each upgrade level adds 10% to every stat of a part (mass excluded), up to MAX_UPGRADE. */
export const MAX_UPGRADE = 3;
export const UPGRADE_STEP = 0.1;

/** Penalties (negative stats on specialist parts) stay as listed: rarity and upgrades only grow strengths. */
export function effectiveStat(part: Part, key: StatKey, upgrade = 0): number {
  if (part[key] < 0) return part[key];
  return part[key] * RARITY_MULTIPLIER[part.rarity] * (1 + UPGRADE_STEP * Math.min(MAX_UPGRADE, Math.max(0, upgrade)));
}

/** Specialist parts trade one strength for a penalty somewhere else. */
export function isSpecialist(part: Part): boolean {
  return STAT_KEYS.some((k) => part[k] < 0);
}

function fail(message: string): never {
  throw new Error(`Invalid part catalog: ${message}`);
}

function num(raw: Record<string, unknown>, key: string, id: string): number {
  const value = raw[key] ?? 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${id}.${key} must be a number`);
  return value;
}

export interface Prebuilt {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Highest unlocked level needed before it appears for sale. */
  levelRequired: number;
  parts: string[];
}

/** Validates prebuilt rocket definitions against the catalog. */
export function parsePrebuilts(raw: unknown, catalog: Catalog): Prebuilt[] {
  if (!Array.isArray(raw)) fail('prebuilts must be an array');
  return (raw as Prebuilt[]).map((p) => {
    if (typeof p.id !== 'string' || typeof p.name !== 'string') fail('prebuilt needs id and name');
    if (typeof p.price !== 'number' || typeof p.levelRequired !== 'number') fail(`${p.id} needs price and levelRequired`);
    if (!Array.isArray(p.parts) || p.parts.length === 0) fail(`${p.id} needs parts`);
    const categories = new Set<Category>();
    for (const partId of p.parts) {
      const part = catalog.get(partId);
      if (!part) fail(`${p.id} references unknown part ${partId}`);
      if (categories.has(part.category)) fail(`${p.id} has two ${part.category} parts`);
      categories.add(part.category);
    }
    return { ...p, description: p.description ?? '' };
  });
}

/** Validates raw JSON part definitions and fills omitted stats with 0. */
export function parseCatalog(raw: unknown): Catalog {
  if (!Array.isArray(raw)) fail('expected an array');
  const catalog = new Map<string, Part>();
  for (const item of raw as Record<string, unknown>[]) {
    const id = item.id;
    if (typeof id !== 'string' || id === '') fail('every part needs an id');
    if (catalog.has(id)) fail(`duplicate id ${id}`);
    if (typeof item.name !== 'string') fail(`${id}.name must be a string`);
    if (!CATEGORIES.includes(item.category as Category)) fail(`${id}.category is unknown`);
    if (!RARITIES.includes(item.rarity as Rarity)) fail(`${id}.rarity is unknown`);
    const level = num(item, 'level', id);
    if (!Number.isInteger(level) || level < 1 || level > 5) fail(`${id}.level must be 1-5`);
    const price = num(item, 'price', id);
    if (price < 0) fail(`${id}.price must be >= 0`);
    catalog.set(id, {
      id,
      name: item.name,
      category: item.category as Category,
      rarity: item.rarity as Rarity,
      level,
      price,
      mass: num(item, 'mass', id),
      thrust: num(item, 'thrust', id),
      fuelCapacity: num(item, 'fuelCapacity', id),
      fuelEfficiency: num(item, 'fuelEfficiency', id),
      maneuverability: num(item, 'maneuverability', id),
      hull: num(item, 'hull', id),
      shield: num(item, 'shield', id),
      weaponDamage: num(item, 'weaponDamage', id),
      prebuiltOnly: item.prebuiltOnly === true,
    });
  }
  return catalog;
}

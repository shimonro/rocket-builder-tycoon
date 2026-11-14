import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './events';
import { effectiveStat, parseCatalog, parsePrebuilts, type Part } from './parts/parts';
import { createRng, mixSeed } from './rng';
import { isLaunchable, missingSlots, ranking, rocketParts, rocketStats } from './rocket/rocket';
import catalogJson from '../data/parts/catalog.json';
import prebuiltsJson from '../data/parts/prebuilts.json';
import rankingJson from '../data/config/ranking.json';

const base = { name: 'X', category: 'engine', rarity: 'common', level: 1, price: 10 };

describe('parts', () => {
  it('scales stats by rarity but leaves omitted stats at zero', () => {
    const catalog = parseCatalog([{ ...base, id: 'e', rarity: 'epic', thrust: 10, mass: 4 }]);
    const part = catalog.get('e') as Part;
    expect(effectiveStat(part, 'thrust')).toBeCloseTo(21);
    expect(effectiveStat(part, 'shield')).toBe(0);
    expect(part.mass).toBe(4);
    expect(part.prebuiltOnly).toBe(false);
  });

  it.each([
    ['not an array', {}, /expected an array/],
    ['missing id', [{ ...base }], /needs an id/],
    ['duplicate id', [{ ...base, id: 'a' }, { ...base, id: 'a' }], /duplicate id a/],
    ['bad name', [{ ...base, id: 'a', name: 3 }], /name must be a string/],
    ['bad category', [{ ...base, id: 'a', category: 'wings' }], /category is unknown/],
    ['bad rarity', [{ ...base, id: 'a', rarity: 'mythic' }], /rarity is unknown/],
    ['level too high', [{ ...base, id: 'a', level: 6 }], /level must be 1-5/],
    ['fractional level', [{ ...base, id: 'a', level: 1.5 }], /level must be 1-5/],
    ['negative price', [{ ...base, id: 'a', price: -1 }], /price must be >= 0/],
    ['non-numeric stat', [{ ...base, id: 'a', thrust: '9' }], /a.thrust must be a number/],
  ])('rejects a catalog with %s', (_label, raw, message) => {
    expect(() => parseCatalog(raw)).toThrow(message);
  });

  it('validates prebuilts against the catalog', () => {
    const catalog = parseCatalog([
      { ...base, id: 'e1' },
      { ...base, id: 'e2' },
      { ...base, id: 'f', category: 'fins' },
    ]);
    const ok = { id: 'p', name: 'P', price: 1, levelRequired: 1, parts: ['e1', 'f'] };
    expect(parsePrebuilts([ok], catalog)[0].description).toBe('');
    expect(() => parsePrebuilts({}, catalog)).toThrow(/must be an array/);
    expect(() => parsePrebuilts([{ ...ok, name: undefined }], catalog)).toThrow(/needs id and name/);
    expect(() => parsePrebuilts([{ ...ok, price: '1' }], catalog)).toThrow(/needs price/);
    expect(() => parsePrebuilts([{ ...ok, parts: [] }], catalog)).toThrow(/needs parts/);
    expect(() => parsePrebuilts([{ ...ok, parts: ['zzz'] }], catalog)).toThrow(/unknown part zzz/);
    expect(() => parsePrebuilts([{ ...ok, parts: ['e1', 'e2'] }], catalog)).toThrow(/two engine parts/);
  });

  it('ships a valid catalog and prebuilt list', () => {
    const catalog = parseCatalog(catalogJson);
    expect(parsePrebuilts(prebuiltsJson, catalog)).toHaveLength(5);
  });
});

describe('rocket', () => {
  const catalog = parseCatalog(catalogJson);
  const starter = {
    body: 'body_tin_can_hull',
    fuel_tank: 'fuel_tank_jerrycan_tank',
    engine: 'engine_sparrow_e1',
    fins: 'fins_stub_fins',
  };

  it('ranks the starter rocket by the weighted formula', () => {
    // hull 60×0.5 + efficiency 5×1.2 + fuel 30×1.2 + thrust 40×1.5 + maneuverability 20×1.0
    const stats = rocketStats(rocketParts(starter, catalog));
    expect(ranking(stats, rankingJson)).toBe(152);
    expect(stats.mass).toBe(50);
  });

  it('applies rarity multipliers to every stat in the ranking', () => {
    // Riveted Hull is the uncommon (×1.25) twin of the Tin Can Hull: (30 + 6) × 1.25 = 45
    const stats = rocketStats(rocketParts({ body: 'body_riveted_hull' }, catalog));
    expect(ranking(stats, rankingJson)).toBe(45);
  });

  it('treats missing weights as zero and never goes negative', () => {
    const stats = rocketStats(rocketParts(starter, catalog));
    expect(ranking(stats, { thrust: 1 })).toBe(40);
    expect(ranking(stats, { thrust: -1 })).toBe(0);
  });

  it('ignores empty and unknown slots', () => {
    expect(rocketParts({ engine: 'nope', fins: 'fins_stub_fins' }, catalog).map((p) => p.id)).toEqual(['fins_stub_fins']);
  });

  it('needs body, tank, engine and fins to launch', () => {
    expect(missingSlots({ engine: 'x' })).toEqual(['body', 'fuel_tank', 'fins']);
    expect(isLaunchable({ engine: 'x' })).toBe(false);
    expect(isLaunchable(starter)).toBe(true);
  });
});

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRng(43)()).not.toBe(values[0]);
  });

  it('mixes seeds asymmetrically', () => {
    expect(mixSeed(1, 2)).not.toBe(mixSeed(2, 1));
    expect(mixSeed(1, 2)).toBe(mixSeed(1, 2));
  });
});

describe('event bus', () => {
  it('delivers events until a listener unsubscribes', () => {
    const bus = createEventBus<{ type: string }>();
    const listener = vi.fn();
    const off = bus.on(listener);
    bus.emit({ type: 'a' });
    off();
    bus.emit({ type: 'b' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: 'a' });
  });
});

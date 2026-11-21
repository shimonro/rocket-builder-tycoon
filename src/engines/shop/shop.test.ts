import { describe, expect, it } from 'vitest';
import { CATEGORIES, parseCatalog, parsePrebuilts } from '../../core/parts/parts';
import catalogJson from '../../data/parts/catalog.json';
import prebuiltsJson from '../../data/parts/prebuilts.json';
import { buyPart, buyPrebuilt, listParts, partLock, rarityFromLevel, sellPart, sellPrice, sortParts, upgradeCost, upgradePart, type ShopAccess } from './shop';

const catalog = parseCatalog(catalogJson);
const prebuilts = parsePrebuilts(prebuiltsJson, catalog);
const fresh: ShopAccess = { partLevelCap: 1, highestUnlocked: 1, shieldsAndWeaponsUnlocked: false };
const wallet = { cash: 600, inventory: {} };

describe('buyPart', () => {
  it('deducts the price and adds the part to the inventory', () => {
    const r = buyPart({ cash: 600, inventory: { engine_sparrow_e1: 1 } }, 'engine_sparrow_e1', catalog, fresh);
    expect(r).toEqual({ ok: true, wallet: { cash: 400, inventory: { engine_sparrow_e1: 2 } } });
  });

  it('allows spending the last dollar but not more', () => {
    expect(buyPart({ cash: 200, inventory: {} }, 'engine_sparrow_e1', catalog, fresh).ok).toBe(true);
    expect(buyPart({ cash: 199, inventory: {} }, 'engine_sparrow_e1', catalog, fresh)).toEqual({
      ok: false,
      error: 'insufficient_funds',
    });
  });

  it('enforces part level, shield/weapon and prebuilt-only locks', () => {
    expect(buyPart(wallet, 'zzz', catalog, fresh)).toEqual({ ok: false, error: 'unknown_item' });
    expect(buyPart(wallet, 'engine_falcon_e2', catalog, fresh)).toEqual({ ok: false, error: 'level_locked' });
    expect(buyPart(wallet, 'shield_bubble_shield', catalog, fresh)).toEqual({ ok: false, error: 'category_locked' });
    expect(buyPart(wallet, 'pb_skylark_engine', catalog, fresh)).toEqual({ ok: false, error: 'prebuilt_only' });
    const level2 = { ...fresh, shieldsAndWeaponsUnlocked: true };
    expect(partLock(catalog.get('shield_bubble_shield')!, level2)).toBeNull();
  });
});

describe('prebuilts', () => {
  const skylark = prebuilts[0];
  const comet = prebuilts[1];

  it('adds every part of the prebuilt to the inventory', () => {
    const r = buyPrebuilt({ cash: skylark.price, inventory: {} }, skylark, fresh);
    expect(r.ok && r.wallet.cash).toBe(0);
    expect(r.ok && Object.keys(r.wallet.inventory).sort()).toEqual([...skylark.parts].sort());
  });

  it('requires the level and the cash', () => {
    expect(buyPrebuilt({ cash: 1e9, inventory: {} }, comet, fresh)).toEqual({ ok: false, error: 'level_locked' });
    expect(buyPrebuilt({ cash: skylark.price - 1, inventory: {} }, skylark, fresh)).toEqual({
      ok: false,
      error: 'insufficient_funds',
    });
  });
});

describe('sellPart', () => {
  it('refunds the sell-back share and removes one copy', () => {
    const part = catalog.get('engine_sparrow_e1')!;
    expect(sellPrice(part, 0.5)).toBe(100);
    const two = sellPart({ cash: 0, inventory: { [part.id]: 2 } }, part.id, catalog, 0.5);
    expect(two).toEqual({ ok: true, wallet: { cash: 100, inventory: { [part.id]: 1 } } });
    const one = sellPart({ cash: 0, inventory: { [part.id]: 1 } }, part.id, catalog, 0.5);
    expect(one).toEqual({ ok: true, wallet: { cash: 100, inventory: {} } });
  });

  it('cannot sell what is not owned', () => {
    expect(sellPart(wallet, 'engine_sparrow_e1', catalog, 0.5)).toEqual({ ok: false, error: 'not_owned' });
    expect(sellPart(wallet, 'zzz', catalog, 0.5)).toEqual({ ok: false, error: 'unknown_item' });
  });
});

describe('upgradePart', () => {
  const engine = catalog.get('engine_sparrow_e1')!; // $200

  it('costs price × factor × next level and stops at the cap', () => {
    expect([0, 1, 2, 3].map((n) => upgradeCost(engine, n, 0.5))).toEqual([100, 200, 300, null]);
  });

  it('upgrades owned parts one level at a time', () => {
    let state = { cash: 600, upgrades: {} as Record<string, number> };
    for (const expected of [500, 300, 0]) {
      const r = upgradePart(state, engine.id, true, catalog, 0.5);
      if (!r.ok) throw new Error(r.error);
      expect(r.cash).toBe(expected);
      state = r;
    }
    expect(state.upgrades).toEqual({ [engine.id]: 3 });
    expect(upgradePart({ ...state, cash: 9999 }, engine.id, true, catalog, 0.5)).toEqual({ ok: false, error: 'max_upgrade' });
  });

  it('refuses unknown, unowned and unaffordable upgrades', () => {
    const state = { cash: 99, upgrades: {} };
    expect(upgradePart(state, 'nope', true, catalog, 0.5)).toEqual({ ok: false, error: 'unknown_item' });
    expect(upgradePart({ ...state, cash: 999 }, engine.id, false, catalog, 0.5)).toEqual({ ok: false, error: 'not_owned' });
    expect(upgradePart(state, engine.id, true, catalog, 0.5)).toEqual({ ok: false, error: 'insufficient_funds' });
  });
});

describe('listParts', () => {
  it('hides prebuilt-only parts and sorts by category, level, rarity', () => {
    const all = listParts(catalog, CATEGORIES);
    expect(all.some((p) => p.prebuiltOnly)).toBe(false);
    expect(all[0].id).toBe('body_tin_can_hull');
    expect(all[1].id).toBe('body_riveted_hull');
    expect(all.at(-1)!.category).toBe('weapon');
  });

  it('filters by category and rarity', () => {
    const fins = listParts(catalog, CATEGORIES, { category: 'fins', rarity: 'legendary' });
    expect(fins.map((p) => p.name)).toEqual(['Aether Wings', 'Nova Wings']);
  });
});

describe('sortParts', () => {
  const pick = (...ids: string[]) => ids.map((id) => catalog.get(id)!);
  // Riveted: $240 uncommon; Tin Can: $150 common; Carbon: $860 rare.
  const parts = pick('body_riveted_hull', 'body_tin_can_hull', 'body_carbon_shell');
  const gain: Record<string, number> = { body_riveted_hull: 5, body_tin_can_hull: -3, body_carbon_shell: 2 };
  const by = (sort: Parameters<typeof sortParts>[1]) => sortParts(parts, sort, (p) => gain[p.id]).map((p) => p.id);

  it('orders by price either way, ranking gain, or rarity, and keeps the list order by default', () => {
    expect(by('price_asc')).toEqual(['body_tin_can_hull', 'body_riveted_hull', 'body_carbon_shell']);
    expect(by('price_desc')).toEqual(['body_carbon_shell', 'body_riveted_hull', 'body_tin_can_hull']);
    expect(by('ranking')).toEqual(['body_riveted_hull', 'body_carbon_shell', 'body_tin_can_hull']);
    expect(by('rarity')).toEqual(['body_carbon_shell', 'body_riveted_hull', 'body_tin_can_hull']);
    expect(by('default')).toEqual(['body_riveted_hull', 'body_tin_can_hull', 'body_carbon_shell']);
  });

  it('does not reorder the input list', () => {
    by('price_asc');
    expect(parts[0].id).toBe('body_riveted_hull');
  });
});

describe('rarityFromLevel', () => {
  it('names the first game level whose shop sells a rarity', () => {
    expect(rarityFromLevel(catalog, 'common')).toBe(1);
    // Rare parts start at part level 2 (game level 3), epic at 3 (level 5), legendary at 4 (level 7).
    expect(rarityFromLevel(catalog, 'rare')).toBe(3);
    expect(rarityFromLevel(catalog, 'epic')).toBe(5);
    expect(rarityFromLevel(catalog, 'legendary')).toBe(7);
    expect(rarityFromLevel(new Map(), 'epic')).toBeNull();
  });
});

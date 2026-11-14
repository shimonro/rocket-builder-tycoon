import { describe, expect, it } from 'vitest';
import { CATEGORIES, parseCatalog, parsePrebuilts } from '../../core/parts/parts';
import catalogJson from '../../data/parts/catalog.json';
import prebuiltsJson from '../../data/parts/prebuilts.json';
import { buyPart, buyPrebuilt, listParts, partLock, sellPart, sellPrice, type ShopAccess } from './shop';

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

import { RARITIES, type Catalog, type Category, type Part, type Prebuilt, type Rarity } from '../../core/parts/parts';

export type Inventory = Record<string, number>;

export interface Wallet {
  cash: number;
  inventory: Inventory;
}

/** What the player has unlocked, computed by the caller from level progress and tutorial state. */
export interface ShopAccess {
  partLevelCap: number;
  highestUnlocked: number;
  shieldsAndWeaponsUnlocked: boolean;
}

export type ShopError = 'unknown_item' | 'insufficient_funds' | 'level_locked' | 'category_locked' | 'prebuilt_only' | 'not_owned';

export type ShopResult = { ok: true; wallet: Wallet } | { ok: false; error: ShopError };

const LOCKABLE: readonly Category[] = ['shield', 'weapon'];

/** Why a part cannot be bought right now, ignoring cash. */
export function partLock(part: Part, access: ShopAccess): 'prebuilt_only' | 'category_locked' | 'level_locked' | null {
  if (part.prebuiltOnly) return 'prebuilt_only';
  if (LOCKABLE.includes(part.category) && !access.shieldsAndWeaponsUnlocked) return 'category_locked';
  if (part.level > access.partLevelCap) return 'level_locked';
  return null;
}

function addParts(inventory: Inventory, ids: readonly string[]): Inventory {
  const next = { ...inventory };
  for (const id of ids) next[id] = (next[id] ?? 0) + 1;
  return next;
}

export function buyPart(wallet: Wallet, partId: string, catalog: Catalog, access: ShopAccess): ShopResult {
  const part = catalog.get(partId);
  if (!part) return { ok: false, error: 'unknown_item' };
  const lock = partLock(part, access);
  if (lock) return { ok: false, error: lock };
  if (wallet.cash < part.price) return { ok: false, error: 'insufficient_funds' };
  return { ok: true, wallet: { cash: wallet.cash - part.price, inventory: addParts(wallet.inventory, [partId]) } };
}

/** Adds every prebuilt part to the inventory; the caller equips them. */
export function buyPrebuilt(wallet: Wallet, prebuilt: Prebuilt, access: ShopAccess): ShopResult {
  if (prebuilt.levelRequired > access.highestUnlocked) return { ok: false, error: 'level_locked' };
  if (wallet.cash < prebuilt.price) return { ok: false, error: 'insufficient_funds' };
  return {
    ok: true,
    wallet: { cash: wallet.cash - prebuilt.price, inventory: addParts(wallet.inventory, prebuilt.parts) },
  };
}

export function sellPrice(part: Part, sellBackFactor: number): number {
  return Math.floor(part.price * sellBackFactor);
}

/** Sells one unequipped copy of a part. */
export function sellPart(wallet: Wallet, partId: string, catalog: Catalog, sellBackFactor: number): ShopResult {
  const part = catalog.get(partId);
  if (!part) return { ok: false, error: 'unknown_item' };
  const owned = wallet.inventory[partId] ?? 0;
  if (owned < 1) return { ok: false, error: 'not_owned' };
  const inventory = { ...wallet.inventory };
  if (owned === 1) delete inventory[partId];
  else inventory[partId] = owned - 1;
  return { ok: true, wallet: { cash: wallet.cash + sellPrice(part, sellBackFactor), inventory } };
}

export interface ShopFilter {
  category?: Category;
  rarity?: Rarity;
}

/** Parts for sale, ordered by category, then level, then rarity. */
export function listParts(catalog: Catalog, categories: readonly Category[], filter: ShopFilter = {}): Part[] {
  return [...catalog.values()]
    .filter(
      (p) =>
        !p.prebuiltOnly &&
        (filter.category === undefined || p.category === filter.category) &&
        (filter.rarity === undefined || p.rarity === filter.rarity),
    )
    .sort(
      (a, b) =>
        categories.indexOf(a.category) - categories.indexOf(b.category) ||
        a.level - b.level ||
        RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity),
    );
}

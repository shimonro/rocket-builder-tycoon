import { MAX_UPGRADE, RARITIES, type Catalog, type Category, type Part, type Prebuilt, type Rarity } from '../../core/parts/parts';

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

export type ShopError =
  | 'unknown_item'
  | 'insufficient_funds'
  | 'level_locked'
  | 'category_locked'
  | 'prebuilt_only'
  | 'not_owned'
  | 'max_upgrade';

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

/** Price of the next upgrade level: the part's price × factor × (current level + 1). Null at the cap. */
export function upgradeCost(part: Part, current: number, factor: number): number | null {
  return current >= MAX_UPGRADE ? null : Math.round(part.price * factor * (current + 1));
}

export type UpgradeResult = { ok: true; cash: number; upgrades: Record<string, number> } | { ok: false; error: ShopError };

/** Raises an owned part (spare or mounted) one upgrade level. Upgrades apply to every copy of that part. */
export function upgradePart(
  state: { cash: number; upgrades: Record<string, number> },
  partId: string,
  owned: boolean,
  catalog: Catalog,
  factor: number,
): UpgradeResult {
  const part = catalog.get(partId);
  if (!part) return { ok: false, error: 'unknown_item' };
  if (!owned) return { ok: false, error: 'not_owned' };
  const current = state.upgrades[partId] ?? 0;
  const cost = upgradeCost(part, current, factor);
  if (cost === null) return { ok: false, error: 'max_upgrade' };
  if (state.cash < cost) return { ok: false, error: 'insufficient_funds' };
  return { ok: true, cash: state.cash - cost, upgrades: { ...state.upgrades, [partId]: current + 1 } };
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

export type PartSort = 'default' | 'price_asc' | 'price_desc' | 'ranking' | 'rarity';

/** Re-orders a part list; `rankingGain` is how much each part would add to the current rocket's ranking. */
export function sortParts(parts: readonly Part[], by: PartSort, rankingGain: (part: Part) => number): Part[] {
  const list = [...parts];
  if (by === 'price_asc') return list.sort((a, b) => a.price - b.price);
  if (by === 'price_desc') return list.sort((a, b) => b.price - a.price);
  if (by === 'ranking') return list.sort((a, b) => rankingGain(b) - rankingGain(a));
  if (by === 'rarity') return list.sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity));
  return list;
}

/** First game level whose shop sells parts of this rarity, or null when none are sold. */
export function rarityFromLevel(catalog: Catalog, rarity: Rarity): number | null {
  const levels = [...catalog.values()].filter((p) => !p.prebuiltOnly && p.rarity === rarity).map((p) => p.level * 2 - 1);
  return levels.length ? Math.min(...levels) : null;
}

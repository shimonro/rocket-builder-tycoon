import type { Catalog, Category } from '../../core/parts/parts';
import { missingSlots, SLOTS, type Rocket } from '../../core/rocket/rocket';

export type Inventory = Record<string, number>;

export interface Hangar {
  rocket: Rocket;
  /** Parts owned but not equipped. */
  inventory: Inventory;
}

/** Hangar states: empty → incomplete → ready (all required slots filled). */
export type HangarState = 'empty' | 'incomplete' | 'ready';

export function hangarState(rocket: Rocket): HangarState {
  if (SLOTS.every((s) => rocket[s.category] === undefined)) return 'empty';
  return missingSlots(rocket).length === 0 ? 'ready' : 'incomplete';
}

export type BuilderResult = { ok: true; hangar: Hangar } | { ok: false; error: 'unknown_part' | 'not_owned' };

function take(inventory: Inventory, id: string): Inventory {
  const next = { ...inventory };
  if (next[id] === 1) delete next[id];
  else next[id] -= 1;
  return next;
}

function give(inventory: Inventory, id: string | undefined): Inventory {
  return id === undefined ? inventory : { ...inventory, [id]: (inventory[id] ?? 0) + 1 };
}

/** Moves a part from the inventory into its slot; the part it replaces goes back to the inventory. */
export function equip(hangar: Hangar, partId: string, catalog: Catalog): BuilderResult {
  const part = catalog.get(partId);
  if (!part) return { ok: false, error: 'unknown_part' };
  if ((hangar.inventory[partId] ?? 0) < 1) return { ok: false, error: 'not_owned' };
  const previous = hangar.rocket[part.category];
  return {
    ok: true,
    hangar: {
      rocket: { ...hangar.rocket, [part.category]: partId },
      inventory: give(take(hangar.inventory, partId), previous),
    },
  };
}

export function unequip(hangar: Hangar, category: Category): Hangar {
  const current = hangar.rocket[category];
  if (current === undefined) return hangar;
  const rocket = { ...hangar.rocket };
  delete rocket[category];
  return { rocket, inventory: give(hangar.inventory, current) };
}

/** Equips several parts in order, e.g. a freshly bought prebuilt. */
export function equipAll(hangar: Hangar, partIds: readonly string[], catalog: Catalog): BuilderResult {
  let current = hangar;
  for (const id of partIds) {
    const result = equip(current, id, catalog);
    if (!result.ok) return result;
    current = result.hangar;
  }
  return { ok: true, hangar: current };
}

/** One hangar bay and the rocket stored in it ({} when the bay is empty). */
export interface BayRocket {
  name: string;
  parts: Rocket;
}

/**
 * The player's fleet. `rocket` is the rocket in use, the source of truth for the active bay;
 * `fleet[active].parts` is refreshed whenever the player switches away from it.
 */
export interface Garage {
  rocket: Rocket;
  fleet: BayRocket[];
  active: number;
}

/** Price of the next hangar bay, or null once every bay is built. The first bay is free. */
export function bayPrice(bays: number, prices: readonly number[]): number | null {
  return prices[bays - 1] ?? null;
}

export function addBay(garage: Garage, name: string): Garage {
  return { ...garage, fleet: [...garage.fleet, { name, parts: {} }] };
}

/** Parks the active rocket in its bay and takes out the one in bay `index`. */
export function switchRocket(garage: Garage, index: number): Garage {
  if (index === garage.active || !garage.fleet[index]) return garage;
  const fleet = garage.fleet.map((bay, i) => (i === garage.active ? { ...bay, parts: garage.rocket } : bay));
  return { rocket: fleet[index].parts, fleet, active: index };
}

/** A bay with no rocket in it: the active bay if its rocket is stripped, else the first empty one. */
export function emptyBay(garage: Garage): number | null {
  if (Object.keys(garage.rocket).length === 0) return garage.active;
  const index = garage.fleet.findIndex((bay, i) => i !== garage.active && Object.keys(bay.parts).length === 0);
  return index < 0 ? null : index;
}

export function renameRocket(garage: Garage, index: number, name: string): Garage {
  const clean = name.trim().slice(0, 20);
  if (!clean || !garage.fleet[index]) return garage;
  return { ...garage, fleet: garage.fleet.map((bay, i) => (i === index ? { ...bay, name: clean } : bay)) };
}

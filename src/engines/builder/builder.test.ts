import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../../core/parts/parts';
import catalogJson from '../../data/parts/catalog.json';
import { equip, equipAll, hangarState, unequip } from './builder';

const catalog = parseCatalog(catalogJson);

describe('builder', () => {
  it('moves a part from the inventory into its slot and returns the replaced part', () => {
    const start = { rocket: { engine: 'engine_sparrow_e1' }, inventory: { engine_hawk_e1: 1 } };
    const r = equip(start, 'engine_hawk_e1', catalog);
    expect(r).toEqual({ ok: true, hangar: { rocket: { engine: 'engine_hawk_e1' }, inventory: { engine_sparrow_e1: 1 } } });
  });

  it('keeps remaining copies in the inventory', () => {
    const r = equip({ rocket: {}, inventory: { fins_stub_fins: 2 } }, 'fins_stub_fins', catalog);
    expect(r.ok && r.hangar.inventory).toEqual({ fins_stub_fins: 1 });
  });

  it('refuses unknown and unowned parts', () => {
    expect(equip({ rocket: {}, inventory: {} }, 'zzz', catalog)).toEqual({ ok: false, error: 'unknown_part' });
    expect(equip({ rocket: {}, inventory: {} }, 'fins_stub_fins', catalog)).toEqual({ ok: false, error: 'not_owned' });
  });

  it('unequips into the inventory and ignores empty slots', () => {
    const hangar = { rocket: { fins: 'fins_stub_fins' }, inventory: { fins_stub_fins: 1 } };
    expect(unequip(hangar, 'fins')).toEqual({ rocket: {}, inventory: { fins_stub_fins: 2 } });
    expect(unequip(hangar, 'engine')).toBe(hangar);
  });

  it('walks empty → incomplete → ready', () => {
    const inventory = { body_tin_can_hull: 1, fuel_tank_jerrycan_tank: 1, engine_sparrow_e1: 1, fins_stub_fins: 1 };
    expect(hangarState({})).toBe('empty');
    const partial = equipAll({ rocket: {}, inventory }, ['body_tin_can_hull'], catalog);
    expect(partial.ok && hangarState(partial.hangar.rocket)).toBe('incomplete');
    const full = equipAll({ rocket: {}, inventory }, Object.keys(inventory), catalog);
    expect(full.ok && hangarState(full.hangar.rocket)).toBe('ready');
    expect(full.ok && full.hangar.inventory).toEqual({});
  });

  it('stops at the first part that cannot be equipped', () => {
    const r = equipAll({ rocket: {}, inventory: { fins_stub_fins: 1 } }, ['fins_stub_fins', 'engine_sparrow_e1'], catalog);
    expect(r).toEqual({ ok: false, error: 'not_owned' });
  });
});

import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../../core/parts/parts';
import catalogJson from '../../data/parts/catalog.json';
import { addBay, bayPrice, emptyBay, equip, equipAll, hangarState, renameRocket, switchRocket, unequip, type Garage } from './builder';

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

describe('hangar bays', () => {
  const garage: Garage = {
    rocket: { engine: 'engine_sparrow_e1' },
    fleet: [
      { name: 'Rocket 1', parts: {} },
      { name: 'Skylark', parts: { engine: 'pb_skylark_engine' } },
    ],
    active: 0,
  };

  it('prices each new bay from the list and stops when every bay is built', () => {
    expect(bayPrice(1, [2500, 12000])).toBe(2500);
    expect(bayPrice(2, [2500, 12000])).toBe(12000);
    expect(bayPrice(3, [2500, 12000])).toBeNull();
  });

  it('parks the active rocket when switching and takes out the other one', () => {
    const switched = switchRocket(garage, 1);
    expect(switched).toEqual({
      rocket: { engine: 'pb_skylark_engine' },
      fleet: [
        { name: 'Rocket 1', parts: { engine: 'engine_sparrow_e1' } },
        { name: 'Skylark', parts: { engine: 'pb_skylark_engine' } },
      ],
      active: 1,
    });
    expect(switchRocket(switched, 0).rocket).toEqual({ engine: 'engine_sparrow_e1' });
    expect(switchRocket(garage, 0)).toBe(garage);
    expect(switchRocket(garage, 5)).toBe(garage);
  });

  it('finds an empty bay: the stripped active one first, then a parked empty one', () => {
    expect(emptyBay(garage)).toBeNull();
    expect(emptyBay({ ...garage, rocket: {} })).toBe(0);
    // Bay 0 looks empty only because its parts live in `rocket` while it is active.
    const built = addBay(garage, 'Rocket 3');
    expect(built.fleet[2]).toEqual({ name: 'Rocket 3', parts: {} });
    expect(emptyBay(built)).toBe(2);
  });

  it('renames a bay, trimming the name and ignoring blanks and unknown bays', () => {
    expect(renameRocket(garage, 1, '  Big Bird  ').fleet[1].name).toBe('Big Bird');
    expect(renameRocket(garage, 1, 'x'.repeat(30)).fleet[1].name).toHaveLength(20);
    expect(renameRocket(garage, 1, '   ')).toBe(garage);
    expect(renameRocket(garage, 9, 'Nope')).toBe(garage);
  });
});

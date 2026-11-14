import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'rocket-builder-tycoon.save.v1';

export const ALL_TIPS = ['weapons', 'guardian', 'wind', 'meteors', 'missions', 'upgrades', 'coins', 'ghost', 'leaderboard'];

/** A guest save that finished the tutorial and level 1 with the starter rocket plus a booster in stock. */
export function veteranSave(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    cash: 5000,
    gems: 0,
    inventory: { booster_bottle_rocket: 1 },
    rocket: { body: 'body_tin_can_hull', fuel_tank: 'fuel_tank_jerrycan_tank', engine: 'engine_sparrow_e1', fins: 'fins_stub_fins' },
    upgrades: {},
    progress: { unlocked: [1], completed: [1], best: { '1': 1200 } },
    selectedLevel: 1,
    tutorialStep: 'done',
    settings: { volume: 0, muted: true, touchControls: 'auto', music: 0, vibration: false, ghost: true, analytics: false, pilotName: '' },
    stats: { flights: 3, totalEarned: 2000, totalDistance: 3000, hoops: 4, destroyed: 0, coins: 10, guardians: 0, fuelCans: 0 },
    achievements: ['first_flight'],
    missions: null,
    cosmetics: { owned: [], equipped: {} },
    tips: ALL_TIPS,
    updatedAt: 1,
    ...overrides,
  };
}

export async function startWithSave(page: Page, save: object, query = '') {
  await page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    }
  }, [SAVE_KEY, JSON.stringify(save)] as const);
  await page.goto(`/${query}`);
  await page.getByTestId('play-guest').click();
  await expect(page.getByTestId('launch')).toBeVisible();
}

export async function cash(page: Page): Promise<number> {
  return Number((await page.getByTestId('cash').textContent())!.replace(/[^0-9]/g, ''));
}

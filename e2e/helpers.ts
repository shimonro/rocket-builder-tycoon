import { expect, type Page } from '@playwright/test';

export const SAVE_KEY = 'rocket-builder-tycoon.save.v1';

/** A guest save that finished the tutorial and level 1 with the starter rocket plus a booster in stock. */
export function veteranSave(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    cash: 5000,
    inventory: { booster_bottle_rocket: 1 },
    rocket: { body: 'body_tin_can_hull', fuel_tank: 'fuel_tank_jerrycan_tank', engine: 'engine_sparrow_e1', fins: 'fins_stub_fins' },
    progress: { unlocked: [1], completed: [1], best: { '1': 1200 } },
    selectedLevel: 1,
    tutorialStep: 'done',
    settings: { volume: 0, muted: true, touchControls: 'auto' },
    stats: { flights: 3, totalEarned: 2000 },
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

import { expect, test } from '@playwright/test';
import { cash, SAVE_KEY, startWithSave, veteranSave } from './helpers';

const STARTER = ['body_tin_can_hull', 'fuel_tank_jerrycan_tank', 'engine_sparrow_e1', 'fins_stub_fins'];

test('a new guest completes the locked tutorial and keeps progress after reload', async ({ page }) => {
  await page.goto('/?timescale=8');
  await page.getByTestId('play-guest').click();
  await expect(page.getByTestId('coach')).toContainText('$600');
  await expect(page.getByTestId('nav-shop')).toBeDisabled();
  await page.getByTestId('tutorial-next').click();

  for (const id of STARTER) {
    // Only the part the tutorial is teaching can be bought.
    await expect(page.locator('.buy:not(:disabled)')).toHaveCount(1);
    await page.getByTestId(`buy-${id}`).click();
  }
  await expect(page.getByTestId('cash')).toHaveText('$0');

  await page.getByTestId('nav-hangar').click();
  for (const id of STARTER) await page.getByTestId(`equip-${id}`).click();
  await expect(page.getByTestId('hangar-ranking')).toContainText('152');

  await page.getByTestId('launch').click();
  await expect(page.getByTestId('flight-hint')).toBeVisible();
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 30_000 });
  const payout = Number((await page.getByTestId('payout-total').textContent())!.replace(/[^0-9]/g, ''));
  expect(payout).toBeGreaterThan(0);

  await page.getByTestId('continue').click();
  await expect(page.getByTestId('coach')).toHaveCount(0);
  await expect(page.getByTestId('nav-shop')).toBeEnabled();
  expect(await cash(page)).toBe(payout);

  await page.reload();
  await expect(page.getByTestId('play-guest')).toContainText('Continue');
  await page.getByTestId('play-guest').click();
  expect(await cash(page)).toBe(payout);
});

test('a flight flown with the keyboard pays out on distance', async ({ page }) => {
  await startWithSave(page, veteranSave());
  const before = await cash(page);
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('journey')).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowUp');
  const distance = Number((await page.getByTestId('hud-distance').textContent())!.replace(/[^0-9]/g, ''));
  expect(distance).toBeGreaterThan(20);

  await page.keyboard.press('Escape');
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('results')).toBeVisible();
  const payout = Number((await page.getByTestId('payout-total').textContent())!.replace(/[^0-9]/g, ''));
  expect(payout).toBeGreaterThan(0);
  expect(await cash(page)).toBe(before + payout);
});

test('level 2 unlocks only when all three gates pass', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('nav-levels').click();
  const card = page.getByTestId('level-2');
  await expect(card).toContainText('Ranking ★ 170');
  await expect(page.getByTestId('unlock-2')).toBeDisabled();

  await page.getByTestId('nav-hangar').click();
  await page.getByTestId('equip-booster_bottle_rocket').click();
  await page.getByTestId('nav-levels').click();
  await page.getByTestId('unlock-2').click();
  await expect(card).toContainText('Unlocked');
  expect(await cash(page)).toBe(5000 - 600);

  // Shields and weapons go on sale with level 2.
  await page.getByTestId('nav-shop').click();
  await expect(page.getByTestId('buy-shield_bubble_shield')).toBeEnabled();
});

test('a prebuilt rocket is assembled and ready to launch', async ({ page }) => {
  await startWithSave(page, veteranSave({ rocket: {}, inventory: {} }));
  await expect(page.getByTestId('launch')).toBeDisabled();
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('tab-prebuilts').click();
  await page.getByTestId('prebuilt-skylark').getByRole('button').click();
  await page.getByTestId('nav-hangar').click();
  await expect(page.getByTestId('launch')).toBeEnabled();
  expect(await cash(page)).toBe(5000 - 1250);
});

test('a corrupt save falls back to a fresh game', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{broken'), SAVE_KEY);
  await page.goto('/');
  await page.getByTestId('play-guest').click();
  await expect(page.getByTestId('cash')).toHaveText('$600');
  await expect(page.getByTestId('coach')).toBeVisible();
});

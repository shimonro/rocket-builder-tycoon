import { expect, test } from '@playwright/test';
import { cash, SAVE_KEY, startWithSave, veteranSave } from './helpers';

test('returning players can skip the tutorial', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('play-guest').click();
  await page.getByTestId('skip-tutorial').click();
  await expect(page.getByTestId('coach')).toHaveCount(0);
  await expect(page.getByTestId('tab-prebuilts')).toBeEnabled();
  await expect(page.getByTestId('cash')).toHaveText('$600');
  // The first contextual tip appears and goes away for good.
  await expect(page.getByTestId('tip')).toContainText('missions');
  await page.getByTestId('tip-dismiss').click();
  await expect(page.getByTestId('tip')).toHaveCount(0);
});

test('upgrading a mounted part raises the ranking', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await expect(page.getByTestId('hangar-ranking')).toContainText('152');
  await page.getByTestId('upgrade-engine_sparrow_e1').click();
  // +10% thrust: 40 → 44 thrust × weight 1.5 = +6 ranking.
  await expect(page.getByTestId('hangar-ranking')).toContainText('158');
  expect(await cash(page)).toBe(5000 - 100);
  await expect(page.getByTestId('slot-engine')).toContainText('▲');
});

test('daily missions pay gems that buy cosmetics', async ({ page }) => {
  await startWithSave(page, veteranSave({ gems: 30 }));
  await page.getByTestId('nav-missions').click();
  await expect(page.getByTestId('missions').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('achievement-first_flight')).toHaveClass(/done/);

  await page.getByTestId('nav-shop').click();
  await page.getByTestId('tab-cosmetics').click();
  await page.getByTestId('buy-cosmetic-paint_crimson').click();
  await expect(page.getByTestId('gems')).toHaveText('💎 15');
  await expect(page.getByTestId('cosmetic-paint_crimson')).toContainText('In use');
  await page.getByTestId('nav-hangar').click();
  await expect(page.locator('.rocket-preview svg path').first()).toHaveAttribute('fill', '#ef4444');
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).cosmetics, SAVE_KEY))
    .toEqual({ owned: ['paint_crimson'], equipped: { paint: 'paint_crimson' } });
});

test('flights show coins and record a ghost of a new best run', async ({ page }) => {
  await startWithSave(page, veteranSave({ progress: { unlocked: [1], completed: [1], best: {} } }), '?timescale=3');
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('hud-coins')).toBeVisible();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('results')).toContainText('ghost');
  const ghost = await page.evaluate(() => JSON.parse(localStorage.getItem('rocket-builder-tycoon.ghosts.v1')!));
  expect(ghost['1'].distance).toBeGreaterThan(0);
  expect(ghost['1'].points.length).toBeGreaterThan(10);
});

import { expect, test } from '@playwright/test';
import { cash, startWithSave, veteranSave } from './helpers';

test('the game guide explains the basics and replays the tour without touching progress', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('info-button').click();
  const guide = page.getByTestId('info-modal');
  await expect(guide).toContainText('target distance');
  await expect(guide).toContainText('triple-tap');
  await expect(guide).toContainText(/Version \d+\.\d+\.\d+\+/);

  await page.getByTestId('replay-tutorial').click();
  await expect(guide).toHaveCount(0);
  const tour = page.getByTestId('tour');
  await expect(tour).toContainText('cash');
  await expect(page.getByTestId('spotlight')).toBeVisible();

  // Stops on other screens navigate there.
  while (!(await page.getByTestId('tab-prebuilts').isVisible())) await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('nav-shop')).toHaveClass(/active/);
  await expect(page.getByTestId('spotlight')).toBeVisible();

  await page.getByTestId('tour-end').click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId('notice')).toContainText('hoops');
  expect(await cash(page)).toBe(5000);
});

test('QA builds show the environment badge and a god mode that restores progress when switched off', async ({ page }) => {
  await startWithSave(page, veteranSave());
  // E2E builds run as 'dev'.
  await expect(page.getByTestId('env-badge')).toContainText('DEV');
  await page.getByTestId('god-toggle').click();
  await expect(page.getByTestId('cash')).toHaveText('$∞');
  await expect(page.getByTestId('god-toggle')).toContainText('GOD MODE');
  await page.getByTestId('god-toggle').click();
  await expect(page.getByTestId('god-toggle')).not.toContainText('GOD MODE');
  expect(await cash(page)).toBe(5000);
});

test('the profile shows the pilot, the rocket and lifetime statistics', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('profile-button').click();
  await expect(page.getByTestId('profile-stats')).toContainText('3,000 m');
  await expect(page.getByTestId('profile')).toContainText('Liftoff');
  await page.getByTestId('profile-name').fill('Ace');
  await expect(page.getByTestId('profile-button')).toContainText('Ace');
});

test('the top bar fits a phone screen with thumb-sized buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startWithSave(page, veteranSave());
  const bar = (await page.locator('.topbar').boundingBox())!;
  expect(bar.width).toBeLessThanOrEqual(390);
  for (const button of await page.locator('.topbar button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
});

test('a finished flight can be watched again', async ({ page }) => {
  await startWithSave(page, veteranSave(), '?timescale=3');
  await page.getByTestId('launch').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await page.getByTestId('end-flight').click();
  await page.getByTestId('watch-replay').click();
  await expect(page.locator('.app-replay')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);
});

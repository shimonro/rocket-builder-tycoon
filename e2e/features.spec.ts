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

test('the shop explains part types, sorts, and says when a rarity is still locked', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('nav-shop').click();
  // Tapping ⓘ works without hover (phones).
  const help = page.getByTestId('part-engine_hawk_e1').locator('.cat-help');
  await help.locator('.help-dot').click();
  await expect(help.locator('.help-tip')).toBeVisible();
  await expect(help.locator('.help-tip')).toContainText('top speed');

  await page.getByTestId('sort-parts').selectOption('price_desc');
  const prices = (await page.locator('.part-card [data-testid^="buy-"]').allTextContents()).map((t) => Number(t.replace(/[^0-9]/g, '')));
  expect(prices.length).toBeGreaterThan(3);
  expect(prices).toEqual([...prices].sort((a, b) => b - a));

  await page.locator('.filters .chip', { hasText: /^epic$/ }).click();
  await expect(page.getByTestId('rarity-empty')).toContainText('Level 5');
  await page.locator('.filters .toggle input').check();
  await expect(page.getByTestId('rarity-empty')).toHaveCount(0);
  await expect(page.locator('.part-card').first()).toContainText('epic');
});

test('specialist parts show their penalty in red', async ({ page }) => {
  await startWithSave(page, veteranSave({ progress: { unlocked: [1, 2, 3, 4, 5], completed: [1, 2, 3, 4], best: {} } }));
  await page.getByTestId('nav-shop').click();
  const card = page.getByTestId('part-engine_drag_racer_e3');
  await expect(card).toContainText('Specialist');
  await expect(card.locator('.part-stats .neg')).toContainText('-25');
});

test('compare shows how a part or a prebuilt changes the rocket', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('compare-engine_hawk_e1').click();
  const modal = page.getByTestId('compare-modal');
  await expect(modal).toContainText('152');
  await expect(modal).toContainText('167');
  await expect(modal.locator('.delta.up').first()).toHaveText('+15');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  await page.getByTestId('tab-prebuilts').click();
  await page.getByTestId('compare-prebuilt-skylark').click();
  await expect(modal).toContainText('Skylark');
  await expect(modal).toContainText('hangar bay');
  await page.getByTestId('compare-close').click();
  await expect(modal).toHaveCount(0);
});

test('flag decals are bought with gems and drawn on the rocket', async ({ page }) => {
  await startWithSave(page, veteranSave({ gems: 30 }));
  await page.getByTestId('nav-shop').click();
  await page.getByTestId('tab-cosmetics').click();
  // The card shows the flag on a rocket and in a close-up badge.
  await expect(page.getByTestId('cosmetic-decal_flag_jp').locator('svg circle[fill="#bc002d"]')).toHaveCount(2);
  await page.getByTestId('buy-cosmetic-decal_flag_jp').click();
  await expect(page.getByTestId('gems')).toHaveText('💎 20');
  await expect(page.getByTestId('cosmetic-decal_flag_jp')).toContainText('In use');
  await expect
    .poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).cosmetics.equipped, SAVE_KEY))
    .toEqual({ decal: 'decal_flag_jp' });
  await page.getByTestId('nav-hangar').click();
  await expect(page.locator('.rocket-preview svg circle[fill="#bc002d"]')).toHaveCount(1);
});

test('the flight HUD shows level progress and gems, and triple-tapping ↑ locks fast mode', async ({ page }) => {
  await startWithSave(page, veteranSave(), '?timescale=3');
  await page.getByTestId('launch').click();
  await expect(page.getByTestId('hud-percent')).toHaveText(/\d+%/);
  await expect(page.getByTestId('hud-gems')).toContainText('💎');
  // Three taps inside the 0.6 s window, sent in one go so slow CI round-trips do not stretch them apart.
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));
    }
  });
  const fast = page.getByTestId('fast-mode');
  await expect(fast).toBeVisible();
  // It stays on with no key held, until ↓ is tapped once.
  await page.waitForTimeout(800);
  await expect(fast).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(fast).toHaveCount(0);
});

test('the tutorial flight pauses once on each new kind of thing', async ({ page }) => {
  await page.goto('/?timescale=8');
  await page.getByTestId('play-guest').click();
  await page.getByTestId('tutorial-next').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('tutorial-next').click();
  const starter = ['body_tin_can_hull', 'fuel_tank_jerrycan_tank', 'engine_sparrow_e1', 'fins_stub_fins'];
  for (const id of starter) await page.getByTestId(`buy-${id}`).click();
  await page.getByTestId('nav-hangar').click();
  for (const id of starter) await page.getByTestId(`equip-${id}`).click();
  await page.getByTestId('tutorial-next').click();
  await page.getByTestId('launch').click();

  const intro = page.getByTestId('flight-intro');
  await expect(intro).toBeVisible({ timeout: 20_000 });
  // The flight is frozen while the callout is up, and Space does not reach the rocket as turbo.
  const distance = await page.getByTestId('hud-distance').textContent();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('hud-distance')).toHaveText(distance!);
  const seen = [await intro.locator('strong').textContent()];
  await page.keyboard.press('Space');
  // Space dismisses it; the next intro may follow at once when another new thing is close by.
  await expect(intro.filter({ hasText: seen[0]! })).toHaveCount(0);

  const deadline = Date.now() + 45_000;
  while (!(await page.getByTestId('results').isVisible())) {
    expect(Date.now()).toBeLessThan(deadline);
    if (await intro.isVisible()) {
      const title = await intro.locator('strong').textContent();
      expect(seen).not.toContain(title);
      seen.push(title);
      await page.getByTestId('intro-continue').click();
    }
    await page.waitForTimeout(150);
  }
  expect(seen.length).toBeGreaterThanOrEqual(2);
});

test('the last flight can be watched again from the results', async ({ page }) => {
  await startWithSave(page, veteranSave(), '?timescale=3');
  await page.getByTestId('launch').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await page.getByTestId('end-flight').click();
  const distance = (await page.getByTestId('result-distance').textContent())!.replace(/[^0-9]/g, '');

  await page.getByTestId('watch-replay').click();
  await expect(page.getByTestId('replay-badge')).toBeVisible();
  await expect(page.getByTestId('pause')).toHaveCount(0);
  await page.getByTestId('replay-speed').click();
  await expect(page.getByTestId('replay-speed')).toHaveText('2×');
  await expect(page.getByTestId('replay-finished')).toBeVisible({ timeout: 20_000 });
  // The replay ends exactly where the flight did.
  await expect(page.getByTestId('hud-distance')).toHaveText(`${Number(distance).toLocaleString('en-US')} m`);
  await page.getByTestId('replay-again').click();
  await expect(page.getByTestId('replay-finished')).toHaveCount(0);
  await page.getByTestId('replay-close').click();
  await expect(page.getByTestId('results')).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { cash, startWithSave, veteranSave } from './helpers';

test('touch controls fly the rocket on a phone', async ({ page }) => {
  await startWithSave(page, veteranSave());
  const before = await cash(page);
  await page.getByTestId('launch').click();
  const controls = page.getByTestId('touch-controls');
  await expect(controls).toBeVisible();

  // Drag across the sky to steer, hold Forward, then tap Turbo.
  const host = page.locator('.flight-host');
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 5 });
  const forward = controls.getByRole('button', { name: 'Forward' });
  await forward.dispatchEvent('pointerdown');
  await page.waitForTimeout(1000);
  await forward.dispatchEvent('pointerup');
  await page.mouse.up();
  await controls.getByRole('button', { name: 'Turbo' }).tap();
  await page.waitForTimeout(500);

  const distance = Number((await page.getByTestId('hud-distance').textContent())!.replace(/[^0-9]/g, ''));
  expect(distance).toBeGreaterThan(20);

  await page.getByTestId('pause').tap();
  await page.getByTestId('end-flight').tap();
  await expect(page.getByTestId('results')).toBeVisible();
  expect(await cash(page)).toBeGreaterThan(before);
  await page.getByTestId('retry').tap();
  await expect(page.getByTestId('journey')).toBeVisible();
});

test('triple-tapping ▲ locks fast mode and one ▼ tap releases it', async ({ page }) => {
  await startWithSave(page, veteranSave());
  await page.getByTestId('launch').click();
  const controls = page.getByTestId('touch-controls');
  const forward = controls.getByRole('button', { name: 'Forward' });
  // Three taps inside the 0.6 s window, sent in one go so test round-trips do not stretch them apart.
  await forward.evaluate((button) => {
    for (let i = 0; i < 3; i++) {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    }
  });
  await expect(page.getByTestId('fast-mode')).toBeVisible();
  await expect(page.getByTestId('hud-gems')).toBeVisible();
  const backward = controls.getByRole('button', { name: 'Backward' });
  await backward.dispatchEvent('pointerdown');
  await backward.dispatchEvent('pointerup');
  await expect(page.getByTestId('fast-mode')).toHaveCount(0);
});

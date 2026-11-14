import { expect, test, type Page } from '@playwright/test';
import { cash, SAVE_KEY, veteranSave } from './helpers';
import { SupabaseMock } from './supabaseMock';

let mock: SupabaseMock;

test.beforeEach(async ({ page }) => {
  mock = new SupabaseMock();
  await mock.install(page);
});

async function logIn(page: Page, email: string, password: string, button: 'Log in' | 'Register' = 'Log in') {
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/^Password/).fill(password);
  await page.getByRole('button', { name: button }).click();
}

function seedGuest(page: Page, save: object) {
  return page.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', '1');
    }
  }, [SAVE_KEY, JSON.stringify(save)] as const);
}

test('registering imports guest progress, saves it to the cloud and restores it on the next login', async ({ page }) => {
  await seedGuest(page, veteranSave({ cash: 4321 }));
  await page.goto('/');
  await logIn(page, 'pilot@example.com', 'secret-123', 'Register');
  await page.getByRole('button', { name: 'Yes, import it' }).click();
  await expect(page.getByTestId('launch')).toBeVisible();
  expect(await cash(page)).toBe(4321);
  const userId = mock.users[0].id;
  await expect.poll(() => (mock.saves.get(userId) as { cash: number } | undefined)?.cash).toBe(4321);

  // Later changes overwrite the cloud copy this device saved.
  await page.getByTestId('upgrade-engine_sparrow_e1').click();
  await expect.poll(() => (mock.saves.get(userId) as { cash: number }).cash).toBe(4221);

  await page.getByTestId('nav-settings').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('play-guest')).toBeVisible();
  await logIn(page, 'pilot@example.com', 'secret-123');
  await expect(page.getByTestId('launch')).toBeVisible();
  expect(await cash(page)).toBe(4221);
});

test('a wrong password shows the error and keeps the player on the title screen', async ({ page }) => {
  mock.users.push({ id: crypto.randomUUID(), email: 'pilot@example.com', password: 'right-pass' });
  await page.goto('/');
  await logIn(page, 'pilot@example.com', 'wrong-pass');
  await expect(page.getByText('Invalid login credentials')).toBeVisible();
  await expect(page.getByTestId('play-guest')).toBeVisible();
});

test('progress saved on another device triggers a conflict choice', async ({ page }) => {
  const id = crypto.randomUUID();
  mock.users.push({ id, email: 'pilot@example.com', password: 'secret-123' });
  mock.saves.set(id, veteranSave({ cash: 3000, updatedAt: 100 }));
  await page.goto('/');
  await logIn(page, 'pilot@example.com', 'secret-123');
  await expect(page.getByTestId('launch')).toBeVisible();

  // Another device saves meanwhile.
  mock.saves.set(id, veteranSave({ cash: 7777, updatedAt: 200 }));
  await page.getByTestId('upgrade-engine_sparrow_e1').click();
  const dialog = page.getByTestId('conflict');
  await expect(dialog).toContainText('$7,777');
  await expect(dialog).toContainText('$2,900');
  await page.getByTestId('keep-remote').click();
  expect(await cash(page)).toBe(7777);

  // Keeping this device's progress overwrites the other copy instead.
  mock.saves.set(id, veteranSave({ cash: 1111, updatedAt: 300 }));
  await page.getByTestId('upgrade-engine_sparrow_e1').click();
  await page.getByTestId('keep-local').click();
  await expect.poll(() => (mock.saves.get(id) as { cash: number }).cash).toBe(7677);
});

test('forgotten passwords are reset through an emailed link', async ({ page }) => {
  const id = crypto.randomUUID();
  mock.users.push({ id, email: 'pilot@example.com', password: 'old-pass' });
  await page.goto('/');
  await page.getByTestId('forgot-password').click();
  await page.getByPlaceholder('Email').fill('pilot@example.com');
  await page.getByTestId('send-reset').click();
  await expect(page.getByTestId('reset-sent')).toBeVisible();
  expect(mock.resetRequests).toEqual(['pilot@example.com']);

  // The emailed link signs the player in with a recovery session.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256' })}.${b64({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
  await page.goto('about:blank');
  await page.goto(`/#access_token=${token}&expires_at=${Math.floor(Date.now() / 1000) + 3600}&expires_in=3600&refresh_token=refresh-${id}&token_type=bearer&type=recovery`);
  await expect(page.getByTestId('recovery')).toBeVisible();
  await page.getByTestId('new-password').fill('new-pass-456');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password updated')).toBeVisible();
  expect(mock.passwordUpdates).toEqual(['new-pass-456']);
  expect(page.url()).not.toContain('access_token');
});

test('signed-in runs go to the leaderboard for verification', async ({ page }) => {
  const id = crypto.randomUUID();
  mock.users.push({ id, email: 'ace@example.com', password: 'secret-123' });
  mock.saves.set(id, veteranSave({ progress: { unlocked: [1], completed: [1], best: {} }, settings: { ...veteranSave().settings, pilotName: 'Ace' } }));
  mock.leaderboard.push({ user_id: 'someone', name: 'Rival', distance: 5000, level_id: 1 });
  await page.goto('/?timescale=3');
  await logIn(page, 'ace@example.com', 'secret-123');
  await page.getByTestId('launch').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1200);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  await page.getByTestId('end-flight').click();
  await expect(page.getByTestId('leaderboard-status')).toContainText('#1');
  const run = mock.submissions[0] as { levelId: number; log: number[]; aborted: boolean; name: string; rulesVersion: string };
  expect(run).toMatchObject({ levelId: 1, aborted: true, name: 'Ace' });
  expect(run.log.length).toBeGreaterThan(1);
  expect(run.rulesVersion).toMatch(/^[0-9a-z]+$/);

  await page.getByRole('button', { name: /Level 2|Hangar/ }).first().click();
  await page.getByTestId('nav-levels').click();
  await page.getByTestId('board-1').click();
  await expect(page.getByTestId('leaderboard')).toContainText('Rival');
});

import { expect, test } from '@playwright/test';

test('Developer can log in and core screens render without browser exceptions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible({ timeout: 30_000 });
  await page.locator('#login-username').fill('developer');
  await page.locator('#login-password').fill('ci-test-only-not-for-production-507218');
  await page.locator('#login-form button[type="submit"]').click();

  await expect(page.locator('#top-logout-btn')).toBeVisible({ timeout: 60_000 });
  const routes = [
    'dashboard', 'patients', 'requests', 'samples',
    'tests', 'testParameters', 'results', 'resultReview',
    'invoices', 'payments', 'inventory', 'purchases',
    'accounts', 'journalEntries', 'cashbox', 'expenses',
    'reports', 'users', 'permissions', 'settings',
  ];

  for (const route of routes) {
    await page.evaluate((next) => { window.location.hash = '#/' + next; }, route);
    await expect(page.locator('#screen-viewport')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      return (await page.locator('#screen-viewport').innerText()).trim().length;
    }, { timeout: 15_000, message: 'Empty screen: ' + route }).toBeGreaterThan(10);
    await page.screenshot({ path: `test-results/screen-${route}.png` }).catch(() => {});
  }
  expect(errors, errors.join('\n')).toEqual([]);

  await page.locator('#top-logout-btn').click();
  await expect(page.locator('#login-form')).toBeVisible({ timeout: 15_000 });
});

test('Invalid credentials do not open protected application screens', async ({ page }) => {
  await page.goto('/');
  await page.locator('#login-username').fill('developer');
  await page.locator('#login-password').fill('incorrect-password');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#login-error-box')).toBeVisible();
  await expect(page.locator('#top-logout-btn')).toHaveCount(0);
});

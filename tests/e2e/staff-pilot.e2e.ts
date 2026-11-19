import { expect, test } from '@playwright/test';

test('staff uses only secure patient pilot backed by MySQL 5.5', async ({ page }) => {
  test.skip(process.env.TLAB_STAFF_E2E !== 'true', 'Requires real MySQL 5.5 service');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible();
  await page.locator('#login-username').fill('developer');
  await page.locator('#login-password').fill(process.env.TLAB_ADMIN_PASSWORD || 'ci-test-only-not-for-production-507218');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#top-logout-btn')).toBeVisible();

  const username = 'pw_ci_' + Date.now().toString(36);
  const password = 'Pilot-ci-secret-password-16725!';
  const provision = await page.request.post('/api/auth/staff', {
    data: { username, password, role: 'Receptionist' },
  });
  expect(provision.status()).toBe(201);
  await page.locator('#top-logout-btn').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#staff-pilot-create')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#top-logout-btn')).toHaveCount(0);
  const restricted = await page.request.get('/api/mysql/env-config');
  expect(restricted.status()).toBe(403);

  const name = 'CI Patient ' + Date.now();
  await page.locator('#staff-pilot-create [name="name"]').fill(name);
  await page.locator('#staff-pilot-create [name="phone"]').fill('01000000000');
  await page.locator('#staff-pilot-create button[type="submit"]').click();
  await expect(page.locator('#staff-pilot-list')).toContainText(name, { timeout: 20_000 });
  expect(errors, errors.join('\n')).toEqual([]);

  await page.locator('#staff-pilot-logout').click();
  await expect(page.locator('#login-form')).toBeVisible();
});

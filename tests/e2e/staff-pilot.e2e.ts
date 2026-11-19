import { expect, test } from '@playwright/test';
import mysql from 'mysql2/promise';

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

  const suffix = Date.now().toString(36);
  const e2eTestId = '000_e2e_' + suffix;
  const dbConnection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'tlab_mysql55_ci',
  });
  try {
    await dbConnection.execute(
      'INSERT INTO lab_tests (id, code, name_ar, price, active) VALUES (?, ?, ?, 25, 1)',
      [e2eTestId, 'CI', 'E2E Result Test'],
    );
    await dbConnection.execute(
      'INSERT INTO test_parameters (id, test_id, code, name_ar, result_type, is_calculated, active) VALUES (?, ?, ?, ?, ?, 0, 1)',
      ['p_' + suffix, e2eTestId, 'E2E', 'E2E Numeric Parameter', 'numeric'],
    );
  } finally { await dbConnection.end(); }
  const username = 'pw_ci_' + Date.now().toString(36);
  const password = 'Pilot-ci-secret-password-16725!';
  const provision = await page.request.post('/api/auth/staff', {
    data: { username, password, role: 'Receptionist' },
  });
  expect(provision.status()).toBe(201);
  const techUsername = 'tech_ci_' + Date.now().toString(36);
  const techPassword = 'Technician-ui-test-password-8975!';
  const techProvision = await page.request.post('/api/auth/staff', {
    data: { username: techUsername, password: techPassword, role: 'Technician' },
  });
  expect(techProvision.status()).toBe(201);
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
  const patientRow = page.locator('#staff-pilot-list tr').filter({ hasText: name });
  await patientRow.locator('[data-patient-action="select"]').click();
  await expect(page.locator('#lab-pilot-request [name="patientId"]')).not.toHaveValue('');
  await expect(page.locator('#lab-pilot-request select[name="testId"] option')).not.toHaveCount(1, { timeout: 20_000 });
  await page.locator('#lab-pilot-request select[name="testId"]').selectOption(e2eTestId);
  await page.locator('#lab-pilot-request button[type="submit"]').click();
  await expect(page.locator('#lab-pilot-requests')).toContainText('awaiting_sample', { timeout: 20_000 });
  await expect(page.locator('#lab-pilot-status')).toContainText('تم إنشاء الطلب', { timeout: 20000 });
  const requestNumber = (await page.locator('#lab-pilot-status').innerText()).match(/REQ-[A-Z0-9]+/)?.[0];
  expect(requestNumber).toBeTruthy();
  await page.locator('#lab-pilot-requests tr').filter({ hasText: requestNumber! }).locator('button[data-quote-index]').click();
  await expect(page.locator('#lab-pilot-quote')).toContainText('ليست فاتورة', { timeout: 20000 });

  await page.locator('#staff-pilot-logout').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await page.locator('#login-username').fill(techUsername);
  await page.locator('#login-password').fill(techPassword);
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#lab-pilot-requests')).toContainText('awaiting_sample', { timeout: 20_000 });
  await expect(page.locator('#lab-pilot-request')).toHaveCount(0);
  page.once('dialog', dialog => dialog.accept('Blood'));
  await page.locator('#lab-pilot-requests tr').filter({ hasText: requestNumber! }).locator('button[data-receive-index]').click();
  await expect(page.locator('#lab-pilot-requests')).toContainText('sample_received', { timeout: 20_000 });
  await page.reload();
  await expect(page.locator('#preliminary-order')).toBeVisible({ timeout: 20_000 });
  await page.locator('#preliminary-order').selectOption({ label: requestNumber! });
  await expect(page.locator('#preliminary-entry-forms')).toContainText('E2E Numeric Parameter');
  await page.locator('#preliminary-entry-forms input').first().fill('10');
  await page.locator('#preliminary-entry-forms button[type="submit"]').first().click();
  await expect(page.locator('#preliminary-entry-forms button[data-send-review]')).toBeVisible({ timeout: 20_000 });
  expect(errors, errors.join('\n')).toEqual([]);

  await page.locator('#staff-pilot-logout').click();
  await expect(page.locator('#login-form')).toBeVisible();
});

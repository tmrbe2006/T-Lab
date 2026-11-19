import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/',
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: '3000',
      TLAB_ADMIN_PASSWORD: 'ci-test-only-not-for-production-507218',
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '3306',
      MYSQL_USER: 'ci_no_database',
      MYSQL_PASSWORD: 'not-valid',
      MYSQL_DATABASE: 'tlab_ci_demo',
      NODE_ENV: 'development',
    },
  },
});

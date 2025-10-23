import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

process.env.NODE_EXTRA_CA_CERTS = resolve(__dirname, '../.certs/rootCA.pem');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html'],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        contextOptions: {
          ignoreHTTPSErrors: true,
          recordHar: {
            path: 'test-results/test.har',
          },
        },
      },
    },
  ],
});

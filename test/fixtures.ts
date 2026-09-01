import { test as base, TestInfo } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { cleanupBackups, cleanupDb, cleanupFolder } from './utils';

// Define a type for our fixtures
type TestFixtures = {
  setupTestEnvironment: void;
};

// Extend the base test with our fixtures
export const test = base.extend<TestFixtures>({
  // This fixture runs automatically for each test
  setupTestEnvironment: [async ({}, use) => {
    // Cleanup before each test
    await cleanupBackups();
    await cleanupDb();
    await cleanupFolder('/tmp/test-uploads');
    await cleanupFolder('/tmp/test-documents');

    // Run the test
    await use();

    // Cleanup after each test
    await cleanupDb();
    await cleanupFolder('/tmp/test-uploads');
    await cleanupFolder('/tmp/test-documents');
  }, { auto: true }], // auto: true makes this fixture run automatically

  // Capture browser console logs and page errors, attaching them to the
  // report on failure to help debug flaky/failed E2E runs from CI artifacts
  page: async ({ page }, use, testInfo: TestInfo) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      const location = msg.location();
      const timestamp = new Date().toISOString();
      consoleLogs.push(
        `[${timestamp}] [${type.toUpperCase()}] ${text} (${location.url}:${location.lineNumber})`
      );
    });

    page.on('pageerror', (error) => {
      const timestamp = new Date().toISOString();
      consoleLogs.push(`[${timestamp}] [PAGE_ERROR] ${error.message}\n${error.stack}`);
    });

    await use(page);

    if (testInfo.status !== testInfo.expectedStatus && consoleLogs.length > 0) {
      const outputDir = testInfo.outputDir;
      mkdirSync(outputDir, { recursive: true });
      const logPath = join(outputDir, 'console-logs.txt');
      writeFileSync(logPath, consoleLogs.join('\n'));
      testInfo.attachments.push({
        name: 'console-logs',
        path: logPath,
        contentType: 'text/plain',
      });
    }
  },
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

import { test as base } from '@playwright/test';
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
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

import { test as base } from '@playwright/test';
import { cleanupBackups, cleanupDb, cleanupBlobContainer } from './utils';

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
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Run the test
    await use();

    // Cleanup after each test
    await cleanupDb();
  }, { auto: true }], // auto: true makes this fixture run automatically
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

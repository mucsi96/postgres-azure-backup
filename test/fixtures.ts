import { test as base } from '@playwright/test';
import { cleanupBackups, cleanupDb, createBackup, populateDb } from './utils';
import { resolve } from 'path';

// Define a type for our fixtures
type TestFixtures = {
  setupTestEnvironment: void;
};

// Extend the base test with our fixtures
export const test = base.extend<TestFixtures>({
  // This fixture runs automatically for each test
  setupTestEnvironment: [async ({}, use) => {
    // Cleanup and setup initial state
    await cleanupBackups();

    // Create initial backups
    await createBackup({
      prefix: 'db1',
      rowsCount: 8,
      timeDelta: { hours: 10 },
      retention: 1,
      size: 100,
      blobCount: 5,
      blobsTotalSize: 2048,
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 7,
      timeDelta: { days: 3, hours: 10 },
      retention: 7,
      size: 150,
      blobCount: 12,
      blobsTotalSize: 524288,
    });

    // Setup database
    await cleanupDb();
    await populateDb();

    // Run the test
    await use();

    // Teardown after each test (if needed)
    // Add any cleanup code here if necessary
  }, { auto: true }], // auto: true makes this fixture run automatically
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

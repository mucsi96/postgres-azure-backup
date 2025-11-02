import { test, expect } from '../fixtures';
import {
  cleanupBackups,
  createBackup,
  getBackupsFromStorage,
  populateDb,
  triggerBackup
} from '../utils';

test.describe('Smart Backup Tests', () => {
  test('triggers smart backup when no backups exist', async () => {
    await populateDb();

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const result = await response.json();
    expect(result.cleanupPerformed).toBe(true);
    expect(result.backupsPerformed.length).toBeGreaterThan(0);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');
    const db2Backups = await getBackupsFromStorage('db2');

    // Should have created monthly backups for each database (highest priority when no backups exist)
    expect(db1Backups.length).toBe(1);
    expect(db2Backups.length).toBe(1);

    // Check retention periods - should be monthly (356 days)
    expect(db1Backups[0].retention).toBe(356);
    expect(db2Backups[0].retention).toBe(356);
  });

  test('skips daily backup when recent backup exists', async () => {
    await populateDb();

    // Create a recent daily backup (12 hours ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 5,
      retention: 7,
      size: 100,
      timeDelta: { hours: 12 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: existing daily, new monthly (monthly takes priority when none exists)
    expect(db1Backups.length).toBe(2);

    // Check that daily backup wasn't duplicated
    const dailyBackups = db1Backups.filter(b => b.retention === 7);
    expect(dailyBackups.length).toBe(1);
    expect(dailyBackups[0].rowsCount).toBe(5); // Original backup

    // Check that monthly was created (highest priority)
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
  });

  test('creates daily backup when last one is older than 24 hours', async () => {
    await populateDb();

    // Create an old daily backup (25 hours ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 3,
      retention: 7,
      size: 100,
      timeDelta: { hours: 25 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: old daily, new monthly (monthly takes priority)
    expect(db1Backups.length).toBe(2);

    // Check old daily backup still exists
    const dailyBackups = db1Backups.filter(b => b.retention === 7);
    expect(dailyBackups.length).toBe(1);
    expect(dailyBackups[0].rowsCount).toBe(3); // Old backup

    // Check that monthly backup was created (highest priority)
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
  });

  test('skips weekly backup when recent one exists', async () => {
    await populateDb();

    // Create a recent weekly backup (5 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 6,
      retention: 30,
      size: 100,
      timeDelta: { days: 5 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: existing weekly, new monthly (monthly takes priority)
    expect(db1Backups.length).toBe(2);

    // Check that weekly backup wasn't duplicated
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    expect(weeklyBackups.length).toBe(1);
    expect(weeklyBackups[0].rowsCount).toBe(6); // Original backup

    // Check that monthly was created
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
  });

  test('creates weekly backup when last one is older than 7 days', async () => {
    await populateDb();

    // Create an old weekly backup (8 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 4,
      retention: 30,
      size: 100,
      timeDelta: { days: 8 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: old weekly, new monthly (monthly takes priority)
    expect(db1Backups.length).toBe(2);

    // Check that old weekly backup still exists
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    expect(weeklyBackups.length).toBe(1);
    expect(weeklyBackups[0].rowsCount).toBe(4); // Old backup

    // Check that monthly backup was created
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
  });

  test('skips monthly backup when recent one exists', async () => {
    await populateDb();

    // Create a recent monthly backup (20 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 7,
      retention: 356,
      size: 100,
      timeDelta: { days: 20 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: existing monthly, new weekly (weekly needed since >7 days)
    expect(db1Backups.length).toBe(2);

    // Check that monthly backup wasn't duplicated
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
    expect(monthlyBackups[0].rowsCount).toBe(7); // Original backup

    // Check that weekly backup was created (since >7 days since last backup)
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    expect(weeklyBackups.length).toBe(1);
  });

  test('creates monthly backup when last one is older than 30 days', async () => {
    await populateDb();

    // Create an old monthly backup (31 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 2,
      retention: 356,
      size: 100,
      timeDelta: { days: 31 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: old monthly, new monthly
    expect(db1Backups.length).toBe(2);

    // Check that a new monthly backup was created
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(2);

    // The newer backup should have more rows (9 vs 2)
    const sortedMonthlyBackups = monthlyBackups.sort((a, b) => b.rowsCount - a.rowsCount);
    expect(sortedMonthlyBackups[0].rowsCount).toBe(9); // New backup
    expect(sortedMonthlyBackups[1].rowsCount).toBe(2); // Old backup
  });

  test('performs cleanup during smart backup', async () => {
    await populateDb();

    // Create expired backups
    await createBackup({
      prefix: 'db1',
      rowsCount: 1,
      retention: 1,
      size: 100,
      timeDelta: { days: 2 }, // Expired (retention is 1 day)
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 2,
      retention: 7,
      size: 100,
      timeDelta: { days: 8 }, // Expired (retention is 7 days)
    });

    // Create non-expired backup
    await createBackup({
      prefix: 'db1',
      rowsCount: 3,
      retention: 30,
      size: 100,
      timeDelta: { days: 15 }, // Not expired (retention is 30 days)
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const result = await response.json();
    expect(result.cleanupPerformed).toBe(true);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Expired backups should be gone
    const expiredBackup1 = db1Backups.find(b => b.rowsCount === 1);
    const expiredBackup2 = db1Backups.find(b => b.rowsCount === 2);
    expect(expiredBackup1).toBeUndefined();
    expect(expiredBackup2).toBeUndefined();

    // Non-expired backup should still exist
    const nonExpiredBackup = db1Backups.find(b => b.rowsCount === 3);
    expect(nonExpiredBackup).toBeDefined();
  });

  test('handles multiple databases in smart backup', async () => {
    await populateDb();

    // Create backups for db2 (2 days old daily backup)
    await createBackup({
      prefix: 'db2',
      rowsCount: 10,
      retention: 7,
      size: 200,
      timeDelta: { days: 2 },
    });

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const result = await response.json();
    expect(result.backupsPerformed.length).toBeGreaterThan(0);

    // Verify backups in blob storage for both databases
    const db1Backups = await getBackupsFromStorage('db1');
    const db2Backups = await getBackupsFromStorage('db2');

    // db1 should have monthly backup (highest priority when no backups exist)
    expect(db1Backups.length).toBe(1);
    expect(db1Backups[0].retention).toBe(356);

    // db2 should have the existing daily plus new monthly (highest priority)
    expect(db2Backups.length).toBe(2);

    // Check db2 has both daily and monthly backups
    const db2DailyBackups = db2Backups.filter(b => b.retention === 7);
    const db2MonthlyBackups = db2Backups.filter(b => b.retention === 356);

    expect(db2DailyBackups.length).toBe(1); // Old daily
    expect(db2MonthlyBackups.length).toBe(1); // New monthly
  });

  test('verifies smart backup REST endpoint response structure', async () => {
    await populateDb();

    // Trigger smart backup via REST endpoint
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const result = await response.json();

    // Verify response structure
    expect(result).toHaveProperty('backupsPerformed');
    expect(result).toHaveProperty('cleanupPerformed');
    expect(Array.isArray(result.backupsPerformed)).toBe(true);
    expect(typeof result.cleanupPerformed).toBe('boolean');

    // If backups were performed, check their structure
    if (result.backupsPerformed.length > 0) {
      const backup = result.backupsPerformed[0];
      expect(backup).toHaveProperty('database');
      expect(backup).toHaveProperty('retentionPeriod');
      expect(typeof backup.database).toBe('string');
      expect(typeof backup.retentionPeriod).toBe('number');
    }

    // Verify actual backups were created in storage
    const db1Backups = await getBackupsFromStorage('db1');
    const db2Backups = await getBackupsFromStorage('db2');

    // Total backups created should match the response
    const totalBackupsInStorage = db1Backups.length + db2Backups.length;
    expect(totalBackupsInStorage).toBeGreaterThan(0);
  });

  test('creates correct backup filenames with retention periods', async () => {
    await populateDb();

    // Trigger smart backup
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backup filenames in blob storage
    const db1Backups = await getBackupsFromStorage('db1');
    const blobs = db1Backups.map(backup => backup.name);

    // Check filename format: prefix/YYYYMMDD-HHMMSS.rowCount.blobCount.blobsTotalSize.retention.zip
    blobs.forEach(filename => {
      expect(filename).toMatch(/^db1\/\d{8}-\d{6}\.\d+\.\d+\.\d+\.(7|30|356)\.zip$/);
    });

    // Verify blob metadata in filename
    db1Backups.forEach(backup => {
      expect(backup.blobCount).toBeGreaterThanOrEqual(0);
      expect(backup.blobsTotalSize).toBeGreaterThanOrEqual(0);
      expect(backup.retention).toBeGreaterThan(0);
    });

    // Should only have one backup (monthly - highest priority when no backups exist)
    expect(blobs.length).toBe(1);
    expect(blobs[0]).toMatch(/\.356\.zip$/);
  });

  test('creates daily backup when monthly and weekly exist but daily is old', async () => {
    await populateDb();

    // Create a recent monthly backup (10 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 5,
      retention: 356,
      size: 100,
      timeDelta: { days: 10 },
    });

    // Create a recent weekly backup (3 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 6,
      retention: 30,
      size: 100,
      timeDelta: { days: 3 },
    });

    // Trigger smart backup
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 3 backups: monthly, weekly, new daily
    expect(db1Backups.length).toBe(3);

    const dailyBackups = db1Backups.filter(b => b.retention === 7);
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);

    expect(dailyBackups.length).toBe(1);
    expect(weeklyBackups.length).toBe(1);
    expect(monthlyBackups.length).toBe(1);
  });

  test('creates weekly backup when monthly exists and weekly is old', async () => {
    await populateDb();

    // Create a recent monthly backup (10 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 5,
      retention: 356,
      size: 100,
      timeDelta: { days: 10 },
    });

    // Trigger smart backup
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 2 backups: existing monthly, new weekly (since >7 days since last backup)
    expect(db1Backups.length).toBe(2);

    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);

    expect(weeklyBackups.length).toBe(1);
    expect(monthlyBackups.length).toBe(1);
  });

  test('verifies backup retention periods are correctly set', async () => {
    await populateDb();

    // Trigger first smart backup - should create monthly
    const response1 = await triggerBackup();
    expect(response1.ok).toBe(true);

    const result1 = await response1.json();
    expect(result1.backupsPerformed.length).toBe(2); // db1 and db2
    expect(result1.backupsPerformed[0].retentionPeriod).toBe(356);
    expect(result1.backupsPerformed[1].retentionPeriod).toBe(356);

    // Verify backups have correct retention in storage
    const db1Backups = await getBackupsFromStorage('db1');
    expect(db1Backups[0].retention).toBe(356); // Monthly retention

    // Create a monthly backup 10 days ago to trigger weekly
    await cleanupBackups();
    await createBackup({
      prefix: 'db1',
      rowsCount: 5,
      retention: 356,
      size: 100,
      timeDelta: { days: 10 },
    });

    const response2 = await triggerBackup();
    expect(response2.ok).toBe(true);

    const result2 = await response2.json();
    // Should create weekly for db1 (has monthly >7 days old) and monthly for db2 (no backups)
    expect(result2.backupsPerformed.length).toBe(2);

    const db1Backup = result2.backupsPerformed.find((b: any) => b.database === 'db1');
    expect(db1Backup.retentionPeriod).toBe(30); // Weekly retention

    const db1BackupsAfter = await getBackupsFromStorage('db1');
    const weeklyBackup = db1BackupsAfter.find(b => b.retention === 30);
    expect(weeklyBackup).toBeDefined();
    expect(weeklyBackup!.retention).toBe(30); // Weekly retention
  });

  test('verifies cleanup removes only expired backups during smart backup', async () => {
    await populateDb();

    // Create multiple backups with different retention periods
    // Expired backup (retention 1 day, created 2 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 1,
      retention: 1,
      size: 100,
      timeDelta: { days: 2 },
    });

    // Expired backup (retention 7 days, created 8 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 2,
      retention: 7,
      size: 100,
      timeDelta: { days: 8 },
    });

    // Non-expired backup (retention 30 days, created 10 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 3,
      retention: 30,
      size: 100,
      timeDelta: { days: 10 },
    });

    // Trigger smart backup (should cleanup expired and create new backup)
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    const result = await response.json();
    expect(result.cleanupPerformed).toBe(true);

    const db1Backups = await getBackupsFromStorage('db1');

    // Should only have non-expired backup plus new weekly backup
    expect(db1Backups.length).toBe(2);

    // Verify expired backups are gone
    const backup1 = db1Backups.find(b => b.rowsCount === 1);
    const backup2 = db1Backups.find(b => b.rowsCount === 2);
    expect(backup1).toBeUndefined();
    expect(backup2).toBeUndefined();

    // Verify non-expired backup still exists
    const backup3 = db1Backups.find(b => b.rowsCount === 3);
    expect(backup3).toBeDefined();
    expect(backup3!.retention).toBe(30);
  });
});

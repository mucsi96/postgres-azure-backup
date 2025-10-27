import { test, expect } from '../fixtures';
import {
  cleanupBackups,
  createBackup,
  getBackupsFromStorage
} from '../utils';

test.describe('Smart Backup Tests', () => {
  test('triggers smart backup when no backups exist', async ({ page }) => {
    // Clean all existing backups
    await cleanupBackups();

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    const result = await response.json();
    expect(result.cleanupPerformed).toBe(true);
    expect(result.backupsPerformed.length).toBeGreaterThan(0);

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');
    const db2Backups = await getBackupsFromStorage('db2');

    // Should have created daily, weekly, and monthly backups for each database
    expect(db1Backups.length).toBe(3);
    expect(db2Backups.length).toBe(3);

    // Check retention periods for db1
    const db1Retentions = db1Backups.map(b => b.retention).sort((a, b) => a - b);
    expect(db1Retentions).toEqual([7, 30, 356]);

    // Check retention periods for db2
    const db2Retentions = db2Backups.map(b => b.retention).sort((a, b) => a - b);
    expect(db2Retentions).toEqual([7, 30, 356]);
  });

  test('skips daily backup when recent backup exists', async ({ page }) => {
    await cleanupBackups();

    // Create a recent daily backup (12 hours ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 5,
      retention: 7,
      size: 100,
      timeDelta: { hours: 12 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    const result = await response.json();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 3 backups: existing daily, new weekly, new monthly
    expect(db1Backups.length).toBe(3);

    // Check that daily backup wasn't duplicated
    const dailyBackups = db1Backups.filter(b => b.retention === 7);
    expect(dailyBackups.length).toBe(1);
    expect(dailyBackups[0].rowsCount).toBe(5); // Original backup

    // Check that weekly and monthly were created
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(weeklyBackups.length).toBe(1);
    expect(monthlyBackups.length).toBe(1);
  });

  test('creates daily backup when last one is older than 24 hours', async ({ page }) => {
    await cleanupBackups();

    // Create an old daily backup (25 hours ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 3,
      retention: 7,
      size: 100,
      timeDelta: { hours: 25 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 4 backups: old daily, new daily, new weekly, new monthly
    expect(db1Backups.length).toBe(4);

    // Check that a new daily backup was created
    const dailyBackups = db1Backups.filter(b => b.retention === 7);
    expect(dailyBackups.length).toBe(2);

    // The newer backup should have more rows (9 vs 3)
    const sortedDailyBackups = dailyBackups.sort((a, b) => b.rowsCount - a.rowsCount);
    expect(sortedDailyBackups[0].rowsCount).toBe(9); // New backup
    expect(sortedDailyBackups[1].rowsCount).toBe(3); // Old backup
  });

  test('skips weekly backup when recent one exists', async ({ page }) => {
    await cleanupBackups();

    // Create a recent weekly backup (5 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 6,
      retention: 30,
      size: 100,
      timeDelta: { days: 5 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 3 backups: new daily, existing weekly, new monthly
    expect(db1Backups.length).toBe(3);

    // Check that weekly backup wasn't duplicated
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    expect(weeklyBackups.length).toBe(1);
    expect(weeklyBackups[0].rowsCount).toBe(6); // Original backup
  });

  test('creates weekly backup when last one is older than 7 days', async ({ page }) => {
    await cleanupBackups();

    // Create an old weekly backup (8 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 4,
      retention: 30,
      size: 100,
      timeDelta: { days: 8 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 4 backups: new daily, old weekly, new weekly, new monthly
    expect(db1Backups.length).toBe(4);

    // Check that a new weekly backup was created
    const weeklyBackups = db1Backups.filter(b => b.retention === 30);
    expect(weeklyBackups.length).toBe(2);

    // The newer backup should have more rows (9 vs 4)
    const sortedWeeklyBackups = weeklyBackups.sort((a, b) => b.rowsCount - a.rowsCount);
    expect(sortedWeeklyBackups[0].rowsCount).toBe(9); // New backup
    expect(sortedWeeklyBackups[1].rowsCount).toBe(4); // Old backup
  });

  test('skips monthly backup when recent one exists', async ({ page }) => {
    await cleanupBackups();

    // Create a recent monthly backup (20 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 7,
      retention: 356,
      size: 100,
      timeDelta: { days: 20 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 3 backups: new daily, new weekly, existing monthly
    expect(db1Backups.length).toBe(3);

    // Check that monthly backup wasn't duplicated
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(1);
    expect(monthlyBackups[0].rowsCount).toBe(7); // Original backup
  });

  test('creates monthly backup when last one is older than 30 days', async ({ page }) => {
    await cleanupBackups();

    // Create an old monthly backup (31 days ago)
    await createBackup({
      prefix: 'db1',
      rowsCount: 2,
      retention: 356,
      size: 100,
      timeDelta: { days: 31 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backups in blob storage
    const db1Backups = await getBackupsFromStorage('db1');

    // Should have 4 backups: new daily, new weekly, old monthly, new monthly
    expect(db1Backups.length).toBe(4);

    // Check that a new monthly backup was created
    const monthlyBackups = db1Backups.filter(b => b.retention === 356);
    expect(monthlyBackups.length).toBe(2);

    // The newer backup should have more rows (9 vs 2)
    const sortedMonthlyBackups = monthlyBackups.sort((a, b) => b.rowsCount - a.rowsCount);
    expect(sortedMonthlyBackups[0].rowsCount).toBe(9); // New backup
    expect(sortedMonthlyBackups[1].rowsCount).toBe(2); // Old backup
  });

  test('performs cleanup during smart backup', async ({ page }) => {
    await cleanupBackups();

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
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

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

  test('handles multiple databases in smart backup', async ({ page }) => {
    await cleanupBackups();

    // Create backups for db2
    await createBackup({
      prefix: 'db2',
      rowsCount: 10,
      retention: 7,
      size: 200,
      timeDelta: { days: 2 },
    });

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    const result = await response.json();
    expect(result.backupsPerformed.length).toBeGreaterThan(0);

    // Verify backups in blob storage for both databases
    const db1Backups = await getBackupsFromStorage('db1');
    const db2Backups = await getBackupsFromStorage('db2');

    // db1 should have all three types of backups
    expect(db1Backups.length).toBe(3);
    const db1Retentions = db1Backups.map(b => b.retention).sort((a, b) => a - b);
    expect(db1Retentions).toEqual([7, 30, 356]);

    // db2 should have the existing daily (old) plus new daily, weekly, and monthly
    expect(db2Backups.length).toBe(4);

    // Check db2 has backups for all retention periods
    const db2DailyBackups = db2Backups.filter(b => b.retention === 7);
    const db2WeeklyBackups = db2Backups.filter(b => b.retention === 30);
    const db2MonthlyBackups = db2Backups.filter(b => b.retention === 356);

    expect(db2DailyBackups.length).toBe(2); // Old and new
    expect(db2WeeklyBackups.length).toBe(1);
    expect(db2MonthlyBackups.length).toBe(1);
  });

  test('verifies smart backup REST endpoint response structure', async ({ page }) => {
    await cleanupBackups();

    // Trigger smart backup via REST endpoint
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

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

  test('creates correct backup filenames with retention periods', async ({ page }) => {
    await cleanupBackups();

    // Trigger smart backup
    const response = await page.request.post('http://localhost:8080/api/smart-backup');
    expect(response.ok()).toBeTruthy();

    // Verify backup filenames in blob storage
    const db1Backups = await getBackupsFromStorage('db1');
    const blobs = db1Backups.map(backup => backup.name);

    // Check filename format: prefix/YYYYMMDD-HHMMSS.rowCount.retention.pgdump
    blobs.forEach(filename => {
      expect(filename).toMatch(/^db1\/\d{8}-\d{6}\.\d+\.(7|30|356)\.pgdump$/);
    });

    // Verify we have backups for each retention period
    const has7DayBackup = blobs.some(f => f.includes('.7.pgdump'));
    const has30DayBackup = blobs.some(f => f.includes('.30.pgdump'));
    const has356DayBackup = blobs.some(f => f.includes('.356.pgdump'));

    expect(has7DayBackup).toBe(true);
    expect(has30DayBackup).toBe(true);
    expect(has356DayBackup).toBe(true);
  });
});

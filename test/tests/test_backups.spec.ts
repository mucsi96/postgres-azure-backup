import { test, expect } from '../fixtures';
import {
  extractTableData,
  cleanupBackups,
  createBackup,
  mockWindowOpen,
  listWithoutKeys
} from '../utils';

test.describe('Backups Tests', () => {
  test('shows number of backups', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 2');
  });

  test('shows last backup time', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Last backup' })).toHaveText(
      'Last backup 10 hours ago'
    );
  });

  test('shows backups', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 2');

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Name']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        'Date': '10 hours ago',
        'Records': '8',
        'Size': '100.0 B',
        'Retention': '1 day',
      },
      {
        '': 'Restore',
        'Date': '3 days ago',
        'Records': '7',
        'Size': '150.0 B',
        'Retention': '7 days',
      },
    ]);
  });

  test('switches to other db', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await page.getByRole('button', { name: 'db1' }).click();
    await page.getByRole('link', { name: 'db2' }).click();
    await expect(page.getByRole('heading', { name: 'Last backup' })).toHaveText(
      'Last backup —'
    );
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 0');
  });

  test('creates backup', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 1');

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Name', 'Date']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        'Records': '9',
        'Size': '1.9 KB',
        'Retention': '1 day',
      }
    ]);
  });

  test('creates backup with retention', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');

    const retentionPeriodInput = page.getByLabel('Retention period');
    await retentionPeriodInput.fill('7');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 1');

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Name', 'Date']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        'Records': '9',
        'Size': '1.9 KB',
        'Retention': '7 days',
      }
    ]);
  });

  test('cleans up outdated backups', async ({ page }) => {
    await cleanupBackups();

    await createBackup({
      prefix: 'db1',
      rowsCount: 1,
      retention: 31,
      size: 132,
      timeDelta: { days: 30 },
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 2,
      retention: 7,
      size: 132,
      timeDelta: { days: 7 },
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 3,
      retention: 1,
      size: 132,
      timeDelta: { days: 1 },
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 4,
      retention: 2,
      size: 132,
      timeDelta: { days: 1 },
    });

    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Cleanup' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Cleanup finished' })
    ).toBeVisible();

    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText('Backups 2');

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Name']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        'Date': 'yesterday',
        'Records': '4',
        'Size': '132.0 B',
        'Retention': '2 days',
      },
      {
        '': 'Restore',
        'Date': 'last month',
        'Records': '1',
        'Size': '132.0 B',
        'Retention': '31 days',
      },
    ]);
  });

  test('downloads backup archive', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await page.getByText('db1').click();
    await page.locator(':text("Backups") + table').getByText('1 day').click();

    await mockWindowOpen(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download archive' }).click();
    const download = await downloadPromise;

    expect(download.url()).toMatch(
      /https:\/\/localhost:8081\/devstoreaccount1\/backups\/db1%2F.*-.*.9.1.pgdump/
    );
  });

  test('downloads backup plain', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await page.getByText('db1').click();
    await page.locator(':text("Backups") + table').getByText('1 day').click();

    await mockWindowOpen(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plain dump' }).click();
    const download = await downloadPromise;

    expect(download.url()).toMatch(
      /https:\/\/localhost:8081\/devstoreaccount1\/backups\/db1%2F.*-.*.9.1.sql/
    );

    const response = await page.request.get(download.url());
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('CREATE SCHEMA test1');
    expect(text).toContain("INSERT INTO test1.fruites (name) VALUES ('Apple');");
    expect(text).toContain("INSERT INTO test1.fruites (name) VALUES ('Orange');");
    expect(text).toContain("INSERT INTO test1.fruites (name) VALUES ('Banana');");
    expect(text).toContain("INSERT INTO test1.fruites (name) VALUES ('Rasberry');");
  });
});

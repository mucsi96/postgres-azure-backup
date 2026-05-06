import { test, expect } from '../fixtures';
import { extractTableData, cleanupDb, getDb1Tables, triggerBackup, populateDb, writeFileToFolder, getBackupsFromStorage, executeDbQuery, getTablesInSchema, getTableRowCount } from '../utils';

const TEST_FOLDER_1 = '/tmp/test-uploads';
const TEST_FOLDER_2 = '/tmp/test-documents';

test.describe('Database Tests', () => {
  test('switches to other db', async ({ page }) => {
    await populateDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await page.getByRole('button', { name: 'db1' }).click();
    await page.getByRole('link', { name: 'db2' }).click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 17');
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 0');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 3');

    const tableData = await extractTableData(page.locator(':text("Tables") + table'));
    expect(tableData).toEqual([
      { Name: 'animals', Records: '6' },
      { Name: 'countries', Records: '6' },
      { Name: 'books', Records: '5' },
    ]);
  });

  test('shows total record count in db', async ({ page }) => {
    await populateDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');
  });

  test('shows total file count in db', async ({ page }) => {
    await populateDb();

    // Write files to the folders configured for db1
    // db1 has: /tmp/test-uploads and /tmp/test-documents
    await writeFileToFolder(TEST_FOLDER_1, 'file1.jpg', 'content1');
    await writeFileToFolder(TEST_FOLDER_1, 'file2.jpg', 'content2');
    await writeFileToFolder(TEST_FOLDER_2, 'doc1.pdf', 'doc1');

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 3');
  });

  test('shows total table count in db', async ({ page }) => {
    await populateDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
  });

  test('shows tables and record count in db', async ({ page }) => {
    await populateDb();

    // Write some files for db1
    await writeFileToFolder(TEST_FOLDER_1, 'file1.jpg', 'content1');
    await writeFileToFolder(TEST_FOLDER_2, 'doc1.pdf', 'doc1');

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 2');

    const tableData = await extractTableData(page.locator(':text("Tables") + table'));
    expect(tableData).toEqual([
      { Name: 'fruites', Records: '4' },
      { Name: 'vegetables', Records: '5' },
    ]);
  });

  test('restores backup', async ({ page }) => {
    await populateDb();

    await triggerBackup(page);

    await cleanupDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 0');
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 0');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 0');

    await page.locator(':text("Backups") + table').getByText('356 days').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 0');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
  });

  test('restore leaves unrelated schemas in the same database untouched', async ({ page }) => {
    await populateDb();

    // db1 manages schema test1 in the "test" database on port 5451.
    // Add a sibling schema in the same physical database — restoring db1
    // must not affect it.
    await executeDbQuery(
      5451,
      `DROP SCHEMA IF EXISTS other_tenant CASCADE;
       CREATE SCHEMA other_tenant;
       CREATE TABLE other_tenant.shared (value VARCHAR(20));
       INSERT INTO other_tenant.shared (value) VALUES ('survives-restore');`
    );

    try {
      await triggerBackup(page);

      await cleanupDb();

      await page.goto('/');
      await page.getByText('db1').click();
      await page.locator(':text("Backups") + table').getByText('356 days').click();
      await page.getByRole('button', { name: 'Restore' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

      // db1's own schema is restored — excluded tables are recreated
      // (empty) so the application keeps working.
      expect(await getDb1Tables()).toEqual([
        'fruites',
        'passwords',
        'secrets',
        'vegetables',
      ]);

      // The unrelated schema is still intact
      expect(await getTablesInSchema(5451, 'other_tenant')).toEqual(['shared']);
    } finally {
      await executeDbQuery(5451, 'DROP SCHEMA IF EXISTS other_tenant CASCADE');
    }
  });

  test('creates backup using backup button', async ({ page }) => {
    await populateDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');

    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    const backups = await getBackupsFromStorage('db1');
    expect(backups.length).toBe(1);
    expect(backups[0].rowsCount).toBe(9);
  });

  test('restores excluded tables empty', async ({ page }) => {
    await populateDb();

    await triggerBackup(page);

    await cleanupDb();

    await page.goto('/');
    await page.getByText('db1').click();
    await page.locator(':text("Backups") + table').getByText('356 days').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

    // Excluded tables must be recreated so the application can keep
    // working — only their rows are skipped.
    const tables = await getDb1Tables();
    expect(tables).toEqual(['fruites', 'passwords', 'secrets', 'vegetables']);

    expect(await getTableRowCount(5451, 'test1', 'fruites')).toBe(4);
    expect(await getTableRowCount(5451, 'test1', 'vegetables')).toBe(5);
    expect(await getTableRowCount(5451, 'test1', 'passwords')).toBe(0);
    expect(await getTableRowCount(5451, 'test1', 'secrets')).toBe(0);
  });
});

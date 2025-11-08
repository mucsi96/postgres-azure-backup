import { test, expect } from '../fixtures';
import { extractTableData, cleanupDb, getDb1Tables, triggerBackup, populateDb, writeFileToFolder } from '../utils';

const TEST_FOLDER_1 = '/tmp/test-uploads';
const TEST_FOLDER_2 = '/tmp/test-documents';

test.describe('Database Tests', () => {
  test('switches to other db', async ({ page }) => {
    await populateDb();

    await page.goto('http://localhost:8080');
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

    await page.goto('http://localhost:8080');
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

    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 3');
  });

  test('shows total table count in db', async ({ page }) => {
    await populateDb();

    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
  });

  test('shows tables and record count in db', async ({ page }) => {
    await populateDb();

    // Write some files for db1
    await writeFileToFolder(TEST_FOLDER_1, 'file1.jpg', 'content1');
    await writeFileToFolder(TEST_FOLDER_2, 'doc1.pdf', 'doc1');

    await page.goto('http://localhost:8080');
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

    // Create backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    await cleanupDb();

    await page.goto('http://localhost:8080');
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

  test('doesnt restore excluded tables', async ({ page }) => {
    await populateDb();

    // Create backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    await cleanupDb();

    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await page.locator(':text("Backups") + table').getByText('356 days').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

    const tables = await getDb1Tables();
    expect(tables).toEqual(['fruites', 'vegetables']);
  });
});

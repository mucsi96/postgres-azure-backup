import { test, expect } from '../fixtures';
import { extractTableData, cleanupBackups, cleanupDb, getDb1Tables } from '../utils';

test.describe('Database Tests', () => {
  test('switches to other db', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await page.getByRole('button', { name: 'db1' }).click();
    await page.getByRole('link', { name: 'db2' }).click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 17');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 3');

    const tableData = await extractTableData(page.locator(':text("Tables") + table'));
    expect(tableData).toEqual([
      { Name: 'animals', Records: '6' },
      { Name: 'countries', Records: '6' },
      { Name: 'books', Records: '5' },
    ]);
  });

  test('shows total record count in db', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');
  });

  test('shows total table count in db', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
  });

  test('shows tables and record count in db', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');

    const tableData = await extractTableData(page.locator(':text("Tables") + table'));
    expect(tableData).toEqual([
      { Name: 'fruites', Records: '4' },
      { Name: 'vegetables', Records: '5' },
    ]);
  });

  test('restores backup', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await cleanupDb();
    await page.reload();
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 0');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 0');

    await page.locator(':text("Backups") + table').getByText('1 day').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Records' })).toHaveText('Records 9');
    await expect(page.getByRole('heading', { name: 'Tables' })).toHaveText('Tables 2');
  });

  test('doesnt restore excluded tables', async ({ page }) => {
    await cleanupBackups();
    await page.goto('http://localhost:8080');
    await page.getByRole('button', { name: 'Backup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup created' })).toBeVisible();

    await cleanupDb();
    await page.getByText('db1').click();
    await page.locator(':text("Backups") + table').getByText('1 day').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

    const tables = await getDb1Tables();
    expect(tables).toEqual(['fruites', 'vegetables']);
  });
});

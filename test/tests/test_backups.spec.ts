import { test, expect } from '../fixtures';
import {
  extractTableData,
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
});

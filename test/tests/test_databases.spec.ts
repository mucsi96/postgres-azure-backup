import { test, expect } from '../fixtures';
import { extractTableData } from '../utils';

test.describe('Databases Tests', () => {
  test('shows number of databases', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await expect(page.getByText('Databases')).toHaveText('Databases 2');
  });

  test('shows number of tables', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await expect(page.getByRole('row')).toHaveCount(3);

    const tableData = await extractTableData(page.locator(':text("Databases") + table'));

    expect(tableData).toEqual([
      {
        '': '',
        'Name': 'db1',
        'Tables': '2',
        'Records': '9',
        'Blobs': '17',
        'Backups': '2',
        'Last backup': '10 hours ago',
      },
      {
        '': '',
        'Name': 'db2',
        'Tables': '3',
        'Records': '17',
        'Blobs': '0',
        'Backups': '0',
        'Last backup': '—',
      },
    ]);
  });
});

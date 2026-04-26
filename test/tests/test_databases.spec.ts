import { test, expect } from '../fixtures';
import { extractTableData, populateDb, createBackup, writeFileToFolder } from '../utils';

const TEST_FOLDER_1 = '/tmp/test-uploads';
const TEST_FOLDER_2 = '/tmp/test-documents';

test.describe('Databases Tests', () => {
  test('shows number of databases', async ({ page }) => {
    await populateDb();

    await page.goto('/');
    await expect(page.getByText('Databases')).toHaveText('Databases 2');
  });

  test('shows number of tables', async ({ page }) => {
    await populateDb();

    // Write files for db1
    await writeFileToFolder(TEST_FOLDER_1, 'file1.jpg', 'content1');
    await writeFileToFolder(TEST_FOLDER_1, 'file2.jpg', 'content2');
    await writeFileToFolder(TEST_FOLDER_2, 'doc1.pdf', 'doc1');

    await createBackup({
      prefix: 'db1',
      rowsCount: 8,
      timeDelta: { hours: 10 },
      retention: 1,
      size: 100,
      fileCount: 5,
      filesTotalSize: 2048,
    });

    await createBackup({
      prefix: 'db1',
      rowsCount: 7,
      timeDelta: { days: 3, hours: 10 },
      retention: 7,
      size: 150,
      fileCount: 12,
      filesTotalSize: 524288,
    });

    await page.goto('/');
    await expect(page.getByRole('row')).toHaveCount(3);

    const tableData = await extractTableData(page.locator(':text("Databases") + table'));

    expect(tableData).toEqual([
      {
        '': '',
        'Name': 'db1',
        'Tables': '2',
        'Records': '9',
        'Files': '3',
        'Backups': '2',
        'Last backup': '10 hours ago',
      },
      {
        '': '',
        'Name': 'db2',
        'Tables': '3',
        'Records': '17',
        'Files': '0',
        'Backups': '0',
        'Last backup': '—',
      },
    ]);
  });
});

import { test, expect } from '../fixtures';
import { extractTableData, populateDb, createBackup, uploadBlob } from '../utils';

test.describe('Databases Tests', () => {
  test('shows number of databases', async ({ page }) => {
    await populateDb();

    await page.goto('http://localhost:8080');
    await expect(page.getByText('Databases')).toHaveText('Databases 2');
  });

  test('shows number of tables', async ({ page }) => {
    await populateDb();

    // Upload blobs for db1
    await uploadBlob('user-uploads', 'production/file1.jpg', 'content1');
    await uploadBlob('user-uploads', 'production/file2.jpg', 'content2');
    await uploadBlob('documents', 'active/doc1.pdf', 'doc1');

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

    await page.goto('http://localhost:8080');
    await expect(page.getByRole('row')).toHaveCount(3);

    const tableData = await extractTableData(page.locator(':text("Databases") + table'));

    expect(tableData).toEqual([
      {
        '': '',
        'Name': 'db1',
        'Tables': '2',
        'Records': '9',
        'Blobs': '3',
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

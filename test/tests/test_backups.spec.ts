import { test, expect } from '../fixtures';
import {
  extractTableData,
  listWithoutKeys,
  triggerBackup,
  writeFileToFolder,
  populateDb,
  createBackup,
} from '../utils';
import AdmZip from 'adm-zip';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const TEST_FOLDER_1 = '/tmp/test-uploads';
const TEST_FOLDER_2 = '/tmp/test-documents';

test.describe('Backups Tests', () => {
  test('shows number of backups', async ({ page }) => {
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

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText(
      'Backups 2'
    );
  });

  test('shows last backup time', async ({ page }) => {
    await populateDb();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    const lastBackupText = await page
      .getByRole('heading', { name: 'Last backup' })
      .textContent();
    expect(lastBackupText).toContain('Last backup');
    expect(lastBackupText).not.toContain('Last backup —');
  });

  test('shows backups', async ({ page }) => {
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

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText(
      'Backups 2'
    );

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Date']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        Records: '8',
        Size: '100.0 B',
        Files: '5',
        'Files size': '2.0 kB',
        Retention: '1 day',
      },
      {
        '': 'Restore',
        Records: '7',
        Size: '150.0 B',
        Files: '12',
        'Files size': '512.0 kB',
        Retention: '7 days',
      },
    ]);
  });

  test('switches to other db', async ({ page }) => {
    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    await page.getByRole('button', { name: 'db1' }).click();
    await page.getByRole('link', { name: 'db2' }).click();
    await expect(page.getByRole('heading', { name: 'Last backup' })).toHaveText(
      'Last backup —'
    );
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText(
      'Backups 0'
    );
  });

  test('downloads archive backup and verifies ZIP contents', async ({
    page,
  }) => {
    await populateDb();

    // Setup test folder files
    await writeFileToFolder(TEST_FOLDER_1, 'avatar-1.jpg', 'fake-jpg-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'avatar-2.png', 'fake-png-content-2');
    await writeFileToFolder(TEST_FOLDER_1, 'document-1.pdf', 'fake-pdf-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'video.mp4', 'fake-video-content');
    await writeFileToFolder(TEST_FOLDER_1, 'image-5.jpg', 'fake-jpg-content-5');
    await writeFileToFolder(TEST_FOLDER_2, 'report.docx', 'fake-docx-content');

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();

    // Select the first backup
    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    // Wait for the download to start when clicking the archive button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download archive' }).click();
    const download = await downloadPromise;

    // Verify the download was triggered
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    // Download the file and verify its contents
    const path = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(path);

    // Extract and verify ZIP contents
    const zip = new AdmZip(path);
    const zipEntries = zip.getEntries();
    const entryNames = zipEntries.map((entry) => entry.entryName);

    // Verify pgdump file exists
    const pgdumpFile = zipEntries.find((entry) =>
      entry.entryName.endsWith('.pgdump')
    );
    expect(pgdumpFile).toBeTruthy();

    // Verify folder files exist
    const folderFiles = zipEntries.filter((entry) =>
      entry.entryName.startsWith('folders/')
    );
    expect(folderFiles.length).toBe(6); // 5 from test-uploads + 1 from test-documents

    // Verify specific files are included
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/avatar-1.jpg`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/avatar-2.png`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/document-1.pdf`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/video.mp4`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/image-5.jpg`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_2}/report.docx`);

    // Verify file content
    const avatarFile = zipEntries.find(
      (entry) =>
        entry.entryName === `folders${TEST_FOLDER_1}/avatar-1.jpg`
    );
    expect(avatarFile).toBeTruthy();
    const fileContent = avatarFile!.getData().toString('utf-8');
    expect(fileContent).toBe('fake-jpg-content-1');
  });

  test('downloads pgdump backup', async ({ page }) => {
    await populateDb();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();

    // Select the first backup
    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    // Wait for the download to start when clicking the pgdump button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download pgdump' }).click();
    const download = await downloadPromise;

    // Verify the download was triggered
    expect(download.suggestedFilename()).toMatch(/\.pgdump$/);
  });

  test('downloads SQL backup and verifies content', async ({ page }) => {
    await populateDb();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();

    // Select the first backup
    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    // Wait for the download to start when clicking the SQL button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download plain SQL' }).click();
    const download = await downloadPromise;

    // Verify the download was triggered and has .sql extension
    expect(download.suggestedFilename()).toMatch(/\.sql$/);

    // Download the file and verify its content
    const path = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(path);

    const content = await readFile(path, 'utf-8');

    // Verify SQL content contains expected data from the populated database
    expect(content).toContain('test1');
  });
});

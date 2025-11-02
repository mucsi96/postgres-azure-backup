import { test, expect } from '../fixtures';
import {
  extractTableData,
  listWithoutKeys,
  cleanupBackups,
  cleanupDb,
  populateDb,
  triggerBackup,
  uploadBlob,
  cleanupBlobContainer,
} from '../utils';
import AdmZip from 'adm-zip';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

test.describe('Backups Tests', () => {
  test.beforeEach(async () => {
    // Setup test blob containers and files
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Create test blobs
    await uploadBlob(
      'user-uploads',
      'production/avatar-1.jpg',
      'fake-jpg-content-1'
    );
    await uploadBlob(
      'user-uploads',
      'production/avatar-2.png',
      'fake-png-content-2'
    );
    await uploadBlob(
      'user-uploads',
      'production/document-1.pdf',
      'fake-pdf-content-1'
    );
    await uploadBlob(
      'user-uploads',
      'production/video.mp4',
      'fake-video-content'
    );
    await uploadBlob(
      'user-uploads',
      'production/image-5.jpg',
      'fake-jpg-content-5'
    );

    await uploadBlob('documents', 'active/report.docx', 'fake-docx-content');

    // Setup database
    await cleanupDb();
    await populateDb();
  });

  test('shows number of backups', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText(
      'Backups 2'
    );
  });

  test('shows last backup time', async ({ page }) => {
    await cleanupBackups();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    const lastBackupText = await page
      .getByRole('heading', { name: 'Last backup' })
      .textContent();
    expect(lastBackupText).toContain('Last backup');
    expect(lastBackupText).not.toContain('Last backup —');
  });

  test('shows backups', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Backups' })).toHaveText(
      'Backups 2'
    );

    const tableData = listWithoutKeys(
      await extractTableData(page.locator(':text("Backups") + table')),
      ['Name', 'Date']
    );

    expect(tableData).toEqual([
      {
        '': 'Restore',
        Records: '8',
        Size: '100.0 B',
        Blobs: '5',
        'Blob size': '2.0 kB',
        Retention: '1 day',
      },
      {
        '': 'Restore',
        Records: '7',
        Size: '150.0 B',
        Blobs: '12',
        'Blob size': '512.0 kB',
        Retention: '7 days',
      },
    ]);
  });

  test('switches to other db', async ({ page }) => {
    await cleanupBackups();

    await page.goto('http://localhost:8080');
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
    await cleanupBackups();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8080');
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

    // Verify blob files exist
    const blobFiles = zipEntries.filter((entry) =>
      entry.entryName.startsWith('blobs/')
    );
    expect(blobFiles.length).toBe(6); // 5 from user-uploads + 1 from documents

    // Verify specific blobs are included
    expect(entryNames).toContain('blobs/user-uploads/production/avatar-1.jpg');
    expect(entryNames).toContain('blobs/user-uploads/production/avatar-2.png');
    expect(entryNames).toContain(
      'blobs/user-uploads/production/document-1.pdf'
    );
    expect(entryNames).toContain('blobs/user-uploads/production/video.mp4');
    expect(entryNames).toContain('blobs/user-uploads/production/image-5.jpg');
    expect(entryNames).toContain('blobs/documents/active/report.docx');

    // Verify blob content
    const avatarBlob = zipEntries.find(
      (entry) =>
        entry.entryName === 'blobs/user-uploads/production/avatar-1.jpg'
    );
    expect(avatarBlob).toBeTruthy();
    const blobContent = avatarBlob!.getData().toString('utf-8');
    expect(blobContent).toBe('fake-jpg-content-1');
  });

  test('downloads pgdump backup', async ({ page }) => {
    await cleanupBackups();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8080');
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
    await cleanupBackups();

    // Create a backup via API
    await triggerBackup();

    await page.goto('http://localhost:8080');
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

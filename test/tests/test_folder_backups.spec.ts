import { test, expect } from '../fixtures';
import {
  writeFileToFolder,
  fileExistsInFolder,
  readFileFromFolder,
  deleteFileFromFolder,
  triggerBackup,
  getBackupsList,
  getBlobServiceClient,
  populateDb,
} from '../utils';
import AdmZip from 'adm-zip';

const TEST_FOLDER_1 = '/tmp/test-uploads';
const TEST_FOLDER_2 = '/tmp/test-documents';

test.describe('Folder Backup Tests', () => {
  test('creates ZIP backup with database dump and folder files', async () => {
    await populateDb();

    await writeFileToFolder(TEST_FOLDER_1, 'avatar-1.jpg', 'fake-jpg-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'avatar-2.png', 'fake-png-content-2');
    await writeFileToFolder(TEST_FOLDER_1, 'document-1.pdf', 'fake-pdf-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'video.mp4', 'fake-video-content');
    await writeFileToFolder(TEST_FOLDER_2, 'report.docx', 'fake-docx-content');
    await writeFileToFolder(TEST_FOLDER_2, 'data.xlsx', 'fake-xlsx-content');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backup was created in blob storage
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient('backups');
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'db1/' })) {
      backups.push(blob.name);
    }

    expect(backups.length).toBeGreaterThan(0);

    // All backups should be ZIP files
    const zipBackup = backups.find((name: string) => name.endsWith('.zip'));
    expect(zipBackup).toBeDefined();
  });

  test('verifies ZIP contains database dump and all folder files', async ({ page }) => {
    await populateDb();

    await writeFileToFolder(TEST_FOLDER_1, 'avatar-1.jpg', 'fake-jpg-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'avatar-2.png', 'fake-png-content-2');
    await writeFileToFolder(TEST_FOLDER_1, 'document-1.pdf', 'fake-pdf-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'video.mp4', 'fake-video-content');
    await writeFileToFolder(TEST_FOLDER_2, 'report.docx', 'fake-docx-content');
    await writeFileToFolder(TEST_FOLDER_2, 'data.xlsx', 'fake-xlsx-content');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Download the ZIP backup via UI
    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();

    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download archive' }).click();
    const download = await downloadPromise;

    const path = await download.path();
    expect(path).toBeTruthy();

    if (!path) {
      throw new Error('Download failed');
    }

    // Parse ZIP content
    const zip = new AdmZip(path);
    const zipEntries = zip.getEntries();
    const entryNames = zipEntries.map(entry => entry.entryName);

    // Verify database dump exists
    expect(entryNames.some((name: string) => name.endsWith('.pgdump'))).toBe(true);

    // Verify folders directory exists
    const folderEntries = entryNames.filter(name => name.startsWith('folders/'));
    expect(folderEntries.length).toBeGreaterThan(0);

    // Verify all files are included
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/avatar-1.jpg`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/avatar-2.png`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/document-1.pdf`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/video.mp4`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_2}/report.docx`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_2}/data.xlsx`);
  });

  test('shows file count and size in backup listing', async ({ page }) => {
    await populateDb();

    await writeFileToFolder(TEST_FOLDER_1, 'avatar-1.jpg', 'fake-jpg-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'avatar-2.png', 'fake-png-content-2');
    await writeFileToFolder(TEST_FOLDER_1, 'document-1.pdf', 'fake-pdf-content-1');
    await writeFileToFolder(TEST_FOLDER_1, 'video.mp4', 'fake-video-content');
    await writeFileToFolder(TEST_FOLDER_2, 'report.docx', 'fake-docx-content');
    await writeFileToFolder(TEST_FOLDER_2, 'data.xlsx', 'fake-xlsx-content');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Get backups list via API
    const backups = await getBackupsList('db1');
    expect(backups.length).toBe(1);

    // Verify the backup has file information
    const backup = backups[0];
    expect(backup).toHaveProperty('fileCount');
    expect(backup).toHaveProperty('filesTotalSize');
    expect(backup.fileCount).toBe(6); // 4 from test-uploads + 2 from test-documents

    // Verify UI shows file count on home screen
    await page.goto('http://localhost:8280');
    const db1Row = page.getByRole('row').filter({ hasText: 'db1' });
    await expect(db1Row.getByRole('cell').nth(4)).toHaveText('6'); // Files column

    // Verify UI shows file count on database details page
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 6');
  });

  test('restores folder files along with database from ZIP backup', async ({ page }) => {
    await populateDb();

    await writeFileToFolder(TEST_FOLDER_1, 'avatar-1.jpg', 'original-jpg-content');
    await writeFileToFolder(TEST_FOLDER_1, 'document-1.pdf', 'original-pdf-content');

    // Create backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify UI shows file count before deletion
    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 2');

    // Delete the files to simulate data loss
    await deleteFileFromFolder(TEST_FOLDER_1, 'avatar-1.jpg');
    await deleteFileFromFolder(TEST_FOLDER_1, 'document-1.pdf');

    // Verify files are deleted
    expect(await fileExistsInFolder(TEST_FOLDER_1, 'avatar-1.jpg')).toBe(false);

    // Restore backup via UI
    await page.locator(':text("Backups") + table').getByText('356 days').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

    // Verify UI still shows file count after restore
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 2');

    // Verify files are restored
    expect(await fileExistsInFolder(TEST_FOLDER_1, 'avatar-1.jpg')).toBe(true);
    expect(await fileExistsInFolder(TEST_FOLDER_1, 'document-1.pdf')).toBe(true);

    // Verify file content is restored correctly
    const restoredContent = await readFileFromFolder(TEST_FOLDER_1, 'avatar-1.jpg');
    expect(restoredContent).toBe('original-jpg-content');
  });

  test('creates ZIP backup for all databases', async () => {
    await populateDb();

    // Trigger backup via API (backup happens for all databases)
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backup was created in blob storage for db2
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient('backups');
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'db2/' })) {
      backups.push(blob.name);
    }

    expect(backups.length).toBeGreaterThan(0);

    // All backups should be ZIP files (even without folder config)
    const zipBackup = backups.find((name: string) => name.endsWith('.zip'));
    expect(zipBackup).toBeDefined();
  });

  test('handles empty folders gracefully', async ({ page }) => {
    await populateDb();

    // Trigger backup via API (folders are empty)
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Verify backup still created (just without folder files)
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient('backups');
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'db1/' })) {
      backups.push(blob.name);
    }

    expect(backups.length).toBeGreaterThan(0);
    const zipBackup = backups.find((name: string) => name.endsWith('.zip'));
    expect(zipBackup).toBeDefined();

    // Verify UI shows 0 files on home screen
    await page.goto('http://localhost:8280');
    const db1Row = page.getByRole('row').filter({ hasText: 'db1' });
    await expect(db1Row.getByRole('cell').nth(4)).toHaveText('0'); // Files column

    // Verify UI shows 0 files on database details page
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Files' })).toHaveText('Files 0');

    // Verify ZIP still has database dump, just no folder files
    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download archive' }).click();
    const download = await downloadPromise;

    const path = await download.path();
    expect(path).toBeTruthy();

    if (!path) {
      throw new Error('Download failed');
    }

    const zip = new AdmZip(path);
    const entryNames = zip.getEntries().map(entry => entry.entryName);

    expect(entryNames.some((name: string) => name.endsWith('.pgdump'))).toBe(true);

    // Verify no folders directory
    const folderEntries = entryNames.filter(name => name.startsWith('folders/'));
    expect(folderEntries.length).toBe(0);
  });

  test('handles nested folder structures correctly', async ({ page }) => {
    await populateDb();

    await writeFileToFolder(TEST_FOLDER_1, 'user1/avatar.jpg', 'user1-avatar');
    await writeFileToFolder(TEST_FOLDER_1, 'user2/profile/avatar.png', 'user2-avatar');
    await writeFileToFolder(TEST_FOLDER_1, 'shared/docs/report.pdf', 'shared-report');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Download ZIP via UI
    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();

    const firstBackupRow = page.locator('#backups tbody tr').first();
    await firstBackupRow.click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download archive' }).click();
    const download = await downloadPromise;

    const path = await download.path();
    expect(path).toBeTruthy();

    if (!path) {
      throw new Error('Download failed');
    }

    const zip = new AdmZip(path);
    const entryNames = zip.getEntries().map(entry => entry.entryName);

    // Verify nested folder structure is preserved
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/user1/avatar.jpg`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/user2/profile/avatar.png`);
    expect(entryNames).toContain(`folders${TEST_FOLDER_1}/shared/docs/report.pdf`);
  });
});

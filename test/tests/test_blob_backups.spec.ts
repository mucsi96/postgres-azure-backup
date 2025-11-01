import { test, expect } from '../fixtures';
import {
  cleanupBackups,
  cleanupBlobContainer,
  uploadBlob,
  blobExists,
  getBlobContent,
  triggerBackup,
  getBackupsList,
  downloadZipBackup,
  getBlobServiceClient,
} from '../utils';
import AdmZip from 'adm-zip';

test.describe('Blob Backup Tests', () => {
  test.beforeEach(async () => {
    // Setup test blob containers and files
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Create test blobs in user-uploads container
    await uploadBlob('user-uploads', 'production/avatar-1.jpg', 'fake-jpg-content-1');
    await uploadBlob('user-uploads', 'production/avatar-2.png', 'fake-png-content-2');
    await uploadBlob('user-uploads', 'production/document-1.pdf', 'fake-pdf-content-1');
    await uploadBlob('user-uploads', 'production/video.mp4', 'fake-video-content');

    // Create test blobs in documents container
    await uploadBlob('documents', 'active/report.docx', 'fake-docx-content');
    await uploadBlob('documents', 'active/data.xlsx', 'fake-xlsx-content');
  });

  test('creates ZIP backup with database dump and blobs', async () => {
    await cleanupBackups();

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

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

  test('verifies ZIP contains database dump and all blobs', async () => {
    await cleanupBackups();

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Download the ZIP backup
    const downloaded = await downloadZipBackup('db1');

    // Parse ZIP content
    const zip = new AdmZip(downloaded);
    const zipEntries = zip.getEntries();
    const entryNames = zipEntries.map(entry => entry.entryName);

    // Verify database dump exists
    expect(entryNames.some((name: string) => name.endsWith('.pgdump'))).toBe(true);

    // Verify blobs directory exists
    const blobEntries = entryNames.filter(name => name.startsWith('blobs/'));
    expect(blobEntries.length).toBeGreaterThan(0);

    // Verify all blobs are included (no extension filtering)
    expect(entryNames).toContain('blobs/user-uploads/production/avatar-1.jpg');
    expect(entryNames).toContain('blobs/user-uploads/production/avatar-2.png');
    expect(entryNames).toContain('blobs/user-uploads/production/document-1.pdf');
    expect(entryNames).toContain('blobs/user-uploads/production/video.mp4');
    expect(entryNames).toContain('blobs/documents/active/report.docx');
    expect(entryNames).toContain('blobs/documents/active/data.xlsx');
  });

  test('shows blob count and size in backup listing', async ({ page }) => {
    await cleanupBackups();

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get backups list via API
    const backups = await getBackupsList('db1');
    expect(backups.length).toBe(1);

    // Verify the backup has blob information
    const backup = backups[0];
    expect(backup).toHaveProperty('blobCount');
    expect(backup).toHaveProperty('blobsTotalSize');
    expect(backup.blobCount).toBe(6); // 4 from user-uploads + 2 from documents

    // Verify UI shows blob count on home screen
    await page.goto('http://localhost:8080');
    const db1Row = page.getByRole('row').filter({ hasText: 'db1' });
    await expect(db1Row.getByRole('cell').nth(4)).toHaveText('6'); // Blobs column

    // Verify UI shows blob count on database details page
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Blobs' })).toHaveText('Blobs 6');
  });

  test('restores blobs along with database from ZIP backup', async ({ page }) => {
    await cleanupBackups();

    // Clean up destination blobs to ensure restore is working
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Re-create source blobs
    await uploadBlob('user-uploads', 'production/avatar-1.jpg', 'original-jpg-content');
    await uploadBlob('user-uploads', 'production/document-1.pdf', 'original-pdf-content');

    // Create backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify UI shows blob count before deletion
    await page.goto('http://localhost:8080');
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Blobs' })).toHaveText('Blobs 2');

    // Delete the blobs to simulate data loss
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Verify blobs are deleted
    expect(await blobExists('user-uploads', 'production/avatar-1.jpg')).toBe(false);

    // Restore backup via UI
    await page.locator(':text("Backups") + table').getByText('356 days').click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Backup restored' })).toBeVisible();

    // Verify UI still shows blob count after restore (blob count is from backup metadata, not live blobs)
    await expect(page.getByRole('heading', { name: 'Blobs' })).toHaveText('Blobs 2');

    // Verify blobs are restored
    expect(await blobExists('user-uploads', 'production/avatar-1.jpg')).toBe(true);
    expect(await blobExists('user-uploads', 'production/document-1.pdf')).toBe(true);

    // Verify blob content is restored correctly
    const restoredContent = await getBlobContent('user-uploads', 'production/avatar-1.jpg');
    expect(restoredContent).toBe('original-jpg-content');
  });

  test('creates ZIP backup for all databases', async () => {
    await cleanupBackups();

    // Trigger backup via API (backup happens for all databases)
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify backup was created in blob storage for db2
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient('backups');
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'db2/' })) {
      backups.push(blob.name);
    }

    expect(backups.length).toBeGreaterThan(0);

    // All backups should be ZIP files (even without blob config)
    const zipBackup = backups.find((name: string) => name.endsWith('.zip'));
    expect(zipBackup).toBeDefined();
  });

  test('filters blobs by prefix correctly', async () => {
    await cleanupBackups();

    // Add blobs outside the configured prefix
    await uploadBlob('user-uploads', 'staging/avatar-staging.jpg', 'staging-content');
    await uploadBlob('user-uploads', 'archive/old-file.pdf', 'archive-content');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Download and verify ZIP
    const downloaded = await downloadZipBackup('db1');

    const zip = new AdmZip(downloaded);
    const entryNames = zip.getEntries().map(entry => entry.entryName);

    // Verify blobs outside "production/" prefix are NOT included
    expect(entryNames.filter((name: string) => name.includes('staging')).length).toBe(0);
    expect(entryNames.filter((name: string) => name.includes('archive')).length).toBe(0);

    // Verify blobs with "production/" prefix ARE included
    expect(entryNames.some((name: string) => name.includes('production/'))).toBe(true);
  });

  test('handles empty blob containers gracefully', async ({ page }) => {
    await cleanupBackups();

    // Clean all blobs from configured containers
    await cleanupBlobContainer('user-uploads');
    await cleanupBlobContainer('documents');

    // Trigger backup via API
    const response = await triggerBackup();
    expect(response.ok).toBe(true);

    // Wait for backup to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify backup still created (just without blobs)
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient('backups');
    const backups = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix: 'db1/' })) {
      backups.push(blob.name);
    }

    expect(backups.length).toBeGreaterThan(0);
    const zipBackup = backups.find((name: string) => name.endsWith('.zip'));
    expect(zipBackup).toBeDefined();

    // Verify UI shows 0 blobs on home screen
    await page.goto('http://localhost:8080');
    const db1Row = page.getByRole('row').filter({ hasText: 'db1' });
    await expect(db1Row.getByRole('cell').nth(4)).toHaveText('0'); // Blobs column

    // Verify UI shows 0 blobs on database details page
    await page.getByText('db1').click();
    await expect(page.getByRole('heading', { name: 'Blobs' })).toHaveText('Blobs 0');

    // Verify ZIP still has database dump, just no blobs
    const downloaded = await downloadZipBackup('db1');

    const zip = new AdmZip(downloaded);
    const entryNames = zip.getEntries().map(entry => entry.entryName);

    expect(entryNames.some((name: string) => name.endsWith('.pgdump'))).toBe(true);

    // Verify no blobs directory
    const blobEntries = entryNames.filter(name => name.startsWith('blobs/'));
    expect(blobEntries.length).toBe(0);
  });
});

import { test, expect } from '../fixtures';
import { populateDb } from '../utils';
import { readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

test.describe('Export SQL Tests', () => {
  test('downloads data-only SQL export with INSERT statements', async ({
    page,
  }) => {
    await populateDb();

    await page.goto('http://localhost:8280');
    await page.getByText('db1').click();
    await expect(
      page.getByRole('heading', { name: 'Records' })
    ).toHaveText('Records 9');

    // Click the Export SQL button and wait for download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SQL' }).click();
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toBe('db1-data-export.sql');

    // Save and verify content
    const filePath = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(filePath);

    const content = await readFile(filePath, 'utf-8');

    // Verify it contains INSERT statements (data-only)
    expect(content).toContain('INSERT INTO');

    // Verify it does NOT contain CREATE TABLE (schema)
    expect(content).not.toContain('CREATE TABLE');

    // Verify actual data from the fruites table
    expect(content).toContain('Apple');
    expect(content).toContain('Orange');
    expect(content).toContain('Banana');
    expect(content).toContain('Rasberry');

    // Verify actual data from the vegetables table
    expect(content).toContain('Carrot');
    expect(content).toContain('Potato');
    expect(content).toContain('Spinach');
    expect(content).toContain('Broccoli');
    expect(content).toContain('Tomato');

    // Verify excluded tables are NOT in the export
    expect(content).not.toContain('INSERT INTO test1.passwords');
    expect(content).not.toContain('INSERT INTO test1.secrets');
  });

  test('exports SQL for second database', async ({ page }) => {
    await populateDb();

    await page.goto('http://localhost:8280');
    await page.getByText('db2').click();
    await expect(
      page.getByRole('heading', { name: 'Records' })
    ).toHaveText('Records 17');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SQL' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('db2-data-export.sql');

    const filePath = join(tmpdir(), download.suggestedFilename());
    await download.saveAs(filePath);

    const content = await readFile(filePath, 'utf-8');

    // Verify data from db2 tables
    expect(content).toContain('INSERT INTO');
    expect(content).not.toContain('CREATE TABLE');
    expect(content).toContain('Dog');
    expect(content).toContain('Harry Potter');
    expect(content).toContain('USA');

    // Verify excluded tables are NOT in the export
    expect(content).not.toContain('INSERT INTO test2.secrets');
  });
});

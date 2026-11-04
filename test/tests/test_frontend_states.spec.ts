import { test, expect } from '../fixtures';
import { createBackup, getBackupsFromStorage, populateDb } from '../utils';

test('shows a read error instead of empty data and retries a malformed response', async ({ page }) => {
  let invalid = true;
  await page.route('**/api/databases', route => invalid
    ? route.fulfill({ json: [{ name: 'broken' }] })
    : route.fallback());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Unable to load databases');
  await expect(page.getByRole('heading', { name: 'Databases 0' })).toHaveCount(0);
  invalid = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Databases 2' })).toBeVisible();
});

test('retries failed backup lists independently of table data', async ({ page }) => {
  await populateDb();
  let failed = true;
  await page.route('**/api/database/db1/backups', route => failed
    ? route.fulfill({ status: 503 })
    : route.fallback());
  await page.goto('/database/db1');
  await expect(page.getByRole('heading', { name: 'Records 9' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Unable to load backups');
  failed = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Backups 0' })).toBeVisible();
});

test('failed mutations release controls and can be retried with CSRF proof', async ({ page }) => {
  await populateDb();
  let failed = true;
  let posts = 0;
  await page.route('**/api/database/db1/backup', async route => {
    posts++;
    expect(route.request().headers()['x-xsrf-token']).toBeTruthy();
    if (failed) await route.fulfill({ status: 503 });
    else await route.fallback();
  });
  await page.goto('/database/db1');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Request failed (503)');
  await expect(page.getByRole('button', { name: 'Backup', exact: true })).toBeEnabled();
  expect(posts).toBe(1);
  failed = false;
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByText('Backup created')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backups 1' })).toBeVisible();
  await expect(page.getByTestId('last-backup')).not.toContainText('—');
  expect((await getBackupsFromStorage('db1')).length).toBe(1);
});

test('creates backups for every database using the primary action', async ({ page }) => {
  await populateDb();
  await page.goto('/');
  await page.getByRole('button', { name: 'Backup', exact: true }).click();
  await expect(page.getByText('Backup completed')).toBeVisible();
  expect((await getBackupsFromStorage('db1'))[0].retention).toBe(7);
  expect((await getBackupsFromStorage('db2'))[0].retention).toBe(7);
});

test('keyboard navigation and browser history keep database selection isolated', async ({ page }) => {
  await populateDb();
  await createBackup({ prefix: 'db1', rowsCount: 9, retention: 7, size: 100, timeDelta: { hours: 1 } });
  await page.goto('/');
  await page.getByRole('link', { name: 'db1', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/database\/db1$/);
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await page.getByRole('radio').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'db1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'db2' }).click();
  await expect(page.getByRole('heading', { name: 'Records 17' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backups 0' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Records 9' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Postgres Backup Tool' }).click();
  await expect(page.getByTestId('last-backup')).toHaveCount(0);
});

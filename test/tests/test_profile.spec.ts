import { test, expect } from '../fixtures';

test.describe('Profile Tests', () => {
  test('shows title', async ({ page }) => {
    await page.goto('http://localhost:8280');
    await expect(page.getByRole('link', { name: 'Postgres Backup Tool' })).toBeVisible();
  });

  test('shows user initials in header', async ({ page }) => {
    await page.goto('http://localhost:8280');
    await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
  });

  test('shows user name in popup', async ({ page }) => {
    await page.goto('http://localhost:8280');
    await page.getByRole('button', { name: 'TU' }).click();
    await expect(page.getByText('Test User')).toBeVisible();
  });
});

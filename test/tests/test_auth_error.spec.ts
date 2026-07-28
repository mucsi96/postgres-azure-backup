import { test, expect } from '../fixtures';

const AUTHORITY_ERROR_URL =
  '/?error=invalid_client&error_description=Requested+scope+does+not+exist+on+the+resource&state=stale-state';

test.describe('Auth Error Tests', () => {
  test('shows a clear error instead of redirecting again when the authority rejects the sign-in', async ({
    page,
  }) => {
    await page.goto(AUTHORITY_ERROR_URL);

    await expect(
      page.getByRole('heading', { name: 'Sign-in failed' })
    ).toBeVisible();
    await expect(
      page.getByText('Requested scope does not exist on the resource')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();

    // No automatic redirect back to the authority - the app must stay put
    // (a redirect here is the start of an infinite loop).
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(
      page.getByRole('heading', { name: 'Sign-in failed' })
    ).toBeVisible();
  });

  test('recovers with a user-initiated retry after an authority error', async ({
    page,
  }) => {
    await page.goto(AUTHORITY_ERROR_URL);

    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page).toHaveTitle('Postgres Backup Tool');
    await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
  });
});

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

  test('reauthenticates immediately when the refresh token expires', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();

    const refreshToken = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((item) =>
        item.startsWith('oidc.user:')
      );
      return key ? JSON.parse(localStorage.getItem(key)!).refresh_token : null;
    });
    expect(refreshToken).toBeTruthy();

    const environment = await (
      await page.request.get('/api/environment')
    ).json();
    const consumed = await page.request.post(
      `${environment.mockOAuth2ServerUri}/default/token`,
      {
        form: { grant_type: 'refresh_token', refresh_token: refreshToken },
      }
    );
    expect(consumed.ok()).toBeTruthy();

    let authorizationRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/default/authorize') {
        authorizationRequests += 1;
      }
    });

    await page.evaluate(() => {
      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 31_000;
      window.dispatchEvent(new Event('focus'));
      Date.now = originalDateNow;
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const key = Object.keys(localStorage).find((item) =>
            item.startsWith('oidc.user:')
          );
          return key
            ? JSON.parse(localStorage.getItem(key)!).refresh_token
            : null;
        })
      )
      .not.toBe(refreshToken);
    await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
    await expect(page.getByText(/^An error occurred/)).not.toBeVisible();
    expect(authorizationRequests).toBe(1);
  });
});

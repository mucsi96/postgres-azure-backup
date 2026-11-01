import { test, expect } from '../fixtures';

test('boots without frontend configuration or browser OAuth and sends same-origin Faro', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const telemetry = page.waitForRequest(request => request.url().endsWith('/_telemetry/collect') && request.method() === 'POST');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
  const delivered = await telemetry;
  expect(new URL(delivered.url()).origin).toBe(new URL(page.url()).origin);
  expect(delivered.postDataJSON().meta.app.name).toBe('postgres-azure-backup-client');
  expect(requests.some(url => /\/api\/environment|\/authorize|\/token/.test(url))).toBe(false);
  expect(await page.evaluate(() => '__APP_CONFIG__' in window)).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('oidc.')))).toBe(false);
});

test('rejects anonymous APIs and bearer mutations without a valid CSRF token', async ({ request, apiHeaders }) => {
  expect((await request.get('/api/databases')).status()).toBe(401);
  const initial = await request.get('/api/databases', { headers: apiHeaders });
  expect(initial.ok()).toBe(true);
  // Invalid CSRF must fail before this potentially destructive operation runs.
  expect((await request.post('/api/smart-backup', { headers: apiHeaders })).status()).toBe(403);
  expect((await request.post('/api/smart-backup', {
    headers: { ...apiHeaders, 'X-XSRF-TOKEN': 'invalid' },
  })).status()).toBe(403);
});

test('loads a bookmarked database document through gateway rewriting', async ({ page }) => {
  await page.goto('/database/db1');
  await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/database/db1');
});

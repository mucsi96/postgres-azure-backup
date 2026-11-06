import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';
import { prepareClient } from '../scripts/prepare-client.mjs';

const output = await mkdtemp(join(tmpdir(), 'backup-static-'));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const mime = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', woff: 'font/woff', png: 'image/png', webmanifest: 'application/manifest+json' };
let appOrigin;
const assetServer = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://assets').pathname;
    const body = await readFile(join(output, 'assets', path));
    response.writeHead(200, { 'Content-Type': mime[path.split('.').pop()] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': appOrigin });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
const documentServer = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://app').pathname;
  if (path === '/api/databases') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
  } else if (path === '/api/database/db1/tables') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ tables: [], totalRowCount: 0, fileCount: 0 }));
  } else if (path === '/api/database/db1/backups') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('[]');
  } else if (path === '/api/database/db1/last-backup-time') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end('null');
  } else if (path === '/oauth2/userinfo') {
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ email: 'test@example.com', additionalClaims: { name: 'Test User' } }));
  } else if (request.headers.accept?.includes('text/html')) {
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end(await readFile(join(output, 'documents/index.html')));
  } else {
    response.writeHead(404).end();
  }
});
let browser;
try {
  const assetOrigin = await listen(assetServer);
  appOrigin = await listen(documentServer);
  await prepareClient(resolve('client/dist'), output, `${assetOrigin}/`, appOrigin);
  browser = await chromium.launch();
  const page = await browser.newPage();
  const assets = [];
  const fontRequests = [];
  const failures = [];
  page.on('request', request => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
    if (request.url().startsWith(assetOrigin)) {
      assets.push(request);
      assert.equal(request.headers().authorization, undefined);
      assert.equal(request.headers().cookie, undefined);
    }
  });
  page.on('pageerror', error => failures.push(error.message));
  page.on('requestfailed', request => failures.push(request.url()));
  await page.route('**/_telemetry/collect', route => route.fulfill({ status: 202, body: 'ok' }));
  const telemetry = page.waitForRequest(request => request.url() === `${appOrigin}/_telemetry/collect` && request.method() === 'POST');
  await page.goto(`${appOrigin}/?bookmark=1`);
  await expect(page.getByRole('heading', { name: 'Databases 0' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'TU' })).toBeVisible();
  assert.equal((await telemetry).postDataJSON().meta.app.name, 'postgres-azure-backup-client');
  assert.equal(await page.evaluate(() => '__APP_CONFIG__' in window), false);
  await page.goto(`${appOrigin}/database/db1?bookmark=1`);
  await expect(page.getByRole('heading', { name: 'Backups 0' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tables 0' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  assert(assets.some(request => request.resourceType() === 'script'));
  assert(assets.some(request => request.resourceType() === 'stylesheet'));
  await expect(page.locator('body')).toHaveCSS('font-family', 'system-ui');
  await expect(page.getByRole('heading', { name: 'Backups 0' })).toHaveCSS('font-family', 'system-ui');
  await expect(page.getByRole('button', { name: 'TU' })).toHaveCSS('font-family', 'system-ui');
  assert.deepEqual(fontRequests, [], 'System typography must not download font files');
  const manifest = JSON.parse(await readFile(join(output, 'assets/manifest.webmanifest'), 'utf8'));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field]).origin, appOrigin);
  assert.deepEqual(failures, []);
  console.log('Direct Blob-style assets, system typography, profile and same-origin Faro passed.');
} finally {
  await browser?.close();
  await Promise.all([new Promise(resolve => assetServer.close(resolve)), new Promise(resolve => documentServer.close(resolve))]);
  await rm(output, { recursive: true, force: true });
}

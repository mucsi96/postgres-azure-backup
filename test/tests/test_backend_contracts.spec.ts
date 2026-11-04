import { test, expect } from '../fixtures';
import { executeDbQuery, getBlobServiceClient, getTableRowCount, populateDb } from '../utils';
import AdmZip from 'adm-zip';
import type { APIRequestContext } from '@playwright/test';
import { apiIdentity } from '../auth';

async function csrf(request: APIRequestContext, apiHeaders: Record<string, string>) {
  const response = await request.get('/api/databases', { headers: apiHeaders });
  expect(response.ok()).toBe(true);
  const cookie = (await request.storageState()).cookies.find(cookie => cookie.name === '__Host-XSRF-TOKEN');
  expect(cookie).toMatchObject({ secure: true, httpOnly: false, path: '/', sameSite: 'Lax' });
  return { ...apiHeaders, 'X-XSRF-TOKEN': cookie!.value };
}

test('rejects tampered JWT claims and unsigned tokens', async ({ request, apiHeaders }) => {
  const token = apiHeaders.Authorization.slice('Bearer '.length);
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const modified = Buffer.from(JSON.stringify({ ...claims, aud: 'other-api' })).toString('base64url');
  for (const invalid of [
    `${header}.${modified}.${signature}`,
    `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${payload}.`,
  ]) {
    expect((await request.get('/api/databases', { headers: { Authorization: `Bearer ${invalid}` } })).status()).toBe(401);
  }
});

test('enforces signed-token audience and per-operation roles even with valid CSRF', async ({ request }) => {
  const wrongAudience = await apiIdentity(request, 'wrong-audience-client');
  expect((await request.get('/api/databases', { headers: wrongAudience })).status()).toBe(401);
  const reader = await apiIdentity(request, 'reader-client');
  const headers = await csrf(request, reader);
  for (const endpoint of [
    '/api/smart-backup', '/api/backup-all', '/api/database/db1/backup',
    '/api/database/db1/restore/20260101-000000.0.0.0.7.zip',
    '/api/database/db1/backup/20260101-000000.0.0.0.7.zip/archive/download-token',
    '/api/database/db1/export-sql/download-token',
  ]) {
    expect((await request.post(endpoint, { headers })).status(), endpoint).toBe(403);
  }
});

test('download capabilities are single use and expire after thirty seconds', async ({ request, apiHeaders }) => {
  test.setTimeout(60_000);
  await populateDb();
  const headers = await csrf(request, apiHeaders);
  const create = () => request.post('/api/database/db1/export-sql/download-token', { headers });
  const first = await create();
  expect(first.ok()).toBe(true);
  const { token } = await first.json();
  const download = await request.get(`/api/download/${token}`);
  expect(download.ok()).toBe(true);
  expect(await download.text()).toContain('INSERT INTO test1.fruites');
  expect((await request.get(`/api/download/${token}`)).status()).toBe(410);
  const expired = await (await create()).json();
  await new Promise(resolve => setTimeout(resolve, 31_000));
  expect((await request.get(`/api/download/${expired.token}`)).status()).toBe(410);
});

test('restores legacy ZIP entry names and sequence values; failed restore rolls back', async ({ request, apiHeaders }) => {
  test.setTimeout(60_000);
  await populateDb();
  await executeDbQuery(8164, "SET ROLE test1; SELECT setval('test1.restore_owner_test_sequence', 73, true); RESET ROLE;");
  const headers = await csrf(request, apiHeaders);
  expect((await request.post('/api/database/db1/backup', { headers })).ok()).toBe(true);
  const backups = await (await request.get('/api/database/db1/backups', { headers: apiHeaders })).json();
  const key = backups[0].name as string;
  const blob = getBlobServiceClient().getContainerClient('backups').getBlockBlobClient(`db1/${key}`);
  const archive = new AdmZip(await blob.downloadToBuffer());
  const legacy = new AdmZip();
  const dump = archive.getEntries().find(entry => entry.entryName.endsWith('.pgdump'))!;
  legacy.addFile('pgdump-123456789.pgdump', dump.getData());
  legacy.addFile('pgdump-987654321.sql', archive.getEntries().find(entry => entry.entryName.endsWith('.sql'))!.getData());
  await blob.uploadData(legacy.toBuffer());
  await executeDbQuery(8164, "SET ROLE test1; DELETE FROM test1.fruites; SELECT setval('test1.restore_owner_test_sequence', 999, true); RESET ROLE;");
  expect((await request.post(`/api/database/db1/restore/${key}`, { headers })).ok()).toBe(true);
  expect(await getTableRowCount(8164, 'test1', 'fruites')).toBe(4);
  await executeDbQuery(8164, `DO $$ BEGIN
    IF nextval('test1.restore_owner_test_sequence') <> 74 THEN
      RAISE EXCEPTION 'sequence value not restored';
    END IF;
  END $$;`);

  // Force an error after DROP SCHEMA has executed inside the restore transaction.
  // The dump still contains CREATE SCHEMA, which now lacks database CREATE rights.
  await executeDbQuery(8164, 'REVOKE CREATE ON DATABASE test FROM test1');
  try {
    expect((await request.post(`/api/database/db1/restore/${key}`, { headers })).status()).toBe(500);
    expect(await getTableRowCount(8164, 'test1', 'fruites')).toBe(4);
  } finally {
    await executeDbQuery(8164, 'GRANT CREATE ON DATABASE test TO test1');
  }
});

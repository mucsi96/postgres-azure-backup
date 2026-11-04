import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const databaseSchema = z.object({
  name: z.string(), tablesCount: z.number(), totalRowCount: z.number(),
  fileCount: z.number(), backupsCount: z.number(), lastBackupTime: timestamp.nullable(),
});
const backupSchema = z.object({
  name: z.string(), lastModified: timestamp, totalRowCount: z.number(), size: z.number(),
  retentionPeriod: z.number(), hasPlainDump: z.boolean().optional(),
  fileCount: z.number(), filesTotalSize: z.number(),
});
const tablesSchema = z.object({
  tables: z.array(z.object({ name: z.string(), rowCount: z.number() })),
  totalRowCount: z.number(), fileCount: z.number(),
});
const userInfoSchema = z.object({
  email: z.string(),
  additionalClaims: z.object({ name: z.string().optional() }).optional(),
});
const smartBackupSchema = z.object({
  backupsPerformed: z.array(z.object({ database: z.string(), retentionPeriod: z.number() })),
  cleanupPerformed: z.boolean(), error: z.string().nullable(),
});
export type Backup = z.infer<typeof backupSchema>;

// Credentials belong to the gateway. Only same-origin mutations carry CSRF proof.
async function request(path: string, init: RequestInit = {}) {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error('API requests must be same-origin');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes((init.method ?? 'GET').toUpperCase())) {
    const cookie = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('__Host-XSRF-TOKEN='));
    if (!cookie) throw new Error('Missing CSRF token. Reload the page and try again.');
    headers.set('X-XSRF-TOKEN', decodeURIComponent(cookie.slice('__Host-XSRF-TOKEN='.length)));
  }
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response;
}

async function fetchJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  return schema.parse(await (await request(path, { signal })).json());
}

export const databasePath = (name: string) => `/api/database/${encodeURIComponent(name)}`;
export const databasesQuery = queryOptions({
  queryKey: ['databases'],
  queryFn: ({ signal }) => fetchJson('/api/databases', z.array(databaseSchema), signal),
});
export const profileQuery = queryOptions({
  queryKey: ['profile'],
  queryFn: ({ signal }) => fetchJson('/oauth2/userinfo', userInfoSchema, signal),
});
export const tablesQuery = (name: string) => queryOptions({
  queryKey: ['database', name, 'tables'],
  queryFn: ({ signal }) => fetchJson(`${databasePath(name)}/tables`, tablesSchema, signal),
});
export const backupsQuery = (name: string) => queryOptions({
  queryKey: ['database', name, 'backups'],
  queryFn: ({ signal }) => fetchJson(`${databasePath(name)}/backups`, z.array(backupSchema), signal),
});
export const lastBackupQuery = (name: string) => queryOptions({
  queryKey: ['database', name, 'last-backup-time'],
  queryFn: ({ signal }) => fetchJson(`${databasePath(name)}/last-backup-time`, timestamp.nullable(), signal),
  enabled: Boolean(name),
});

export async function createBackup(name?: string) {
  await request(name ? `${databasePath(name)}/backup` : '/api/backup-all', { method: 'POST' });
}
export async function smartBackup() {
  const result = smartBackupSchema.parse(await (await request('/api/smart-backup', { method: 'POST' })).json());
  if (result.error) throw new Error(result.error);
}
export async function restoreBackup(name: string, key: string) {
  await request(`${databasePath(name)}/restore/${encodeURIComponent(key)}`, { method: 'POST' });
}
export async function download(path: string) {
  const { token } = z.object({ token: z.string().min(1) }).parse(
    await (await request(`${path}/download-token`, { method: 'POST' })).json(),
  );
  window.location.assign(`/api/download/${encodeURIComponent(token)}`);
}

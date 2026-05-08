import { expect, Locator, Page } from '@playwright/test';
import { BlobServiceClient } from '@azure/storage-blob';
import { Client } from 'pg';
import fs from 'fs/promises';
import path from 'path';

const connectionString =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://localhost:8163/devstoreaccount1;';

const blobServiceClient =
  BlobServiceClient.fromConnectionString(connectionString);

export interface TableData {
  [key: string]: string;
}

export async function extractTableData(table: Locator): Promise<TableData[]> {
  const headers = await table.locator('thead th').allInnerTexts();
  const capitalizedHeaders = headers.map(
    (header) => header.charAt(0).toUpperCase() + header.slice(1).toLowerCase()
  );

  const rows = await table.locator('tbody tr').all();
  const tableData: TableData[] = [];

  for (const row of rows) {
    const cells = await row.locator('td').allInnerTexts();
    const rowData: TableData = {};
    capitalizedHeaders.forEach((header, index) => {
      rowData[header] = cells[index];
    });
    tableData.push(rowData);
  }

  return tableData;
}

interface TimeDelta {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
}

interface CreateBackupOptions {
  prefix: string;
  rowsCount: number;
  retention: number;
  size: number;
  timeDelta: TimeDelta;
  fileCount?: number;
  filesTotalSize?: number;
}

export async function createBackup(
  options: CreateBackupOptions
): Promise<void> {
  const {
    prefix,
    rowsCount,
    retention,
    size,
    timeDelta,
    fileCount = 0,
    filesTotalSize = 0,
  } = options;

  const containerClient = blobServiceClient.getContainerClient('backups');

  if (!(await containerClient.exists())) {
    await containerClient.create();
  }

  const currentTime = new Date();
  const totalMilliseconds =
    (timeDelta.days || 0) * 24 * 60 * 60 * 1000 +
    (timeDelta.hours || 0) * 60 * 60 * 1000 +
    (timeDelta.minutes || 0) * 60 * 1000 +
    (timeDelta.seconds || 0) * 1000;

  const backupTime = new Date(currentTime.getTime() - totalMilliseconds);

  const year = backupTime.getUTCFullYear();
  const month = String(backupTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(backupTime.getUTCDate()).padStart(2, '0');
  const hours = String(backupTime.getUTCHours()).padStart(2, '0');
  const minutes = String(backupTime.getUTCMinutes()).padStart(2, '0');
  const seconds = String(backupTime.getUTCSeconds()).padStart(2, '0');

  // Filename format: YYYYMMDD-HHMMSS.rowCount.fileCount.filesTotalSize.retention.zip
  const filename = `${prefix}/${year}${month}${day}-${hours}${minutes}${seconds}.${rowsCount}.${fileCount}.${filesTotalSize}.${retention}.zip`;

  const blockBlobClient = containerClient.getBlockBlobClient(filename);
  const content = 'a'.repeat(size);
  await blockBlobClient.upload(content, content.length);
}

export async function cleanupBackups(): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient('backups');

  if (!(await containerClient.exists())) {
    await containerClient.create();
    return;
  }

  for await (const blob of containerClient.listBlobsFlat()) {
    const blobClient = containerClient.getBlobClient(blob.name);
    await blobClient.delete();
  }
}

export async function executeDbQuery(port: number, query: string): Promise<void> {
  const client = new Client({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: port,
  });

  await client.connect();
  await client.query(query);
  await client.end();
}

export async function getTablesInSchema(
  port: number,
  schema: string
): Promise<string[]> {
  const client = new Client({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: port,
  });

  await client.connect();
  const result = await client.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
    [schema]
  );
  await client.end();

  return result.rows.map((row) => row.table_name);
}

export async function getTableRowCount(
  port: number,
  schema: string,
  table: string
): Promise<number> {
  const client = new Client({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: port,
  });

  await client.connect();
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM "${schema}"."${table}"`
  );
  await client.end();

  return result.rows[0].count;
}

export async function cleanupDb(): Promise<void> {
  await executeDbQuery(8164, 'DROP SCHEMA IF EXISTS test1 CASCADE');
  await executeDbQuery(8165, 'DROP SCHEMA IF EXISTS test2 CASCADE');
}

export async function populateDb(): Promise<void> {
  const db1Query = `
    CREATE SCHEMA test1;
    CREATE TABLE test1.fruites (NAME VARCHAR(20));
    INSERT INTO test1.fruites (NAME) VALUES ('Apple');
    INSERT INTO test1.fruites (NAME) VALUES ('Orange');
    INSERT INTO test1.fruites (NAME) VALUES ('Banana');
    INSERT INTO test1.fruites (NAME) VALUES ('Rasberry');
    CREATE TABLE test1.vegetables (NAME VARCHAR(20));
    INSERT INTO test1.vegetables (NAME) VALUES ('Carrot');
    INSERT INTO test1.vegetables (NAME) VALUES ('Potato');
    INSERT INTO test1.vegetables (NAME) VALUES ('Spinach');
    INSERT INTO test1.vegetables (NAME) VALUES ('Broccoli');
    INSERT INTO test1.vegetables (NAME) VALUES ('Tomato');
    CREATE TABLE test1.passwords (NAME VARCHAR(20));
    INSERT INTO test1.passwords (NAME) VALUES ('123');
    INSERT INTO test1.passwords (NAME) VALUES ('123456');
    INSERT INTO test1.passwords (NAME) VALUES ('abc');
    INSERT INTO test1.passwords (NAME) VALUES ('abcd');
    CREATE TABLE test1.secrets (NAME VARCHAR(20));
    INSERT INTO test1.secrets (NAME) VALUES ('a');
    INSERT INTO test1.secrets (NAME) VALUES ('b');
    INSERT INTO test1.secrets (NAME) VALUES ('c');
    ANALYZE test1.fruites;
    ANALYZE test1.vegetables;
    ANALYZE test1.passwords;
    ANALYZE test1.secrets;
  `;

  const db2Query = `
    CREATE SCHEMA test2;
    CREATE TABLE test2.animals (name VARCHAR(20));
    INSERT INTO test2.animals (name) VALUES ('Dog');
    INSERT INTO test2.animals (name) VALUES ('Cat');
    INSERT INTO test2.animals (name) VALUES ('Bird');
    INSERT INTO test2.animals (name) VALUES ('Fish');
    INSERT INTO test2.animals (name) VALUES ('Rabbit');
    INSERT INTO test2.animals (name) VALUES ('Turtle');
    CREATE TABLE test2.countries (name VARCHAR(20));
    INSERT INTO test2.countries (name) VALUES ('USA');
    INSERT INTO test2.countries (name) VALUES ('Canada');
    INSERT INTO test2.countries (name) VALUES ('Germany');
    INSERT INTO test2.countries (name) VALUES ('Japan');
    INSERT INTO test2.countries (name) VALUES ('Australia');
    INSERT INTO test2.countries (name) VALUES ('Brazil');
    CREATE TABLE test2.books (title VARCHAR(50));
    INSERT INTO test2.books (title) VALUES ('Harry Potter');
    INSERT INTO test2.books (title) VALUES ('To Kill a Mockingbird');
    INSERT INTO test2.books (title) VALUES ('The Great Gatsby');
    INSERT INTO test2.books (title) VALUES ('1984');
    INSERT INTO test2.books (title) VALUES ('Pride and Prejudice');
    CREATE TABLE test2.secrets (secret VARCHAR(20));
    INSERT INTO test2.secrets (secret) VALUES ('alpha');
    INSERT INTO test2.secrets (secret) VALUES ('bravo');
    INSERT INTO test2.secrets (secret) VALUES ('charlie');
    INSERT INTO test2.secrets (secret) VALUES ('delta');
    ANALYZE test2.animals;
    ANALYZE test2.countries;
    ANALYZE test2.books;
    ANALYZE test2.secrets;
  `;

  await executeDbQuery(8164, db1Query);
  await executeDbQuery(8165, db2Query);
}

export async function getDb1Tables(): Promise<string[]> {
  const client = new Client({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: 8164,
  });

  await client.connect();
  const result = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'test1'"
  );
  await client.end();

  return result.rows.map((row) => row.table_name);
}

export async function mockWindowOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).open = (url: string) => {
      if (url && url.startsWith('https://blobstorage:10000')) {
        url = url.replace(
          'https://blobstorage:10000',
          'https://localhost:8163'
        );
        window.location.href = url;
      }
    };
  });
}

export function withoutKeys<T extends Record<string, any>>(
  data: T,
  keys: string[]
): Partial<T> {
  const result: any = {};
  for (const key in data) {
    if (!keys.includes(key)) {
      result[key] = data[key];
    }
  }
  return result;
}

export function listWithoutKeys<T extends Record<string, any>>(
  data: T[],
  keys: string[]
): Partial<T>[] {
  return data.map((row) => withoutKeys(row, keys));
}

export async function getBackupsFromStorage(prefix: string) {
  const containerClient = blobServiceClient.getContainerClient('backups');

  if (!(await containerClient.exists())) {
    return [];
  }

  const backups = [];
  for await (const blob of containerClient.listBlobsFlat({
    prefix: `${prefix}/`,
  })) {
    // Only return ZIP backups
    if (!blob.name.endsWith('.zip')) {
      continue;
    }

    // Filename format: YYYYMMDD-HHMMSS.rowCount.blobCount.blobsTotalSize.retention.zip
    const parts = blob.name.split('/')[1].split('.');
    backups.push({
      name: blob.name,
      rowsCount: parseInt(parts[1]),
      blobCount: parseInt(parts[2]),
      blobsTotalSize: parseInt(parts[3]),
      retention: parseInt(parts[4]),
      size: blob.properties.contentLength,
    });
  }

  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

export async function createBlobContainer(
  containerName: string
): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    await containerClient.create();
  }
}

export async function uploadBlob(
  containerName: string,
  blobName: string,
  content: string
): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    await containerClient.create();
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(content, content.length);
}

export async function getBlobContent(
  containerName: string,
  blobName: string
): Promise<string> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const downloadResponse = await blobClient.download();
  const downloaded = await streamToBuffer(downloadResponse.readableStreamBody!);
  return downloaded.toString();
}

export async function blobExists(
  containerName: string,
  blobName: string
): Promise<boolean> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    return false;
  }

  const blobClient = containerClient.getBlobClient(blobName);
  return await blobClient.exists();
}

export async function listBlobs(
  containerName: string,
  prefix?: string
): Promise<string[]> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    return [];
  }

  const blobs: string[] = [];
  const options = prefix ? { prefix } : {};
  for await (const blob of containerClient.listBlobsFlat(options)) {
    blobs.push(blob.name);
  }
  return blobs;
}

export async function cleanupBlobContainer(
  containerName: string
): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);

  if (!(await containerClient.exists())) {
    return;
  }

  for await (const blob of containerClient.listBlobsFlat()) {
    const blobClient = containerClient.getBlobClient(blob.name);
    await blobClient.delete();
  }
}

async function streamToBuffer(
  readableStream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on('data', (data: Buffer) => {
      chunks.push(data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

export function getBlobServiceClient(): BlobServiceClient {
  return blobServiceClient;
}

export async function triggerBackup(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'More backup options' }).click();
  await page.getByText('Backup if needed').click();
  await expect(
    page.getByText('Smart backup completed')
  ).toBeVisible({ timeout: 60000 });
}


// Folder backup helper functions
export async function writeFileToFolder(
  folderPath: string,
  fileName: string,
  content: string
): Promise<void> {
  const fullPath = path.join(folderPath, fileName);
  const dirPath = path.dirname(fullPath);

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

export async function readFileFromFolder(
  folderPath: string,
  fileName: string
): Promise<string> {
  const fullPath = path.join(folderPath, fileName);
  return await fs.readFile(fullPath, 'utf-8');
}

export async function fileExistsInFolder(
  folderPath: string,
  fileName: string
): Promise<boolean> {
  const fullPath = path.join(folderPath, fileName);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFileFromFolder(
  folderPath: string,
  fileName: string
): Promise<void> {
  const fullPath = path.join(folderPath, fileName);
  try {
    await fs.unlink(fullPath);
  } catch (error) {
    // Ignore if file doesn't exist
  }
}

export async function cleanupFolder(folderPath: string): Promise<void> {
  try {
    // Read all files and directories in the folder
    const entries = await fs.readdir(folderPath);

    // Delete each entry
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry);
      await fs.rm(fullPath, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore if folder doesn't exist or is already empty
  }
}

export { streamToBuffer };

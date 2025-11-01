import { Locator, Page } from '@playwright/test';
import { BlobServiceClient } from '@azure/storage-blob';
import { Client } from 'pg';

const connectionString =
  "DefaultEndpointsProtocol=https;AccountName=devstoreaccount1;" +
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;" +
  "BlobEndpoint=https://localhost:8081/devstoreaccount1;";

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

export interface TableData {
  [key: string]: string;
}

export async function extractTableData(table: Locator): Promise<TableData[]> {
  const headers = await table.locator('thead th').allInnerTexts();
  const capitalizedHeaders = headers.map(header =>
    header.charAt(0).toUpperCase() + header.slice(1).toLowerCase()
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
}

export async function createBackup(options: CreateBackupOptions): Promise<void> {
  const { prefix, rowsCount, retention, size, timeDelta } = options;

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

  const filename = `${prefix}/${year}${month}${day}-${hours}${minutes}${seconds}.${rowsCount}.${retention}.zip`;

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

async function executeDbQuery(port: number, query: string): Promise<void> {
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

export async function cleanupDb(): Promise<void> {
  await executeDbQuery(8082, 'DROP SCHEMA IF EXISTS test1 CASCADE');
  await executeDbQuery(8083, 'DROP SCHEMA IF EXISTS test2 CASCADE');
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
  `;

  await executeDbQuery(8082, db1Query);
  await executeDbQuery(8083, db2Query);
}

export async function getDb1Tables(): Promise<string[]> {
  const client = new Client({
    database: 'test',
    host: 'localhost',
    user: 'postgres',
    password: 'postgres',
    port: 8082,
  });

  await client.connect();
  const result = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'test1'"
  );
  await client.end();

  return result.rows.map(row => row.table_name);
}

export async function mockWindowOpen(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).open = (url: string) => {
      if (url && url.startsWith("https://blobstorage:10000")) {
        url = url.replace("https://blobstorage:10000", "https://localhost:8081");
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
  return data.map(row => withoutKeys(row, keys));
}

export async function getBackupsFromStorage(prefix: string) {
  const containerClient = blobServiceClient.getContainerClient('backups');

  if (!(await containerClient.exists())) {
    return [];
  }

  const backups = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix: `${prefix}/` })) {
    // Only return ZIP backups
    if (!blob.name.endsWith('.zip')) {
      continue;
    }

    const parts = blob.name.split('/')[1].split('.');
    backups.push({
      name: blob.name,
      rowsCount: parseInt(parts[1]),
      retention: parseInt(parts[2]),
      size: blob.properties.contentLength
    });
  }

  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

export async function createBlobContainer(containerName: string): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    await containerClient.create();
  }
}

export async function uploadBlob(containerName: string, blobName: string, content: string): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    await containerClient.create();
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(content, content.length);
}

export async function getBlobContent(containerName: string, blobName: string): Promise<string> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  const downloadResponse = await blobClient.download();
  const downloaded = await streamToBuffer(downloadResponse.readableStreamBody!);
  return downloaded.toString();
}

export async function blobExists(containerName: string, blobName: string): Promise<boolean> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  if (!(await containerClient.exists())) {
    return false;
  }

  const blobClient = containerClient.getBlobClient(blobName);
  return await blobClient.exists();
}

export async function listBlobs(containerName: string, prefix?: string): Promise<string[]> {
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

export async function cleanupBlobContainer(containerName: string): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);

  if (!(await containerClient.exists())) {
    return;
  }

  for await (const blob of containerClient.listBlobsFlat()) {
    const blobClient = containerClient.getBlobClient(blob.name);
    await blobClient.delete();
  }
}

async function streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
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

export async function triggerBackup(): Promise<Response> {
  const response = await fetch(`http://localhost:8080/api/smart-backup`, {
    method: 'POST',
  });
  return response;
}

export async function getBackupsList(databaseName: string): Promise<any[]> {
  const response = await fetch(`http://localhost:8080/api/database/${databaseName}/backups`);
  return await response.json();
}

export async function restoreBackup(databaseName: string, backupKey: string): Promise<Response> {
  const response = await fetch(`http://localhost:8080/api/database/${databaseName}/restore/${backupKey}`, {
    method: 'POST',
  });
  return response;
}

export async function downloadZipBackup(databaseName: string): Promise<Buffer> {
  const containerClient = blobServiceClient.getContainerClient('backups');
  let zipBlobName = '';

  for await (const blob of containerClient.listBlobsFlat({ prefix: `${databaseName}/` })) {
    if (blob.name.endsWith('.zip')) {
      zipBlobName = blob.name;
      break;
    }
  }

  if (!zipBlobName) {
    throw new Error(`No ZIP backup found for database ${databaseName}`);
  }

  const blobClient = containerClient.getBlobClient(zipBlobName);
  const downloadResponse = await blobClient.download();
  return await streamToBuffer(downloadResponse.readableStreamBody!);
}

export { streamToBuffer };

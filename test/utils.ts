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

  const filename = `${prefix}/${year}${month}${day}-${hours}${minutes}${seconds}.${rowsCount}.${retention}.pgdump`;

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

export async function getBackupsFromStorage(prefix: string, type: 'pgdump' | 'sql' = 'pgdump') {
  const containerClient = blobServiceClient.getContainerClient('backups');

  if (!(await containerClient.exists())) {
    return [];
  }

  const backups = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix: `${prefix}/` })) {
    const parts = blob.name.split('/')[1].split('.');
    backups.push({
      name: blob.name,
      rowsCount: parseInt(parts[1]),
      retention: parseInt(parts[2]),
      size: blob.properties.contentLength
    });
  }

  return backups.sort((a, b) => b.name.localeCompare(a.name)).filter(backup => backup.name.endsWith(`.${type}`));
}

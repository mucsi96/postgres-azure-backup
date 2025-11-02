import { delay, http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { Database, Table } from '../types';

// Helper function to create a simple ZIP file with proper structure
function createMockZipFile(): Uint8Array {
  // Create a minimal ZIP file structure manually
  // ZIP file format: Local file header + File data + Central directory + End of central directory

  const files = [
    { name: '20241101-143022.100.7.pgdump', content: 'PGDMP mock content' },
    { name: '20241101-143022.100.7.sql', content: 'SELECT * FROM mock_table;' },
    { name: 'blobs/user-uploads/test-file.txt', content: 'Mock blob content' },
  ];

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirectoryRecords: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);

    // Local file header
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract
    view.setUint16(8, 0, true); // Compression method (0 = no compression)
    view.setUint32(18, contentBytes.length, true); // Uncompressed size
    view.setUint32(22, contentBytes.length, true); // Compressed size
    view.setUint16(26, nameBytes.length, true); // File name length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader);
    parts.push(contentBytes);

    // Central directory file header
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // Central file header signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed to extract
    centralView.setUint16(10, 0, true); // Compression method
    centralView.setUint32(20, contentBytes.length, true); // Uncompressed size
    centralView.setUint32(24, contentBytes.length, true); // Compressed size
    centralView.setUint16(28, nameBytes.length, true); // File name length
    centralView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralDirectoryRecords.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  // Add central directory records
  const centralDirStart = offset;
  for (const record of centralDirectoryRecords) {
    parts.push(record);
    offset += record.length;
  }

  // End of central directory record
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true); // End of central dir signature
  endView.setUint16(8, files.length, true); // Total number of entries (this disk)
  endView.setUint16(10, files.length, true); // Total number of entries
  endView.setUint32(12, offset - centralDirStart, true); // Size of central directory
  endView.setUint32(16, centralDirStart, true); // Offset of start of central directory
  parts.push(endRecord);

  // Combine all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }

  return result;
}

const databases: Database[] = [
  {
    name: 'db1',
    tablesCount: 2,
    totalRowCount: 9,
    backupsCount: 2,
    blobCount: 5,
    lastBackupTime: new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 2),
  },
  {
    name: 'db2',
    tablesCount: 3,
    totalRowCount: 12,
    backupsCount: 3,
    blobCount: 12,
    lastBackupTime: new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 0.5),
  },
  {
    name: 'db3',
    tablesCount: 1,
    totalRowCount: 3,
    backupsCount: 1,
    blobCount: 0,
    lastBackupTime: null,
  },
];

function getDatabase(name: string): Database {
  const database = databases.find((db) => db.name === name);

  if (!database) {
    throw new Error(`Database ${name} not found`);
  }

  return database;
}

const mocks = [
  http.get('/api/databases', async () => {
    return HttpResponse.json(databases);
  }),
  http.get('/api/database/:name/last-backup-time', async (request) => {
    const name = request.params['name']?.toString();

    if (!name) {
      return HttpResponse.text('name is required', { status: 400 });
    }

    return HttpResponse.json(getDatabase(name).lastBackupTime);
  }),
  http.get('/api/database/:name/tables', async (request) => {
    const name = request.params['name']?.toString();

    if (!name) {
      return HttpResponse.text('name is required', { status: 400 });
    }

    await delay(600);
    return HttpResponse.json({
      tables: [
        { name: 'fruites', rowCount: 4 },
        { name: 'vegetables', rowCount: 5 },
      ],
      totalRowCount: getDatabase(name).totalRowCount,
    } satisfies {
      tables: Table[];
      totalRowCount: number;
    });
  }),
  http.post('/api/database/:name/restore/:backupName', async () => {
    await delay(200);
    return HttpResponse.json(null);
  }),
  http.get('/api/database/:name/backups', async () => {
    await delay(200);
    return HttpResponse.json([
      {
        name: 'backup1',
        lastModified: new Date(),
        totalRowCount: 4,
        size: 1024,
        retentionPeriod: 7,
        hasPlainDump: true,
      },
      {
        name: 'backup2',
        lastModified: new Date(new Date().getTime() - 24 * 60 * 60 * 1000 * 2),
        totalRowCount: 5,
        size: 2567,
        retentionPeriod: 14,
      },
    ]);
  }),
  http.get('/api/database/:name/backup/:backupName/archive', async (request) => {
    const name = request.params['name']?.toString();
    const backupName = request.params['backupName']?.toString();

    if (!name) {
      return HttpResponse.text('name is required', { status: 400 });
    }

    if (!backupName) {
      return HttpResponse.text('backupName is required', { status: 400 });
    }

    await delay(200);
    // Return a properly structured mock ZIP file
    const mockZipContent = createMockZipFile();
    return new HttpResponse(mockZipContent, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${backupName}"`,
      },
    });
  }),
  http.get('/api/database/:name/backup/:backupName/pgdump', async (request) => {
    const name = request.params['name']?.toString();
    const backupName = request.params['backupName']?.toString();

    if (!name) {
      return HttpResponse.text('name is required', { status: 400 });
    }

    if (!backupName) {
      return HttpResponse.text('backupName is required', { status: 400 });
    }

    await delay(200);
    // Return a mock binary file for pgdump download
    const mockDumpContent = new TextEncoder().encode('PGDMP mock content');
    return new HttpResponse(mockDumpContent, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${backupName.replace('.zip', '.pgdump')}"`,
      },
    });
  }),
  http.get('/api/database/:name/backup/:backupName/sql', async (request) => {
    const name = request.params['name']?.toString();
    const backupName = request.params['backupName']?.toString();

    if (!name) {
      return HttpResponse.text('name is required', { status: 400 });
    }

    if (!backupName) {
      return HttpResponse.text('backupName is required', { status: 400 });
    }

    await delay(200);
    // Return a mock SQL file for plain SQL download
    const mockSqlContent = 'SELECT * FROM mock_table;';
    return new HttpResponse(mockSqlContent, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${backupName.replace('.zip', '.sql')}"`,
      },
    });
  }),
];

export async function setupMocks() {
  const worker = setupWorker(...mocks);
  await worker.start({
    onUnhandledRequest: (request) => {
      if (request.url.startsWith('/api')) {
        console.error(`No request handler found for ${request.url}`);
      }
    },
  });
}

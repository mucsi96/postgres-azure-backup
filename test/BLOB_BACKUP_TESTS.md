# Blob Backup Playwright Tests

## Overview

Comprehensive end-to-end tests for the blob storage backup feature using Playwright. These tests verify that the system correctly creates ZIP backups containing both database dumps and blob storage files, and can restore them properly.

## Test File

- **Location**: [test/tests/test_blob_backups.spec.ts](tests/test_blob_backups.spec.ts)
- **Test Framework**: Playwright with TypeScript
- **Dependencies**:
  - `@playwright/test` - Test framework
  - `@azure/storage-blob` - Azure Blob Storage SDK
  - `adm-zip` - ZIP file parsing library

## Test Utilities Added

Extended [test/utils.ts](utils.ts) with new blob storage utilities:

- `createBlobContainer(containerName)` - Creates a blob container if it doesn't exist
- `uploadBlob(containerName, blobName, content)` - Uploads a blob with content
- `getBlobContent(containerName, blobName)` - Downloads and returns blob content
- `blobExists(containerName, blobName)` - Checks if a blob exists
- `listBlobs(containerName, prefix?)` - Lists all blobs in a container
- `cleanupBlobContainer(containerName)` - Deletes all blobs in a container

## Test Suite: Blob Backup Tests

### Test Setup

Each test sets up test blob containers with sample data:

**user-uploads container:**
- `production/avatar-1.jpg` - Image file (included)
- `production/avatar-2.png` - Image file (included)
- `production/document-1.pdf` - PDF file (included)
- `production/video.mp4` - Video file (excluded by extension filter)

**documents container:**
- `active/report.docx` - Document file (included)
- `active/data.xlsx` - Spreadsheet file (excluded by extension filter)

### Test Cases

#### 1. **Creates ZIP backup with blobs when blob configuration is present**

**Purpose**: Verifies that backups are created as ZIP files when blob backup configuration exists.

**Steps**:
1. Clean up existing backups
2. Trigger backup creation via UI
3. Verify backup file in blob storage
4. Confirm file has `.zip` extension

**Expected**: Backup is created as a ZIP file for databases with blob configuration (db1).

---

#### 2. **Verifies ZIP backup contains database dump and blobs**

**Purpose**: Validates the internal structure of the ZIP backup.

**Steps**:
1. Create a backup
2. Download the ZIP file from blob storage
3. Parse ZIP contents
4. Verify presence of files

**Expected**:
- ZIP contains database dump (`.pgdump` file)
- ZIP contains `MANIFEST.json`
- ZIP contains `blobs/` directory
- Configured blobs are present (filtered by extension)
- Non-configured blobs are absent (e.g., `.mp4` files)

---

#### 3. **Verifies MANIFEST.json contains correct metadata**

**Purpose**: Ensures the manifest file has proper structure and accurate metadata.

**Steps**:
1. Create backup
2. Extract and parse `MANIFEST.json`
3. Validate schema and values

**Expected Manifest Structure**:
```json
{
  "timestamp": "20251029-213045",
  "databaseDump": "database.pgdump",
  "totalRowCount": 9,
  "retentionPeriod": 1,
  "blobs": [
    {
      "containerName": "user-uploads",
      "blobName": "production/avatar-1.jpg",
      "pathInZip": "blobs/user-uploads/production/avatar-1.jpg",
      "size": 12345
    }
  ]
}
```

---

#### 4. **Shows blob count and size in backup listing**

**Purpose**: Verifies API returns blob metadata with backup listings.

**Steps**:
1. Create backup with blobs
2. Navigate to backups list
3. Verify backup appears in UI

**Expected**: Backup listing shows correctly (API returns `blobCount` and `blobsTotalSize`).

---

#### 5. **Restores blobs along with database from ZIP backup**

**Purpose**: Tests the complete restore workflow including blob restoration.

**Steps**:
1. Create blobs with specific content
2. Create backup
3. Delete blobs to simulate data loss
4. Restore backup via UI
5. Verify blobs are restored with correct content

**Expected**:
- Blobs are recreated in their original containers
- Blob content matches original data
- Database is restored successfully

---

#### 6. **Backward compatibility: db2 without blob config creates regular backup**

**Purpose**: Ensures databases without blob configuration continue to work with traditional backups.

**Steps**:
1. Switch to db2 (no blob backup configuration)
2. Create backup
3. Verify backup format

**Expected**:
- Backup is created as `.pgdump` file (not ZIP)
- No ZIP file is created
- Traditional backup workflow works unchanged

---

#### 7. **Filters blobs by extension correctly**

**Purpose**: Validates extension-based filtering works as configured.

**Steps**:
1. Upload blobs with various extensions (`.txt`, `.exe`, `.jpg`, `.pdf`)
2. Create backup
3. Parse ZIP contents
4. Verify filtered files

**Expected**:
- Only configured extensions are included (`.pdf`, `.jpg`, `.png`, `.docx`)
- Other extensions are excluded (`.txt`, `.exe`, `.mp4`)

---

#### 8. **Filters blobs by prefix correctly**

**Purpose**: Validates prefix-based filtering works as configured.

**Steps**:
1. Upload blobs with different prefixes (`production/`, `staging/`, `archive/`)
2. Create backup
3. Parse ZIP contents

**Expected**:
- Only blobs with configured prefix (`production/`) are included
- Blobs with other prefixes are excluded

---

#### 9. **Handles empty blob containers gracefully**

**Purpose**: Tests edge case where configured containers have no matching blobs.

**Steps**:
1. Clean all blobs from configured containers
2. Create backup
3. Verify ZIP structure

**Expected**:
- Backup is still created successfully
- ZIP contains database dump and manifest
- Manifest shows `blobs: []` (empty array)
- No errors occur

---

## Running the Tests

### Prerequisites

1. Full application stack must be running:
   - PostgreSQL databases (db1 on port 8082, db2 on port 8083)
   - Azure Blob Storage (Azurite on port 8081)
   - Application server (port 8080)

2. Test databases must be configured with blob backup settings

### Run Tests

```bash
# Install dependencies
cd test
npm install

# Run all tests
npm test

# Run only blob backup tests
npm test test_blob_backups.spec.ts

# Run with UI
npm run test:ui

# Debug tests
npm run test:debug
```

### Test Configuration

Test configuration is defined in [playwright.config.ts](playwright.config.ts):
- Base URL: `http://localhost:8080`
- Ignore HTTPS errors (for Azurite)
- Screenshots on failure
- Video recording on failure
- Single worker (no parallelization)

## Test Data Configuration

Tests use the database configuration from [test/databases_config.json](../test/databases_config.json):

- **db1**: Has blob backup configuration (creates ZIP backups)
  - Backs up from `user-uploads` container with `production/` prefix
  - Filters: `.pdf`, `.jpg`, `.png`, `.docx`
  - Backs up from `documents` container with `active/` prefix

- **db2**: No blob backup configuration (creates traditional backups)

## Coverage

The test suite covers:

✅ ZIP backup creation with blobs
✅ ZIP structure validation
✅ Manifest metadata accuracy
✅ Extension-based filtering
✅ Prefix-based filtering
✅ Blob restoration workflow
✅ Backward compatibility
✅ Empty container handling
✅ Multiple container support
✅ UI integration

## Notes

- Tests use Azurite (local Azure Storage emulator) with HTTPS on port 8081
- SSL certificates must be configured (`.certs/rootCA.pem`)
- Tests are not fully parallelizable due to shared blob storage state
- Each test cleans up blob containers before execution
- Restore tests may take longer due to database operations (30s timeout)

## Troubleshooting

### Tests fail with connection errors
- Ensure all services are running (PostgreSQL, Azurite, application server)
- Check ports 8080, 8081, 8082, 8083 are not in use by other processes

### ZIP parsing errors
- Verify `adm-zip` is installed: `npm install`
- Check backup was created successfully before parsing

### Blob not found errors
- Ensure blob containers are created before uploading
- Check Azurite is running with HTTPS support

### Restore timeout errors
- Increase timeout in test: `{ timeout: 60000 }`
- Check database connection and pg_restore availability

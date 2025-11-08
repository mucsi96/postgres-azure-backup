# Application Architecture Guide

This document provides a comprehensive overview of the postgres-azure-backup application architecture, components, and workflows.

## Overview

**postgres-azure-backup** is a cloud-native PostgreSQL backup management application featuring:
- Full-stack architecture (Angular frontend + Spring Boot backend)
- Azure Blob Storage integration for backup persistence
- Intelligent backup scheduling with retention management
- Multi-database support with configurable backup strategies
- Microsoft Entra ID authentication and RBAC authorization
- ZIP-based backup format supporting both database dumps and blob storage files

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Angular UI (Client-Side)                │
│    - Backups Management                         │
│    - Database Monitoring                        │
│    - Tables/Records Viewer                      │
│    - Download/Restore Interface                 │
└──────────────────┬──────────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────────┐
│      Spring Boot Backend (Controllers)          │
│    - BackupController                           │
│    - DatabaseController                         │
└──────────────────┬──────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼────────┐ ┌──▼───────┐ ┌───▼──────┐
│ Services   │ │ Scheduler│ │ Security │
│ (Business  │ │ (24-hour │ │ (Entra   │
│  Logic)    │ │  smart)  │ │  ID)     │
└───┬────────┘ └──────────┘ └──────────┘
    │
    ├─── PostgreSQL Databases (Multiple)
    └─── Azure Blob Storage (Backups + Blobs)
```

## Core Services

### BackupService
**Location**: `server/src/main/java/.../service/BackupService.java`

**Responsibilities:**
- List backups from Azure Blob Storage
- Extract and parse backup metadata from ZIP files
- Download backups from blob storage for streaming
- Execute cleanup based on retention periods
- Track last backup timestamp

**Key methods:**
- `getBackups(prefix)` - Lists all backups for a database
- `createBackup(prefix, file, fileName)` - Uploads backup to blob storage
- `downloadBackup(prefix, key)` - Downloads backup file for streaming
- `cleanup(prefix)` - Removes expired backups

### BackupOrchestrationService
**Location**: `server/src/main/java/.../service/BackupOrchestrationService.java`

**Responsibilities:**
- Orchestrates complete backup and restore workflows
- Coordinates multiple services for end-to-end operations
- Manages database dump creation and restoration
- Handles blob collection and restoration

**Backup workflow:**
1. Create pg_dump (custom format) for database
2. Create plain SQL dump (if configured)
3. Collect files from configured folder paths
4. Download files to temporary directory
5. Create ZIP archive with all files
6. Upload ZIP to blob storage
7. Clean up temporary files

**Restore workflow:**
1. Download ZIP from blob storage
2. Extract ZIP to temporary directory
3. Restore database using pg_restore
4. Restore folder files to blob storage
5. Clean up temporary files

### DatabaseService
**Location**: `server/src/main/java/.../service/DatabaseService.java`

**Responsibilities:**
- Load database configurations from JSON file
- Provide JDBC connectivity to PostgreSQL databases
- Retrieve schema information (tables, row counts)
- Create dumps using pg_dump CLI
- Restore databases using pg_restore CLI
- Execute database operations (DROP, CREATE, RENAME)

**Key methods:**
- `getDatabases()` - Returns all configured databases
- `getDatabaseInfo(name)` - Gets tables and row counts
- `createDump(name, retention, format, timestamp)` - Creates backup dump
- `restoreDump(name, file)` - Restores database from dump

### SmartBackupService
**Location**: `server/src/main/java/.../service/SmartBackupService.java`

**Responsibilities:**
- Analyze existing backups and determine needed backup types
- Implement intelligent retention tier logic
- Create backups only when retention interval elapsed
- Ensure higher-retention backups satisfy lower-tier requirements

**Retention tiers:**
- **Daily**: 7-day retention, interval: 1+ day
- **Weekly**: 30-day retention, interval: 7+ days
- **Monthly**: 356-day retention, interval: 30+ days

**Logic:**
- Monthly backup satisfies weekly and daily requirements
- Weekly backup satisfies daily requirement
- Only creates backup when interval has elapsed since last backup of that tier or higher

**Example:** If a monthly backup was created 5 days ago, smart backup skips daily and weekly backups since the monthly backup satisfies those requirements.

### ZipService
**Location**: `server/src/main/java/.../service/ZipService.java`

**Responsibilities:**
- Create ZIP archives containing database dumps and blob files
- Extract and parse backup archives for restoration
- Extract specific files from backups for streaming downloads
- Maintain structured blob directory layout
- Derive container and blob names from ZIP path structure

**Key methods:**
- `createBackupZip()` - Creates ZIP with dumps and blobs
- `extractBackupZip()` - Extracts all files for restoration
- `extractPgdumpFile()` - Extracts only pgdump file for download
- `extractPlainSqlFile()` - Extracts only SQL file for download

**ZIP structure:**
```
backup.zip
├── 20241101-143022.100.7.pgdump  # PostgreSQL custom format
├── 20241101-143022.100.7.sql     # Plain SQL (optional)
└── folders/
    └── user-uploads/
        └── production/
            └── file.pdf
```

### FolderBackupService
**Location**: `server/src/main/java/.../service/FolderBackupService.java`

**Responsibilities:**
- Collect files from configured Azure Storage folder paths
- Download files to local filesystem
- Upload files back to blob storage containers
- Calculate total file count and size for metadata

## API Endpoints

### Backup Management (`BackupController`)

| Endpoint | Method | Auth Role | Purpose |
|----------|--------|-----------|---------|
| `/api/smart-backup` | POST | DatabaseBackupCreator | Execute intelligent backup |
| `/api/database/{name}/backups` | GET | DatabaseBackupsReader | List all backups |
| `/api/database/{name}/backup/{key}/archive` | GET | DatabaseBackupDownloader | Stream ZIP archive download |
| `/api/database/{name}/backup/{key}/pgdump` | GET | DatabaseBackupDownloader | Stream pgdump file download |
| `/api/database/{name}/backup/{key}/sql` | GET | DatabaseBackupDownloader | Stream SQL file download |
| `/api/database/{name}/restore/{key}` | POST | DatabaseBackupRestorer | Restore backup |
| `/api/database/{name}/last-backup-time` | GET | DatabaseBackupsReader | Get last backup timestamp |

### Database Information (`DatabaseController`)

| Endpoint | Method | Auth Role | Purpose |
|----------|--------|-----------|---------|
| `/api/databases` | GET | DatabaseBackupsReader | List databases with stats |
| `/api/database/{name}/tables` | GET | DatabaseBackupsReader | Get tables and row counts |

## Data Models

### DatabaseConfiguration
Database connection and backup settings:
```java
{
  name: String,                        // Database identifier
  host: String,                        // PostgreSQL host
  port: int,                           // PostgreSQL port
  database: String,                    // Database name
  schema: String,                      // Schema to backup
  username: String,                    // Credentials
  password: String,
  excludeTables: List<String>,           // Tables to skip
  dumpFormat: DumpFormat,                // CUSTOM, DIRECTORY, TAR
  createPlainDump: boolean,              // Create SQL dump
  folderBackups: List<FolderBackupConfig>  // Folders to include
}
```

### FolderBackupConfig
Folder backup configuration:
```java
{
  containerName: String,  // Azure container name (required)
  folderPath: String      // Path to folder to backup (required)
}
```

### Backup
Backup file representation:
```java
{
  name: String,              // YYYYMMdd-HHmmss.rowCount.retention.zip
  lastModified: Instant,     // Creation timestamp
  size: long,                // Total ZIP file size
  totalRowCount: int,        // Total records backed up
  retentionPeriod: int,      // Days to retain (7, 30, 356)
  hasPlainDump: boolean,     // Whether SQL dump included
  fileCount: int,            // Number of files in backup
  filesTotalSize: long       // Total size of files
}
```

## Technology Stack

### Backend
- **Java 21** - Runtime
- **Spring Boot 3** - Framework
- **Spring Security** - Authentication/Authorization
- **Spring Cloud Azure** - Entra ID integration
- **Azure SDK** - Blob Storage client
- **PostgreSQL Driver** - Database connectivity
- **Lombok** - Code generation
- **Jackson** - JSON processing

### Frontend
- **Angular 20** - Framework (standalone components)
- **Angular Material** - UI components
- **MSAL Angular** - Microsoft authentication
- **RxJS** - Reactive programming
- **TypeScript** - Language

### Testing
- **Playwright** - E2E testing
- **pg (Node.js)** - Database setup
- **adm-zip** - ZIP manipulation in tests
- **MSW** - Mock Service Worker

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Local orchestration
- **Azurite** - Azure Blob Storage emulator
- **PostgreSQL 17** - Database
- **Helm** - Kubernetes deployment

## Configuration

### Environment Variables (Required)
```bash
AZURE_CLIENT_ID                    # Service principal ID
UI_CLIENT_ID                       # Frontend auth client ID
AZURE_TENANT_ID                    # Azure AD tenant
STORAGE_ACCOUNT_BLOB_URL           # Blob Storage endpoint
STORAGE_ACCOUNT_CONTAINER_NAME     # Backup container
DATABASES_CONFIG_PATH              # Config file path
SPRING_ACTUATOR_PORT               # Management port
```

### Environment Variables (Optional)
```bash
BACKUP_SCHEDULE_ENABLED=true                # Enable scheduling
BACKUP_DAILY_CRON=0 30 6 2-31 * MON-SAT    # Daily: 06:30
BACKUP_WEEKLY_CRON=0 30 6 * * SUN          # Sunday: 06:30
BACKUP_MONTHLY_CRON=0 30 6 1 * *           # 1st: 06:30
BACKUP_CLEANUP_CRON=0 0 7 * * *            # Daily: 07:00
```

### Database Configuration File
JSON file with database configurations:
```json
[
  {
    "name": "db1",
    "host": "localhost",
    "port": 5432,
    "database": "mydb",
    "schema": "public",
    "username": "postgres",
    "password": "password",
    "excludeTables": ["audit_log"],
    "dumpFormat": "custom",
    "createPlainDump": true,
    "folderBackups": [
      {
        "containerName": "user-uploads",
        "folderPath": "production/"
      }
    ]
  }
]
```

## Security

### Authentication & Authorization
- **Framework**: Spring Security + Azure AD (Entra ID)
- **Token**: JWT from Entra ID
- **Frontend**: MSAL (Microsoft Authentication Library)

### Roles (RBAC)
- `APPROLE_DatabaseBackupsReader` - Read backups
- `APPROLE_DatabaseBackupCreator` - Create backups
- `APPROLE_DatabaseBackupDownloader` - Download backups
- `APPROLE_DatabaseBackupRestorer` - Restore backups

### Secure Downloads
- Server-side file streaming through backend endpoints
- No direct blob URLs exposed to browser
- Files extracted from ZIP archives on-demand
- Temporary files cleaned up after streaming

## Key Workflows

### Smart Backup (Scheduled)
Runs every 24 hours via `BackupScheduler`:

```
For each configured database:
  1. Get existing backups from blob storage
  2. Group by retention period (7, 30, 356)
  3. Check retention requirements:
     - Monthly: 30+ days since last monthly?
     - Weekly: 7+ days since last weekly/monthly?
     - Daily: 1+ day since last backup (any tier)?
  4. Create backup with appropriate retention
  5. Run cleanup of expired backups
```

### Manual Backup
```
POST /api/smart-backup
  ↓
SmartBackupService.performSmartBackup()
  ↓
For each database:
  BackupOrchestrationService.performBackupForDatabase()
    ├─ DatabaseService.createDump() [custom]
    ├─ DatabaseService.createDump() [plain SQL]
    ├─ FolderBackupService.collectFolders()
    ├─ FolderBackupService.downloadFile() [each]
    ├─ ZipService.createBackupZip()
    └─ BackupService.createBackup() [upload]
  ↓
BackupOrchestrationService.performCleanup()
```

### Download
```
GET /api/database/{name}/backup/{key}/{type}
  ↓
BackupService.downloadBackup() [from blob storage]
  ↓
ZipService.extractPgdumpFile() OR extractPlainSqlFile() [if needed]
  ↓
Stream file to browser with Content-Disposition header
  ↓
Clean up temporary files

Types:
- /archive → Stream entire ZIP file
- /pgdump → Extract and stream pgdump file
- /sql → Extract and stream SQL file
```

### Restore
```
POST /api/database/{name}/restore/{key}
  ↓
BackupService.downloadBackup()
  ↓
BackupOrchestrationService.restoreBackup()
  ├─ ZipService.extractBackupZip()
  ├─ DatabaseService.restoreDump()
  │  ├─ Create restore database
  │  ├─ pg_restore from dump
  │  ├─ Rename to active
  │  └─ Drop old database
  └─ FolderBackupService.uploadFile() [each file]
```

### Cleanup
```
For each database prefix:
  List all backups
  For each backup:
    Parse retention from filename
    Calculate expiry = created + retention
    If expiry < now:
      Delete from blob storage
```

## Project Structure

```
postgres-azure-backup/
├── server/                          # Spring Boot
│   ├── src/main/java/.../postgresbackuptool/
│   │   ├── App.java                # Entry point
│   │   ├── controller/             # REST API
│   │   ├── service/                # Business logic
│   │   ├── model/                  # Data models
│   │   ├── configuration/          # Spring config
│   │   └── scheduler/              # Scheduled tasks
│   └── pom.xml
│
├── client/                          # Angular
│   ├── src/app/
│   │   ├── backups/                # Backup UI
│   │   ├── databases/              # Database list
│   │   ├── tables/                 # Tables viewer
│   │   └── utils/                  # Pipes/utilities
│   └── package.json
│
├── test/                            # Playwright E2E
│   ├── tests/
│   └── databases_config.json
│
├── docker-compose.yaml
├── Dockerfile
└── README.md
```

## Deployment

### Local Development
```bash
docker-compose up
# App + 2x PostgreSQL + Azurite
# http://localhost:8080
```

### Docker Build
```bash
docker build -t postgres-azure-backup .
# Multi-stage: Maven → Node → Alpine
# Includes pg_dump, pg_restore, curl
```

### Kubernetes (Helm)
```bash
helm install mucsi96/spring-app \
  --set image=postgres-azure-backup \
  --set env.STORAGE_ACCOUNT_BLOB_URL=https://... \
  --set configFile[0].data=$(base64 < config.json)
```

## Testing

### E2E Test Suites (Playwright)
- Backup operations
- Database management
- Folder backup functionality
- Smart backup logic
- Profile management
- Database switching

### Test Setup
- Docker Compose PostgreSQL instances
- Azurite for blob storage
- Test profile (no auth)
- Direct DB queries via `pg`
- ZIP testing via `adm-zip`

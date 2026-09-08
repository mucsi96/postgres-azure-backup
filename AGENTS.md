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
| `/api/smart-backup` | POST | createBackup | Execute intelligent backup |
| `/api/database/{name}/backups` | GET | readBackups | List all backups |
| `/api/database/{name}/backup/{key}/archive` | GET | downloadBackup | Stream ZIP archive download |
| `/api/database/{name}/backup/{key}/pgdump` | GET | downloadBackup | Stream pgdump file download |
| `/api/database/{name}/backup/{key}/sql` | GET | downloadBackup | Stream SQL file download |
| `/api/database/{name}/restore/{key}` | POST | restoreBackup | Restore backup |
| `/api/database/{name}/last-backup-time` | GET | readBackups | Get last backup timestamp |

### Database Information (`DatabaseController`)

| Endpoint | Method | Auth Role | Purpose |
|----------|--------|-----------|---------|
| `/api/databases` | GET | readBackups | List databases with stats |
| `/api/database/{name}/tables` | GET | readBackups | Get tables and row counts |

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
- **Java 21** - Language level; built into a GraalVM native image
- **Spring Boot 4** - Framework
- **Spring Security** - Authentication/Authorization
- **Spring Cloud Azure** - Entra ID integration
- **Azure SDK** - Blob Storage client
- **PostgreSQL Driver** - Database connectivity
- **Lombok** - Code generation
- **Jackson** - JSON processing

### Frontend
- **Angular 20** - Framework (standalone components)
- **Angular Material** - UI components
- **angular-auth-oidc-client** - OpenID Connect authentication
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
- **PostgreSQL 18** - Database
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
- **Frontend**: `angular-auth-oidc-client` (OIDC PKCE flow)

### Roles (RBAC)
- `APPROLE_readBackups` - Read backups
- `APPROLE_createBackup` - Create backups
- `APPROLE_cleanupBackups` - Clean up backups
- `APPROLE_downloadBackup` - Download backups
- `APPROLE_restoreBackup` - Restore backups

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
│   ├── test-pod.yaml                # Podman/Kubernetes pod manifest
│   ├── traefik.yaml
│   ├── traefik-routes.yaml
│   └── databases_config.json
│
├── scripts/
│   ├── pod_up.sh                    # Build images + start the test pod
│   ├── pod_down.sh                  # Stop and clean up the test pod
│   ├── install_dependencies.sh
│   └── deploy.sh
│
├── .containerignore
└── README.md
```

## Skeleton alignment

This project follows the conventions established in
[mucsi96/skeleton-app](https://github.com/mucsi96/skeleton-app). The
shared patterns include:

- **Podman + pod manifests** instead of Docker Compose. The local /
  CI test stack is a single Kubernetes-style pod (`test/test-pod.yaml`)
  brought up with `podman kube play`.
- **Image naming**: `localhost/postgres-azure-backup-server:test` and
  `localhost/postgres-azure-backup-client:test` for local builds.
- **Traefik** as the single entry point that fronts the client and
  reverse-proxies `/api` to the server.
- **Mock OIDC provider** (`mucsi96/mock-oidc-provider`) for local /
  test authentication; production uses real Microsoft Entra ID.
- **OIDC client** (`angular-auth-oidc-client`) on the frontend (no
  MSAL).
- **Port range `xx60–xx69`** for every port the project allocates
  (see "Port Mapping" below).

## Deployment

### Local Development (Podman)

The application is run locally via Podman using the pod manifest in
`test/test-pod.yaml`:

```bash
# Build images and start the pod (rootless Podman)
scripts/pod_up.sh

# Tear it down
scripts/pod_down.sh
```

Open http://localhost:8160 once the pod is healthy.

`scripts/pod_up.sh` builds the `server` and `client` images with
`podman build`, then starts the pod with `podman kube play`. Set
`SKIP_BUILD=1` to reuse already-loaded images (used in CI after
images are loaded with `podman load`).

### Container Build
```bash
podman build --build-arg SPRING_PROFILE=test \
  -t localhost/postgres-azure-backup-server:test server
podman build -t localhost/postgres-azure-backup-client:test client
# Server multi-stage: Maven + Liberica NIK (GraalVM) → Alpine
# Client multi-stage: Node → nginx
# Server image includes pg_dump, pg_restore, psql, curl
```

#### Native image and the baked-in Spring profile

The server is compiled ahead of time into a GraalVM native executable linked
against musl, so there is no JRE in the runtime image and startup is in the
tens of milliseconds rather than seconds.

Ahead-of-time processing resolves bean definitions at build time, which
means the active Spring profile is decided by the build, not by the
environment: Spring AOT emits an `EnvironmentPostProcessor` that activates
the profile the image was built with. `SPRING_PROFILES_ACTIVE` is no longer
read at runtime, and `test/test-pod.yaml` no longer sets it. Build one image
per profile with the `SPRING_PROFILE` build argument — `test` for the e2e
pod, `prod` for the image published to Docker Hub.

Three build-time details live in `server/pom.xml` and are easy to trip over:

- AOT processing refreshes the application context, so every placeholder an
  auto-configuration condition reads has to resolve during the build. The
  `process-aot` execution supplies build-time stand-ins for them and turns
  the Key Vault property source off, so the build never reaches out to
  Azure. The stand-ins are not baked into the image; they only have to make
  the same conditions match as the real values do at runtime. A new required
  environment placeholder means adding it there too.
- Spring AOT generates bean-definition classes into the packages of the
  configuration classes it processes, including the signed Spring Cloud
  Azure jars. Mixing generated (unsigned) and signed classes in one package
  makes the native-image builder throw `SecurityException: ... signer
  information does not match`, so the builder is pointed at
  `server/native-image.security`, which disables jar signature verification.
- Jars can ship a `META-INF/native-image/.../native-image.properties` that
  forces classes to build-time initialization. When such a class holds on to
  objects of types that are still initialized at run time, the builder fails
  with `UnsupportedFeatureException: An object of type ... was found in the
  image heap`. `--initialize-at-build-time` in the `native-maven-plugin`
  config covers the Jackson core classes `azure-core` leaves behind that
  way. Note that a build cannot undo such a directive: `--exclude-config`
  does not apply to `native-image.properties`, and
  `--initialize-at-run-time` for the same class is rejected outright. That
  is why `azure-core` is pinned ahead of the version the Azure BOM selects
  — the BOM's 1.58.1 forces SLF4J and logback to build-time initialization,
  which is irreconcilable with Spring Boot setting logging up at run time.
  Check this again when the Azure BOM moves.
- The Azure SDK's `ExpandableStringEnum` constants are built by
  instantiating the subclass reflectively, and `fromString` returns `null`
  rather than failing when it cannot. Missing reflection metadata therefore
  surfaces as every constant of a class being `null` and a
  `NullPointerException` far from the cause. `AzureNativeHints` registers the
  subclasses azure-identity does not ship metadata for. This kind of problem
  only shows up in the native image, never in the AOT-on-JVM run described
  below.
- azure-core decides how to read a response body by asking the model class
  whether it declares the `fromXml` / `fromJson` pair azure-xml and
  azure-json generate, and it asks with `Class.getDeclaredMethods()`. In a
  native image that returns nothing for a class with no reachability
  metadata, so the answer is silently "no" and azure-core falls back to
  Jackson — for XML that means an `XmlMapper`, and jackson-dataformat-xml is
  not on the classpath, so the call dies with `NoClassDefFoundError: Could
  not initialize class ... JacksonAdapter$GlobalXmlMapper`. The SDK ships
  metadata for most of its models but not all: the blob error model and the
  exception carrying it are both missing, which turned every storage error
  — including the 409 `createIfNotExists` swallows on an existing container
  — into that error. `AzureNativeHints` scans `com.azure` and registers
  every `XmlSerializable`, `JsonSerializable` and `HttpResponseException`
  instead of naming the ones missing today, so an SDK upgrade cannot
  reintroduce this.

- The Key Vault property source is configured by an
  `EnvironmentPostProcessor` that runs before there is an application
  context and reads its own settings with a plain `Binder` over
  `AzureKeyVaultSecretProperties`. Nothing in the framework infers that,
  and the auto-configuration that would otherwise contribute the binding
  metadata for that type never matches here - it is conditional on
  `spring.cloud.azure.keyvault[.secret].endpoint`, while this application
  configures the endpoint under `...secret.property-sources[0]`. With no
  members in the image the binder binds nothing, and an absent binding is
  indistinguishable from an empty configuration, so the post-processor
  quietly concludes there is no property source to add. Nothing fails at
  that point: the image starts and then dies much later on the first
  secret-backed placeholder, `${storage-account-container-name}` while
  creating `backupService`. `KeyVaultPropertySourceNativeHints` supplies
  the metadata. Only the prod profile reads secrets from Key Vault, so no
  test covers this - after changing anything about the Key Vault
  configuration, check that the generated
  `target/spring-aot/main/resources/META-INF/native-image/**/reachability-metadata.json`
  still carries `AzureKeyVaultSecretProperties` and
  `AzureKeyVaultPropertySourceProperties` with their accessors.

Spring Cloud Azure needs one workaround in application code:
`AzureGlobalPropertiesConfiguration` re-declares the
`AzureGlobalProperties` bean. Spring Cloud Azure registers it from an
`ImportBeanDefinitionRegistrar` using a lambda instance supplier, which AOT
cannot turn into generated code, so it drops the bean and the image fails to
start with "required a bean of type AzureGlobalProperties that could not be
found". See the class comment for why it uses its own bean name. That
workaround turns on Spring Cloud Azure's registration order, which is not a
public contract, so smoke-test the native image whenever
`spring-cloud-azure-dependencies` moves - a change there could drop the bean
again with no compile-time signal.

The image is deliberately not built with `--static`. A fully static binary
links (given `zlib-static`, which the NIK image does not ship) but then
segfaults the moment it starts in the container - before GraalVM installs its
own segfault handler, so with no output whatsoever, which looks exactly like
a container that silently never starts.

Most AOT problems reproduce without waiting for a native compile (which
takes several minutes). Run the AOT-processed application on a normal JVM:

```bash
cd server
mvn -Pnative package -DskipTests -Dapp.profile=test
java -Dspring.aot.enabled=true -jar target/*-SNAPSHOT.jar
```

That exercises the generated context — missing bean definitions, profile
and condition mismatches — in seconds. Only class-initialization and
reflection problems need the real `mvn -Pnative native:compile`.

Types that are only ever bound reflectively — the databases config read
with a plain `ObjectMapper` — need explicit hints; see
`@RegisterReflectionForBinding` on `DatabaseConfigurationProviderConfig`.
Controller request/response types are covered by the framework's own AOT
processing and do not need hints. Types bound by a `Binder` rather
than Jackson want `BindableRuntimeHintsRegistrar`, which registers exactly
what `JavaBeanBinder` looks for over the whole class hierarchy; see
`KeyVaultPropertySourceNativeHints`.

### Release and image publishing

`publish-server` and `publish-client` each ask `mucsi96/get-next-version` for
a version. It answers from the newest `server-N` / `client-N` tag: no changes
under the component's directory since that tag means no version, and every
publish step is skipped. The release step must therefore tag the commit its
image was built from - `target_commitish: ${{ github.sha }}` - because the
action otherwise tags whatever the default branch points at when the release
is created, and the server's native build takes long enough that another push
frequently lands first. A tag left on a commit that was never built makes the
next run believe that commit is already released, so nothing is published for
it. That is silent: `deploy` resolves the newest tag on Docker Hub by
`last_updated` and succeeds, deploying the previous commit's image, so a
fix can look deployed while the running image predates it. When a change does
not reach production, check that a release tag exists on the commit and that
`publish-server` did not skip its build steps.

### Kubernetes (Helm)
```bash
helm install mucsi96/spring-app \
  --set image=postgres-azure-backup \
  --set env.STORAGE_ACCOUNT_BLOB_URL=https://... \
  --set configFile[0].data=$(base64 < config.json)
```

## Port Mapping

All host-bound and internal ports the project allocates live in the
**8160–8169** (`xx60–xx69`) range. Stock images are reconfigured
(`PGPORT`, `--blobPort`, Spring `server.port`, nginx `listen`,
Traefik entrypoints) to use these ports so that addresses are the
same inside the pod network and on the host.

| Port  | Service              | Bound to host? | Notes                                                |
| ----- | -------------------- | -------------- | ---------------------------------------------------- |
| 8160  | Traefik web entry    | yes            | Application entry point — UI + `/api` proxy         |
| 8161  | Traefik dashboard    | yes            | Traefik admin / ping endpoint                       |
| 8162  | Server actuator      | yes            | Spring Boot `management.server.port`                |
| 8163  | Azurite blob storage | yes            | Azure Blob Storage emulator (`--blobPort 8163`)     |
| 8164  | PostgreSQL `db1`     | yes            | First test database (`PGPORT=8164`)                 |
| 8165  | PostgreSQL `db2`     | yes            | Second test database (`PGPORT=8165`)                |
| 8166  | Mock OAuth2          | yes            | `mucsi96/mock-oidc-provider` (JWKS / OIDC)          |

## Testing

### E2E Test Suites (Playwright)
- Backup operations
- Database management
- Folder backup functionality
- Smart backup logic
- Profile management
- Database switching

### Test Setup
- Podman pod with two PostgreSQL containers (db1, db2)
- Azurite for blob storage
- Mock OIDC provider for authentication
- Test profile (Spring `test` profile)
- Direct DB queries via `pg` (Node.js client)
- ZIP testing via `adm-zip`

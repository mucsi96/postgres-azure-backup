# Application Architecture Guide

## Code Review Rules

- Review the PR diff for actionable correctness, security, data-loss, and deployment regressions; cite the changed file/line and concrete impact.
- Preserve authentication boundaries, persisted data compatibility, and the project's documented build/test/deploy contracts. Adapt shared patterns to this project's stack.
- Report missing behavioral coverage where it would catch a specific regression; leave formatting and mechanical checks to CI.

## Codex automation

Use native Codex GitHub reviews and `@codex` PR tasks with ChatGPT sign-in.
Setup: https://github.com/mucsi96/skeleton-app/blob/main/docs/codex-automation.md
Skeleton sync: follow `.github/prompts/sync-skeleton.md` in a weekly scheduled task.

## Architecture

React/Vite client → gateway → Rust/Loco API → configured PostgreSQL databases,
Azure Blob Storage and mounted backup folders. Follow
[skeleton-app](https://github.com/mucsi96/skeleton-app)'s lifecycle, typed settings,
thin controllers, structured tracing, workload identity and native deployment patterns.

### Backend

- `server/src/app.rs`: Loco Hooks, configuration, routes and scheduled smart backup.
- `settings.rs`, `key_vault.rs`: typed Serde configuration; production resolves
  existing Key Vault secrets with `WorkloadIdentityCredential` before boot.
- `middleware/`: RS256 JWT issuer/audience/scope/role validation and host-only
  double-submit CSRF. Bearer requests still require CSRF proof for mutations.
- `controllers.rs`: existing `/api` contracts and streamed downloads.
- `services/database.rs`: parameterized catalog queries, quoted identifiers,
  asynchronous PostgreSQL utilities. Credentials go through subprocess environment.
- `services/backup.rs`: orchestration, retention and cleanup; serializes mutations.
- `services/archives.rs`: streaming ZIP files and local folder collection/restoration.
  Reject traversal and archive links; restore only configured folders.
- `services/storage.rs`: Azure object storage, workload identity in production,
  connection-string Azurite locally. Uploads/downloads use bounded buffers.
- `services/tokens.rs`: 30-second, single-use download capabilities.
- `models.rs`: typed API payloads; `services/error.rs`: typed errors.

There are no application-owned SQL tables. Do not create framework migrations,
reset, seed or otherwise mutate the backed-up databases at startup. Catalog reads
use SQLx; backup/restore use PostgreSQL 18 `pg_dump`, `pg_restore` and `psql`.
Restore converts archives with `--no-owner --no-acl`, then drops and recreates the
configured schema in one transaction with `ON_ERROR_STOP`. Preserve application
role ownership, sequences, excluded-table definitions and other schemas.

### Persisted backup contract

- Blob prefix: database name lowercased, each non-ASCII-alphanumeric character
  replaced by `-`.
- Name: `YYYYMMdd-HHmmss.rowCount.fileCount.filesTotalSize.retention.zip` (UTC).
- ZIP: custom-format dump, plain SQL dump, and `folders/{basename}/{relativePath}`.
  Both dumps are always created, including for older config entries with
  `dumpFormat` or `createPlainDump`; those legacy fields are accepted and ignored.
- Daily retention 7 days / interval 1 day; weekly 30 / 7; monthly 356 / 30.
  Higher retention satisfies lower tiers. Cleanup runs after smart backups.
- Production smart backup starts immediately, then waits 24 hours after completion.
  Test scheduling is disabled. `BACKUP_SCHEDULE_ENABLED=false` disables production scheduling.
- The original deployment's cron variables were unused; do not document them as active.

## Frontend conventions

- Use function components, hooks, React Router, and colocated CSS Modules.
- TanStack Query owns server state; include database names in query keys and
  invalidate affected queries after mutations. Do not automatically retry mutations.
- Validate JSON API boundaries with Zod. Keep OAuth at the gateway and send the
  host-only CSRF cookie proof on same-origin mutations.
- Use `@mucsi96/react-ui` buttons with `onPress`, `isDisabled`, and semantic
  `tone="primary|success|warn|error"`. Restore uses `warn`. Import library styles
  once in `main.tsx`; use the documented palette in CSS Modules.
- Verify with lint, type checking, production build, static-hosting checks, and
  Playwright E2E tests. Do not add React unit/component tests.

## Authentication and APIs

JWTs require the configured issuer/audience, RS256 signature, expiration and
`api-access` scope. Roles: `readBackups`, `createBackup`, `restoreBackup`,
`downloadBackup`. The gateway supplies identity; the API validates it independently.
Mutations require matching `__Host-XSRF-TOKEN` cookie and `X-XSRF-TOKEN` header.
The cookie is Secure, host-only, Path=/, SameSite=Lax and readable by the client.
Only `/healthz` and single-use `/api/download/{token}` are unauthenticated.

| Endpoint | Method | Role |
|---|---|---|
| `/api/databases` | GET | readBackups |
| `/api/database/{name}/tables` | GET | readBackups |
| `/api/database/{name}/backups` | GET | readBackups |
| `/api/database/{name}/last-backup-time` | GET | readBackups |
| `/api/database/{name}/backup` | POST | createBackup |
| `/api/backup-all`, `/api/smart-backup` | POST | createBackup |
| `/api/database/{name}/restore/{key}` | POST | restoreBackup |
| `/api/database/{name}/backup/{key}/{archive\|pgdump\|sql}/download-token` | POST | downloadBackup |
| `/api/database/{name}/export-sql/download-token` | POST | downloadBackup |
| `/api/download/{token}` | GET | single-use capability |

## Build, test and deployment contracts

- Rust toolchain is pinned in `server/rust-toolchain.toml`; commit Cargo.lock.
  Run `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`,
  and `cargo build --locked` in `server`.
- Verify behavior through Playwright E2E, extending affected behavior. Do not add
  Rust unit/integration tests or React unit/component tests.
- `scripts/pod_up.sh` builds the native server and Vite client, then runs
  `podman kube play test/test-pod.yaml`. `SKIP_BUILD=1` reuses existing artifacts.
  `scripts/pod_down.sh` tears down the pod. No Docker Compose.
  Rootless tests map the API's UID 65532 to the host user with keep-id; stock
  images retain explicit root startup where their entrypoints need it.
- One native image for all environments; select `LOCO_ENV=test|production` at
  runtime. Production reads Key Vault; tests read `DATABASES_CONFIG_PATH`.
- The runtime includes PostgreSQL utilities and runs as UID/GID 65532.
- Deploy `rust-app` 7.0.0 and `static-client-app` 5.0.0 with `--reset-values`.
  Keep release names, workload identity and all three PVC bindings/mount paths.
  Preserve memory capacity for child processes. `/tmp` is a disk-backed emptyDir;
  fsGroup 65532 grants access to backup PVCs on the nonroot pod.
- `/healthz` is on the main API listener and is ready after configuration and
  OIDC discovery. There is no separate actuator listener.
  Podman uses the executable's `--healthcheck` probe; Kubernetes probes HTTP.
- Numbered GHCR publication is gated solely on `hasNextVersion`; forward the
  version directly to deployment. Use GITHUB_TOKEN with job-scoped packages:write.
  Releases target `${{ github.sha }}`. Serialize publication/rollout; use numbered
  image tags or digests. The GHCR package must support anonymous Kubernetes pulls.
- p07 owns Web auth, ForwardAuth, Redis, static storage and scoped deploy access.
  Read `forward-auth-config.auth` and `client-storage-config` at deploy time.
  No runtime client config endpoint or HTML marker. Keep build-time Faro name
  `postgres-azure-backup-client` and same-origin `/_telemetry/collect`.
- Production static documents are gateway-authenticated; assets load directly
  from Blob with app-origin CORS. Deploy clears `$web` and `assets`, uploads
  assets before index; downtime is intentional. Backups remain private.

## Ports

Allocate only 8160–8169. The test pod shares localhost networking.

| Port | Service |
|---|---|
| 8160 | Traefik application entry (host exposed) |
| 8161 | Traefik dashboard/ping (host exposed) |
| 8163 | Azurite (host exposed) |
| 8164, 8165 | PostgreSQL test databases (host exposed) |
| 8166 | Mock OIDC provider (host exposed) |
| 8168 | Rust API and readiness (pod only) |
| 8169 | Optional Vite dev/preview |

The production chart uses its standard internal API port 8080.

# Playwright Tests - TypeScript Version

This directory contains the TypeScript version of the Playwright tests for the Postgres Backup Tool.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Podman installed (for the test environment)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in headed mode (with browser UI)
```bash
npm run test:headed
```

### Run tests in debug mode
```bash
npm run test:debug
```

### Run tests with UI mode
```bash
npm run test:ui
```

### View test report
```bash
npm run test:report
```

## Test Structure

- `tests/` - Contains all test files
  - `test_backups.spec.ts` - Tests for backup functionality
  - `test_database.spec.ts` - Tests for database operations
  - `test_databases.spec.ts` - Tests for databases listing
  - `test_profile.spec.ts` - Tests for user profile functionality
- `fixtures.ts` - Custom test fixtures with automatic setup/teardown
- `utils.ts` - Helper functions and utilities
- `playwright.config.ts` - Playwright configuration

## Environment Setup

The tests expect the following services to be running:
- Application (Traefik web entry) on http://localhost:8150
- Traefik dashboard on http://localhost:8151
- Server actuator on http://localhost:8152
- Azure Blob Storage emulator (Azurite) on http://localhost:10050
- PostgreSQL databases on ports 5451 (db1) and 5452 (db2)
- Mock OAuth2 provider on http://localhost:8050

Start the Podman pod from the repository root before running the tests:

```bash
scripts/pod_up.sh
```

When you are done, tear it down with:

```bash
scripts/pod_down.sh
```

## Configuration

The tests are configured to:
- Use Chromium browser by default
- Ignore HTTPS errors
- Record HAR files for debugging
- Take screenshots on failure
- Record videos on failure

You can modify these settings in `playwright.config.ts`.

## Differences from Python Version

This TypeScript version maintains the same test coverage and functionality as the original Python pytest version, with the following improvements:

1. **Type Safety**: Full TypeScript type checking for better code reliability
2. **Modern Async/Await**: Native async/await syntax throughout
3. **Better IDE Support**: Enhanced IntelliSense and code completion
4. **Playwright Native**: Uses Playwright's native TypeScript API
5. **Automatic Fixtures**: Uses Playwright's fixture system for automatic setup/teardown per test instead of global setup

## Test Fixtures

The tests use Playwright's automatic fixture system defined in `fixtures.ts`. The `setupTestEnvironment` fixture automatically runs before each test to:
- Set up environment variables for SSL/TLS
- Clean up and create initial backups
- Reset and populate the database

This ensures each test runs in a clean, isolated environment without requiring manual setup or teardown.

## Troubleshooting

For database connection issues, verify that:
- PostgreSQL containers are running on the correct ports
- Database credentials match those in the test configuration

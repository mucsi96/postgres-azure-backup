#!/bin/bash
set -e

# Create test directories with proper permissions
echo "Creating test directories with proper permissions..."

ensure_dir() {
  local dir=$1
  local perms=$2
  mkdir -p "$dir"
  if [ "$(stat -c "%a" "$dir")" != "$perms" ]; then
    echo "Setting permissions $perms for $dir"
    chmod "$perms" "$dir"
  fi
}

ensure_dir "/tmp/test-uploads" "777"
ensure_dir "/tmp/test-documents" "777"

# Start Docker Compose with different flags based on environment
echo "Starting Docker Compose services..."
if [ -n "$CI" ]; then
  # CI environment: simpler flags
  docker compose up --build --wait
else
  # Local development: full set of flags
  docker compose up --build --force-recreate --wait --remove-orphans --pull always
fi

echo "Docker Compose services are ready!"

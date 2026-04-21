#!/bin/bash
set -e

# Create test directories with proper permissions
echo "Creating test directories with proper permissions..."
mkdir -m 777 -p "/tmp/test-uploads"
mkdir -m 777 -p "/tmp/test-documents"

# Export UID and GID for docker-compose
export USER_ID=$(id -u)
export GROUP_ID=$(id -g)

echo "Running Docker Compose as UID=$USER_ID GID=$GROUP_ID"

# Start Docker Compose with different flags based on environment
echo "Starting Docker Compose services..."
if [ "${SKIP_BUILD:-}" = "1" ]; then
  docker compose up --wait
elif [ -n "$CI" ]; then
  docker compose up --build --wait
else
  docker compose up --build --force-recreate --wait --remove-orphans --pull always
fi

echo "Docker Compose services are ready!"

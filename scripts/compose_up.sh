#!/bin/bash
set -e

# Clean up test directories
echo "Cleaning up test directories..."
rm -rf /tmp/test-uploads
rm -rf /tmp/test-documents

# Create test directories with proper permissions
echo "Creating test directories with proper permissions..."
mkdir -p /tmp/test-uploads
mkdir -p /tmp/test-documents
chmod 777 /tmp/test-uploads
chmod 777 /tmp/test-documents

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

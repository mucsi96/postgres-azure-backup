#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POD_NAME="postgres-azure-backup-test"
POD_YAML="$PROJECT_DIR/test/test-pod.yaml"
MAX_WAIT=180

echo "Creating test directories with proper permissions..."
mkdir -m 777 -p "/tmp/test-uploads"
mkdir -m 777 -p "/tmp/test-documents"

if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "Skipping image build (SKIP_BUILD=1)..."
else
  echo "Building container images..."
  podman build -t localhost/postgres-azure-backup-server:test "$PROJECT_DIR/server" &
  podman build -t localhost/postgres-azure-backup-client:test "$PROJECT_DIR/client" &
  wait
fi

echo "Cleaning up existing pod..."
podman kube down "$POD_YAML" 2>/dev/null || true

echo "Starting pod..."
cd "$PROJECT_DIR"
podman kube play "$POD_YAML"

echo "Waiting for all containers to become healthy..."
CONTAINERS=$(podman pod inspect "$POD_NAME" --format '{{range .Containers}}{{.Name}} {{end}}')

for container in $CONTAINERS; do
  if echo "$container" | grep -q "infra"; then
    continue
  fi
  echo "  Waiting for $container..."
  ELAPSED=0
  while true; do
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
      echo "Timeout waiting for $container to become healthy"
      for c in $CONTAINERS; do
        echo "=== $c ==="
        podman logs "$c" 2>&1 | tail -40
      done
      exit 1
    fi
    STATUS=$(podman inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")
    if [ "$STATUS" = "healthy" ]; then
      echo "  $container is healthy"
      break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done
done

echo "All services are ready!"

#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POD_YAML="$PROJECT_DIR/test/test-pod.yaml"

echo "Stopping pod..."
podman kube down "$POD_YAML" 2>/dev/null || true

echo "Pod stopped and cleaned up."

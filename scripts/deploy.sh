#!/bin/bash

set -euo pipefail

: "${AZURE_KEYVAULT_NAME:?Environment variable AZURE_KEYVAULT_NAME is required}"
: "${SERVER_IMAGE:?Set the versioned server image to deploy}"
if [[ ! "$SERVER_IMAGE" =~ ^ghcr\.io/.+(:[1-9][0-9]*|@sha256:[a-f0-9]{64})$ ]]; then
    printf '%s\n' 'SERVER_IMAGE must use GHCR with a release version or sha256 digest.' >&2
    exit 1
fi

AZURE_KEYVAULT_ENDPOINT="https://${AZURE_KEYVAULT_NAME}.vault.azure.net/"
SERVER_RELEASE_NAME=postgres-azure-backup-server
CLIENT_RELEASE_NAME=postgres-azure-backup-client

# Create a temporary file in /dev/shm (RAM) to avoid writing to disk
KUBECONFIG=$(mktemp /dev/shm/kubeconfig.XXXXXX)
export KUBECONFIG

# Ensure the temporary file is deleted when the script exits
trap 'rm -f "$KUBECONFIG"' EXIT

"$(dirname "$0")/pull_kubeconfig.sh"

HOSTNAME=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name hostname --query value -o tsv)
API_CLIENT_ID=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name api-client-id --query value -o tsv)
AUTH_CONFIG=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name forward-auth-config --query value -o tsv)
AUTH_RELEASE=$(jq -er '.release_name | select(type == "string" and length > 0)' <<<"$AUTH_CONFIG")
PROXY_AUTH=$(jq -ce '.auth | select(.proxyService | type == "string" and length > 0) | select(.proxyPort | type == "number") | select(.mode == "api-token")' <<<"$AUTH_CONFIG")
CLIENT_STORAGE_CONFIG=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name client-storage-config --query value -o tsv)
CLIENT_ORIGIN=$(jq -er '.hostname | select(test("^[a-z0-9.-]+\\.web\\.core\\.windows\\.net$"))' <<<"$CLIENT_STORAGE_CONFIG")

echo "Updating Helm repositories..."
# The mucsi96 charts no longer bundle Prometheus exporter sidecars or
# ServiceMonitors (client-app >= 22.0.0, spring-app >= 30.0.0, node-app >= 20.0.0).
# This deploy rolls out the updated charts and drops those containers.
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=37.0.0
staticClientAppChartVersion=5.0.0
helm status "$AUTH_RELEASE" --namespace backup >/dev/null
helm show chart mucsi96/spring-app --version "$springAppChartVersion" >/dev/null
helm show chart mucsi96/static-client-app --version "$staticClientAppChartVersion" >/dev/null

# The server is a GraalVM native image: 77Mi resident at idle in production
# (metrics-server, 2026-09-01), where this cluster's JVM services sit at
# 380-660Mi. It streams dumps and blobs through temp files instead of buffering
# them, so the heap stays small. The 150Mi this sizing originally assumed was an
# estimate; the request follows the measurement.
#
# The request is sized for idle on purpose. It is what the scheduler reserves
# around the clock, and a backup is a few minutes a day - reserving its peak
# would take capacity from workloads that need it continuously.
#
# The limit is the opposite question and stays where it is. It has to cover the
# idle footprint, the 256Mi heap the image is capped at (see the ENTRYPOINT in
# server/Dockerfile - keep the two in step) and the pg_dump / pg_restore / psql
# child processes, which share this cgroup. No backup's peak has been measured,
# pg_dump's own use is not constant - large objects and wide rows push it up -
# and an OOM kill would land mid-backup, so idle numbers are not grounds to cut
# it.
#
# No CPU limit. pg_dump, pg_restore and psql run as child processes inside the
# same cgroup, so a quota is shared with whatever is doing the actual work, and
# CFS throttling would stretch a backup out even on an idle node. CPU is
# compressible, so the request still gives the pod its share under contention -
# which is why the 50m request is not cut to the 1m seen at idle either. It is
# the share the pod is guaranteed while pg_dump runs, and idle CPU says nothing
# about that. null deletes the chart's default rather than overriding it.
echo "Deploying server: $SERVER_IMAGE using spring-app chart $springAppChartVersion"
helm upgrade $SERVER_RELEASE_NAME mucsi96/spring-app \
    --install \
    --namespace backup \
    --reset-values \
    --version $springAppChartVersion \
    --set-string image="$SERVER_IMAGE" \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=postgres-azure-backup-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set-json auth="$PROXY_AUTH" \
    --set persistentVolumeClaims[0].name=learn-language-backup-pvc \
    --set persistentVolumeClaims[0].accessMode=ReadWriteOnce \
    --set persistentVolumeClaims[0].volumeName=learn-language-backup \
    --set persistentVolumeClaims[0].mountPath=/app/storage/learn-language \
    --set persistentVolumeClaims[0].storageClassName="" \
    --set persistentVolumeClaims[0].storage=5Gi \
    --set persistentVolumeClaims[1].name=library-backup-pvc \
    --set persistentVolumeClaims[1].accessMode=ReadWriteOnce \
    --set persistentVolumeClaims[1].volumeName=library-backup \
    --set persistentVolumeClaims[1].mountPath=/app/storage/library \
    --set persistentVolumeClaims[1].storageClassName="" \
    --set persistentVolumeClaims[1].storage=5Gi \
    --set persistentVolumeClaims[2].name=cooking-backup-pvc \
    --set persistentVolumeClaims[2].accessMode=ReadWriteOnce \
    --set persistentVolumeClaims[2].volumeName=cooking-backup \
    --set persistentVolumeClaims[2].mountPath=/app/storage/cooking \
    --set persistentVolumeClaims[2].storageClassName="" \
    --set persistentVolumeClaims[2].storage=5Gi \
    --set resources.requests.memory=128Mi \
    --set resources.requests.cpu=50m \
    --set resources.limits.memory=512Mi \
    --set resources.limits.cpu=null \
    --wait

echo "Deploying static client using static-client-app chart $staticClientAppChartVersion"

helm upgrade $CLIENT_RELEASE_NAME mucsi96/static-client-app \
    --install \
    --namespace backup \
    --reset-values \
    --version $staticClientAppChartVersion \
    --set-string staticOrigin="$CLIENT_ORIGIN" \
    --set host=$HOSTNAME \
    --set entryPoint=web \
    --set-json auth="$PROXY_AUTH" \
    --wait

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
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

serverChartVersion=7.0.0
staticClientAppChartVersion=5.0.0
helm status "$AUTH_RELEASE" --namespace backup >/dev/null
helm show chart mucsi96/rust-app --version "$serverChartVersion" >/dev/null
helm show chart mucsi96/static-client-app --version "$staticClientAppChartVersion" >/dev/null

# Keep capacity for PostgreSQL subprocesses; stream archives through disk.
echo "Deploying server: $SERVER_IMAGE using rust-app chart $serverChartVersion"
helm upgrade $SERVER_RELEASE_NAME mucsi96/rust-app \
    --install \
    --namespace backup \
    --reset-values \
    --version $serverChartVersion \
    --set-string image="$SERVER_IMAGE" \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=postgres-azure-backup-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set env.LOCO_ENV=production \
    --set podSecurityContext.fsGroup=65532 \
    --set-json 'extraVolumes=[{"name":"temporary-files","emptyDir":{}}]' \
    --set-json 'extraVolumeMounts=[{"name":"temporary-files","mountPath":"/tmp"}]' \
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

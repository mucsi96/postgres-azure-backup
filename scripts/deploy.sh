#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

: "${AZURE_KEYVAULT_NAME:?Environment variable AZURE_KEYVAULT_NAME is required}"
: "${DOCKERHUB_USERNAME:?Environment variable DOCKERHUB_USERNAME is required}"

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

# Get latest tags for both server and client
serverLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/postgres-azure-backup-server/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')
clientLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/postgres-azure-backup-client/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')

echo "Updating Helm repositories..."
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=$(helm search repo mucsi96/spring-app --output json | jq -r '.[0].version')
clientAppChartVersion=$(helm search repo mucsi96/client-app --output json | jq -r '.[0].version')

echo "Deploying server: $DOCKERHUB_USERNAME/postgres-azure-backup-server:$serverLatestTag using spring-app chart $springAppChartVersion"
helm upgrade $SERVER_RELEASE_NAME mucsi96/spring-app \
    --install \
    --version $springAppChartVersion \
    --set image=$DOCKERHUB_USERNAME/postgres-azure-backup-server:$serverLatestTag \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=postgres-azure-backup-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set env.CLIENT_APP_NAME=$CLIENT_RELEASE_NAME \
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
    --set resources.requests.memory=512Mi \
    --set resources.requests.cpu=50m \
    --set resources.limits.memory=1Gi \
    --set resources.limits.cpu=500m \
    --wait

echo "Deploying client: $DOCKERHUB_USERNAME/postgres-azure-backup-client:$clientLatestTag using client-app chart $clientAppChartVersion"

helm upgrade $CLIENT_RELEASE_NAME mucsi96/client-app \
    --install \
    --version $clientAppChartVersion \
    --set image=$DOCKERHUB_USERNAME/postgres-azure-backup-client:$clientLatestTag \
    --set host=$HOSTNAME \
    --set entryPoint=web \
    --wait

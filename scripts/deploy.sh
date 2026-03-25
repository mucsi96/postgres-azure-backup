#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

: "${K8S_CONFIG:?Environment variable K8S_CONFIG is required}"
: "${HOSTNAME:?Environment variable HOSTNAME is required}"
: "${API_CLIENT_ID:?Environment variable API_CLIENT_ID is required}"
: "${DOCKERHUB_USERNAME:?Environment variable DOCKERHUB_USERNAME is required}"

# Create a temporary file in /dev/shm (RAM) to avoid writing to disk
KUBECONFIG_FILE=$(mktemp /dev/shm/kubeconfig.XXXXXX)
chmod 600 "$KUBECONFIG_FILE"
echo "$K8S_CONFIG" > "$KUBECONFIG_FILE"
export KUBECONFIG="$KUBECONFIG_FILE"

# Ensure the temporary file is deleted when the script exits
trap 'rm -f "$KUBECONFIG_FILE"' EXIT

# Get latest tags for both server and client
serverLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/postgres-azure-backup-server/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')
clientLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/postgres-azure-backup-client/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')

echo "Updating Helm repositories..."
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=$(helm search repo mucsi96/spring-app --output json | jq -r '.[0].version')
clientAppChartVersion=$(helm search repo mucsi96/client-app --output json | jq -r '.[0].version')

echo "Deploying server: $DOCKERHUB_USERNAME/postgres-azure-backup-server:$serverLatestTag to $HOSTNAME using spring-app chart $springAppChartVersion"
helm upgrade postgres-azure-backup-server mucsi96/spring-app \
    --install \
    --version $springAppChartVersion \
    --namespace backup \
    --set image=$DOCKERHUB_USERNAME/postgres-azure-backup-server:$serverLatestTag \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=postgres-azure-backup-api-workload-identity \
    --set persistentVolumeClaims[0].name=learn-language-backup-pvc \
    --set persistentVolumeClaims[0].accessMode=ReadWriteOnce \
    --set persistentVolumeClaims[0].volumeName=learn-language-backup \
    --set persistentVolumeClaims[0].mountPath=/app/storage/learn-language \
    --set persistentVolumeClaims[0].storageClassName="" \
    --set persistentVolumeClaims[0].storage=5Gi \
    --set resources.requests.memory=512Mi \
    --set resources.requests.cpu=500m \
    --set resources.limits.memory=1Gi \
    --set resources.limits.cpu=1 \
    --wait

echo "Deploying client: $DOCKERHUB_USERNAME/postgres-azure-backup-client:$clientLatestTag to $HOSTNAME using client-app chart $clientAppChartVersion"

helm upgrade postgres-azure-backup-client mucsi96/client-app \
    --install \
    --version $clientAppChartVersion \
    --namespace backup \
    --set image=$DOCKERHUB_USERNAME/postgres-azure-backup-client:$clientLatestTag \
    --set host=$HOSTNAME \
    --set entryPoint=web \
    --wait

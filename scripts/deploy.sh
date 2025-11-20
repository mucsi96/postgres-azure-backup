#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

# Detect if running on Ubuntu
if [ "$(uname -s)" = "Linux" ] && [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" = "ubuntu" ]; then
        echo "Running on Ubuntu. Checking dependencies..."

        # Check and install jq
        if ! command -v jq &> /dev/null; then
            echo "Installing jq..."
            sudo apt-get install -y jq
        else
            echo "jq is already installed."
        fi
    fi
fi

dnsZone=$(az keyvault secret show --vault-name p06 --name dns-zone --query value --output tsv)
storageAccountBlobUrl=$(az storage account show --name ibari --resource-group ibari --query "primaryEndpoints.blob" --output tsv)
apiClientId=$(az keyvault secret show --vault-name p06 --name backup-api-client-id --query value --output tsv)
spaClientId=$(az keyvault secret show --vault-name p06 --name backup-spa-client-id --query value --output tsv)
db_username=$(az keyvault secret show --vault-name p06 --name db-username --query value -o tsv)
db_password=$(az keyvault secret show --vault-name p06 --name db-password --query value -o tsv)
latestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/mucsi96/postgres-azure-backup/tags/" | jq -r '.results |  map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')
chartVersion=21.0.0 #https://github.com/mucsi96/k8s-helm-charts/releases

# Get volume name from the PVC in learn-language namespace
learnLanguageVolumeName=$(kubectl --kubeconfig .kube/config get pvc learn-language-pvc -n learn-language -o jsonpath='{.spec.volumeName}')

# Construct databases configuration in memory
databases_config=$(cat <<EOF
[
  {
    "name": "Learn language",
    "host": "postgres1.db",
    "port": 5432,
    "database": "postgres1",
    "schema": "learn_language",
    "username": "$db_username",
    "password": "$db_password",
    "createPlainDump": true,
    "folderBackups": [
      {
        "path": "/app/storage/learn-language"
      }
    ]
  }
]
EOF
)

echo "Updating Helm repositories..."

helm repo update

echo "Deploying mucsi96/postgres-azure-backup:$latestTag to https://backup.$dnsZone using spring-app chart $chartVersion"

helm upgrade postgres-azure-backup mucsi96/spring-app \
    --install \
    --version $chartVersion \
    --kubeconfig .kube/config \
    --namespace backup \
    --set image=mucsi96/postgres-azure-backup:$latestTag \
    --set entryPoint=web \
    --set host=backup.$dnsZone \
    --set clientId=$apiClientId \
    --set serviceAccountName=postgres-azure-backup-api-workload-identity \
    --set env.STORAGE_ACCOUNT_BLOB_URL=$storageAccountBlobUrl \
    --set env.STORAGE_ACCOUNT_CONTAINER_NAME=backups \
    --set env.DATABASES_CONFIG_PATH=/app/databases_config.json \
    --set env.UI_CLIENT_ID=$spaClientId \
    --set persistentVolumes[0].name=$learnLanguageVolumeName \
    --set persistentVolumes[0].mountPath=/app/storage/learn-language \
    --set configFile[0].name=databases_config.json \
    --set configFile[0].mountPath=/app/databases_config.json \
    --set "configFile[0].data=$(echo "$databases_config" | base64)" \
    --wait

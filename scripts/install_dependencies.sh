#!/usr/bin/env bash

set -e  # Exit immediately if a command exits with a non-zero status

source .venv/bin/activate

spaClientId=$(az keyvault secret show --vault-name p06 --name backup-spa-client-id --query value -o tsv)
apiClientId=$(az keyvault secret show --vault-name p06 --name backup-api-client-id --query value -o tsv)
tenantId=$(az keyvault secret show --vault-name p06 --name tenant-id --query value -o tsv)

echo "NG_APP_TENANT_ID=$tenantId" > client/.env
echo "NG_APP_CLIENT_ID=$spaClientId" >> client/.env
echo "NG_APP_API_CLIENT_ID=$apiClientId" >> client/.env


pip install -r requirements.txt

cd server && mvn clean install && cd ..
cd client && npm install && cd ..
cd test && npm install && npx playwright install --with-deps chromium && cd ..

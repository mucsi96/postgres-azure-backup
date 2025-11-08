#!/usr/bin/env bash

set -e  # Exit immediately if a command exits with a non-zero status

db_k8s_config=$(az keyvault secret show --vault-name p06 --name db-namespace-k8s-user-config --query value -o tsv)

kubectl --kubeconfig <(echo "$db_k8s_config") port-forward services/postgres1 5461:http --namespace db

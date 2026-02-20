#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

mkdir -p .kube

az keyvault secret show --vault-name p06-backup --name k8s-config --query value --output tsv > .kube/config

chmod 0600 .kube/config

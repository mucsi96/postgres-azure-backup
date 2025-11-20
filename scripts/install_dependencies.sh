#!/bin/sh

set -e  # Exit immediately if a command exits with a non-zero status

# Detect if running on Ubuntu
if [ "$(uname -s)" = "Linux" ] && [ -f /etc/os-release ]; then
    . /etc/os-release
    if [ "$ID" = "ubuntu" ]; then
        echo "Running on Ubuntu. Checking dependencies..."

        # Check and install azure-cli
        if ! command -v az >/dev/null 2>&1; then
            echo "Installing Azure CLI..."
            curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
        else
            echo "Azure CLI is already installed."
        fi

        # Check and install helm
        if ! command -v helm >/dev/null 2>&1; then
            echo "Installing Helm..."
            sudo snap install helm --classic
        else
            echo "Helm is already installed."
        fi

        # Check and install kubectl
        if ! command -v kubectl >/dev/null 2>&1; then
            echo "Installing kubectl..."
            sudo snap install kubectl --classic
        else
            echo "kubectl is already installed."
        fi

        # Check and install JDK
        if ! command -v java >/dev/null 2>&1; then
            echo "Installing JDK..."
            if ! apt-cache show temurin-21-jdk >/dev/null 2>&1; then
                echo "Adding Eclipse Adoptium repository for Temurin..."
                if [ ! -f /usr/share/keyrings/adoptium-archive-keyring.gpg ]; then
                    curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public \
                        | sudo gpg --dearmor -o /usr/share/keyrings/adoptium-archive-keyring.gpg
                fi
                echo "deb [signed-by=/usr/share/keyrings/adoptium-archive-keyring.gpg] https://packages.adoptium.net/artifactory/deb ${VERSION_CODENAME:-$(lsb_release -cs)} main" \
                    | sudo tee /etc/apt/sources.list.d/adoptium.list >/dev/null
            fi
            sudo apt-get update
            sudo apt-get install -y temurin-21-jdk
        else
            echo "JDK is already installed."
        fi

        # Check and install Maven
        if ! command -v mvn >/dev/null 2>&1; then
            echo "Installing Maven..."
            sudo apt-get install -y maven
        else
            echo "Maven is already installed."
        fi

        # Check and install angular-cli
        if ! command -v ng >/dev/null 2>&1; then
            echo "Installing Angular CLI..."
            sudo npm install -g @angular/cli
        else
            echo "Angular CLI is already installed."
        fi
    fi
fi

echo "Building server..."
cd server && mvn clean install && cd ..

echo "Installing client dependencies..."
cd client && npm install && cd ..

echo "Installing test dependencies..."
cd test && npm install && npx playwright install --with-deps chromium && cd ..

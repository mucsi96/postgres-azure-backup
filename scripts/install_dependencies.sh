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

        # Check and install jq
        if ! command -v jq >/dev/null 2>&1; then
            echo "Installing jq..."
            sudo apt-get install -y jq
        else
            echo "jq is already installed."
        fi

        # Check and install podman
        if ! command -v podman >/dev/null 2>&1; then
            echo "Installing Podman..."
            sudo apt-get install -y podman
        else
            echo "Podman is already installed."
        fi

        # Enable lingering and Podman socket for rootless Podman
        loginctl enable-linger "$(whoami)" 2>/dev/null || true
        systemctl --user enable --now podman.socket 2>/dev/null || true

        # Check and install SDKMAN
        if [ ! -d "$HOME/.sdkman" ]; then
            echo "Installing SDKMAN..."
            curl -s "https://get.sdkman.io" | bash
        else
            echo "SDKMAN is already installed."
        fi

        # Source SDKMAN
        export SDKMAN_DIR="$HOME/.sdkman"
        [ -s "$SDKMAN_DIR/bin/sdkman-init.sh" ] && . "$SDKMAN_DIR/bin/sdkman-init.sh"

        # Check and install JDK via SDKMAN
        if ! sdk list java | grep -q "21.*tem.*installed"; then
            echo "Installing JDK 21 via SDKMAN..."
            sdk install java 21-tem
        else
            echo "JDK 21 is already installed."
        fi

        # Check and install Maven via SDKMAN
        if ! command -v mvn >/dev/null 2>&1; then
            echo "Installing Maven via SDKMAN..."
            sdk install maven
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

        # Check and install PostgreSQL client
        if ! command -v psql >/dev/null 2>&1; then
            echo "Installing PostgreSQL client..."
            sudo apt-get install -y postgresql-common
            yes | sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
            sudo apt-get install -y postgresql-client-18
        else
            echo "PostgreSQL client is already installed."
        fi
    fi
fi

echo "Building server..."
cd server && mvn clean install && cd ..

echo "Installing client dependencies..."
cd client && npm install && cd ..

echo "Installing test dependencies..."
cd test && npm install && npx playwright install --with-deps chromium && cd ..

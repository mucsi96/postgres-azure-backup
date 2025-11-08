#!/usr/bin/env bash

set -e  # Exit immediately if a command exits with a non-zero status

cd server && mvn clean install && cd ..
cd client && npm install && cd ..
cd test && npm install && npx playwright install --with-deps chromium && cd ..

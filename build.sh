#!/usr/bin/env bash
set -e

echo "=== Installing client dependencies ==="
cd client
NODE_ENV=development npm install --prefer-offline

echo "=== Building React frontend ==="
./node_modules/.bin/vite build

echo "=== Installing server dependencies ==="
cd ../server
npm install

echo "=== Build complete ==="

#!/usr/bin/env bash
set -e

echo "=== Installing client dependencies ==="
cd client
NODE_ENV=development npm install

echo "=== Building React frontend ==="
npm run build

echo "=== Installing server dependencies ==="
cd ../server
npm install

echo "=== Build complete ==="

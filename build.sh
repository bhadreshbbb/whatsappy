#!/usr/bin/env bash
set -e

echo "=== Installing client dependencies ==="
cd client
npm install --include=dev

echo "=== Building React frontend ==="
npm run build

echo "=== Installing server dependencies ==="
cd ../server
npm install

echo "=== Build complete ==="

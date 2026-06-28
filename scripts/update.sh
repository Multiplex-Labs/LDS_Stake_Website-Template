#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "Pulling latest images..."
docker compose pull

echo "Restarting services with new images..."
docker compose up -d --remove-orphans

echo "Pruning dangling images..."
docker image prune -f

echo "Current service status:"
docker compose ps

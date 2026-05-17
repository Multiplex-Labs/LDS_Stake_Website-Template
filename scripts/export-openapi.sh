#!/usr/bin/env bash
# Exports the FastAPI OpenAPI spec from a running backend to docs/api-reference/openapi.json.
# Usage: ./scripts/export-openapi.sh [backend-url]
# Default backend URL: http://localhost:8000
# Must be run from the repository root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_URL="${1:-http://localhost:8000}"
OUTPUT="$REPO_ROOT/docs/api-reference/openapi.json"

mkdir -p "$(dirname "$OUTPUT")"

echo "Fetching OpenAPI spec from $BACKEND_URL/openapi.json ..."
curl -sSf "$BACKEND_URL/openapi.json" -o "$OUTPUT"
echo "Written to $OUTPUT"

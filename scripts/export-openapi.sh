#!/usr/bin/env bash
# Exports the FastAPI OpenAPI spec from a running backend to docs/api-reference/openapi.json.
# Usage: ./scripts/export-openapi.sh [backend-url]
# Default backend URL: http://localhost:8000

set -euo pipefail

BACKEND_URL="${1:-http://localhost:8000}"
OUTPUT="docs/api-reference/openapi.json"

mkdir -p "$(dirname "$OUTPUT")"

echo "Fetching OpenAPI spec from $BACKEND_URL/openapi.json ..."
curl -sSf "$BACKEND_URL/openapi.json" -o "$OUTPUT"
echo "Written to $OUTPUT"

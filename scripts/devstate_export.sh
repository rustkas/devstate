#!/usr/bin/env bash
set -euo pipefail

# Export .trae/state.json and .trae/history.json from running DevState HTTP server

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DEVSTATE_URL="${DEVSTATE_URL:-http://localhost:3180}"

cd "$ROOT_DIR"

echo "[INFO] Exporting via HTTP: ${DEVSTATE_URL}/v1/devstate/export"
if ! curl -sf "${DEVSTATE_URL}/v1/devstate/export" -H 'Accept: application/json' > /tmp/devstate_export.json; then
  echo "[WARN] Export via ${DEVSTATE_URL} failed, trying http://localhost:3080"
  DEVSTATE_URL="http://localhost:3080"
  curl -sf "${DEVSTATE_URL}/v1/devstate/export" -H 'Accept: application/json' > /tmp/devstate_export.json
fi

echo "[OK] Export complete: .trae/state.json and .trae/history.json"

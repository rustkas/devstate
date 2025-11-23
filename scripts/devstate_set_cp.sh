#!/usr/bin/env bash
set -euo pipefail

# Usage: devstate/scripts/devstate_set_cp.sh CP=CP1-LC
# Updates DevState current_cp via HTTP API, verifies, and exports .trae/*

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DEVSTATE_URL="${DEVSTATE_URL:-http://localhost:3180}"

CP_ARG=${1:-}
if [[ -z "$CP_ARG" || "$CP_ARG" != CP*=* ]]; then
  echo "Usage: devstate/scripts/devstate_set_cp.sh CP=CP1-LC" >&2
  exit 1
fi

CP_VALUE="${CP_ARG#CP=}"

echo "[INFO] Setting current_cp=${CP_VALUE} via ${DEVSTATE_URL}/v1/devstate/state"
PAYLOAD=$(cat <<JSON
{ "current_cp": "${CP_VALUE}" }
JSON
)

if ! curl -sf -X POST "${DEVSTATE_URL}/v1/devstate/state" \
  -H 'Content-Type: application/json' \
  -d "${PAYLOAD}" > /tmp/devstate_set_cp_response.json; then
  echo "[WARN] POST failed on ${DEVSTATE_URL}, trying http://localhost:3080" >&2
  DEVSTATE_URL="http://localhost:3080"
  curl -sf -X POST "${DEVSTATE_URL}/v1/devstate/state" \
    -H 'Content-Type: application/json' \
    -d "${PAYLOAD}" > /tmp/devstate_set_cp_response.json
fi

echo "[INFO] Verifying HMAC chain"
"${ROOT_DIR}/scripts/devstate_verify.sh"

echo "[INFO] Exporting .trae/*"
"${ROOT_DIR}/scripts/devstate_export.sh"

echo "[OK] CP set to ${CP_VALUE}. Export complete."
echo "[HINT] If Router is running, restart or signal reload to pick up new state."

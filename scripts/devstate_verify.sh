#!/usr/bin/env bash
set -euo pipefail

# Verify DevState HMAC chain via HTTP

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
DEVSTATE_URL="${DEVSTATE_URL:-http://localhost:3180}"

cd "$ROOT_DIR"

echo "[INFO] Verifying HMAC chain at ${DEVSTATE_URL}/v1/devstate/verify"
if ! curl -sf "${DEVSTATE_URL}/v1/devstate/verify" -H 'Accept: application/json' > /tmp/devstate_verify.json; then
  echo "[WARN] Verify via ${DEVSTATE_URL} failed, trying http://localhost:3080"
  DEVSTATE_URL="http://localhost:3080"
  curl -sf "${DEVSTATE_URL}/v1/devstate/verify" -H 'Accept: application/json' > /tmp/devstate_verify.json
fi

if grep -q '"error": true' /tmp/devstate_verify.json; then
  echo "[FAIL] HMAC chain verification failed" >&2
  cat /tmp/devstate_verify.json >&2
  exit 2
fi

echo "[OK] HMAC chain verified"

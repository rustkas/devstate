#!/usr/bin/env bash
set -euo pipefail

CMD=${1:-help}

ROOT_DIR=$(cd "$(dirname "$0")"/.. && pwd)
MNESIA_DIR=${MNESIA_DIR:-"$ROOT_DIR/.trae/mnesia"}
STATE_PATH=${STATE_PATH:-"$ROOT_DIR/.trae/state.json"}
HISTORY_PATH=${HISTORY_PATH:-"$ROOT_DIR/.trae/history.json"}
TMP_STATE=${TMP_STATE:-"$ROOT_DIR/.trae/state.json.tmp"}
TMP_HISTORY=${TMP_HISTORY:-"$ROOT_DIR/.trae/history.json.tmp"}

ERL_NODE_NAME=${ERL_NODE_NAME:-devstate_dev}
ERL_COOKIE=${ERL_COOKIE:-devstate_cookie}

erl_eval() {
  local eval=$1
  erl -noshell \
    -sname "$ERL_NODE_NAME" \
    -setcookie "$ERL_COOKIE" \
    -pa "$ROOT_DIR/_build/test/extras" \
    -mnesia dir '"$MNESIA_DIR"' \
    -eval "$eval" \
    -s init stop
}

cmd_import() {
  echo "[DevState] Importing state and history into Mnesia..."
  erl_eval "
    try 
      beamline_state:init(),
      beamline_history:init(),
      beamline_state:import_file(\"$STATE_PATH\"),
      beamline_history:import_file(\"$HISTORY_PATH\")
    catch C:R -> io:format(\"Import failed: ~p:~p\\n\", [C,R])
    end.
  "
  echo "[DevState] Import completed."
}

cmd_export() {
  echo "[DevState] Exporting state and history to .tmp..."
  erl_eval "
    try 
      beamline_state:init(),
      beamline_history:init(),
      beamline_state:export_file(\"$TMP_STATE\"),
      beamline_history:export_file(\"$TMP_HISTORY\")
    catch C:R -> io:format(\"Export failed: ~p:~p\\n\", [C,R])
    end.
  "
  echo "[DevState] Export completed."
}

cmd_verify() {
  echo "[DevState] Running import before export..."
  cmd_import
  cmd_export
  echo "[DevState] Verifying .tmp files..."
  for f in "$TMP_STATE" "$TMP_HISTORY"; do
    if [[ ! -f "$f" ]]; then
      echo "[DevState] ERROR: file not found: $f"; exit 1
    fi
    if [[ ! -s "$f" ]]; then
      echo "[DevState] ERROR: file is empty: $f"; exit 1
    fi
  done
  # Optional HMAC chain verification if script present
  if [[ -f "$ROOT_DIR/scripts/verify_hmac_chain.py" ]]; then
    echo "[DevState] Verifying HMAC chain..."
    if ! python3 "$ROOT_DIR/scripts/verify_hmac_chain.py" --quiet; then
      echo "[DevState] ERROR: HMAC chain verification failed"; exit 1
    fi
  else
    echo "[DevState] HMAC verifier not found; skipping"
  fi
  echo "[DevState] Verify OK: $TMP_STATE, $TMP_HISTORY"
}

cmd_help() {
  cat <<EOF
DevState CLI

Usage: scripts/devstate.sh <command>

Commands:
  import   Import .trae/state.json and .trae/history.json into Mnesia
  export   Export to .trae/state.json.tmp and .trae/history.json.tmp
  verify   Export and verify that .tmp files exist and are non-empty
  help     Show this help

Environment:
  MNESIA_DIR   (default: $MNESIA_DIR)
  STATE_PATH   (default: $STATE_PATH)
  HISTORY_PATH (default: $HISTORY_PATH)
  TMP_STATE    (default: $TMP_STATE)
  TMP_HISTORY  (default: $TMP_HISTORY)
  ERL_NODE_NAME (default: $ERL_NODE_NAME)
  ERL_COOKIE    (default: $ERL_COOKIE)
EOF
}

case "$CMD" in
  import) cmd_import ;;
  export) cmd_export ;;
  verify) cmd_verify ;;
  help|*) cmd_help ;;
esac

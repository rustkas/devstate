# DevState Core — Installation and Usage

## Overview
- DB as Source of Truth for `.trae/state.json` and `.trae/history.json`.
- DevState core server provides domain-safe operations with schema and HMAC validation.

## Prerequisites
- Docker Desktop or PostgreSQL 15+ reachable via `DATABASE_URL`.
- Env vars: `DATABASE_URL`, `HMAC_SECRET` (kept outside VCS).

## Schema Initialization
Run the SQL:

```
psql "$DATABASE_URL" -f devstate/sql/init_devstate.sql
```

Tables created:
- `state_current` — single row current state with `json` and `checksum`.
- `history_entries` — append-only audit with `hmac_prev` chain.
- `devstate_locks` — ephemeral lock table for preventing races.

## Commands (CLI)

```
node devstate/server/devstate-server.js get_state
node devstate/server/devstate-server.js update_state '{"current_cp":"CP0-LC"}'
node devstate/server/devstate-server.js append_history '{"actor":"devstate","action":"advance_cp","cp_from":"CP0-LC","cp_to":"CP1-LC","state_checksum":"sha256:..."}'
node devstate/server/devstate-server.js verify_hmac_chain
node devstate/server/devstate-server.js export_files
node devstate/server/devstate-server.js import_files
```

## CI Integration
 - Add `devstate/scripts/devstate_verify.sh` to a required pipeline stage (pre-merge).
 - Optional: run `devstate/scripts/devstate_export.sh` before packaging artifacts.
 - Health check step: `curl -fsS http://localhost:3080/health` (or `3180` standalone).

## TRAE Configuration Example (legacy MCP settings)

```
{
  "mcpServers": {
    "DevState": {
      "command": "node",
      "args": ["devstate/server/devstate-server.js"],
      "env": {
        "DATABASE_URL": "postgresql://devstate:[MASKED]@localhost:55432/devstate",
        "HMAC_SECRET": "[MASKED]"
      }
    }
  }
}
```

## Operational Procedures
- On DB outage: IDE operates in read-only; CI relies on exported `.trae/*`.
- After recovery: run `export_files` to resync files with DB.
- Locking: use `lock_state(scope, ttl)` and `unlock_state(lock_id)` for critical updates.
 
## IDE Integration
- Preflight: `make devstate-up` → `curl -fsS http://localhost:3080/health` → `bash devstate/scripts/devstate_verify.sh`
- Before edit: acquire lock via `POST /v1/devstate/locks` (reason `edit`, `ttl_sec` 900)
- After edit: `bash devstate/scripts/devstate_export.sh` → `bash devstate/scripts/devstate_verify.sh` → `DELETE /v1/devstate/locks/:id`
- Pre-push: `bash devstate/scripts/devstate_verify.sh` and `curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0'`

## Security
- Secrets are only via env; never commit secrets.
- Logs contain only errors; no secrets printed.
- Regular DB backups and recovery tests recommended.

## Acceptance Criteria
- `verify_hmac_chain` returns OK.
- `export_files` produces byte-identical `.trae/*` to DB snapshots.
- Append-only invariants enforced by DB triggers and server.

# DevState Core — Installation and Usage

## Overview
- DB as Source of Truth for `.trae/state.json` and `.trae/history.json`.
- DevState core server provides domain-safe operations with schema and HMAC validation.

## Prerequisites
- Docker Desktop or PostgreSQL 15+ reachable via `DATABASE_URL`.
- Env vars: `DATABASE_URL`, `HMAC_SECRET` (kept outside VCS; `BEAMLINE_HMAC_SECRET` supported for legacy).

## Schema Initialization
Run the SQL:

```
psql "$DATABASE_URL" -f apps/otp/beamline_store/sql/init_devstate.sql
```

Tables created:
- `state_current` — single row current state with `json` and `checksum`.
- `history_entries` — append-only audit with `hmac_prev` chain.
- `devstate_locks` — ephemeral lock table for preventing races.

## Commands (CLI)

```
node apps/otp/beamline_store/mcp/devstate-server.js get_state
node apps/otp/beamline_store/mcp/devstate-server.js update_state '{"current_cp":"CP0-LC"}'
node apps/otp/beamline_store/mcp/devstate-server.js append_history '{"actor":"trae","action":"advance_cp","cp_from":"CP0-LC","cp_to":"CP1-LC","state_checksum":"sha256:..."}'
node apps/otp/beamline_store/mcp/devstate-server.js verify_hmac_chain
node apps/otp/beamline_store/mcp/devstate-server.js export_files
node apps/otp/beamline_store/mcp/devstate-server.js import_files
```

## CI Integration
- Add `scripts/devstate_verify.sh` to pre-merge or pipeline stage.
- Optional: run `scripts/devstate_export.sh` before packaging artifacts.

## TRAE Configuration Example (legacy MCP settings)

```
{
  "mcpServers": {
    "DevState": {
      "command": "node",
      "args": ["apps/otp/beamline_store/mcp/devstate-server.js"],
      "env": {
        "DATABASE_URL": "postgres://user:[MASKED]@localhost:5432/devstate",
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

## Security
- Secrets are only via env; never commit `BEAMLINE_HMAC_SECRET`.
- Logs contain only errors; no secrets printed.
- Regular DB backups and recovery tests recommended.

## Acceptance Criteria
- `verify_hmac_chain` returns OK.
- `export_files` produces byte-identical `.trae/*` to DB snapshots.
- Append-only invariants enforced by DB triggers and server.

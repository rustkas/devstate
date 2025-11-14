# DevState Documentation Index

This folder contains documentation specific to the DevState service.

## Contents
- Credentials and environment: `CREDENTIALS.md`
- Service overview: `DEVSTATE_OVERVIEW.md`
- MCP usage: `MCP_USAGE.md`
- Historical note (Beamline Store): `BEAMLINE_STORE_TZ.md`

State schema reference (Source of Truth): `docs/STATE.schema.json` at the repository root is copied during the Docker build.

## Usage (Standalone Stack)
- Start: `make devstate-up`
- Health: `curl http://localhost:3180/health`
- Stop: `make devstate-down`
- Logs: `make devstate-logs`

### Without Docker (fallback)
- Set env: `export DATABASE_URL=postgresql://beamline:dev_password@localhost:55432/beamline; export HMAC_SECRET=dev-secret-not-for-prod; export DB_SCHEMA=public`
- Start: `node devstate/server/http-server.js`
- Health: `curl http://localhost:3080/health`

## CLI Utilities
- Import: `bash devstate/scripts/devstate.sh import`
- Export: `bash devstate/scripts/devstate.sh export`
- Verify: `bash devstate/scripts/devstate.sh verify`

## Configuration
- `DEVSTATE_HTTP_PORT` (default `3080` internal, `3180` mapped)
- `HMAC_SECRET` (dev-only default in compose)
- `DATABASE_URL`, `PGHOST`, `DB_SCHEMA` from compose

All former `docs/devstate/*` materials were migrated here to keep DevState self-contained.

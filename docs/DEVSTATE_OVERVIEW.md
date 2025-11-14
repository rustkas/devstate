# DevState Management (Docker + Postgres)

Purpose: Source-of-Truth for `.trae/state.json` and `.trae/history.json` with HMAC-chain audit, exposed via an HTTP service and proxied by the Gateway.

## Overview

- Stores the current development state and append-only history in PostgreSQL.
- Enforces JSON Schema validation for state updates.
- Maintains HMAC-chain integrity for history entries.
- Provides HTTP endpoints for CRUD-like operations and verification.

## Deployment

### Prerequisites
- Docker and Docker Compose
- Environment variables: `DB_*`, `HMAC_SECRET` (preferred) or legacy `BEAMLINE_HMAC_SECRET`

### Start Services
```bash
docker compose -f infra/compose/local-dev.yml up -d devstate gateway
```

### Verify
```bash
curl http://localhost:3080/health
curl 'http://localhost:8080/v1/devstate/verify?limit=10'
```

## Usage

- Read state: `GET http://localhost:3080/v1/devstate/state`
- Update state: `POST http://localhost:3080/v1/devstate/state` with JSON body
- Append history: `POST http://localhost:3080/v1/devstate/history`
- Delete (tombstone) history: `DELETE http://localhost:3080/v1/devstate/history/:id`
- Locks: `POST /v1/devstate/locks`, `DELETE /v1/devstate/locks/:id`
- Search history: `GET /v1/devstate/history/search`
- Export files: `GET /v1/devstate/export`
- Import files: `POST /v1/devstate/import`

## Collaboration

- Share `.env` template via `config/env/.env.example` without secrets.
- Use `HMAC_SECRET` (or legacy `BEAMLINE_HMAC_SECRET`) from a secret manager or local dev `.env` with `dev-secret-not-for-prod`.
- Operations are audited via history chain; use locks to coordinate concurrent changes.

## Scaling & Reliability

- Postgres persistence via `postgres_data` volume.
- Health checks and restart policies defined in Compose.
- HMAC chain ensures tamper-evidence; tombstone preserves audit trail.
- Gateway proxy provides shell-less verification endpoint.

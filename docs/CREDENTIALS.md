# Development Credentials & Storage Practices (Example)

This document tracks local development accounts and secrets, and describes safe handling.

## Accounts

- PostgreSQL:
  - `DB_NAME=beamline`
  - `DB_USER=beamline`
  - `DB_PASSWORD=dev_password` (local only; change in production)
  - `DB_PORT=5432`

- DevState HMAC:
  - `BEAMLINE_HMAC_SECRET=dev-secret-not-for-prod` (local only)

## Storage & Access

- Use `.env` for local development only; do not commit secrets.
- In Compose, secrets are passed via environment variables; prefer Docker secrets/Vault in production.
- Persist database via `postgres_data` volume; back up regularly.

## Rotation & Security

- Rotate `BEAMLINE_HMAC_SECRET` in production and re-seal history with controlled process.
- Enforce least privilege on DB connections; restrict network access.
- Audit all changes via history entries and verify HMAC chain regularly.


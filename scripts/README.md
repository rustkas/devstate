DevState scripts relocated here from the top-level `scripts/` directory.

Includes helpers for:
- state import/export
- HMAC chain verification
- history signing

Keep scripts self-contained and documented per DevState APIs.

Usage:
- Ensure DevState server is running (Docker: `make devstate-up`, local: `node devstate/server/http-server.js`).
- Set env: `DATABASE_URL`, `HMAC_SECRET` (or `BEAMLINE_HMAC_SECRET`), optional `DB_SCHEMA`.
- Export: `bash devstate/scripts/devstate_export.sh`
- Verify HMAC: `bash devstate/scripts/devstate_verify.sh`
- Erlang/Mnesia import/export/verify: `bash devstate/scripts/devstate.sh <import|export|verify>`

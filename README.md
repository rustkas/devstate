# DevState — State & Audit Service

![stars](https://img.shields.io/github/stars/rustkas/devstate?style=for-the-badge)
![forks](https://img.shields.io/github/forks/rustkas/devstate?style=for-the-badge)
![issues](https://img.shields.io/github/issues/rustkas/devstate?style=for-the-badge)
![last-commit](https://img.shields.io/github/last-commit/rustkas/devstate?style=for-the-badge)
![ci](https://img.shields.io/github/actions/workflow/status/rustkas/devstate/devstate-verify.yml?style=for-the-badge)
![visitors](https://visitor-badge.laobi.icu/badge?page_id=rustkas.devstate)
![views](https://komarev.com/ghpvc/?username=rustkas&repo=devstate&style=for-the-badge)
![release](https://img.shields.io/github/v/release/rustkas/devstate?style=for-the-badge)
![downloads](https://img.shields.io/github/downloads/rustkas/devstate/total?style=for-the-badge)
![repo-size](https://img.shields.io/github/repo-size/rustkas/devstate?style=for-the-badge)
![languages](https://img.shields.io/github/languages/count/rustkas/devstate?style=for-the-badge)

DevState is a lightweight HTTP service that manages the project state (`.trae/state.json`) and audit history (`.trae/history.json`), enforces No-Drift, and verifies an HMAC chain of operations. It is designed to support development consistency across IDEs and CI/CD pipelines.

TRAE IDE
- Website: https://www.trae.ai/
- DevState integrates with TRAE as the source-of-truth validator for `.trae/state.json` and `.trae/history.json`.

## Features
- Read/write state and history with verification of HMAC digest chain.
- Import/Export helpers for JSON ⇄ memory/DB workflows.
- Health endpoint for monitoring (`/health`).
- Standalone Docker Compose stack for isolated validation.

## Project Structure
- `server/` — Node.js HTTP server and domain logic.
- `docs/` — service documentation and usage guides.
- `scripts/` — CLI utilities for import/export/verify.
- `sql/` — initialization scripts (Postgres schema).
- `docker-compose.yml` — standalone DevState stack (HTTP 3180, Postgres 55432).
- `metadata.json` — service metadata (ports, artifacts, usage).

## Quick Start
Prerequisites: Docker, Docker Compose.

1. Start standalone stack:
   - `make devstate-up`
   - Check health: `curl http://localhost:3180/health`
2. Use CLI utilities:
   - Import: `bash devstate/scripts/devstate.sh import`
   - Export: `bash devstate/scripts/devstate.sh export`
   - Verify: `bash devstate/scripts/devstate.sh verify`
3. Stop the stack when done:
   - `make devstate-down`

Trae IDE Integration
- Trae IDE uses `.trae/state.json` and `.trae/history.json` as sources of truth.
- DevState validates and exports these files to keep multiple IDEs consistent.
- Recommended: add `bash devstate/scripts/devstate_verify.sh` to pre-commit/pre-push.

Installation & Usage
- No Docker: `npm install` in `devstate/server`, then run `node devstate/server/http-server.js` with env vars.
- Docker: `make devstate-up` to run isolated HTTP `3180` and Postgres `55432`.
- Scripts: `devstate/scripts/*` provide import/export/verify helpers.

GitHub Publication (devstat)
- Create a new repository `rustkas/devstat`.
- Put the contents of this `devstate/` directory at the repository root.
- Ensure `LICENSE` is MIT and present at the root.
- Ensure this `README.md` is at the root and references TRAE.
- Initial commit and push:
  - `git init && git add . && git commit -m "DevState initial release (MIT)"`
  - `git branch -M main && git remote add origin git@github.com:rustkas/devstate.git`
  - `git push -u origin main`

GitHub Actions
- Not required for publication.
- Optional (if needed later): add a single workflow to run `devstate/scripts/devstate_verify.sh` on push/PR to validate `.trae/state.json` and HMAC chain.

## Configuration
Environment variables (Compose):
- `DEVSTATE_HTTP_PORT` — internal HTTP port (default `3080`).
- `HMAC_SECRET` — HMAC secret for audit verification (default dev-only value).
- `DATABASE_URL` — Postgres connection string (see compose).
- `PGHOST`, `DB_SCHEMA` — Postgres host and schema.
Security:
- Set `DEVSTATE_API_TOKEN` to protect mutating endpoints (Bearer token).

## Deployment (CI/CD)
- Verify workflow: `.github/workflows/devstate-verify.yml` (compose up → health → verify → export).
- No‑Drift deny: `.github/workflows/no-drift-deny.yml` (blocks PR if `.trae/*` tracked).
- OpenAPI release and clients: TS/Go/Python workflows publish artifacts on tags.

## Metrics
Shields.io badges (replace `USER/REPO`):

![stars](https://img.shields.io/github/stars/rustkas/devstate?style=for-the-badge)
![forks](https://img.shields.io/github/forks/rustkas/devstate?style=for-the-badge)
![issues](https://img.shields.io/github/issues/rustkas/devstate?style=for-the-badge)
![last-commit](https://img.shields.io/github/last-commit/rustkas/devstate?style=for-the-badge)
![ci](https://img.shields.io/github/actions/workflow/status/rustkas/devstate/devstate-verify.yml?style=for-the-badge)

Traffic (unofficial):

![visitors](https://visitor-badge.laobi.icu/badge?page_id=rustkas.devstate)
![views](https://komarev.com/ghpvc/?username=rustkas&repo=devstate&style=for-the-badge)

GitHub Metrics (optional):

![Metrics](./github-metrics.svg)

To enable auto metrics, add `.github/workflows/metrics.yml` with a PAT stored in `METRICS_TOKEN`.

## Observability Assets
- Prometheus scrape example: `docs/prometheus_scrape.yml` (targets `localhost:3180`, path `/metrics`).
- Grafana dashboard example: `docs/grafana_dashboard.json` (p95 verify, failure counts, rate‑limited, locks).

## API
- `GET /health` — returns service status.

## Documentation
- Index: `devstate/docs/README.md`
- Overview: `devstate/docs/DEVSTATE_OVERVIEW.md`
- MCP usage: `devstate/docs/MCP_USAGE.md`
- Historical note: `devstate/docs/BEAMLINE_STORE_TZ.md`
- Scripts: `devstate/scripts/README.md`

## License
MIT. See `LICENSE`.
Package compliance: `server/package.json` declares `MIT`.

## Maintainers
- AIGROUP / [Beamline Constructor platform team](https://github.com/BeamLine-Development).

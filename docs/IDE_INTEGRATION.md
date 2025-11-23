# IDE Integration Guide for DevState

This guide provides detailed instructions for integrating DevState validation gates into popular IDEs to enforce No-Drift policy and ensure state/history integrity.

## Overview

DevState integration ensures that:
- State and history files (`.trae/state.json`, `.trae/history.json`) maintain HMAC chain integrity
- Schema changes are validated before commits
- Multiple IDEs and CI pipelines stay in sync
- No-Drift policy is enforced at all stages

## Required Workflow

### Preflight (Before Starting Work)

1. **Start DevState service**:
   ```bash
   make devstate-up
   ```

2. **Health check**:
   ```bash
   curl -fsS http://localhost:3080/health
   # Expected: {"status":"ok"}
   ```

3. **Verify HMAC chain**:
   ```bash
   bash devstate/scripts/devstate_verify.sh
   # Expected: [OK] HMAC chain verification passed
   ```

### Before Edit (Acquire Lock)

**Purpose**: Prevent concurrent edits that could break HMAC chain.

**Acquire lock**:
```bash
curl -X POST http://localhost:3080/v1/devstate/locks \
  -H "Content-Type: application/json" \
  -d '{"reason": "edit", "ttl_sec": 900}'
# Response: {"lock_id": "uuid", "expires_at": "ISO-8601"}
```

**Save lock_id** for later release.

### After Edit (Export and Verify)

1. **Export state/history**:
   ```bash
   bash devstate/scripts/devstate_export.sh
   ```

2. **Re-verify HMAC**:
   ```bash
   bash devstate/scripts/devstate_verify.sh
   ```

3. **Release lock**:
   ```bash
   curl -X DELETE http://localhost:3080/v1/devstate/locks/{lock_id}
   ```

### Pre-Push (Final Verification)

1. **Verify HMAC chain**:
   ```bash
   bash devstate/scripts/devstate_verify.sh
   ```

2. **Quick API check**:
   ```bash
   curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0'
   # Expected: {"status":"ok","verified":true}
   ```

### CI Gate (Automated)

In CI/CD pipelines:
- Run `devstate/scripts/devstate_verify.sh` in a required stage
- Validate artifacts: `.trae/state.json`, `.trae/history.json`
- Block merge if verification fails

## Environment Variables

Required environment variables for DevState:

```bash
DATABASE_URL='postgresql://devstate:dev_password@localhost:55432/devstate'
HMAC_SECRET='dev-secret-not-for-prod'  # Local only, never commit
DB_SCHEMA='public'
DEVSTATE_HTTP_PORT=3080
```

**Important**: Never commit real `HMAC_SECRET` values. Use `dev-secret-not-for-prod` for local development only.

## IDE-Specific Setup

### VS Code

#### 1. Tasks Configuration (`.vscode/tasks.json`)

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "devstate:preflight",
      "type": "shell",
      "command": "make devstate-up && sleep 2 && curl -fsS http://localhost:3080/health && bash devstate/scripts/devstate_verify.sh",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "dedicated"
      }
    },
    {
      "label": "devstate:verify",
      "type": "shell",
      "command": "bash devstate/scripts/devstate_verify.sh",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always"
      }
    },
    {
      "label": "devstate:export",
      "type": "shell",
      "command": "bash devstate/scripts/devstate_export.sh",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always"
      }
    }
  ]
}
```

#### 2. Git Hooks (`.vscode/settings.json`)

Install Git hooks extension or use manual setup:

```json
{
  "git.enableSmartCommit": true,
  "git.confirmSync": false,
  "files.watcherExclude": {
    "**/.trae/history.json": true
  }
}
```

#### 3. Pre-Push Hook (`.git/hooks/pre-push`)

```bash
#!/bin/bash
# Pre-push hook for DevState verification

set -e

echo "[DevState] Running pre-push verification..."

# Check if DevState is running
if ! curl -fsS http://localhost:3080/health > /dev/null 2>&1; then
  echo "[WARN] DevState service not running. Start with: make devstate-up"
  exit 0  # Don't block, but warn
fi

# Verify HMAC chain
bash devstate/scripts/devstate_verify.sh

# Quick API check
curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0' > /dev/null

echo "[DevState] Pre-push verification passed"
```

Make it executable:
```bash
chmod x .git/hooks/pre-push
```

#### 4. File Watcher (Optional)

Use VS Code extension "File Watcher" to auto-verify on `.trae/state.json` changes:

```json
{
  "filewatcher.commands": [
    {
      "match": "\\.trae/(state|history)\\.json$",
      "isAsync": true,
      "cmd": "bash devstate/scripts/devstate_verify.sh",
      "event": "onFileChange"
    }
  ]
}
```

### JetBrains IDEs (IntelliJ IDEA, WebStorm, etc.)

#### 1. Run Configurations

Create Run Configurations for DevState operations:

**Preflight Configuration**:
- **Name**: `DevState: Preflight`
- **Type**: Shell Script
- **Script**: `make devstate-up && sleep 2 && curl -fsS http://localhost:3080/health && bash devstate/scripts/devstate_verify.sh`
- **Working directory**: `$ProjectFileDir$`

**Verify Configuration**:
- **Name**: `DevState: Verify`
- **Type**: Shell Script
- **Script**: `bash devstate/scripts/devstate_verify.sh`
- **Working directory**: `$ProjectFileDir$`

**Export Configuration**:
- **Name**: `DevState: Export`
- **Type**: Shell Script
- **Script**: `bash devstate/scripts/devstate_export.sh`
- **Working directory**: `$ProjectFileDir$`

#### 2. File Watchers

Create File Watcher for `.trae/state.json` and `.trae/history.json`:

- **File type**: Any
- **Scope**: Project Files
- **Program**: `bash`
- **Arguments**: `devstate/scripts/devstate_verify.sh`
- **Working directory**: `$ProjectFileDir$`
- **Output filters**: `$FILE_PATH$:$LINE$:$MESSAGE$`

#### 3. Git Hooks

Configure Git hooks via Settings → Version Control → Git:

- **Pre-push hook**: Create `.git/hooks/pre-push` (same as VS Code example above)
- **Pre-commit hook** (optional): Add DevState verification

#### 4. Environment Variables

Set environment variables in Run Configurations:

- **DATABASE_URL**: `postgresql://devstate:dev_password@localhost:55432/devstate`
- **HMAC_SECRET**: `dev-secret-not-for-prod`
- **DB_SCHEMA**: `public`
- **DEVSTATE_HTTP_PORT**: `3080`

### Cursor / Windsurf

#### 1. Rules Configuration (`.cursor/rules/agents/wrk-1-schemas-manifest-ci-gates.mdc`)

Add DevState integration rules to WORKER rules (already included).

#### 2. Pre-Push Hook

Same as VS Code setup (`.git/hooks/pre-push`).

#### 3. Environment Variables

Set in workspace settings or `.env` file:

```bash
DATABASE_URL=postgresql://devstate:dev_password@localhost:55432/devstate
HMAC_SECRET=dev-secret-not-for-prod
DB_SCHEMA=public
DEVSTATE_HTTP_PORT=3080
```

#### 4. Quick Commands

Add to workspace tasks or use command palette:

- `make devstate-up` - Start DevState
- `bash devstate/scripts/devstate_verify.sh` - Verify HMAC chain
- `bash devstate/scripts/devstate_export.sh` - Export state/history

## Metadata Template for IDE Rules

Use this template when configuring IDE rules:

```yaml
agent: IDE
role: devstate-integrator
policies:
  - name: no-drift
    description: Enforce HMAC-chain and state schema before edits and merges
    preflight:
      - command: make devstate-up
      - check: curl -fsS http://localhost:3080/health
      - command: bash devstate/scripts/devstate_verify.sh
    before_edit:
      - api: POST /v1/devstate/locks
        body: { reason: "edit", ttl_sec: 900 }
    after_edit:
      - command: bash devstate/scripts/devstate_export.sh
      - command: bash devstate/scripts/devstate_verify.sh
      - api: DELETE /v1/devstate/locks/:id
    pre_push:
      - command: bash devstate/scripts/devstate_verify.sh
      - check: curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0'
    ci_gate:
      - command: bash devstate/scripts/devstate_verify.sh
      - artifact_check: .trae/state.json, .trae/history.json

env:
  DATABASE_URL: 'postgresql://devstate:dev_password@localhost:55432/devstate'
  HMAC_SECRET: 'dev-secret-not-for-prod'
  DB_SCHEMA: 'public'
  DEVSTATE_HTTP_PORT: 3080
```

## Troubleshooting

### DevState Service Not Running

**Error**: `curl: (7) Failed to connect to localhost port 3080`

**Solution**:
```bash
make devstate-up
# Wait a few seconds, then verify:
curl -fsS http://localhost:3080/health
```

### HMAC Verification Failed

**Error**: `[FAIL] HMAC chain verification failed`

**Possible causes**:
- State/history files were modified outside DevState
- HMAC secret mismatch
- Database out of sync with files

**Solution**:
1. Check if files were manually edited
2. Verify `HMAC_SECRET` matches the one used to create entries
3. Re-export from database: `bash devstate/scripts/devstate_export.sh`
4. If still failing, check database integrity

### Lock Acquisition Failed

**Error**: `409 Conflict` or `Lock already exists`

**Solution**:
- Check existing locks: `curl http://localhost:3080/v1/devstate/locks`
- Release expired locks manually if needed
- Wait for lock TTL to expire (default 900 seconds)

### Database Connection Failed

**Error**: `Connection refused` or `authentication failed`

**Solution**:
1. Verify PostgreSQL is running:
   ```bash
   docker ps | grep postgres
   # or
   psql "$DATABASE_URL" -c "SELECT 1"
   ```

2. Check `DATABASE_URL` environment variable:
   ```bash
   echo $DATABASE_URL
   # Should be: postgresql://devstate:dev_password@localhost:55432/devstate
   ```

3. Verify database exists:
   ```bash
   psql "$DATABASE_URL" -c "\l" | grep devstate
   ```

## Quick Reference

### Essential Commands

```bash
# Start DevState
make devstate-up

# Health check
curl -fsS http://localhost:3080/health

# Verify HMAC chain
bash devstate/scripts/devstate_verify.sh

# Export state/history
bash devstate/scripts/devstate_export.sh

# Acquire lock
curl -X POST http://localhost:3080/v1/devstate/locks \
  -H "Content-Type: application/json" \
  -d '{"reason": "edit", "ttl_sec": 900}'

# Release lock
curl -X DELETE http://localhost:3080/v1/devstate/locks/{lock_id}

# Quick verification
curl -fsS 'http://localhost:3080/v1/devstate/verify?limit=0'
```

### Adoption Checklist

- [ ] DevState service running (`make devstate-up`)
- [ ] Health check passes (`curl http://localhost:3080/health`)
- [ ] HMAC verification passes (`bash devstate/scripts/devstate_verify.sh`)
- [ ] Pre-push hook configured (`.git/hooks/pre-push`)
- [ ] IDE tasks/run configurations created
- [ ] Environment variables set correctly
- [ ] File watchers configured (optional)
- [ ] CI gate includes `devstate/scripts/devstate_verify.sh`

## See Also

- `devstate/docs/README.md` - DevState overview and quick start
- `devstate/docs/USAGE.md` - Core usage and CLI commands
- `devstate/docs/DEVSTATE_OVERVIEW.md` - Architecture and design
- `.cursor/rules/agents/wrk-1-schemas-manifest-ci-gates.mdc` - WORKER rules for DevState integration

#!/usr/bin/env node
// DevState core server (Node.js) — DB as Source of Truth
// Provides domain methods: get_state, update_state, append_history, verify_hmac_chain,
// export_files, import_files, lock_state, unlock_state, search_history

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Env
const DATABASE_URL = process.env.DATABASE_URL;
const DB_SCHEMA = process.env.DB_SCHEMA || 'public';
// Prefer neutral env; fallback to legacy BEAMLINE_HMAC_SECRET
const HMAC_SECRET = process.env.HMAC_SECRET || process.env.BEAMLINE_HMAC_SECRET;
// Detect repository root: allow override via REPO_ROOT, otherwise if running from devstate/server,
// use two-level up as monorepo root; else default to cwd.
function detectRepoRoot() {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const cwd = process.cwd();
  const parent = path.dirname(cwd);
  const grand = path.dirname(parent);
  if (path.basename(cwd) === 'server' && path.basename(parent) === 'devstate') {
    return grand;
  }
  return cwd;
}
const REPO_ROOT = detectRepoRoot();

if (!DATABASE_URL || !HMAC_SECRET) {
  console.error('Missing env: DATABASE_URL or HMAC_SECRET');
  process.exit(1);
}

// Load JSON Schema for state validation
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, strict: false });
try {
  require('ajv-formats')(ajv);
} catch (_) {
  // Formats optional; continue without if not available
}

function loadStateSchema() {
  const candidates = [
    path.join(REPO_ROOT, 'docs', 'STATE.schema.json'),
    // Fallback within devstate when building image
    path.join(REPO_ROOT, 'devstate', 'docs', 'STATE.schema.json')
  ];
  let schemaJson = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      schemaJson = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (!schemaJson) {
    throw new Error('STATE.schema.json not found in expected locations');
  }
  const schema = JSON.parse(schemaJson);
  return ajv.compile(schema);
}

const validateState = loadStateSchema();

// PG Client factory
function pgClient() {
  const client = new Client({ connectionString: DATABASE_URL });
  return client;
}

// Helpers
function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function checksumForJson(obj) {
  const normalized = JSON.stringify(obj);
  return 'sha256:' + sha256Hex(Buffer.from(normalized, 'utf8'));
}

function hmacHex(message) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(message).digest('hex');
}

async function getState() {
  const client = pgClient();
  await client.connect();
  try {
    const res = await client.query(`SELECT json, checksum FROM ${DB_SCHEMA}.state_current WHERE id = 1`);
    if (res.rowCount === 0) throw new Error('state_current missing');
    return res.rows[0];
  } finally {
    await client.end();
  }
}

async function updateState(patch, actor = 'system') {
  const client = pgClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT json, checksum FROM ${DB_SCHEMA}.state_current WHERE id = 1 FOR UPDATE`);
    const current = cur.rows[0];
    const updatedJson = Object.assign({}, current.json, patch);
    if (!validateState(updatedJson)) {
      throw new Error('STATE schema validation failed: ' + ajv.errorsText(validateState.errors));
    }
    const newChecksum = checksumForJson(updatedJson);
    await client.query(`UPDATE ${DB_SCHEMA}.state_current SET json = $1, checksum = $2, updated_at = NOW() WHERE id = 1`, [updatedJson, newChecksum]);
    const hprev = await lastHistoryHmac(client);
    const meta = { patch_keys: Object.keys(patch) };
    const hmsg = JSON.stringify({ checksum: newChecksum, meta });
    const hmac = hmacHex(hmsg);
    await client.query(
      `INSERT INTO ${DB_SCHEMA}.history_entries(ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [actor, 'update_state', null, null, newChecksum, hprev || null, hmac, meta]
    );
    await client.query('COMMIT');
    return { ok: true, new_checksum: newChecksum };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

async function lastHistoryHmac(client) {
  const res = await client.query(`SELECT hmac FROM ${DB_SCHEMA}.history_entries ORDER BY id DESC LIMIT 1`);
  return res.rowCount ? res.rows[0].hmac : null;
}

async function appendHistory(entry) {
  const client = pgClient();
  await client.connect();
  try {
    const hprev = await lastHistoryHmac(client);
    const message = JSON.stringify(entry);
    const hmac = hmacHex(message);
    await client.query(
      `INSERT INTO ${DB_SCHEMA}.history_entries(ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.actor, entry.action, entry.cp_from || null, entry.cp_to || null, entry.state_checksum || null, hprev || null, hmac, entry.metadata || null]
    );
    return { ok: true, new_hmac: hmac };
  } finally {
    await client.end();
  }
}

// Soft-delete (tombstone) of a history entry by id, preserving audit chain
async function tombstoneHistory(targetId, actor = 'system') {
  const client = pgClient();
  await client.connect();
  try {
    // Ensure target exists
    const exists = await client.query(`SELECT id FROM ${DB_SCHEMA}.history_entries WHERE id = $1`, [targetId]);
    if (!exists.rowCount) {
      throw new Error(`History entry ${targetId} not found`);
    }
    const hprev = await lastHistoryHmac(client);
    const entry = {
      actor,
      action: 'delete_history',
      cp_from: null,
      cp_to: null,
      state_checksum: null,
      metadata: { target_id: targetId },
    };
    const message = JSON.stringify(entry);
    const hmac = hmacHex(message);
    await client.query(
      `INSERT INTO ${DB_SCHEMA}.history_entries(ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata) VALUES (NOW(), $1, $2, $3, $4, $5, $6, $7, $8)`,
      [entry.actor, entry.action, entry.cp_from, entry.cp_to, entry.state_checksum, hprev || null, hmac, entry.metadata]
    );
    return { ok: true, tombstoned: targetId };
  } finally {
    await client.end();
  }
}

async function verifyHmacChain(limit = 0) {
  const client = pgClient();
  await client.connect();
  try {
    const sql = `SELECT id, hmac_prev, hmac, metadata, state_checksum, actor, action, cp_from, cp_to, ts FROM ${DB_SCHEMA}.history_entries ORDER BY id ASC` + (limit > 0 ? ' LIMIT ' + Number(limit) : '');
    const res = await client.query(sql);
    let prev = null;
    for (const row of res.rows) {
      if (prev && row.hmac_prev !== prev) {
        return { error: true, pos: row.id, expected: prev, got: row.hmac_prev };
      }
      // Optional recompute check: ensure hmac is reproducible
      const message = JSON.stringify({
        actor: row.actor,
        action: row.action,
        cp_from: row.cp_from,
        cp_to: row.cp_to,
        state_checksum: row.state_checksum,
        metadata: row.metadata,
        ts: row.ts
      });
      const recomputed = hmacHex(message);
      if (recomputed !== row.hmac) {
        return { error: true, pos: row.id, reason: 'hmac_mismatch' };
      }
      prev = row.hmac;
    }
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function exportFiles() {
  const state = await getState();
  const history = await exportHistory();
  const statePath = path.join(REPO_ROOT, '.trae', 'state.json');
  const historyPath = path.join(REPO_ROOT, '.trae', 'history.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  fs.writeFileSync(historyPath, JSON.stringify({ entries: history }, null, 2));
  return { ok: true, files_written: [statePath, historyPath] };
}

async function exportHistory() {
  const client = pgClient();
  await client.connect();
  try {
    const res = await client.query(`SELECT id, ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata FROM ${DB_SCHEMA}.history_entries ORDER BY id ASC`);
    return res.rows;
  } finally {
    await client.end();
  }
}

async function importFiles() {
  const statePath = path.join(REPO_ROOT, '.trae', 'state.json');
  const historyPath = path.join(REPO_ROOT, '.trae', 'history.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  if (!validateState(state.json)) {
    throw new Error('STATE schema validation failed: ' + ajv.errorsText(validateState.errors));
  }
  const client = pgClient();
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE ${DB_SCHEMA}.state_current SET json = $1, checksum = $2, updated_at = NOW() WHERE id = 1`, [state.json, state.checksum]);
    // Reinsert history (optional: truncate and load). Assumes fresh DB or consistency checks elsewhere.
    await client.query(`TRUNCATE ${DB_SCHEMA}.history_entries`);
    let prev = null;
    for (const e of history.entries) {
      if (prev && e.hmac_prev !== prev) {
        throw new Error(`History chain mismatch at id=${e.id}`);
      }
      const message = JSON.stringify({
        actor: e.actor,
        action: e.action,
        cp_from: e.cp_from,
        cp_to: e.cp_to,
        state_checksum: e.state_checksum,
        metadata: e.metadata,
        ts: e.ts
      });
      const hmac = hmacHex(message);
      if (hmac !== e.hmac) {
        throw new Error(`HMAC mismatch at id=${e.id}`);
      }
      await client.query(
        `INSERT INTO ${DB_SCHEMA}.history_entries(id, ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [e.id, e.ts, e.actor, e.action, e.cp_from || null, e.cp_to || null, e.state_checksum || null, e.hmac_prev || null, e.hmac, e.metadata || null]
      );
      prev = e.hmac;
    }
    await client.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

async function lockState(scope, ttlSec, actor = 'system') {
  const client = pgClient();
  await client.connect();
  try {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    const res = await client.query(
      `INSERT INTO ${DB_SCHEMA}.devstate_locks(scope, actor, expires_at) VALUES ($1, $2, $3) RETURNING lock_id`,
      [scope, actor, expiresAt]
    );
    return res.rows[0];
  } finally {
    await client.end();
  }
}

async function unlockState(lockId) {
  const client = pgClient();
  await client.connect();
  try {
    await client.query(`DELETE FROM ${DB_SCHEMA}.devstate_locks WHERE lock_id = $1`, [lockId]);
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function searchHistory(filters = {}) {
  const client = pgClient();
  await client.connect();
  try {
    const where = [];
    const params = [];
    let p = 1;
    if (filters.actor) { where.push(`actor = $${p++}`); params.push(filters.actor); }
    if (filters.action) { where.push(`action = $${p++}`); params.push(filters.action); }
    if (filters.since) { where.push(`ts >= $${p++}`); params.push(new Date(filters.since)); }
    if (filters.until) { where.push(`ts <= $${p++}`); params.push(new Date(filters.until)); }
    const sql = `SELECT id, ts, actor, action, cp_from, cp_to, state_checksum, hmac_prev, hmac, metadata FROM ${DB_SCHEMA}.history_entries` + (where.length ? (' WHERE ' + where.join(' AND ')) : '') + ' ORDER BY id DESC LIMIT 1000';
    const res = await client.query(sql, params);
    return res.rows;
  } finally {
    await client.end();
  }
}

// Simple CLI interface (invoked via node mcp/devstate-server.js <cmd> [args...])
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'get_state':
        return console.log(JSON.stringify(await getState(), null, 2));
      case 'update_state': {
        const patch = JSON.parse(args[0] || '{}');
        return console.log(JSON.stringify(await updateState(patch), null, 2));
      }
      case 'append_history': {
        const entry = JSON.parse(args[0] || '{}');
        return console.log(JSON.stringify(await appendHistory(entry), null, 2));
      }
      case 'verify_hmac_chain':
        return console.log(JSON.stringify(await verifyHmacChain(Number(args[0] || 0)), null, 2));
      case 'export_files':
        return console.log(JSON.stringify(await exportFiles(), null, 2));
      case 'import_files':
        return console.log(JSON.stringify(await importFiles(), null, 2));
      case 'lock_state':
        return console.log(JSON.stringify(await lockState(args[0] || 'global', Number(args[1] || 30)), null, 2));
      case 'unlock_state':
        return console.log(JSON.stringify(await unlockState(args[0]), null, 2));
      case 'search_history': {
        const filters = JSON.parse(args[0] || '{}');
        return console.log(JSON.stringify(await searchHistory(filters), null, 2));
      }
      default:
        console.error('Unknown command');
        process.exit(2);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getState,
  updateState,
  appendHistory,
  verifyHmacChain,
  exportFiles,
  importFiles,
  lockState,
  unlockState,
  searchHistory,
  tombstoneHistory,
};

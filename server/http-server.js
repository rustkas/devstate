#!/usr/bin/env node
// Lightweight HTTP server wrapping DevState core methods
// Endpoints:
// - GET /health
// - GET /v1/devstate/verify
// - GET /v1/devstate/state
// - POST /v1/devstate/state (partial update via JSON patch object)
// - POST /v1/devstate/history (append entry)
// - POST /v1/devstate/locks (create lock)
// - DELETE /v1/devstate/locks/:id (remove lock)
// - GET /v1/devstate/history/search (query by actor/action/time)
// - DELETE /v1/devstate/history/:id (tombstone entry)
// - GET /v1/devstate/export (write files to .trae)
// - POST /v1/devstate/import (load files from .trae)

const express = require('express');
const cors = require('cors');
const client = require('prom-client');
const rateLimit = require('express-rate-limit');

// Import domain methods from DevState core server
const mcp = require('./devstate-server.js');

const app = express();
app.use(cors());
app.use(express.json());

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const hmacVerifyPass = new client.Counter({ name: 'devstate_hmac_verify_pass_total', help: 'HMAC verify pass', registers: [register] });
const hmacVerifyFail = new client.Counter({ name: 'devstate_hmac_verify_fail_total', help: 'HMAC verify fail', registers: [register] });
const stateUpdates = new client.Counter({ name: 'devstate_state_updates_total', help: 'State updates', registers: [register] });
const historyAppends = new client.Counter({ name: 'devstate_history_appends_total', help: 'History appends', registers: [register] });
const locksActive = new client.Gauge({ name: 'devstate_locks_active', help: 'Active locks', registers: [register] });

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'trae-devstate-http', ts: new Date().toISOString() });
});

// Verify HMAC chain
app.get('/v1/devstate/verify', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 0;
    const result = await mcp.verifyHmacChain(limit);
    if (result && result.ok) hmacVerifyPass.inc(); else hmacVerifyFail.inc();
    res.json(result);
  } catch (e) {
    hmacVerifyFail.inc();
    res.status(500).json({ error: 'verify_failed', message: e.message });
  }
});

// Get current state
app.get('/v1/devstate/state', async (_req, res) => {
  try {
    const state = await mcp.getState();
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: 'get_state_failed', message: e.message });
  }
});

// Update state (partial patch)
app.post('/v1/devstate/state', async (req, res) => {
  try {
    const patch = req.body || {};
    const result = await mcp.updateState(patch, 'http');
    stateUpdates.inc();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'update_state_failed', message: e.message });
  }
});

// Append history entry
app.post('/v1/devstate/history', async (req, res) => {
  try {
    const entry = req.body || {};
    const result = await mcp.appendHistory(entry);
    historyAppends.inc();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'append_history_failed', message: e.message });
  }
});

// Create lock
app.post('/v1/devstate/locks', async (req, res) => {
  try {
    const { scope = 'global', ttlSec = 30 } = req.body || {};
    const result = await mcp.lockState(scope, Number(ttlSec), 'http');
    locksActive.inc();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'lock_failed', message: e.message });
  }
});

// Delete lock
app.delete('/v1/devstate/locks/:id', async (req, res) => {
  try {
    const lockId = req.params.id;
    const result = await mcp.unlockState(lockId);
    locksActive.dec();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'unlock_failed', message: e.message });
  }
});

// Search history (paginated)
app.get('/v1/devstate/history/search', async (req, res) => {
  try {
    const filters = {
      actor: req.query.actor,
      action: req.query.action,
      since: req.query.since,
      until: req.query.until,
      limit: req.query.limit,
      cursor: req.query.cursor,
    };
    const result = await mcp.searchHistory(filters);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'search_failed', message: e.message });
  }
});

// Tombstone history entry (soft delete)
app.delete('/v1/devstate/history/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    const result = await mcp.tombstoneHistory(id, 'http');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'tombstone_failed', message: e.message });
  }
});

// Export state/history files
app.get('/v1/devstate/export', async (_req, res) => {
  try {
    const result = await mcp.exportFiles();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'export_failed', message: e.message });
  }
});

// Import state/history files
app.post('/v1/devstate/import', async (_req, res) => {
  try {
    const result = await mcp.importFiles();
    const verify = await mcp.verifyHmacChain(0);
    if (verify && verify.ok) hmacVerifyPass.inc(); else hmacVerifyFail.inc();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'import_failed', message: e.message });
  }
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

const PORT = process.env.DEVSTATE_HTTP_PORT ? Number(process.env.DEVSTATE_HTTP_PORT) : 3080;
app.listen(PORT, () => {
  console.log(`DevState HTTP server listening on port ${PORT}`);
});
// OpenAPI-like minimal docs (JSON)
app.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.0.0',
    info: { title: 'DevState API', version: 'v1' },
    paths: {
      '/health': { get: { summary: 'Health check' } },
      '/v1/devstate/verify': { get: { summary: 'Verify HMAC chain' } },
      '/v1/devstate/state': { get: { summary: 'Get state' }, post: { summary: 'Update state' } },
      '/v1/devstate/history': { post: { summary: 'Append history entry' } },
      '/v1/devstate/history/search': { get: { summary: 'Search history (paginated)' } },
      '/v1/devstate/history/{id}': { delete: { summary: 'Tombstone history entry' } },
      '/v1/devstate/export': { get: { summary: 'Export .trae files' } },
      '/v1/devstate/import': { post: { summary: 'Import .trae files' } },
      '/v1/devstate/keys/active': { get: { summary: 'Get active HMAC key' } },
      '/v1/devstate/keys/rotate': { post: { summary: 'Rotate HMAC key' } },
    },
  });
});
// HMAC key endpoints
app.get('/v1/devstate/keys/active', async (_req, res) => {
  try {
    const key = await mcp.getActiveKey();
    res.json(key || {});
  } catch (e) {
    res.status(500).json({ error: 'get_active_key_failed', message: e.message });
  }
});

app.post('/v1/devstate/keys/rotate', async (req, res) => {
  try {
    const { id, secret } = req.body || {};
    if (!id || !secret) return res.status(400).json({ error: 'invalid_params' });
    const result = await mcp.rotateKey(id, secret);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: 'rotate_key_failed', message: e.message });
  }
});
// Rate limiting for mutating endpoints
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use(['/v1/devstate/state', '/v1/devstate/history', '/v1/devstate/import', '/v1/devstate/locks', '/v1/devstate/keys/rotate'], limiter);
// Scheduled cleanup (lazy endpoint to trigger) — can be wired to cron
app.post('/v1/devstate/locks/cleanup', async (_req, res) => {
  try {
    const result = await mcp.cleanupExpiredLocks();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'locks_cleanup_failed', message: e.message });
  }
});
// Archive history older than 'days' into history_archive
app.post('/v1/devstate/history/archive', async (req, res) => {
  try {
    const days = Number((req.body || {}).days || 30);
    const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
    const result = await mcp.archiveHistory(cutoff);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'archive_failed', message: e.message });
  }
});

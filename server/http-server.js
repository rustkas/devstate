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

// Search history
app.get('/v1/devstate/history/search', async (req, res) => {
  try {
    const filters = {
      actor: req.query.actor,
      action: req.query.action,
      since: req.query.since,
      until: req.query.until,
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

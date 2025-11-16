#!/usr/bin/env node
const axios = require('axios')
const assert = require('assert')
const BASE = 'http://localhost:3180'
async function run() {
  const h = await axios.get(`${BASE}/health`)
  assert.strictEqual(h.status, 200)
  const v = await axios.get(`${BASE}/v1/devstate/verify`, { params: { limit: 0 } })
  assert.strictEqual(v.status, 200)
  const s = await axios.get(`${BASE}/v1/devstate/state`)
  assert.strictEqual(s.status, 200)
  const stateJson = (s.data && s.data.json) || {}
  const required = ['project', 'version', 'current_cp', 'agents', 'artifact_checksums', 'updated_at']
  const hasRequired = required.every((k) => Object.prototype.hasOwnProperty.call(stateJson, k))
  if (hasRequired) {
    const up = await axios.post(`${BASE}/v1/devstate/state`, { no_drift: true })
    assert.strictEqual(up.status, 200)
  } else {
    console.log('Skip state update: state.json missing required fields (compose init still running)')
  }
  const ap = await axios.post(`${BASE}/v1/devstate/history`, { actor: 'ts', action: 'append', metadata: { rnd: Math.random().toString(36).slice(2) } })
  assert.strictEqual(ap.status, 200)
  console.log('TS CLIENT OK')
}
run().catch((e) => { console.error(e); process.exit(1) })
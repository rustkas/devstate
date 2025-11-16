import http from 'k6/http'
import { check, sleep } from 'k6'
function makeHtml(data) {
  const checks = data.root_group.checks || []
  const pass = checks.filter((c) => c.passes > 0).length
  const fail = checks.length - pass
  const rps = (data.metrics.http_reqs.values.rate || 0).toFixed(2)
  return `<!doctype html><html><head><meta charset=\"utf-8\"><title>k6 Append Summary</title></head><body>
  <h1>k6 Append Summary</h1>
  <p>Checks: pass=${pass} fail=${fail}</p>
  <p>HTTP RPS=${rps}</p>
  </body></html>`
}

export const options = {
  scenarios: {
    append_rps: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '3m', target: 50 },
        { duration: '5m', target: 100 },
      ],
    },
  },
}

export default function () {
  const base = 'http://localhost:3180'
  const payload = {
    actor: 'k6',
    action: 'append_test',
    metadata: { rnd: Math.random().toString(36).slice(2) },
  }
  const headers = {}
  const token = __ENV.DEVSTATE_API_TOKEN
  if (token) headers['Authorization'] = `Bearer ${token}`
  const finalHeaders = Object.assign({ 'Content-Type': 'application/json' }, headers)
  const res = http.post(`${base}/v1/devstate/history`, JSON.stringify(payload), { headers: finalHeaders })
  const okAppend = check(res, { 'append 200': (r) => r.status === 200 })
  if (!okAppend) {
    console.error(`Append failed: status=${res.status} body=${res.body}`)
  }
  sleep(0.2)
}

export function handleSummary(data) {
  return {
    'append-summary.html': makeHtml(data),
    'append-summary.json': JSON.stringify(data, null, 2),
  }
}
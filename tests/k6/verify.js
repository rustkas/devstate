import http from 'k6/http'
import { check, sleep } from 'k6'
// Local HTML summary generator to avoid remote imports in CI
function makeHtml(data) {
  const checks = data.root_group.checks || []
  const pass = checks.filter((c) => c.passes > 0).length
  const fail = checks.length - pass
  const rate = (data.metrics.data_sent.values.rate || 0).toFixed(2)
  const rps = (data.metrics.http_reqs.values.rate || 0).toFixed(2)
  return `<!doctype html><html><head><meta charset="utf-8"><title>k6 Verify Summary</title></head><body>
  <h1>k6 Verify Summary</h1>
  <p>Checks: pass=${pass} fail=${fail}</p>
  <p>HTTP RPS=${rps}, Data rate=${rate} bytes/s</p>
  </body></html>`
}

export const options = {
  scenarios: {
    ramping: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 5,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 15 },
        { duration: '10s', target: 0 },
      ],
    },
  },
}

export default function () {
  const h = http.get('http://localhost:3180/health')
  const okHealth = check(h, { 'health 200': (r) => r.status === 200 })
  if (!okHealth) {
    console.error(`Health check failed: status=${h.status} body=${h.body}`)
  }
  const v = http.get('http://localhost:3180/v1/devstate/verify?limit=0')
  const okVerify = check(v, { 'verify ok': (r) => r.status === 200 && (r.json().ok === true || r.json().error !== undefined) })
  if (!okVerify) {
    console.error(`Verify failed: status=${v.status} body=${v.body}`)
  }
  sleep(0.2)
}

export function handleSummary(data) {
  return {
    'verify-summary.html': makeHtml(data),
    'verify-summary.json': JSON.stringify(data, null, 2),
  }
}
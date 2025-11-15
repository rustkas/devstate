import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
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
  const res = http.post(`${base}/v1/devstate/history`, JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', ...headers } })
  check(res, { 'append 200': (r) => r.status === 200 })
  sleep(0.2)
}
import http from 'k6/http'
import { check, sleep } from 'k6'

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
  check(h, { 'health 200': (r) => r.status === 200 })
  const v = http.get('http://localhost:3180/v1/devstate/verify?limit=0')
  check(v, { 'verify ok': (r) => r.status === 200 && (r.json().ok === true || r.json().error !== undefined) })
  sleep(0.2)
}
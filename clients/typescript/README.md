# DevState TypeScript Client

## Install

```sh
npm install @rustkas/devstate-client
```

## Usage

```ts
import { Configuration, DefaultApi } from '@rustkas/devstate-client';

const cfg = new Configuration({ basePath: 'http://localhost:3180' });
const api = new DefaultApi(cfg);

// Verify HMAC chain
api.v1DevstateVerifyGet(0).then(console.log);

// Update state (requires bearer token if configured)
api.v1DevstateStatePost({ no_drift: true }, { headers: { Authorization: `Bearer ${process.env.DEVSTATE_API_TOKEN}` } }).then(console.log);

// Rotate key (Bearer auth)
await api.v1DevstateKeysRotatePost({ id: 'key-2025-11', secret: 'replace-with-secure' }, { headers: { Authorization: `Bearer ${process.env.DEVSTATE_API_TOKEN}` } });

// Archive history older than 30 days
await api.v1DevstateHistoryArchivePost({ days: 30 }, { headers: { Authorization: `Bearer ${process.env.DEVSTATE_API_TOKEN}` } });

// Search history (filters)
const search = await api.v1DevstateHistorySearchGet(undefined, 'k6', 'append_test');
console.log(search.items);
```

Generated from `openapi.yaml`.
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
```

Generated from `openapi.yaml`.

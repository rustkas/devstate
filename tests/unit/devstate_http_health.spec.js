#!/usr/bin/env node
const http = require('http');
const assert = require('assert');

function getJson(baseUrl, path) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const req = http.get(url, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const body = JSON.parse(data || '{}');
                    resolve({ statusCode: res.statusCode, body });
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url.href}: ${e.message}`));
                }
            });
        });
        req.on('error', (err) => reject(err));
    });
}

async function run() {
    const base = process.env.DEVSTATE_URL || 'http://localhost:3080';

    // /health should return 200 and { status: 'ok', ... }
    const health = await getJson(base, '/health');
    assert.strictEqual(health.statusCode, 200, 'health status code must be 200');
    assert(health.body && health.body.status === 'ok', 'health.status must be ok');

    // /v1/devstate/verify should indicate verified: true
    const verify = await getJson(base, '/v1/devstate/verify?limit=0');
    assert.strictEqual(verify.statusCode, 200, 'verify status code must be 200');
    assert(verify.body && verify.body.verified === true, 'verify.verified must be true');

    console.log('HTTP HEALTH/VERIFY OK');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { createApp } from '../../src/app.js';

describe('Health and System Endpoints', () => {
  test('app can be instantiated without Gemini API Key', () => {
    const app = createApp();
    assert.ok(app);
  });

  test('GET /health returns 200 and JSON { ok: true }', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, { ok: true });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test('Unknown route returns JSON 404', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/not-exist`);
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body.error.message, 'Not Found');
      assert.equal(body.error.code, 'NOT_FOUND');
      assert.equal(typeof body.requestId, 'string');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

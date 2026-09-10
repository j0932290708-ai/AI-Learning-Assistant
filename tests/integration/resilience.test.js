import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../../src/app.js';
import { Semaphore } from '../../src/services/concurrencyLimiter.js';

const quietLogger = { log() {}, error() {} };

function fakeAnswer() {
  return JSON.stringify({
    subject: 'math',
    method: 'algebra',
    steps: ['step'],
    answer: 'answer'
  });
}

async function withServer(app, callback) {
  const server = app.listen(0);
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function solveRequest(baseUrl, options = {}) {
  return fetch(`${baseUrl}/api/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body || JSON.stringify({
      subject: 'math',
      method: 'auto',
      question: 'Solve x + 1 = 2.'
    })
  });
}

test('readiness reports whether the AI service is configured', async () => {
  await withServer(createApp({ services: { aiService: null } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ready: false });
  });

  const aiService = { models: { generateContent: async () => ({ text: fakeAnswer() }) } };
  await withServer(createApp({ services: { aiService } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });
  });
});

test('request IDs accept a safe value and replace an unsafe value', async () => {
  const aiService = { models: { generateContent: async () => ({ text: fakeAnswer() }) } };
  await withServer(createApp({ services: { aiService }, logger: quietLogger }), async (baseUrl) => {
    const accepted = await solveRequest(baseUrl, {
      headers: { 'X-Request-ID': 'student-demo_123' }
    });
    assert.equal(accepted.headers.get('x-request-id'), 'student-demo_123');
    assert.equal((await accepted.json()).requestId, 'student-demo_123');

    const rejected = await solveRequest(baseUrl, {
      headers: { 'X-Request-ID': '<unsafe value>' }
    });
    assert.notEqual(rejected.headers.get('x-request-id'), '<unsafe value>');
    assert.match(rejected.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
  });
});

test('malformed and oversized JSON receive clear status codes', async () => {
  const app = createApp({ services: { aiService: null }, logger: quietLogger });
  await withServer(app, async (baseUrl) => {
    const malformed = await solveRequest(baseUrl, { body: '{' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');

    const oversized = await solveRequest(baseUrl, {
      body: JSON.stringify({ question: 'x'.repeat(1_100_000) })
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE');
  });
});

test('a slow AI request returns a 504 timeout', async () => {
  const aiService = {
    models: { generateContent: () => new Promise(() => {}) }
  };
  const app = createApp({
    services: { aiService },
    logger: quietLogger,
    config: { aiTimeoutMs: 20 }
  });

  await withServer(app, async (baseUrl) => {
    const response = await solveRequest(baseUrl);
    const body = await response.json();
    assert.equal(response.status, 504);
    assert.equal(body.error.code, 'AI_TIMEOUT');
  });
});

test('a full AI queue rejects extra work and releases the active permit', async () => {
  let notifyStarted;
  let finishFirst;
  const started = new Promise((resolve) => { notifyStarted = resolve; });
  const finish = new Promise((resolve) => { finishFirst = resolve; });
  const aiService = {
    models: {
      async generateContent() {
        notifyStarted();
        await finish;
        return { text: fakeAnswer() };
      }
    }
  };
  const concurrencyLimiter = new Semaphore(1, 0);
  const app = createApp({
    services: { aiService, concurrencyLimiter },
    logger: quietLogger
  });

  await withServer(app, async (baseUrl) => {
    const first = solveRequest(baseUrl);
    await started;
    const second = await solveRequest(baseUrl);
    assert.equal(second.status, 503);
    assert.equal((await second.json()).error.code, 'AI_CONCURRENCY_LIMIT');

    finishFirst();
    assert.equal((await first).status, 200);
    assert.equal(concurrencyLimiter.getStats().active, 0);
  });
});

test('timeout aborts the client request but retains capacity until the model settles', async () => {
  let finish;
  let signal;
  const aiService = { models: { generateContent(request) {
    signal = request.config.abortSignal;
    return new Promise((resolve) => { finish = () => resolve({ text: fakeAnswer() }); });
  } } };
  const concurrencyLimiter = new Semaphore(1, 0);
  const app = createApp({ services: { aiService, concurrencyLimiter },
    logger: quietLogger, config: { aiTimeoutMs: 20 } });
  await withServer(app, async (baseUrl) => {
    assert.equal((await solveRequest(baseUrl)).status, 504);
    assert.equal(signal.aborted, true);
    assert.equal(concurrencyLimiter.getStats().active, 1);
    assert.equal((await solveRequest(baseUrl)).status, 503);
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(concurrencyLimiter.getStats().active, 0);
  });
});

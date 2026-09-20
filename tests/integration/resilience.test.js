import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../../src/app.js';
import { Semaphore } from '../../src/services/concurrencyLimiter.js';
import { createRateLimiter } from '../../src/middleware/rateLimiter.js';

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

test('upstream overload gives a safe retry message and releases capacity', async () => {
  let calls = 0;
  const aiService = { models: { generateContent: async () => {
    if (calls++ === 0) {
      const error = new Error('upstream internal details must not reach students');
      error.status = 503;
      throw error;
    }
    return { text: fakeAnswer() };
  } } };
  const app = createApp({
    services: { aiService, concurrencyLimiter: new Semaphore(1, 0) },
    logger: quietLogger
  });
  await withServer(app, async (baseUrl) => {
    const response = await solveRequest(baseUrl);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'AI_UPSTREAM_UNAVAILABLE');
    assert.equal(body.error.message, 'AI 服務目前忙碌，請稍後再試。');
    assert.equal((await solveRequest(baseUrl)).status, 200);
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

test('image and solve traffic share a limit before parsing, without limiting health checks', async () => {
  let calls = 0;
  const aiService = { models: { generateContent: async () => { calls++; } } };
  await withServer(createApp({ services: { aiService }, logger: quietLogger }), async (baseUrl) => {
    for (let i = 0; i < 31; i++) {
      const response = await fetch(baseUrl + (i % 2 ? '/api/solve' : '/api/recognize'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${i + 1}` }, body: '{'
      });
      assert.equal(response.status, i < 30 ? 400 : 429);
      if (i === 30) {
        assert.ok(Number(response.headers.get('retry-after')) > 0);
        assert.equal((await response.json()).error.code, 'RATE_LIMIT_EXCEEDED');
      }
    }
    assert.equal(calls, 0);
    assert.equal((await fetch(baseUrl + '/health')).status, 200);
    assert.equal((await fetch(baseUrl + '/ready')).status, 200);
  });
});

function attempt(limiter, ip) {
  const result = { allowed: false, headers: {} };
  const response = { setHeader(name, value) { result.headers[name] = value; },
    status(code) { result.status = code; return this; }, json(body) { result.body = body; } };
  limiter({ ip, requestId: 'test-request' }, response, () => { result.allowed = true; });
  return result;
}

test('a global limiter applies across distinct addresses and resets after its window', () => {
  let now = 1000;
  const limiter = createRateLimiter({ max: 2, windowMs: 1000, keyGenerator: () => 'global', clock: () => now });
  assert.equal(attempt(limiter, 'a').allowed, true);
  assert.equal(attempt(limiter, 'b').allowed, true);
  assert.equal(attempt(limiter, 'c').status, 429);
  now = 2000;
  assert.equal(attempt(limiter, 'd').allowed, true);
});

test('limiter capacity rejects new addresses without evicting active limits, then reclaims expired entries', () => {
  let now = 0;
  const limiter = createRateLimiter({ max: 1, maxClients: 2, windowMs: 1000, clock: () => now });
  assert.equal(attempt(limiter, 'a').allowed, true);
  assert.equal(attempt(limiter, 'b').allowed, true);
  assert.equal(attempt(limiter, 'c').status, 429);
  assert.equal(attempt(limiter, 'a').status, 429);
  now = 1000;
  assert.equal(attempt(limiter, 'c').allowed, true);
  assert.equal(attempt(limiter, 'a').allowed, true);
  assert.equal(attempt(limiter, 'b').status, 429);
});

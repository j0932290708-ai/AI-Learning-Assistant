import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';
import { Semaphore } from '../../src/services/concurrencyLimiter.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9i0AAAAASUVORK5CYII=';
const image = { mimeType: 'image/png', data: png };
const logger = { log() {}, error() {} };
async function withServer(aiService, check, config = {}, extra = {}) {
  const server = createApp({ services: { aiService, ...extra }, logger, config }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await check(base); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
function post(base, body = image, endpoint = '/api/recognize') {
  return fetch(base + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('recognition forwards image bytes, preserves text, and includes cancellation', async () => {
  let request;
  const ai = { models: { generateContent: async (input) => {
    request = input;
    return { text: JSON.stringify({ text: '解 2x + 3 = 11\n  x = ?', warnings: ['請核對符號'] }) };
  } } };
  await withServer(ai, async (base) => {
    const response = await post(base);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.text, '解 2x + 3 = 11\n  x = ?');
    assert.deepEqual(body.warnings, ['請核對符號']);
    assert.equal(body.success, true);
    assert.ok(body.requestId);
    assert.deepEqual(request.contents[0].parts[1].inlineData, image);
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.equal(request.config.abortSignal.aborted, false);
  });
});

test('invalid image requests are rejected before calling AI', async () => {
  let calls = 0;
  const ai = { models: { generateContent: async () => { calls++; } } };
  await withServer(ai, async (base) => {
    const overLimit = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from(png, 'base64').copy(overLimit);
    for (const body of [
      {}, { ...image, mimeType: 'image/svg+xml' }, { ...image, data: 'not base64' },
      { ...image, mimeType: 'image/jpeg' }, { ...image, data: 'aGVsbG8=' },
      { ...image, data: overLimit.toString('base64') }, { ...image, extra: true }
    ]) assert.equal((await post(base, body)).status, 400);
    assert.equal(calls, 0);
  });
});

test('recognition reports unreadable images without inventing a question', async () => {
  const ai = { models: { generateContent: async () => ({ text: '{"text":"","warnings":["圖片不清楚"]}' }) } };
  await withServer(ai, async (base) => {
    const body = await (await post(base)).json();
    assert.equal(body.text, '');
    assert.deepEqual(body.warnings, ['圖片不清楚']);
  });
});

test('recognition rejects malformed AI output and excessive transcription', async () => {
  for (const text of ['not json', '{"text":5}', JSON.stringify({ text: 'a'.repeat(5001) })]) {
    const ai = { models: { generateContent: async () => ({ text }) } };
    await withServer(ai, async (base) => {
      const response = await post(base);
      assert.equal(response.status, 502);
      assert.equal((await response.json()).error.code, 'IMAGE_RECOGNITION_INVALID');
    });
  }
});

test('recognition returns missing service and timeout errors safely', async () => {
  await withServer(null, async (base) => assert.equal((await post(base)).status, 503));
  const ai = { models: { generateContent: () => new Promise(() => {}) } };
  await withServer(ai, async (base) => {
    const response = await post(base);
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error.code, 'AI_TIMEOUT');
  }, { aiTimeoutMs: 20 });
});

test('image and text requests share the same concurrency capacity', async () => {
  let finish, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const ai = { models: { generateContent: () => new Promise((resolve) => {
    finish = () => resolve({ text: '{"text":"1 + 1","warnings":[]}' });
    started();
  }) } };
  await withServer(ai, async (base) => {
    const first = post(base);
    await ready;
    const second = await post(base, { subject: 'math', method: 'auto', question: '1+1' }, '/api/solve');
    assert.equal(second.status, 503);
    assert.equal((await second.json()).error.code, 'AI_CONCURRENCY_LIMIT');
    finish();
    assert.equal((await first).status, 200);
  }, {}, { concurrencyLimiter: new Semaphore(1, 0) });
});

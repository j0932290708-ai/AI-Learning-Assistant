import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateWithFallback } from '../../src/services/modelFallback.js';

test('successful primary model does not invoke fallback', async () => {
  const calls = [];
  const client = { models: { generateContent: async (request) => { calls.push(request.model); return { text: 'ok' }; } } };
  assert.equal((await generateWithFallback(client, { contents: 'question' }, 'primary', 'backup')).text, 'ok');
  assert.deepEqual(calls, ['primary']);
});

test('temporary 503 uses fallback once with identical image data and cancellation', async () => {
  const controller = new AbortController();
  const request = { contents: [{ inlineData: { mimeType: 'image/png', data: 'bytes' } }], config: { abortSignal: controller.signal } };
  const calls = [];
  const client = { models: { generateContent: async (input) => {
    calls.push(input);
    if (calls.length === 1) throw Object.assign(new Error('busy'), { status: 503 });
    return { text: 'recognized' };
  } } };
  assert.equal((await generateWithFallback(client, request, 'primary', 'gemini-3.7-flash')).text, 'recognized');
  assert.deepEqual(calls.map((call) => call.model), ['primary', 'gemini-3.7-flash']);
  assert.equal(calls[1].contents, request.contents);
  assert.equal(calls[1].config.abortSignal, controller.signal);
  assert.equal(calls[1].config.thinkingConfig.thinkingLevel, 'low');
});

test('quota and authentication errors are not retried', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    let calls = 0;
    const error = Object.assign(new Error('failed'), { status });
    const client = { models: { generateContent: async () => { calls++; throw error; } } };
    await assert.rejects(generateWithFallback(client, {}, 'primary', 'backup'), (actual) => actual === error);
    assert.equal(calls, 1);
  }
});

test('aborted request never starts a fallback', async () => {
  const controller = new AbortController();
  let calls = 0;
  const error = Object.assign(new Error('busy'), { status: 503 });
  const client = { models: { generateContent: async () => { calls++; controller.abort(); throw error; } } };
  await assert.rejects(generateWithFallback(client, { config: { abortSignal: controller.signal } }, 'primary', 'backup'));
  assert.equal(calls, 1);
});

test('disabled or identical fallback makes one attempt', async () => {
  for (const fallback of [null, 'primary']) {
    let calls = 0;
    const client = { models: { generateContent: async () => { calls++; throw Object.assign(new Error('busy'), { status: 503 }); } } };
    await assert.rejects(generateWithFallback(client, {}, 'primary', fallback));
    assert.equal(calls, 1);
  }
});

test('fallback failure is returned without an unbounded retry loop', async () => {
  let calls = 0;
  const error = Object.assign(new Error('busy'), { status: 503 });
  const client = { models: { generateContent: async () => { calls++; throw error; } } };
  await assert.rejects(generateWithFallback(client, {}, 'primary', 'backup'), (actual) => actual === error);
  assert.equal(calls, 2);
});

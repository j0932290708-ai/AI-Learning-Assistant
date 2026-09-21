import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solveSubject } from '../../src/subjects/registry.js';
import { solveRequestSchema } from '../../src/schemas/requestSchemas.js';
import { createApp } from '../../src/app.js';

test('guided mode uses learner attempts and only returns hints and a next-step question', async () => {
  let request;
  const service = { models: { generateContent: async (r) => { request = r; return { text: JSON.stringify({ hints: ['先在兩邊減去 3。'], guidingQuestion: '2x 現在等於多少？' }) }; } } };
  const result = await solveSubject({ subject: 'math', method: 'auto', question: '2x+3=11', mode: 'guided', feedback: '我想先移項', previousAnswer: '之前的提示' }, service);
  assert.equal(result.mode, 'guided'); assert.equal(result.answer, '2x 現在等於多少？');
  assert.match(request.contents, /我想先移項/); assert.match(request.contents, /之前的提示/);
  assert.match(request.contents, /Do not reveal the final answer/);
});

test('guided output with a full-answer field is rejected, unsupported modes and excessive feedback fail validation', async () => {
  const service = { models: { generateContent: async () => ({ text: '{"hints":["想想"],"guidingQuestion":"下一步？","answer":"x=4"}' }) } };
  await assert.rejects(solveSubject({ subject: 'math', method: 'auto', question: '2x+3=11', mode: 'guided' }, service), { code: 'GUIDANCE_INVALID' });
  for (const extra of [{ mode: 'anything' }, { feedback: 'x'.repeat(1001) }, { previousAnswer: 'x'.repeat(4001) }]) {
    assert.equal(solveRequestSchema.safeParse({ subject: 'math', question: '2+2', ...extra }).success, false);
  }
});

test('direct retry adds the correction while retaining the original solver schema', async () => {
  let prompt;
  const service = { models: { generateContent: async (r) => { prompt = r.contents; return { text: '{"subject":"math","method":"algebra","steps":["驗算"],"answer":"x=4"}' }; } } };
  const result = await solveSubject({ subject: 'math', method: 'auto', question: '2x+3=11', mode: 'direct', feedback: '請再驗算', previousAnswer: 'x=5' }, service);
  assert.equal(result.answer, 'x=4'); assert.match(prompt, /請再驗算/); assert.match(prompt, /x=5/);
});

test('guided HTTP requests use the same cancellable AI service and serve local formula assets', async () => {
  let signal;
  const aiService = { models: { generateContent: async (r) => { signal = r.config.abortSignal; return { text: '{"hints":["移項"],"guidingQuestion":"接著呢？"}' }; } } };
  const server = createApp({ services: { aiService }, logger: { log() {}, error() {} } }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base + '/api/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'math', method: 'auto', question: '2x+3=11', mode: 'guided' }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).mode, 'guided'); assert.equal(signal.aborted, false);
    const asset = await fetch(base + '/vendor/katex/katex.min.js'); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type'), /javascript/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solveSubject } from '../../src/subjects/registry.js';
import { createApp } from '../../src/app.js';

test('automatic teaching uses one call, preserves feedback, and returns the detected subject', async () => {
  let calls = 0, request;
  const service = { models: { generateContent: async r => { calls++; request = r; return { text: JSON.stringify({ subject: 'english', method: 'grammar', steps: ['第三人稱單數使用 goes'], answer: 'She goes to school.' }) }; } } };
  const result = await solveSubject({ subject: 'auto', method: 'auto', question: 'Correct: She go to school.', feedback: '解釋文法', previousAnswer: '先前答案' }, service);
  assert.equal(calls, 1); assert.equal(result.subject, 'english'); assert.equal(result.mode, 'direct');
  assert.match(request.contents, /解釋文法/); assert.match(request.contents, /先前答案/);
  assert.ok(request.config.responseJsonSchema.properties.subject.enum.includes('general'));
});

test('automatic mode rejects invented subjects, mismatched methods and full-answer guided output', async () => {
  for (const result of [
    { subject: 'invented', method: 'auto', steps: ['a'], answer: 'b' },
    { subject: 'english', method: 'algebra', steps: ['a'], answer: 'b' },
    { subject: 'math', method: 'algebra', hints: ['a'], guidingQuestion: 'b', answer: '4' }
  ]) {
    const service = { models: { generateContent: async () => ({ text: JSON.stringify(result) }) } };
    await assert.rejects(solveSubject({ subject: 'auto', method: 'auto', mode: result.hints ? 'guided' : 'direct', question: '題目' }, service), { code: 'AUTO_LESSON_INVALID' });
  }
});

test('automatic guided HTTP request passes cancellation and returns subject with hints', async () => {
  let request;
  const service = { models: { generateContent: async r => { request = r; return { text: JSON.stringify({ subject: 'math', method: 'algebra', hints: ['兩邊減去 3'], guidingQuestion: '右邊剩多少？' }) }; } } };
  const server = createApp({ services: { aiService: service }, logger: { log() {}, error() {} } }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/solve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '2x+3=11', mode: 'guided' }) });
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.subject, 'math'); assert.equal(body.mode, 'guided'); assert.deepEqual(body.steps, ['兩邊減去 3']);
    assert.equal(request.config.abortSignal.aborted, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

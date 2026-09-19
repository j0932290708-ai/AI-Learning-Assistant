import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  loadQuestionBank,
  saveQuestionToBank, exportQuestionBank, importQuestionBank, questionNumber, requestAI
} from '../../public/src/api.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

afterEach(() => {
  delete globalThis.localStorage;
});

test('backup round trip merges unique entries without losing originals', () => {
  globalThis.localStorage = createStorage();
  saveQuestionToBank('舊題', '數學', '代數', '2');
  const backup = exportQuestionBank();
  saveQuestionToBank('新題', '英文', '文法', '<script>bad</script>');
  const merged = importQuestionBank(backup);
  assert.equal(merged.added, 0);
  assert.equal(merged.entries.length, 2);
  globalThis.localStorage = createStorage();
  assert.equal(importQuestionBank(backup).added, 1);
  assert.equal(loadQuestionBank()[0].answer, '2');
});

test('invalid or overflowing backup does not change stored data', () => {
  globalThis.localStorage = createStorage();
  for (let i = 0; i < 20; i++) saveQuestionToBank(`q${i}`, '數學', '代數', '2');
  const original = localStorage.getItem('ai-learning-bank');
  const entry = { question: 'additional', subject: '數學', method: '代數', answer: '3' };
  for (const content of ['bad', '{"version":999}', JSON.stringify({ format: 'ai-learning-bank', version: 1, entries: [{ ...entry, answer: 123 }] }), JSON.stringify({ format: 'ai-learning-bank', version: 1, entries: [entry] })]) {
    assert.throws(() => importQuestionBank(content));
    assert.equal(localStorage.getItem('ai-learning-bank'), original);
  }
});

test('question references are recognized without swallowing mathematical questions', () => {
  for (const text of ['第174題', '幫我解第174提', '請解照片中的第174題', '１７４', '第 174 題？']) assert.equal(questionNumber(text), '174');
  for (const text of ['174 + 1', '174 是質數嗎', '第174題：2x+3=11', '求174的平方根', 'y=174']) assert.equal(questionNumber(text), null);
});

test('slow startup shows a warmup hint and sends the AI request only after health succeeds', async () => {
  const messages = [], calls = [];
  let wake, healthStarted;
  const started = new Promise((r) => { healthStarted = r; });
  const result = requestAI('/api/solve', { question: '1+1' }, { warmHintMs: 5, startupMs: 2000,
    onStatus: (m) => messages.push(m), fetchImpl: async (url) => {
      calls.push(url);
      if (url === '/health') { healthStarted(); return new Promise((r) => { wake = r; }); }
      return { ok: true, json: async () => ({ success: true, answer: '2' }) };
    } });
  await started;
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, ['/health']);
  assert.ok(messages.some((m) => m.includes('熱身')));
  wake({ ok: true });
  assert.equal((await result).answer, '2');
  assert.deepEqual(calls, ['/health', '/api/solve']);
});

test('startup timeout and cancellation never send a question to AI', async () => {
  const calls = [];
  const fetchImpl = (url, { signal }) => { calls.push(url); return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }); };
  await assert.rejects(requestAI('/api/solve', {}, { fetchImpl, startupMs: 10 }), /啟動等候過久/);
  const controller = new AbortController();
  const pending = requestAI('/api/solve', {}, { fetchImpl, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
  assert.deepEqual(calls, ['/health', '/health']);
});

test('a damaged question bank is backed up and treated as empty', () => {
  const storage = createStorage({ 'ai-learning-bank': '{broken json' });
  globalThis.localStorage = storage;

  assert.deepEqual(loadQuestionBank(), []);
  assert.equal(storage.getItem('ai-learning-bank'), null);
  assert.equal(storage.getItem('ai-learning-bank-corrupt'), '{broken json');
});

test('question bank keeps only the newest 20 entries', () => {
  globalThis.localStorage = createStorage();
  let bank;

  for (let index = 0; index < 24; index += 1) {
    bank = saveQuestionToBank(`question ${index}`, 'math', 'auto', 'answer');
  }

  assert.equal(bank.length, 20);
  assert.equal(bank[0].question, 'question 23');
  assert.equal(bank.at(-1).question, 'question 4');
});

test('storage quota errors become a friendly application error', () => {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota'); },
    removeItem() {}
  };

  assert.throws(
    () => saveQuestionToBank('q', 'math', 'auto', 'a'),
    (error) => error.code === 'QUESTION_BANK_SAVE_FAILED'
  );
});

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  loadQuestionBank,
  saveQuestionToBank
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

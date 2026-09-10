import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const scope = 'https://example.com/AI-Learning-Assistant/';
function worker() {
  const handlers = {};
  const deleted = [];
  const entries = new Map([[scope, 'offline app']]);
  const cache = { match: async (key) => entries.get(key.url || key), put: async () => {} };
  const context = vm.createContext({ URL, self: {
    registration: { scope }, location: { origin: 'https://example.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting() {}, clients: { claim() {} }
  }, caches: {
    open: async () => cache,
    keys: async () => ['focus-clock-v1', 'ai-learning-assistant-v3',
      `ai-learning-assistant:${scope}:v3`, `ai-learning-assistant:${scope}:v4`,
      'ai-learning-assistant:https://example.com/other/:v3'],
    delete: async (name) => { deleted.push(name); }
  }, fetch: async () => { throw new Error('offline'); } });
  vm.runInContext(readFileSync(new URL('../../public/service-worker.js', import.meta.url), 'utf8'), context);
  return { handlers, deleted };
}

test('activation removes only this app caches, preserving other sites on the origin', async () => {
  const w = worker();
  let pending;
  w.handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.deleted, ['ai-learning-assistant-v3', `ai-learning-assistant:${scope}:v3`]);
});

test('API, external, and non-shell requests bypass the service worker', () => {
  const w = worker();
  for (const url of [`${scope}api/solve`, 'https://other.test/src/main.js',
    'https://example.com/focus-clock/', `${scope}private.json`]) {
    w.handlers.fetch({ request: { url, method: 'GET', mode: 'cors' },
      respondWith() { assert.fail(`must bypass ${url}`); } });
  }
});

test('offline HTML fallback is used for navigation, never for missing JavaScript', async () => {
  const w = worker();
  let response;
  w.handlers.fetch({ request: { url: `${scope}index.html`, method: 'GET', mode: 'navigate' },
    respondWith: (promise) => { response = promise; } });
  assert.equal(await response, 'offline app');
  w.handlers.fetch({ request: { url: `${scope}src/main.js`, method: 'GET', mode: 'cors' },
    respondWith: (promise) => { response = promise; } });
  await assert.rejects(response, /offline/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const scope = 'https://example.com/AI-Learning-Assistant/';
function worker(fetchImpl = async () => { throw new Error('offline'); }) {
  const handlers = {};
  const deleted = [];
  const entries = new Map([[scope, 'offline app']]);
  let installed = [];
  const cache = { match: async (key) => entries.get(key.url || key),
    put: async (key, value) => { entries.set(key.url || key, value); },
    addAll: async (requests) => { installed = requests; } };
  const context = vm.createContext({ URL, Request, self: {
    registration: { scope }, location: { origin: 'https://example.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting() {}, clients: { claim() {} }
  }, caches: {
    open: async () => cache,
    keys: async () => ['focus-clock-v1', 'ai-learning-assistant-v3',
      `ai-learning-assistant:${scope}:v3`, `ai-learning-assistant:${scope}:v5`, `ai-learning-assistant:${scope}:v6`,
      'ai-learning-assistant:https://example.com/other/:v3'],
    delete: async (name) => { deleted.push(name); }
  }, fetch: fetchImpl });
  vm.runInContext(readFileSync(new URL('../../public/service-worker.js', import.meta.url), 'utf8'), context);
  return { handlers, deleted, entries, get installed() { return installed; } };
}

test('activation removes only this app caches, preserving other sites on the origin', async () => {
  const w = worker();
  let pending;
  w.handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.deleted, ['ai-learning-assistant-v3', `ai-learning-assistant:${scope}:v3`, `ai-learning-assistant:${scope}:v5`]);
});

test('installation bypasses stale HTTP cache for app shell files', async () => {
  const w = worker();
  let pending;
  w.handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.ok(w.installed.some((request) => request.url === `${scope}src/main.js`));
  assert.ok(w.installed.every((request) => request.cache === 'reload'));
});

test('online scripts replace stale cache and stay available offline', async () => {
  let online = true;
  const fresh = { ok: true, type: 'basic', clone() { return this; } };
  const w = worker(async (request, options) => {
    assert.equal(options.cache, 'no-cache');
    if (!online) throw new Error('offline');
    return fresh;
  });
  const request = { url: `${scope}src/main.js`, method: 'GET', mode: 'cors' };
  w.entries.set(request.url, 'old script');
  let response;
  const event = { request, respondWith: (promise) => { response = promise; } };
  w.handlers.fetch(event);
  assert.equal(await response, fresh);
  assert.equal(w.entries.get(request.url), fresh);
  online = false;
  w.handlers.fetch(event);
  assert.equal(await response, fresh);
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

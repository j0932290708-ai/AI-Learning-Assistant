import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const scope = 'https://example.com/AI-Learning-Assistant/';
function shellResponse(url, { body, type } = {}) {
  const pathname = new URL(url).pathname;
  const contentType = type || (pathname.endsWith('.js') ? 'application/javascript'
    : pathname.endsWith('.css') ? 'text/css' : 'text/html');
  return { ok: true, type: 'basic', headers: new Headers({ 'content-type': contentType }),
    clone() { return this; }, async text() { return body ?? '<body data-app-mode="api">'; } };
}
function worker(fetchImpl = async () => { throw new Error('offline'); }) {
  const handlers = {}, deleted = [], requests = [];
  const entries = new Map([[scope, 'offline app']]);
  const cache = { match: async (key) => entries.get(key.url || key),
    put: async (key, value) => { entries.set(key.url || key, value); } };
  const context = vm.createContext({ URL, Request, self: {
    registration: { scope }, location: { origin: 'https://example.com' },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting() {}, clients: { claim() {} }
  }, caches: {
    open: async () => cache,
    keys: async () => ['focus-clock-v1', 'ai-learning-assistant-v3',
      ...[3, 5, 6, 7, 8, 9].map((version) => `ai-learning-assistant:${scope}:v${version}`),
      'ai-learning-assistant:https://example.com/other/:v3'],
    delete: async (name) => { deleted.push(name); }
  }, fetch: async (request, options) => {
    requests.push({ request, options });
    return fetchImpl(request, options);
  } });
  vm.runInContext(readFileSync(new URL('../../public/service-worker.js', import.meta.url), 'utf8'), context);
  return { handlers, deleted, entries, requests };
}
function dispatch(w, url, mode = 'cors') {
  let response;
  w.handlers.fetch({ request: { url, method: 'GET', mode },
    respondWith: (promise) => { response = promise; } });
  return response;
}
function install(w) {
  let pending;
  w.handlers.install({ waitUntil: (promise) => { pending = promise; } });
  return pending;
}

test('activation removes only this app old caches, preserving other sites and current version', async () => {
  const w = worker();
  let pending;
  w.handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.deleted, ['ai-learning-assistant-v3',
    ...[3, 5, 6, 7, 8].map((version) => `ai-learning-assistant:${scope}:v${version}`)]);
});

test('installation fetches a fresh complete shell and caches valid responses', async () => {
  const w = worker(async (request) => shellResponse(request.url));
  await install(w);
  assert.equal(w.requests.length, 8);
  assert.ok(w.requests.every(({ request, options }) => request.cache === 'reload' && options.cache === 'reload'));
  assert.ok(w.entries.has(`${scope}src/main.js`));
  assert.ok(w.entries.has(`${scope}blackboard.css`));
});

test('a hosting startup page aborts installation before replacing any cached files', async () => {
  const w = worker(async (request) => shellResponse(request.url,
    request.url === scope ? { body: '<h1>Application loading</h1>' } : {}));
  await assert.rejects(install(w), /Invalid app-shell response/);
  assert.equal(w.entries.size, 1);
  assert.equal(w.entries.get(scope), 'offline app');
});

test('cached HTML and scripts return without contacting even an indefinitely stalled network', async () => {
  const w = worker(() => new Promise(() => {}));
  w.entries.set(`${scope}src/main.js`, 'installed script');
  assert.equal(await dispatch(w, scope, 'navigate'), 'offline app');
  assert.equal(await dispatch(w, `${scope}src/main.js`), 'installed script');
  assert.equal(w.requests.length, 0);
});

test('a missing script is fetched once, checked, cached, and available without further requests', async () => {
  const fresh = shellResponse(`${scope}src/main.js`);
  const w = worker(async () => fresh);
  assert.equal(await dispatch(w, `${scope}src/main.js`), fresh);
  assert.equal(w.requests[0].options.cache, 'no-cache');
  assert.equal(await dispatch(w, `${scope}src/main.js`), fresh);
  assert.equal(w.requests.length, 1);
});

test('HTML masquerading as a script or stylesheet is rejected and never cached', async () => {
  const w = worker(async (request) => shellResponse(request.url, { type: 'text/html' }));
  for (const path of ['src/main.js', 'blackboard.css']) {
    await assert.rejects(dispatch(w, scope + path), /Invalid app-shell response/);
    assert.equal(w.entries.has(scope + path), false);
  }
});

test('API, health, external, non-shell and POST requests bypass the service worker', () => {
  const w = worker();
  for (const url of [`${scope}api/solve`, `${scope}health`, 'https://other.test/src/main.js',
    'https://example.com/focus-clock/', `${scope}private.json`]) {
    w.handlers.fetch({ request: { url, method: 'GET', mode: 'cors' },
      respondWith() { assert.fail(`must bypass ${url}`); } });
  }
  w.handlers.fetch({ request: { url: scope, method: 'POST', mode: 'navigate' },
    respondWith() { assert.fail('must bypass POST'); } });
});

test('offline HTML fallback is used for navigation, never for missing JavaScript', async () => {
  const w = worker();
  assert.equal(await dispatch(w, `${scope}index.html`, 'navigate'), 'offline app');
  await assert.rejects(dispatch(w, `${scope}src/main.js`), /offline/);
});

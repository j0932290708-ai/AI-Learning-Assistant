const CACHE_PREFIX = `ai-learning-assistant:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v6`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/api.js',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png'
];
const shellUrls = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(
      [...shellUrls].map((url) => new Request(url, { cache: 'reload' }))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && (key.startsWith(CACHE_PREFIX)
          || /^ai-learning-assistant-v[123]$/.test(key)))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (
    event.request.method !== 'GET'
    || requestUrl.origin !== self.location.origin
    || requestUrl.pathname.includes('/api/')
    || !shellUrls.has(requestUrl.href)
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok && response.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(event.request))
            || cache.match(new URL('./', self.registration.scope).href);
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Online students should receive fixes even when an older script is cached.
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (response.ok && response.type === 'basic') {
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw error;
      }
    })
  );
});

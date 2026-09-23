const CACHE_PREFIX = `ai-learning-assistant:${self.registration.scope}:`;
// Increment this version whenever app-shell HTML, CSS or JS changes.
const CACHE_NAME = `${CACHE_PREFIX}v13`;
const APP_SHELL = [
  './',
  './index.html',
  './blackboard.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/api.js',
  './src/stepTutor.js',
  "./src/richText.js",
  "./src/imageTools.js",
  "./vendor/katex/katex.min.js",
  "./vendor/katex/katex.min.css",
  "./vendor/katex/fonts/KaTeX_AMS-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_Main-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2",
  "./vendor/katex/fonts/KaTeX_Math-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2",
  "./vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Script-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size1-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size2-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size3-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Size4-Regular.woff2",
  "./vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2",
  './icons/app-icon-192.png',
  './icons/app-icon-512.png'
];
const shellUrls = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).href));

async function fetchShell(request, cacheMode) {
  const response = await fetch(request, { cache: cacheMode });
  const type = response.headers.get('content-type') || '';
  const pathname = new URL(request.url).pathname;
  let valid = response.ok && response.type === 'basic';
  if (pathname.endsWith('.js')) valid = valid && /javascript/i.test(type);
  else if (pathname.endsWith('.css')) valid = valid && /text\/css/i.test(type);
  else if (pathname.endsWith('/') || pathname.endsWith('/index.html')) {
    valid = valid && /text\/html/i.test(type) && (await response.clone().text()).includes('data-app-mode="api"');
  }
  if (!valid) throw new Error('Invalid app-shell response');
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    // Validate every response before storing any part of this new version.
    // A hosting wake-up page must never become the installed offline homepage.
    Promise.all([...shellUrls].map(async (url) => {
      const request = new Request(url, { cache: 'reload' });
      return [request, await fetchShell(request, 'reload')];
    })).then(async (entries) => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(entries.map(([request, response]) => cache.put(request, response)));
      await self.skipWaiting();
    })
  );
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

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Return the installed shell immediately, even if a sleeping host or a
      // captive network never settles. Updates arrive as a new worker version.
      const cached = (await cache.match(event.request))
        || (event.request.mode === 'navigate' ? await cache.match(new URL('./', self.registration.scope).href) : null);
      if (cached) return cached;
      const response = await fetchShell(event.request, 'no-cache');
      await cache.put(event.request, response.clone());
      return response;
    })
  );
});

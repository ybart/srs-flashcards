// Cache version. bin/deploy overwrites this with the app version from
// version.json at deploy time, so every release ships a byte-changed sw.js
// (which is what makes the browser install the new worker on an update check).
const CACHE_VERSION = 'v3';
const CACHE_NAME = `srs-flashcards-${CACHE_VERSION}`;
const FAILED_ASSETS = new Set();
const CACHE_COMPLETE_MESSAGE = 'CACHE_COMPLETE';
const LOG_MESSAGE = 'UI_LOG';
// const INIT_PORT_MESSAGE = 'INIT_PORT';

// State for UI communication
const state = {
  port: null,
  precacheDone: false
};

// Set up message listener IMMEDIATELY (before any events)
console.log('[ServiceWorker] Setting up message listener');
self.addEventListener('message', (event) => {
  if (event.data.type === LOG_MESSAGE) {
    console.log(`[UI] ${event.data.message}`, ...(event.data.args || []));
  } else if (event.data.type === 'SKIP_WAITING') {
    // A client asked a freshly-installed worker to take over immediately.
    self.skipWaiting();
  }
});

// List of static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/ios/32.png',
  '/icons/ios/192.png',
  '/icons/ios/144.png',
  '/icons/ios/256.png',
  '/icons/ios/1024.png',
  
  // Pages
  '/categories.html',
  '/study.html',

  // JS
  '/js/app.js',
  '/js/db.js',
  '/js/worker.js',
  '/sw.js',
  
  // CSS
  '/css/main.css',
  
  // Icons
  '/icons/cog.png',
  '/icons/clock-32.png',
  '/icons/stack-32.png',

  // Database
  '/db/flashcards.db',
  
  // CDN resources
  'https://cdn.jsdelivr.net/npm/ios-pwa-splash@1.0.0/cdn.min.js',
  'https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.fluid.classless.min.css',
  'https://cdn.jsdelivr.net/npm/@hotwired/turbo@8.0.12/dist/turbo.es2017-esm.js',
  'https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm',
  
  // Controllers and models
  '/js/controllers/categories_controller.js',
  '/js/controllers/study_session_controller.js',
  '/js/controllers/donate_controller.js',
  '/js/models/application_record.js',
  '/js/models/category.js',
  '/js/models/card.js',
  '/js/models/relative_date.js',
  '/js/models/session.js',


  // SQLite resources
  '/js/sqlite3/sqlite3.mjs',
  '/js/sqlite3/sqlite3.wasm',
  '/js/sqlite3/sqlite3-opfs-async-proxy.js',
];

async function precacheAssets() {
  const cache = await caches.open(CACHE_NAME);
  let cachedCount = 0; // Counter for successfully cached assets

  await Promise.all(
    PRECACHE_ASSETS.map(async (asset) => {
      try {
        // {cache: 'reload'} bypasses the browser HTTP cache so we never
        // precache a stale copy (e.g. an old .mjs served as octet-stream).
        const response = await fetch(asset, { cache: 'reload' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await cache.put(asset, response);
        cachedCount++;
        console.log(`[ServiceWorker] Cached (${cachedCount}/${PRECACHE_ASSETS.length}): ${asset}`);
        notifyUI("CACHE_PROGRESS", cachedCount, PRECACHE_ASSETS.length);
      } catch (error) {
        console.error(`[ServiceWorker] Failed to cache ${asset}:`, error);
        FAILED_ASSETS.add(asset);
      }
    })
  );

  console.log(`[ServiceWorker] Caching complete: ${cachedCount}/${PRECACHE_ASSETS.length} assets cached`);

  await notifyUI("CACHE_COMPLETE");
}

async function notifyUI(message, ...args) {
  const allClients = await clients.matchAll();
  allClients.forEach(client => {
    client.postMessage({ type: message, args: args });
  });
}

self.addEventListener('install', (event) => {
  // waitUntil keeps the SW in "installing" until the precache finishes,
  // so we never activate with a half-populated cache.
  event.waitUntil((async () => {
    try {
      console.log('[ServiceWorker] Install event');
      await precacheAssets();

      const version = await fetch('/version.json').then(res => res.json()).then(data => data.version);
      const allClients = await clients.matchAll();
      allClients.forEach(client => {
        client.postMessage({ type: 'VERSION_INSTALLED', version: version });
      });
    } catch (error) {
      console.error('[ServiceWorker] Installation failed:', error);
    } finally {
      await self.skipWaiting();
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      console.log('[ServiceWorker] Activate event');
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames.map(async (cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            await caches.delete(cacheName);
          }
        })
      );

      await self.clients.claim();
      console.log('[ServiceWorker] Ready to handle fetches');
    } catch (error) {
      console.error('[ServiceWorker] Activation failed:', error);
    }
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // respondWith MUST be called synchronously here for the SW to intercept the
  // request at all. Strategy: cache-first, fall back to network; when offline
  // and uncached, serve the app shell for navigations so the PWA still opens.
  event.respondWith((async () => {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      return await fetch(event.request);
    } catch (error) {
      if (event.request.mode === 'navigate') {
        const shell = await caches.match('/index.html') || await caches.match('/');
        if (shell) return shell;
      }
      console.error('[ServiceWorker] Offline and not cached:', event.request.url, error);
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  })());
});

console.log('[ServiceWorker] root sw.js loaded');

// Service worker version (update this when making changes)
const CACHE_VERSION = 'v1';
const CACHE_NAME = `srs-flashcards-${CACHE_VERSION}`;
const FAILED_ASSETS = new Set();
const CACHE_COMPLETE_MESSAGE = 'CACHE_COMPLETE';
const LOG_MESSAGE = 'UI_LOG';
const INIT_PORT_MESSAGE = 'INIT_PORT';

// State for UI communication
const state = {
  port: null,
  precacheDone: false
};

// Set up message listener IMMEDIATELY (before any events)
console.log('[ServiceWorker] Setting up message listener');
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);
  
  if (event.data.type === INIT_PORT_MESSAGE) {
    state.port = event.ports[0];
    console.log('[ServiceWorker] Port received and stored');
  }
  else if (event.data.type === LOG_MESSAGE) {
    console.log(`[UI] ${event.data.message}`, ...(event.data.args || []));
  }
});

// List of static assets to precache
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/version.json',
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

self.addEventListener('install', async (event) => {
  try {
    console.log('[ServiceWorker] Install event');
    const cache = await caches.open(CACHE_NAME);
    let cachedCount = 0; // Counter for successfully cached assets
    
    await Promise.all(
      PRECACHE_ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
          cachedCount++;
          console.log(`[ServiceWorker] Cached (${cachedCount}/${PRECACHE_ASSETS.length}): ${asset}`);
        } catch (error) {
          console.error(`[ServiceWorker] Failed to cache ${asset}:`, error);
          FAILED_ASSETS.add(asset);
        }
      })
    );

    console.log(`[ServiceWorker] Caching complete: ${cachedCount}/${PRECACHE_ASSETS.length} assets cached`);
    
    // Notify UI if port is available
    if (state.port) {
      try {
        state.port.postMessage({ type: CACHE_COMPLETE_MESSAGE });
        console.log('[ServiceWorker] Notified UI via port');
      } catch (error) {
        console.error('[ServiceWorker] Failed to notify UI via port:', error);
      }
    } else {
      console.log('[ServiceWorker] No port available, UI will need to poll or timeout');
    }
    
    await self.skipWaiting();    
  } catch (error) {
    console.error('[ServiceWorker] Installation failed:', error);
    await self.skipWaiting();
  }
});


self.addEventListener('activate', async (event) => {
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
});
  
self.addEventListener('fetch', async (event) => {
  if (event.request.method !== 'GET') return;

  try {
    const cachedResponse = await caches.match(event.request);
    if (cachedResponse) {
      console.log('[ServiceWorker] Serving from cache:', event.request.url);
      return cachedResponse;
    }

    if (FAILED_ASSETS.has(event.request.url)) {
      console.warn('[ServiceWorker] Serving previously failed asset from network:', event.request.url);
    }

    console.log('[ServiceWorker] Serving from network:', event.request.url);
    return fetch(event.request);
  } catch (error) {
    console.error('[ServiceWorker] Fetch handler failed:', error);
    return new Response('Network error', { 
      status: 408,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
});

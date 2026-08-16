const CACHE_NAME = 'gestao-pro-v3';
const DATA_CACHE_NAME = 'gestao-pro-data-v3';
const SYNC_STORE_NAME = 'sync-queue';
const DB_NAME = 'gestao-pro-sync-db';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToQueue(requestData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_STORE_NAME);
    store.add(requestData);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readonly');
    const store = tx.objectStore(SYNC_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SYNC_STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function processQueue() {
  const queue = await getQueue();
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body
      });
      if (response.ok || response.status === 400 || response.status === 409) {
        await deleteFromQueue(item.id);
      }
    } catch (err) {
      console.log('Sync failed for item', item.id, err);
      // Stop processing if we hit a network error
      break;
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Process queue when online
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_ONLINE') {
    processQueue();
  }
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  if (event.request.url.includes('/supabase.co') || event.request.url.includes('/api/')) {
    if (event.request.method === 'GET') {
      // Network First for API GET requests
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(DATA_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          })
          .catch(() => caches.match(event.request))
      );
    } else {
      // POST, PATCH, DELETE
      event.respondWith(
        fetch(event.request.clone()).catch(async (error) => {
          // If network fails, queue the request
          const serializedRequest = {
            url: event.request.url,
            method: event.request.method,
            headers: Array.from(event.request.headers.entries()),
          };
          if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
            serializedRequest.body = await event.request.clone().text();
          }
          await saveToQueue(serializedRequest);
          
          // Return a fake 200 OK so the app doesn't crash completely
          return new Response(JSON.stringify([{ id: 'offline-' + Date.now(), success: true }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
    }
    return;
  }

  // Navigation requests (index.html) -> Network First
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Static assets (JS, CSS, Images) -> Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (event.request.method === 'GET' && networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // ignore fetch errors for assets if we have cache
      });
      return cachedResponse || fetchPromise;
    })
  );
});

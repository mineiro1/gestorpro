const CACHE_NAME = 'gestao-pro-v7';
const DATA_CACHE_NAME = 'gestao-pro-data-v7';
const SYNC_STORE_NAME = 'sync-queue';
const DB_NAME = 'gestao-pro-sync-db';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/notificacao.mp3',
  '/chat_notification.mp3'
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
            console.log('[SW v7] Expurgando cache legado:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Process messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_ONLINE') {
    processQueue();
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith('http')) return;

  const url = event.request.url;

  // 1. Tratamento específico para rotas /api/
  // Impede que retornos em HTML (como o fallback de SPA no Android / Capacitor) quebrem com SyntaxError no res.json()
  if (url.includes('/api/')) {
    event.respondWith(
      fetch(event.request.clone())
        .then(async (response) => {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html') || response.status === 404) {
            return new Response(JSON.stringify({ 
              success: false, 
              reason: 'api_fallback_intercepted',
              status: response.status 
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return response;
        })
        .catch(() => {
          return new Response(JSON.stringify({ 
            success: false, 
            reason: 'api_network_error_offline' 
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 2. Requisições para o Supabase (.supabase.co)
  if (url.includes('.supabase.co')) {
    if (event.request.method === 'GET') {
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
      // POST, PATCH, DELETE diretos para Supabase (como login e mutations)
      event.respondWith(
        fetch(event.request.clone()).catch(async (error) => {
          return new Response(JSON.stringify({ error: error.message || 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
    }
    return;
  }

  // 3. Navegação (HTML principal index.html) -> Network First com fallback para cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // 4. Arquivos estáticos (JS, CSS, Imagens) -> Stale-While-Revalidate
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
      }).catch((error) => {
        if (!cachedResponse) throw error;
      });
      return cachedResponse || fetchPromise;
    })
  );
});

console.log('SW Updated to v7');

// Notification click handling
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

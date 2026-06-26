const CACHE_NAME = 'watchvault-v2-cache-v7';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './favicon-16.png',
    './favicon-32.png',
    './favicon.ico',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500&display=swap'
];

// Install Event - Cache Core Assets
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Pre-caching core assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(err => console.error('[SW] Cache Error:', err))
    );
});

// Activate Event - Clean Up Old Caches & Claim Clients
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('[SW] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch Event - Cache-First Strategy with Dynamic Runtime Caching
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(response => {
                // Ensure valid response to cache dynamically
                if (!response || response.status !== 200) {
                    return response;
                }

                // Cache static assets, webfonts, and stylesheet resources dynamically
                const url = event.request.url;
                const isCacheable = url.includes('.woff') ||
                                    url.includes('.ttf') ||
                                    url.includes('.png') ||
                                    url.includes('.jpg') ||
                                    url.includes('.css') ||
                                    url.includes('fonts.googleapis') ||
                                    url.includes('fonts.gstatic') ||
                                    url.includes('cdnjs.cloudflare.com');

                if (isCacheable) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }

                return response;
            }).catch(err => {
                console.error('[SW] Fetch failed offline:', err);
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html') || caches.match('./');
                }
            });
        })
    );
});
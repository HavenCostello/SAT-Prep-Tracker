/* SAT Prep — Service Worker
 * Strategy:
 *   • App shell (HTML/CSS/JS/assets): Cache-first, update in background
 *   • Firebase / Firestore API: Network-only (always fresh, auth-gated)
 *   • Google Fonts: Stale-while-revalidate (fallback gracefully)
 */

const CACHE   = 'sat-prep-v2';
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebase.googleapis.com',
];

const SHELL = [
    '/home.html',
    '/index.html',
    '/history.html',
    '/test.html',
    '/test-history.html',
    '/sync.html',
    '/app.css',
    '/storage.js',
    '/firebase-config.js',
    '/firebase-init.js',
    '/pwa-init.js',
    '/Logo.png',
    '/manifest.json',
    /* Firebase compat SDK (versioned — safe to cache) */
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

/* ── Activate: evict old caches ── */
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

/* ── Fetch: route requests ── */
self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    /* Firebase / auth APIs → always network */
    if (NETWORK_ONLY.some(h => url.hostname.includes(h))) return;

    /* Google Fonts → stale-while-revalidate */
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        e.respondWith(staleWhileRevalidate(request));
        return;
    }

    /* Everything else (app shell, Firebase SDK CDN) → cache-first */
    e.respondWith(cacheFirst(request));
});

async function cacheFirst(req) {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
        const fresh = await fetch(req);
        if (fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
        }
        return fresh;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}

async function staleWhileRevalidate(req) {
    const cache  = await caches.open(CACHE);
    const cached = await cache.match(req);
    const fetchP = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return cached || await fetchP || new Response('Offline', { status: 503 });
}

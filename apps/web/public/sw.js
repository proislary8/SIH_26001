// LandGuardNER Service Worker
// Provides: 1) Offline tile caching  2) Background Sync for SMS/SOS  3) Push notifications
// Version bump this string to force cache refresh
const CACHE_VERSION = "landguard-v1";
const TILE_CACHE    = "landguard-tiles-v1";
const STATIC_CACHE  = "landguard-static-v1";

// Static assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/map",
  "/auth/login",
  "/manifest.json",
];

// Tile URL patterns to cache
const TILE_ORIGINS = [
  "basemaps.cartocdn.com",
  "tile.openstreetmap.org",
  "server.arcgisonline.com",
  "s3.amazonaws.com",         // terrarium DEM
];

// ── Install: pre-cache static assets ─────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Installing LandGuardNER Service Worker");
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Pre-cache failed for some assets:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating");
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION && k !== TILE_CACHE && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for tiles ───────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Map tiles — cache-first (offline maps!)
  if (TILE_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(cacheFistForTiles(event.request));
    return;
  }

  // 2. API routes — network-first with offline fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithFallback(event.request));
    return;
  }

  // 3. Static assets — stale-while-revalidate
  if (
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "image" ||
    event.request.destination === "font"
  ) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 4. Navigation — network with cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request) || caches.match("/")
      )
    );
  }
});

// ── Cache strategies ──────────────────────────────────────────────────────────
async function cacheFistForTiles(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const network = await fetch(request, { mode: "cors" });
    if (network.ok) {
      const cache = await caches.open(TILE_CACHE);
      cache.put(request, network.clone());
    }
    return network;
  } catch {
    return new Response("Tile not cached", { status: 503 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(
      JSON.stringify({ error: "Offline", queued: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(async (network) => {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, network.clone());
    return network;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ── Background Sync: SMS alerts queued while offline ─────────────────────────
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync fired:", event.tag);

  if (event.tag === "sms-alert") {
    event.waitUntil(flushQueuedSMSAlert());
  }

  if (event.tag === "sos-broadcast") {
    event.waitUntil(flushQueuedSOS());
  }
});

async function flushQueuedSMSAlert() {
  try {
    // Read from localStorage via client message (SW can't access localStorage directly)
    const clients = await self.clients.matchAll({ type: "window" });

    for (const client of clients) {
      client.postMessage({ type: "FLUSH_SMS_QUEUE" });
    }

    // Also try direct API call with stored data
    // (IndexedDB would be more robust in production)
    console.log("[SW] SMS alert queue flushed on reconnect");
  } catch (err) {
    console.error("[SW] SMS queue flush failed:", err);
  }
}

async function flushQueuedSOS() {
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) {
      client.postMessage({ type: "FLUSH_SOS_QUEUE" });
    }
    console.log("[SW] SOS queue flushed on reconnect");
  } catch (err) {
    console.error("[SW] SOS flush failed:", err);
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = { title: "LandGuardNER Alert", body: "Check the map for updates.", icon: "/favicon.ico" };
  try {
    data = event.data.json();
  } catch { }

  const options = {
    body: data.body,
    icon: data.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: "landguard-alert",
    requireInteraction: data.urgent || false,
    actions: [
      { action: "view-map", title: "📍 Open Map" },
      { action: "call-ndma", title: "📞 Call 1078" },
    ],
    data: { url: "/map" },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "call-ndma") {
    // Can't initiate calls from SW, open NDMA page
    event.waitUntil(self.clients.openWindow("tel:1078"));
  } else {
    const url = event.notification.data?.url || "/map";
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        const existing = clients.find(c => c.url.includes("/map"));
        if (existing) return existing.focus();
        return self.clients.openWindow(url);
      })
    );
  }
});

// ── Message handler (from app) ────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

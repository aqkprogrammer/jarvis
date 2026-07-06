/* JARVIS service worker — offline shell, API caching strategy, web push. */

var CACHE_VERSION = "jarvis-cache-v1";
var PRECACHE_URLS = ["/", "/manifest.json", "/icons/icon.svg"];

var OFFLINE_HTML =
  "<!DOCTYPE html>" +
  '<html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  "<title>JARVIS — Offline</title>" +
  "<style>" +
  "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
  "background:#0a0e17;color:#e0f4ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center}" +
  ".ring{width:72px;height:72px;margin:0 auto 24px;border-radius:50%;" +
  "border:3px solid rgba(0,212,255,.25);border-top-color:#00d4ff;animation:spin 1.6s linear infinite}" +
  "@keyframes spin{to{transform:rotate(360deg)}}" +
  "h1{font-size:18px;letter-spacing:.2em;color:#00d4ff;margin:0 0 8px}" +
  "p{font-size:13px;color:#5a8a9f;margin:0}" +
  "</style></head><body><div>" +
  '<div class="ring"></div>' +
  "<h1>JARVIS IS OFFLINE</h1>" +
  "<p>No network connection detected. Reconnect to restore systems.</p>" +
  "</div></body></html>";

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf("jarvis-cache-") === 0 && key !== CACHE_VERSION;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;

  // Never cache non-GET requests (POST/PUT/DELETE pass straight through)
  if (request.method !== "GET") {
    return;
  }

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // API: network-first, fall back to last cached response
  if (url.pathname.indexOf("/api/") === 0) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            if (cached) {
              return cached;
            }
            return new Response(JSON.stringify({ message: "Offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          });
        })
    );
    return;
  }

  // Static assets and icons: cache-first
  if (url.pathname.indexOf("/_next/static/") === 0 || url.pathname.indexOf("/icons/") === 0) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) {
          return cached;
        }
        return fetch(request).then(function (response) {
          if (response.ok) {
            var copy = response.clone();
            caches.open(CACHE_VERSION).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigations: network, then cached shell, then inline offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match("/").then(function (cached) {
          if (cached) {
            return cached;
          }
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        });
      })
    );
  }
});

self.addEventListener("push", function (event) {
  var data = { title: "JARVIS", body: "You have a new notification.", url: "/" };
  if (event.data) {
    try {
      var parsed = event.data.json();
      data.title = parsed.title || data.title;
      data.body = parsed.body || parsed.message || data.body;
      data.url = parsed.url || data.url;
    } catch (e) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ("focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

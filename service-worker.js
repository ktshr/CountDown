// この名前を変更すると、新版のinstall後に旧キャッシュがactivateで削除される。
const CACHE_NAME = "countdown-static-v4";
const CACHE_PREFIX = "countdown-static-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/countdown.js",
  "./js/qr-code.js",
  "./js/storage.js",
  "./js/transfer.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/qr-github-pages.png",
  "./vendor/qrcode-generator-1.4.4.js",
  "./vendor/jsQR-8e6a036.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      // GitHub Pages上の別アプリが持つキャッシュは削除せず、本アプリの旧版だけを対象にする。
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// 最新版を優先し、通信失敗時だけinstall済みのアプリシェルを返す。
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (networkError) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    throw networkError;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(event.request));
});

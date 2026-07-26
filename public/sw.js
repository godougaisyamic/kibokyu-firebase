// 最小限のサービスワーカー（アプリとしてインストール可能にするために必要）
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // 通常通りネットワークから取得する（オフラインキャッシュは行わない）
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

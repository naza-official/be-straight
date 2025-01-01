const CACHE_NAME = "v1_0";

const RESOURCES_TO_CACHE = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js",
  "/sounds/notification-sound.wav",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.js",
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/vision_wasm_internal.wasm",
  "./models/pose_landmarker_full.task",
  "./favicon/android-chrome-192x192.png",
];

self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(RESOURCES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      if (!keys.includes(CACHE_NAME)) {
        await Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
        await updateCacheResources();
      }
    })()
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
      );
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SEND_NOTIFICATION") {
    console.log("Service Worker: Sending Notification...");
    const { title, options } = event.data;
    self.registration.showNotification(title, options);
  }
});

async function updateCacheResources() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    RESOURCES_TO_CACHE.map(async (resource) => {
      const response = await fetch(resource);
      await cache.put(resource, response);
    })
  );
}

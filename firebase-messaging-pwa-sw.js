/* Eugene Card — Firebase Cloud Messaging service worker */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCm13Nh6k6W9wsL0_OPpjKZNrbSg-pFsuA',
  authDomain: 'eugene-card-marketplace.firebaseapp.com',
  storageBucket: 'eugene-card-marketplace.firebasestorage.app',
  projectId: 'eugene-card-marketplace',
  messagingSenderId: '789014481646',
  appId: '1:789014481646:web:3858909b429985005a41ff',
  measurementId: 'G-MRPT21P9M1'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload && payload.data ? payload.data : {};
  const notification = payload && payload.notification ? payload.notification : {};
  const title = notification.title || data.title || 'Eugene Card';
  const body = notification.body || data.body || 'Ada aktivitas baru di Eugene Card.';
  const url = data.url || '/';

  return self.registration.showNotification(title, {
    body,
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'eugene-card-push',
    renotify: true,
    data: { url }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if ('focus' in client) {
        try {
          if (targetUrl && targetUrl !== '/') await client.navigate(targetUrl);
        } catch (e) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});


// PWA service-worker fetch handler. Network-first keeps the existing app behavior
// while making this service worker usable by the installed PWA.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

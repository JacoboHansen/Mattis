const CACHE_NAME = 'mattis-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Mattis', {
      body: payload.body || 'Matteøkten din er klar.',
      icon: payload.icon || '/icons/mattis-icon.svg',
      badge: payload.badge || '/icons/mattis-icon.svg',
      tag: payload.tag || 'mattis-session',
      data: { url: payload.url || '/home' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/home', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === target);
      if (existing && 'focus' in existing) return existing.focus();
      return self.clients.openWindow(target);
    }),
  );
});

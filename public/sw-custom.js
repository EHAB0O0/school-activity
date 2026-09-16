// School Activity ERP - Background Service Worker Extension
// Handles native mobile background push, periodic sync, and notification interactions

const SW_VERSION = 'v2.1.0';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 1. Native Mobile Background Push Event
self.addEventListener('push', (event) => {
    let data = {
        title: 'تنبيه النشاط المدرسي 🔔',
        body: 'لديك نشاط مدرسي قادم قريباً!',
        url: '/scheduler'
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/school-logo.png',
        badge: '/school-logo.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: data.tag || 'school-activity-reminder',
        renotify: true,
        requireInteraction: true,
        data: {
            url: data.url || '/scheduler',
            timestamp: Date.now()
        },
        actions: [
            { action: 'open', title: 'عرض النشاط' },
            { action: 'dismiss', title: 'إغلاق' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 2. Notification Click Handling (Focus existing tab or open new window)
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    const targetUrl = (event.notification.data && event.notification.data.url) || '/scheduler';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    if (client.url.includes(location.origin)) {
                        client.navigate(targetUrl);
                        return client.focus();
                    }
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});

// 3. Periodic Background Sync (for Chrome/Android PWA)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-school-reminders' || event.tag === 'school-activity-sync') {
        event.waitUntil(checkScheduledBackgroundReminders());
    }
});

// 4. Communication from Client (Sync reminders & Manual tests)
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'TEST_NOTIFICATION') {
        const options = {
            body: event.data.body || 'تم استلام الإشعار بنجاح عبر Service Worker!',
            icon: '/school-logo.png',
            badge: '/school-logo.png',
            vibrate: [200, 100, 200],
            tag: 'test-pwa-notification',
            data: { url: '/scheduler' },
            actions: [
                { action: 'open', title: 'فتح النظام' },
                { action: 'dismiss', title: 'إلغاء' }
            ]
        };
        event.waitUntil(
            self.registration.showNotification(event.data.title || 'إشعار PWA تجريبي', options)
        );
    } else if (event.data.type === 'SYNC_REMINDERS') {
        // Cache reminders in CacheStorage or IndexedDB
        if (Array.isArray(event.data.reminders)) {
            caches.open('school-reminders-cache').then(cache => {
                const response = new Response(JSON.stringify(event.data.reminders), {
                    headers: { 'Content-Type': 'application/json' }
                });
                cache.put('/background-reminders.json', response);
            });
        }
    }
});

// Helper for Background Sync Checks
async function checkScheduledBackgroundReminders() {
    try {
        const cache = await caches.open('school-reminders-cache');
        const response = await cache.match('/background-reminders.json');
        if (!response) return;

        const reminders = await response.json();
        const now = Date.now();

        for (const item of reminders) {
            const triggerTime = new Date(item.triggerTime).getTime();
            // If trigger time reached within past 15 minutes and not yet acknowledged
            if (triggerTime <= now && (now - triggerTime) < 15 * 60 * 1000) {
                await self.registration.showNotification(item.title, {
                    body: item.body,
                    icon: '/school-logo.png',
                    badge: '/school-logo.png',
                    vibrate: [200, 100, 200, 100, 200],
                    tag: item.tag || `rem-${item.id}`,
                    data: { url: item.url || '/scheduler' }
                });
            }
        }
    } catch (e) {
        console.warn('Background reminder check error in SW:', e);
    }
}

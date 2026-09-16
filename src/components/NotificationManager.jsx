import { useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';

const sendPwaPushNotification = async (title, body, tag, url) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const options = {
        body,
        icon: '/school-logo.png',
        badge: '/school-logo.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: tag || 'school-erp-reminder',
        renotify: true,
        requireInteraction: true,
        data: { url: url || '/scheduler' },
        actions: [
            { action: 'open', title: 'عرض النشاط' },
            { action: 'dismiss', title: 'إغلاق' }
        ]
    };

    // Real mobile background PWA delivery via Service Worker Registration
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
                await reg.showNotification(title, options);
                return;
            }
        } catch (err) {
            console.warn('PWA service worker notification notice:', err);
        }
    }

    // Fallback for desktop window notification
    try {
        new Notification(title, {
            body,
            icon: '/school-logo.png'
        });
    } catch (e) {
        console.error('Fallback notification error:', e);
    }
};

const checkEventReminders = (eventId, event) => {
    if (!event.reminders || !Array.isArray(event.reminders) || event.reminders.length === 0) return;

    const eventDateStr = event.date;
    const eventTimeStr = event.startTime || '08:00';
    const eventDateTime = new Date(`${eventDateStr}T${eventTimeStr}`);

    const now = new Date();

    event.reminders.forEach((rem, idx) => {
        let triggerTime;

        if (rem.type === 'custom' && rem.customDateTime) {
            // Custom absolute date and time chosen by user
            triggerTime = new Date(rem.customDateTime);
        } else {
            // Relative time before activity
            triggerTime = new Date(eventDateTime);
            const val = Number(rem.value) || 0;
            if (rem.type === 'minutes') {
                triggerTime.setMinutes(triggerTime.getMinutes() - val);
            } else if (rem.type === 'hours') {
                triggerTime.setHours(triggerTime.getHours() - val);
            } else if (rem.type === 'days') {
                triggerTime.setDate(triggerTime.getDate() - val);
            }
        }

        if (!triggerTime || isNaN(triggerTime.getTime())) return;

        // Trigger window: if now is after triggerTime and within last 10 minutes
        const diff = now.getTime() - triggerTime.getTime(); // > 0 means triggerTime has passed

        if (diff >= 0 && diff < 10 * 60 * 1000) {
            const notifKey = `notif_${eventId}_${idx}_${eventDateStr}_${rem.type}_${rem.value || rem.customDateTime}`;
            const alreadySent = localStorage.getItem(notifKey);

            if (!alreadySent) {
                const timeLabel = event.startTime ? `الساعة ${event.startTime}` : '';
                sendPwaPushNotification(
                    `تذكير بنشاط: ${event.title}`,
                    `النشاط سيبدأ قريباً ${timeLabel} في ${event.venueId || 'المدرسة'}. انقر للعرض التفصيلي.`,
                    notifKey,
                    '/scheduler'
                );
                localStorage.setItem(notifKey, 'true');
            }
        }
    });
};

const checkAllReminders = (eventsList) => {
    eventsList.forEach(event => {
        checkEventReminders(event.id, event);
    });
};

const syncRemindersToServiceWorker = (eventsList) => {
    if (!('serviceWorker' in navigator)) return;

    const scheduledList = [];
    eventsList.forEach(event => {
        if (!event.reminders || !Array.isArray(event.reminders)) return;
        const eventDateStr = event.date;
        const eventTimeStr = event.startTime || '08:00';
        const eventDateTime = new Date(`${eventDateStr}T${eventTimeStr}`);

        event.reminders.forEach((rem, idx) => {
            let triggerTime;
            if (rem.type === 'custom' && rem.customDateTime) {
                triggerTime = new Date(rem.customDateTime);
            } else {
                triggerTime = new Date(eventDateTime);
                const val = Number(rem.value) || 0;
                if (rem.type === 'minutes') triggerTime.setMinutes(triggerTime.getMinutes() - val);
                else if (rem.type === 'hours') triggerTime.setHours(triggerTime.getHours() - val);
                else if (rem.type === 'days') triggerTime.setDate(triggerTime.getDate() - val);
            }

            if (triggerTime && !isNaN(triggerTime.getTime()) && triggerTime.getTime() > Date.now()) {
                scheduledList.push({
                    id: `${event.id}_${idx}`,
                    title: `تذكير بنشاط: ${event.title}`,
                    body: `النشاط سيبدأ قريباً في ${event.venueId || 'المدرسة'}.`,
                    triggerTime: triggerTime.toISOString(),
                    tag: `rem_${event.id}_${idx}`,
                    url: '/scheduler'
                });
            }
        });
    });

    navigator.serviceWorker.ready.then(reg => {
        if (reg.active) {
            reg.active.postMessage({
                type: 'SYNC_REMINDERS',
                reminders: scheduledList
            });
        }
    }).catch(e => console.debug('Sync reminders notice:', e?.message));
};

export default function NotificationManager() {
    const activeEventsRef = useRef([]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;

        // Query upcoming and active events
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = format(today, 'yyyy-MM-dd');

        const q = query(
            collection(db, 'events'),
            where('date', '>=', todayStr),
            where('status', '!=', 'archived')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            activeEventsRef.current = list;
            checkAllReminders(list);
            syncRemindersToServiceWorker(list);
        }, (err) => {
            console.debug('NotificationManager Firestore sync notice:', err?.message);
        });

        // Register Periodic Background Sync if supported (Mobile Chrome PWA)
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
                if ('periodicSync' in reg) {
                    reg.periodicSync.register('check-school-reminders', {
                        minInterval: 15 * 60 * 1000 // Every 15 mins
                    }).catch(e => console.debug('Periodic sync notice (optional PWA feature):', e?.message));
                }
            }).catch(() => {});
        }

        // Periodic background poll every 30 seconds for timely alarms
        const interval = setInterval(() => {
            if (activeEventsRef.current.length > 0) {
                checkAllReminders(activeEventsRef.current);
            }
        }, 30000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, []);

    return null;
}

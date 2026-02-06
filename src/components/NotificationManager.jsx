import { useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';

export default function NotificationManager() {
    useEffect(() => {
        if (!('Notification' in window)) return;

        // Query upcoming events (today and future)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = format(today, 'yyyy-MM-dd');

        // We can't easily query "date >= todayStr" if date is string YYYY-MM-DD
        // But for this scale, fetching active events isn't too heavy if we filter by status != Archived
        // Optimization: Query where date >= todayStr (since ISO strings sort correctly)

        const q = query(
            collection(db, 'events'),
            where('date', '>=', todayStr),
            where('status', '!=', 'archived')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docs.forEach(doc => {
                checkEventReminders(doc.id, doc.data());
            });
        });

        return () => unsubscribe();
    }, []);

    const checkEventReminders = (eventId, event) => {
        if (!event.reminders || !Array.isArray(event.reminders)) return;
        if (!event.startTime) return;

        const eventDateStr = event.date; // "2024-02-06"
        const eventTimeStr = event.startTime; // "09:00"
        const eventDateTime = new Date(`${eventDateStr}T${eventTimeStr}`);

        const now = new Date();

        event.reminders.forEach((rem, idx) => {
            let triggerTime = new Date(eventDateTime);

            // Calculate Trigger Time
            if (rem.type === 'minutes') {
                triggerTime.setMinutes(triggerTime.getMinutes() - rem.value);
            } else if (rem.type === 'hours') {
                triggerTime.setHours(triggerTime.getHours() - rem.value);
            } else if (rem.type === 'days') {
                triggerTime.setDate(triggerTime.getDate() - rem.value);
            }

            // Check if NOW is within a 2-minute window of Trigger Time (to avoid missed checks)
            // AND ensure we haven't already passed it significantly
            const diff = now - triggerTime; // +ve means now is AFTER trigger

            // Logic:
            // If diff is between 0 and 65000ms (1 min + buffer), trigger.
            // But if the user opens the app *after* the trigger time, they might want to know? 
            // Better: If diff > 0 and diff < 10 mins? 
            // AND check localStorage if already sent.

            // Let's say: Trigger if within last 5 minutes.
            if (diff >= 0 && diff < 5 * 60 * 1000) {
                const notifKey = `notif_${eventId}_${idx}_${event.date}`;
                const alreadySent = localStorage.getItem(notifKey);

                if (!alreadySent) {
                    sendNotification(event.title, `تذكير: ${event.title} سيبدأ قريباً (${event.time})`);
                    localStorage.setItem(notifKey, 'true');
                }
            }
        });
    };

    const sendNotification = (title, body) => {
        if (Notification.permission === 'granted') {
            const n = new Notification(title, {
                body,
                icon: '/icon.png' // Optional
            });
            // Optional: Play sound
        }
    };

    return null; // Logic only
}

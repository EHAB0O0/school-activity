import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

/**
 * Checks for scheduling conflicts.
 * @param {Object} newEvent - { start, end, venueId, participatingStudents: [], assets: [], id: string (optional) }
 * @returns {Promise<Object>} - { hasConflict: boolean, reason: string }
 */
export async function checkConflicts(newEvent) {
    const { start, end, venueId, participatingStudents = [], assets = [], id: excludeId } = newEvent;

    // GUARD CLAUSE: Prevent DB queries if essential fields are undefined
    if (!venueId || !start || !end) {
        return { hasConflict: false };
    }

    // Convert JS Dates to Firestore Timestamps for Query
    // We use a "Time Window" query to fetch ALL potential overlaps from the server.
    // This is NOT a simulation; it is a scoped DB query.
    // By filtering `startTime < newEnd` AND `endTime > newStart`, we get all events that overlap.

    // 4. Check Asset Maintenance Status (Strict Guard with Chunking for >30 assets)
    if (newEvent.assets && newEvent.assets.length > 0) {
        const assetsRef = collection(db, 'assets');
        const chunkSize = 30;
        const assetIds = newEvent.assets;
        const chunks = [];
        for (let i = 0; i < assetIds.length; i += chunkSize) {
            chunks.push(assetIds.slice(i, i + chunkSize));
        }

        const chunkSnapshots = await Promise.all(
            chunks.map(chunk => getDocs(query(assetsRef, where('__name__', 'in', chunk))))
        );

        const maintenanceNames = [];
        for (const snap of chunkSnapshots) {
            for (const doc of snap.docs) {
                if (doc.data().status === 'Maintenance') {
                    maintenanceNames.push(doc.data().name || doc.id);
                }
            }
        }

        if (maintenanceNames.length > 0) {
            const names = maintenanceNames.join(', ');
            return { hasConflict: true, reason: `الموارد التالية تحت الصيانة ولا يمكن استخدامها: ${names}` };
        }
    }

    // A0. Strict Venue Status Check (Fetch & Verify)
    if (venueId) {
        // Warning: venueId in this system is usually the Name (historical).
        // Best practice: Check if venueId string matches a 'name' field in venues collection.
        const venuesRef = collection(db, 'venues');
        const qVenue = query(venuesRef, where('name', '==', venueId));
        const vSnap = await getDocs(qVenue);

        if (!vSnap.empty) {
            const venueData = vSnap.docs[0].data();
            if (venueData.status && venueData.status !== 'Available') {
                return { hasConflict: true, reason: `المكان المختار (${venueData.name}) حالته: ${venueData.status === 'Maintenance' ? 'تحت الصيانة' : 'مغلق'} ولا يمكن استخدامه.` };
            }
        }
    }

    // 5. Strict Conflict Check (DB Query)
    // We query for ANY event that overlaps in time.
    // Overlap Logic: (StartA < EndB) and (EndA > StartB)
    const q = query(
        collection(db, 'events'),
        where('startTime', '<', newEvent.end), // Starts before new event ends
        where('endTime', '>', newEvent.start)   // Ends after new event starts
    );

    const snapshot = await getDocs(q);
    const overlappingEvents = [];

    snapshot.forEach(doc => {
        if (doc.id !== excludeId && doc.data().status !== 'archived') {
            overlappingEvents.push({ id: doc.id, ...doc.data() });
        }
    });

    if (overlappingEvents.length === 0) {
        return { hasConflict: false };
    }

    // A. Venue Conflict (Strict)
    if (venueId) {
        const venueConflict = overlappingEvents.find(e => e.venueId === venueId);
        if (venueConflict) {
            return {
                hasConflict: true,
                reason: `القاعة مشغول حالياً: ${venueConflict.title} (${venueConflict.startTime.toDate().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })})`
            };
        }
    }

    // B. Asset Double-Booking (Strict)
    if (assets.length > 0) {
        for (const event of overlappingEvents) {
            if (!event.assets || event.assets.length === 0) continue;
            // Find intersection
            const conflictAsset = event.assets.find(a => assets.includes(a));
            if (conflictAsset) {
                // Fetch asset name for better error? Or just ID. 
                // Optimization: We could fetch names, but ID is standard for now.
                return {
                    hasConflict: true,
                    reason: `المورد (${conflictAsset}) محجوز في نشاط: ${event.title}`
                };
            }
        }
    }

    // C. Student Double-Booking (Strict)
    if (participatingStudents.length > 0) {
        for (const event of overlappingEvents) {
            if (!event.participatingStudents || event.participatingStudents.length === 0) continue;

            const conflictStudentId = event.participatingStudents.find(s => participatingStudents.includes(s));
            if (conflictStudentId) {
                // We return the ID. In a super-polished app we'd fetch the name, 
                // but blocking with ID is sufficient for the Guard to work.
                return {
                    hasConflict: true,
                    reason: `الطالب (ID: ${conflictStudentId}) مسجل بالفعل في نشاط: ${event.title}`
                };
            }
        }
    }

    return { hasConflict: false };
}

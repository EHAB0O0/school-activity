import { runTransaction, doc, increment } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Updates an event and recalculates student points transactionally.
 * Handles cases where points changed, students changed, or status changed to/from 'Done'.
 */
export async function updateEventWithSmartSync(eventId, newData) {
    if (!eventId) throw new Error("Event ID is required for update.");

    try {
        await runTransaction(db, async (transaction) => {
            const eventRef = doc(db, 'events', eventId);
            const eventSnap = await transaction.get(eventRef);

            if (!eventSnap.exists()) {
                throw new Error("Event does not exist!");
            }

            const currentServerData = eventSnap.data();

            // Determine if we need to sync points
            // Sync is needed if:
            // 1. Status is 'Done' (or becoming 'Done')
            // 2. AND (Points changed OR Students changed OR Status changed)

            const isDone = newData.status === 'Done';
            const wasDone = currentServerData.status === 'Done';

            // Lists of students
            const oldStudents = currentServerData.participatingStudents || [];
            const newStudents = newData.participatingStudents || [];

            // Link-registered students are excluded from receiving event points (they keep link points)
            const oldLinkStudents = currentServerData.linkStudentIds || [];
            const newLinkStudents = newData.linkStudentIds !== undefined ? newData.linkStudentIds : oldLinkStudents;

            const eligibleOldStudents = oldStudents.filter(id => !oldLinkStudents.includes(id));
            const eligibleNewStudents = newStudents.filter(id => !newLinkStudents.includes(id));

            // Points
            const oldPoints = Number(currentServerData.points) || 0;
            const newPoints = Number(newData.points) || 0;

            // 1. If it WAS Done and is NO LONGER Done -> Revert all points
            if (wasDone && !isDone) {
                eligibleOldStudents.forEach(studentId => {
                    const sRef = doc(db, 'students', studentId);
                    transaction.update(sRef, { totalPoints: increment(-oldPoints) });
                });
            }

            // 2. If it IS Done (whether it was before or just became)
            if (isDone) {
                // If it was already done, we need to handle diffs.
                // If it wasn't done, we just add points to all new students.

                if (wasDone) {
                    // Logic for updates:
                    // Identify 3 groups:
                    // A. Removed Students (In Old, Not in New) -> Deduct Old Points
                    // B. Added Students (In New, Not in Old) -> Add New Points
                    // C. Kept Students (In Both) -> Add (NewPoints - OldPoints)

                    const removed = eligibleOldStudents.filter(id => !eligibleNewStudents.includes(id));
                    const added = eligibleNewStudents.filter(id => !eligibleOldStudents.includes(id));
                    const kept = eligibleNewStudents.filter(id => eligibleOldStudents.includes(id));

                    // A. Removed
                    removed.forEach(id => {
                        const sRef = doc(db, 'students', id);
                        transaction.update(sRef, { totalPoints: increment(-oldPoints) });
                    });

                    // B. Added
                    added.forEach(id => {
                        const sRef = doc(db, 'students', id);
                        transaction.update(sRef, { totalPoints: increment(newPoints) });
                    });

                    // C. Kept (Only if points changed)
                    if (oldPoints !== newPoints) {
                        const diff = newPoints - oldPoints;
                        kept.forEach(id => {
                            const sRef = doc(db, 'students', id);
                            transaction.update(sRef, { totalPoints: increment(diff) });
                        });
                    }

                } else {
                    // Was NOT Done, now IS Done.
                    // Simply add newPoints to all eligible newStudents
                    eligibleNewStudents.forEach(id => {
                        const sRef = doc(db, 'students', id);
                        transaction.update(sRef, { totalPoints: increment(newPoints) });
                    });
                }
            }

            // Finally, update the event itself
            transaction.update(eventRef, {
                ...newData,
                // Ensure specific fields are updated
                participatingStudents: newStudents,
                linkStudentIds: newLinkStudents,
                points: newPoints,
                status: newData.status,
                venueId: newData.venueId,
                title: newData.title,
                date: newData.date,
                start: newData.start,
                end: newData.end,
                startTime: newData.startTime,
                endTime: newData.endTime,
                // We don't overwrite created/creator fields usually
            });
        });

        return { success: true };
    } catch (e) {
        console.error("Smart Sync Transaction Failed:", e);
        throw e;
    }
}

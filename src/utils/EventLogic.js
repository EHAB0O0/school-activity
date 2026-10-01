import { runTransaction, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { logPointsChange, clampPoints } from './pointsLedger';

/**
 * Updates an event and recalculates student points transactionally.
 * Handles cases where points changed, students changed, or status changed to/from 'Done'.
 * Ensures points are never negative and records point ledger movements.
 */
export async function updateEventWithSmartSync(eventId, newData) {
    if (!eventId) throw new Error("Event ID is required for update.");

    const loggedChanges = [];

    try {
        await runTransaction(db, async (transaction) => {
            const eventRef = doc(db, 'events', eventId);
            const eventSnap = await transaction.get(eventRef);

            if (!eventSnap.exists()) {
                throw new Error("Event does not exist!");
            }

            const currentServerData = eventSnap.data();

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

            // Helper to get student and apply change
            const applyStudentPointsChange = async (studentId, diff, reason, actionType) => {
                const sRef = doc(db, 'students', studentId);
                const sSnap = await transaction.get(sRef);
                if (!sSnap.exists()) return;

                const sData = sSnap.data();
                const prev = Math.max(0, Number(sData.totalPoints) || 0);
                const next = Math.max(0, prev + diff);

                transaction.update(sRef, { totalPoints: next });

                loggedChanges.push({
                    studentId,
                    studentName: sData.name || 'طالب',
                    grade: sData.grade || '',
                    section: sData.section || '',
                    class: sData.class || '',
                    change: diff,
                    previousTotalPoints: prev,
                    newTotalPoints: next,
                    reason,
                    actionType,
                    eventId,
                    eventTitle: newData.title || currentServerData.title || '',
                    eventType: newData.typeName || currentServerData.typeName || ''
                });
            };

            // 1. If it WAS Done and is NO LONGER Done -> Revert all points
            if (wasDone && !isDone) {
                for (const studentId of eligibleOldStudents) {
                    await applyStudentPointsChange(
                        studentId,
                        -oldPoints,
                        `إلغاء اعتماد نشاط: ${currentServerData.title || ''}`,
                        'activity_deduct'
                    );
                }
            }

            // 2. If it IS Done (whether it was before or just became)
            if (isDone) {
                if (wasDone) {
                    const removed = eligibleOldStudents.filter(id => !eligibleNewStudents.includes(id));
                    const added = eligibleNewStudents.filter(id => !eligibleOldStudents.includes(id));
                    const kept = eligibleNewStudents.filter(id => eligibleOldStudents.includes(id));

                    // Removed
                    for (const id of removed) {
                        await applyStudentPointsChange(
                            id,
                            -oldPoints,
                            `إزالة من نشاط معتمد: ${currentServerData.title || ''}`,
                            'activity_deduct'
                        );
                    }

                    // Added
                    for (const id of added) {
                        await applyStudentPointsChange(
                            id,
                            newPoints,
                            `إضافة إلى نشاط معتمد: ${newData.title || currentServerData.title || ''}`,
                            'activity_award'
                        );
                    }

                    // Kept (Only if points changed)
                    if (oldPoints !== newPoints) {
                        const diff = newPoints - oldPoints;
                        for (const id of kept) {
                            await applyStudentPointsChange(
                                id,
                                diff,
                                `تعديل نقاط النشاط: ${newData.title || currentServerData.title || ''} (${diff > 0 ? `+${diff}` : diff})`,
                                diff > 0 ? 'activity_award' : 'activity_deduct'
                            );
                        }
                    }
                } else {
                    // Was NOT Done, now IS Done -> add newPoints to all eligible newStudents
                    for (const id of eligibleNewStudents) {
                        await applyStudentPointsChange(
                            id,
                            newPoints,
                            `مشاركة في نشاط: ${newData.title || currentServerData.title || ''}`,
                            'activity_award'
                        );
                    }
                }
            }

            // Finally, update the event itself
            transaction.update(eventRef, {
                ...newData,
                participatingStudents: newStudents,
                linkStudentIds: newLinkStudents,
                points: newPoints,
                status: newData.status,
                venueId: newData.venueId,
                title: newData.title,
                date: newData.date,
                startTime: newData.startTime,
                endTime: newData.endTime
            });
        });

        // Record all logged movements asynchronously after successful commit
        if (loggedChanges.length > 0) {
            Promise.allSettled(loggedChanges.map(change => logPointsChange(change))).catch(e => console.warn(e));
        }

        return true;
    } catch (error) {
        console.error("Smart Sync Failed:", error);
        throw error;
    }
}

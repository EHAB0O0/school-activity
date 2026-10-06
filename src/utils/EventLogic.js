import { runTransaction, doc, collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logPointsChange } from './pointsLedger';

/**
 * Updates an event and recalculates student points transactionally.
 * Handles cases where points changed, students changed, or status changed to/from 'Done'.
 * Ensures points are never negative and records point ledger movements.
 * Strictly adheres to Firestore transaction rule: all reads before all writes.
 */
export async function updateEventWithSmartSync(eventId, newData) {
    if (!eventId) throw new Error("Event ID is required for update.");

    const loggedChanges = [];
    let shouldUpdateDeferredSubmissions = false;

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
            if (!wasDone && isDone) {
                shouldUpdateDeferredSubmissions = true;
            }

            // Lists of students
            const oldStudents = currentServerData.participatingStudents || [];
            const newStudents = newData.participatingStudents || [];

            // Helper to get awarded points for a student in an event
            const getStudentEventPoints = (stuId, evData, defaultPts) => {
                const links = evData.linkStudentIds || [];
                const deferred = evData.deferredLinkStudents || {};
                const combine = evData.combineLinkStudents || {};

                if (deferred[stuId] !== undefined) {
                    return Number(deferred[stuId]) || defaultPts;
                }
                if (combine[stuId]) {
                    return defaultPts;
                }
                if (!links.includes(stuId)) {
                    return defaultPts;
                }
                return 0; // Immediate link registration, already received link points
            };

            // Points
            const oldPoints = Number(currentServerData.points) || 0;
            const newPoints = Number(newData.points) || 0;

            // Collect all student point adjustments in memory: studentId -> { diff, reason, actionType }
            const studentPointDiffs = new Map();

            // 1. If it WAS Done and is NO LONGER Done -> Revert all points
            if (wasDone && !isDone) {
                for (const studentId of oldStudents) {
                    const ptsToRevert = getStudentEventPoints(studentId, currentServerData, oldPoints);
                    if (ptsToRevert > 0) {
                        studentPointDiffs.set(studentId, {
                            diff: -ptsToRevert,
                            reason: `إلغاء اعتماد نشاط: ${currentServerData.title || ''}`,
                            actionType: 'activity_deduct'
                        });
                    }
                }
            }

            // 2. If it IS Done (whether it was before or just became)
            if (isDone) {
                if (wasDone) {
                    const removed = oldStudents.filter(id => !newStudents.includes(id));
                    const added = newStudents.filter(id => !oldStudents.includes(id));
                    const kept = newStudents.filter(id => oldStudents.includes(id));

                    // Removed
                    for (const id of removed) {
                        const oldAward = getStudentEventPoints(id, currentServerData, oldPoints);
                        if (oldAward > 0) {
                            studentPointDiffs.set(id, {
                                diff: -oldAward,
                                reason: `إزالة من نشاط معتمد: ${currentServerData.title || ''}`,
                                actionType: 'activity_deduct'
                            });
                        }
                    }

                    // Added
                    for (const id of added) {
                        const newAward = getStudentEventPoints(id, newData, newPoints);
                        if (newAward > 0) {
                            studentPointDiffs.set(id, {
                                diff: newAward,
                                reason: `إضافة إلى نشاط معتمد: ${newData.title || currentServerData.title || ''}`,
                                actionType: 'activity_award'
                            });
                        }
                    }

                    // Kept
                    for (const id of kept) {
                        const oldAward = getStudentEventPoints(id, currentServerData, oldPoints);
                        const newAward = getStudentEventPoints(id, newData, newPoints);
                        const diff = newAward - oldAward;
                        if (diff !== 0) {
                            studentPointDiffs.set(id, {
                                diff,
                                reason: `تعديل نقاط النشاط: ${newData.title || currentServerData.title || ''} (${diff > 0 ? `+${diff}` : diff})`,
                                actionType: diff > 0 ? 'activity_award' : 'activity_deduct'
                            });
                        }
                    }
                } else {
                    // Was NOT Done, now IS Done -> add points to all newStudents
                    for (const id of newStudents) {
                        const award = getStudentEventPoints(id, newData, newPoints);
                        if (award > 0) {
                            studentPointDiffs.set(id, {
                                diff: award,
                                reason: `مشاركة في نشاط: ${newData.title || currentServerData.title || ''}`,
                                actionType: 'activity_award'
                            });
                        }
                    }
                }
            }

            // --- PHASE 1: ALL READS (Must execute before any writes) ---
            const studentDocs = [];
            for (const [studentId, info] of studentPointDiffs.entries()) {
                if (info.diff === 0) continue;
                const sRef = doc(db, 'students', studentId);
                const sSnap = await transaction.get(sRef);
                if (sSnap.exists()) {
                    studentDocs.push({ studentId, sRef, sSnap, ...info });
                }
            }

            // --- PHASE 2: ALL WRITES (Only after all reads complete) ---
            for (const item of studentDocs) {
                const sData = item.sSnap.data();
                const prev = Math.max(0, Number(sData.totalPoints) || 0);
                const next = Math.max(0, prev + item.diff);

                transaction.update(item.sRef, { totalPoints: next });

                loggedChanges.push({
                    studentId: item.studentId,
                    studentName: sData.name || 'طالب',
                    grade: sData.grade || '',
                    section: sData.section || '',
                    class: sData.class || '',
                    change: item.diff,
                    previousTotalPoints: prev,
                    newTotalPoints: next,
                    reason: item.reason,
                    actionType: item.actionType,
                    eventId,
                    eventTitle: newData.title || currentServerData.title || '',
                    eventType: newData.typeName || currentServerData.typeName || ''
                });
            }

            // Update the event itself
            const newLinkStudents = newData.linkStudentIds || currentServerData.linkStudentIds || [];
            let finalStartTime = currentServerData.startTime;
            if (newData.startTime?.toDate) {
                finalStartTime = newData.startTime;
            } else if (newData.date && newData.startTime) {
                const timeStr = typeof newData.startTime === 'string' && newData.startTime.includes('T') ? newData.startTime.split('T')[1] : newData.startTime;
                finalStartTime = Timestamp.fromDate(new Date(`${newData.date}T${timeStr}`));
            }

            let finalEndTime = currentServerData.endTime;
            if (newData.endTime?.toDate) {
                finalEndTime = newData.endTime;
            } else if (newData.date && newData.endTime) {
                const timeStr = typeof newData.endTime === 'string' && newData.endTime.includes('T') ? newData.endTime.split('T')[1] : newData.endTime;
                finalEndTime = Timestamp.fromDate(new Date(`${newData.date}T${timeStr}`));
            }

            const updatePayload = {
                ...currentServerData,
                ...newData,
                participatingStudents: newStudents,
                linkStudentIds: newLinkStudents,
                points: newPoints,
                status: newData.status,
                venueId: newData.venueId ?? currentServerData.venueId ?? '',
                title: newData.title ?? currentServerData.title ?? '',
                date: newData.date ?? currentServerData.date ?? '',
                startTime: finalStartTime,
                endTime: finalEndTime
            };
            delete updatePayload.id;
            delete updatePayload.markDone;
            const cleanPayload = Object.fromEntries(
                Object.entries(updatePayload).filter(([_, v]) => v !== undefined)
            );
            transaction.update(eventRef, cleanPayload);
        });

        // Update any link submissions marked as deferred for this event
        if (shouldUpdateDeferredSubmissions) {
            try {
                const subSnap = await getDocs(query(
                    collection(db, 'link_submissions'),
                    where('eventId', '==', eventId)
                ));
                if (!subSnap.empty) {
                    const subBatch = writeBatch(db);
                    let hasDeferred = false;
                    subSnap.docs.forEach(docSnap => {
                        const d = docSnap.data();
                        if (d.deferredPoints) {
                            hasDeferred = true;
                            subBatch.update(docSnap.ref, {
                                deferredPoints: false,
                                pointsAwarded: d.pendingPoints || newData.points || 0,
                                pendingPoints: 0,
                                awardedAtEventDone: true
                            });
                        }
                    });
                    if (hasDeferred) await subBatch.commit();
                }
            } catch (subErr) {
                console.warn("Could not batch update link_submissions on event done:", subErr);
            }
        }

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

import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';

/**
 * Log a point change for a student into the points_logs collection.
 * 
 * @param {Object} params
 * @param {string} params.studentId - Firestore student document ID
 * @param {string} params.studentName - Full student name
 * @param {string} [params.grade] - Student grade (e.g. "ثاني ثانوي")
 * @param {string} [params.section] - Student section (e.g. "1")
 * @param {string} [params.class] - Student class combined
 * @param {number} params.change - Points change (+10, -5, etc.)
 * @param {number} params.previousTotalPoints - Student's total points before this change
 * @param {number} params.newTotalPoints - Student's total points after this change
 * @param {string} params.reason - Human-readable reason for the change
 * @param {'activity_award'|'activity_deduct'|'manual_edit'|'link_registration'|'bulk_adjustment'|'duplicate_merge'} params.actionType
 * @param {string} [params.eventId] - Related event ID if any
 * @param {string} [params.eventTitle] - Related event title if any
 * @param {string} [params.eventType] - Related event type if any
 * @param {string} [params.performedBy] - Admin or user who performed the change
 */
export async function logPointsChange({
    studentId,
    studentName,
    grade = '',
    section = '',
    class: studentClass = '',
    change,
    previousTotalPoints = 0,
    newTotalPoints = 0,
    reason,
    actionType = 'manual_edit',
    eventId = null,
    eventTitle = null,
    eventType = null,
    performedBy = 'النظام'
}) {
    if (!studentId || change === undefined || change === 0) return null;

    try {
        const payload = {
            studentId,
            studentName: studentName || 'طالب',
            grade: grade || '',
            section: section || '',
            class: studentClass || (grade && section ? `${grade} - ${section}` : ''),
            change: Number(change) || 0,
            previousTotalPoints: Math.max(0, Number(previousTotalPoints) || 0),
            newTotalPoints: Math.max(0, Number(newTotalPoints) || 0),
            reason: reason || 'تعديل في النقاط',
            actionType,
            eventId: eventId || null,
            eventTitle: eventTitle || null,
            eventType: eventType || null,
            performedBy: performedBy || 'المشرف',
            createdAt: Timestamp.now()
        };

        const docRef = await addDoc(collection(db, 'points_logs'), payload);
        return docRef.id;
    } catch (err) {
        if (err?.code === 'permission-denied') {
            console.info("Firestore: points_logs write rule pending in Firebase Console.");
        } else {
            console.warn("Failed to log points change:", err);
        }
        return null;
    }
}

/**
 * Ensures points are never negative.
 * If negative, clamps to 0.
 */
export function clampPoints(points) {
    const val = Number(points) || 0;
    return val < 0 ? 0 : val;
}

/**
 * Scans students and silently corrects any negative points to 0 in Firestore.
 * Does NOT generate audit logs per user request.
 * 
 * @param {Array} studentsList
 */
export async function sanitizeNegativePoints(studentsList = []) {
    if (!Array.isArray(studentsList) || studentsList.length === 0) return;

    const negativeStudents = studentsList.filter(s => (Number(s.totalPoints) || 0) < 0);
    if (negativeStudents.length === 0) return;

    console.info(`Found ${negativeStudents.length} students with negative points. Auto-zeroing...`);

    const updatePromises = negativeStudents.map(student => {
        try {
            const sRef = doc(db, 'students', student.id);
            return updateDoc(sRef, { totalPoints: 0 });
        } catch (err) {
            console.warn(`Failed to sanitize points for student ${student.id}:`, err);
            return Promise.resolve();
        }
    });

    await Promise.allSettled(updatePromises);
}

/**
 * Fetch points history for a specific student.
 * 
 * @param {string} studentId
 * @returns {Promise<Array>}
 */
export async function fetchStudentPointsLogs(studentId) {
    if (!studentId) return [];
    try {
        const q = query(
            collection(db, 'points_logs'),
            where('studentId', '==', studentId)
        );
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Sort descending by createdAt
        logs.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
            return timeB - timeA;
        });

        return logs;
    } catch (err) {
        if (err?.code === 'permission-denied') {
            console.info("Firestore: points_logs read rule pending in Firebase Console.");
        } else {
            console.warn("Error fetching student points logs:", err);
        }
        return [];
    }
}

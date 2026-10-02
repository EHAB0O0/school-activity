import { db } from '../firebase';
import { doc, getDocs, collection, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { logPointsChange } from './pointsLedger';

/**
 * Normalizes Arabic names to detect spelling variations
 * e.g. "أحمد" vs "احمد", "عبد الله" vs "عبدالله", "فاطمة" vs "فاطمه"
 */
export const normalizeArabic = (str) => {
    if (!str) return '';
    return str
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\u0640/g, '') // Tatweel
        .replace(/عبد\s+/g, 'عبد') // Normalize "عبد الله" to "عبدالله"
        .replace(/ابو\s+/g, 'ابو')  // Normalize "أبو " to "ابو"
        .replace(/\s+/g, ' ');      // Collapse spaces
};

/**
 * Detects duplicate students by normalized name among active students
 */
export const findDuplicateGroups = (students) => {
    if (!students || !Array.isArray(students)) return [];

    const map = new Map();
    students.forEach(st => {
        if (!st || !st.name) return;
        const normKey = normalizeArabic(st.name);
        if (!normKey) return;

        if (!map.has(normKey)) {
            map.set(normKey, []);
        }
        map.get(normKey).push(st);
    });

    const duplicateGroups = [];
    map.forEach((list, normKey) => {
        if (list.length > 1) {
            duplicateGroups.push({
                key: normKey,
                displayName: list[0].name,
                students: list
            });
        }
    });

    return duplicateGroups;
};

/**
 * Enriches duplicate groups with event participation counts and details
 */
export const enrichDuplicateGroupsWithEvents = (groups, allEvents) => {
    return groups.map(group => {
        const enrichedStudents = group.students.map(st => {
            const studentEvents = (allEvents || []).filter(e =>
                Array.isArray(e.participatingStudents) && e.participatingStudents.includes(st.id)
            );

            // Compute completeness score:
            // 10 pts per event + 1 pt per point + 5 pts for grade/section + 2 pts per spec + 3 pts for notes
            const completenessScore =
                (studentEvents.length * 10) +
                Math.min(st.totalPoints || 0, 100) +
                (st.grade ? 5 : 0) +
                (st.section ? 5 : 0) +
                ((st.specializations || []).length * 2) +
                (st.notes ? 3 : 0);

            return {
                ...st,
                eventsCount: studentEvents.length,
                events: studentEvents,
                completenessScore
            };
        });

        // Sort descending by: eventsCount desc, completenessScore desc, totalPoints desc
        enrichedStudents.sort((a, b) => {
            if (b.eventsCount !== a.eventsCount) return b.eventsCount - a.eventsCount;
            if (b.completenessScore !== a.completenessScore) return b.completenessScore - a.completenessScore;
            return (b.totalPoints || 0) - (a.totalPoints || 0);
        });

        const primaryCandidate = enrichedStudents[0];
        const secondCandidate = enrichedStudents[1];

        // Scenario analysis:
        // Scenario 1: Unlinked duplicate (one has 0 events and primary has >= 0)
        const hasZeroEvent = enrichedStudents.some(s => s.eventsCount === 0);
        // Scenario 2: Both have events linked and one has more/better
        const allHaveEvents = enrichedStudents.every(s => s.eventsCount > 0);
        // Scenario 3: Perfectly identical events and details
        const isIdentical =
            enrichedStudents.length === 2 &&
            primaryCandidate.eventsCount === secondCandidate.eventsCount &&
            (primaryCandidate.totalPoints || 0) === (secondCandidate.totalPoints || 0) &&
            primaryCandidate.completenessScore === secondCandidate.completenessScore;

        return {
            ...group,
            students: enrichedStudents,
            primaryCandidate,
            hasZeroEvent,
            allHaveEvents,
            isIdentical
        };
    });
};

/**
 * Merges a secondary student into a primary student:
 * 1. Reassigns all events from secondaryId to primaryId in Firestore
 * 2. Merges participantDetails in events
 * 3. Updates primary student's specializations and points
 * 4. Permanently deletes secondary student document
 */
export const mergeStudentRecords = async ({ primaryStudent, secondaryStudent, allEvents }) => {
    const batch = writeBatch(db);

    // 1. Reassign events
    const affectedEvents = (allEvents || []).filter(e =>
        Array.isArray(e.participatingStudents) && e.participatingStudents.includes(secondaryStudent.id)
    );

    affectedEvents.forEach(evt => {
        const evtRef = doc(db, 'events', evt.id);
        const newParticipants = (evt.participatingStudents || []).map(id =>
            id === secondaryStudent.id ? primaryStudent.id : id
        );
        // Deduplicate in case primary was already in the same event
        const uniqueParticipants = Array.from(new Set(newParticipants));

        const updatePayload = {
            participatingStudents: uniqueParticipants
        };

        // Transfer participantDetails if present
        if (evt.participantDetails && evt.participantDetails[secondaryStudent.id]) {
            const newDetails = { ...evt.participantDetails };
            if (!newDetails[primaryStudent.id]) {
                newDetails[primaryStudent.id] = newDetails[secondaryStudent.id];
            }
            delete newDetails[secondaryStudent.id];
            updatePayload.participantDetails = newDetails;
        }

        batch.update(evtRef, updatePayload);
    });

    // 2. Merge primary student details
    const primaryRef = doc(db, 'students', primaryStudent.id);
    const mergedSpecs = Array.from(new Set([
        ...(primaryStudent.specializations || []),
        ...(secondaryStudent.specializations || [])
    ]));

    const mergedPoints = (primaryStudent.totalPoints || 0) + (secondaryStudent.totalPoints || 0);

    const primaryUpdate = {
        specializations: mergedSpecs,
        totalPoints: mergedPoints,
        // Fill missing grade/section if secondary had it
        grade: primaryStudent.grade || secondaryStudent.grade || '',
        section: primaryStudent.section || secondaryStudent.section || '',
        class: primaryStudent.class || secondaryStudent.class || ''
    };

    if (!primaryStudent.notes && secondaryStudent.notes) {
        primaryUpdate.notes = secondaryStudent.notes;
    }

    batch.update(primaryRef, primaryUpdate);

    // 3. Delete secondary student document
    const secondaryRef = doc(db, 'students', secondaryStudent.id);
    batch.delete(secondaryRef);

    await batch.commit();

    if ((secondaryStudent.totalPoints || 0) > 0) {
        logPointsChange({
            studentId: primaryStudent.id,
            studentName: primaryStudent.name,
            grade: primaryUpdate.grade,
            section: primaryUpdate.section,
            class: primaryUpdate.class,
            change: secondaryStudent.totalPoints,
            previousTotalPoints: primaryStudent.totalPoints || 0,
            newTotalPoints: mergedPoints,
            reason: `دمج نقاط من حساب مكرر (${secondaryStudent.name})`,
            actionType: 'duplicate_merge'
        }).catch(console.warn);
    }
};

/**
 * Safely deletes a duplicate student who has 0 activity links
 */
export const deleteUnlinkedStudent = async (studentId) => {
    await deleteDoc(doc(db, 'students', studentId));
};

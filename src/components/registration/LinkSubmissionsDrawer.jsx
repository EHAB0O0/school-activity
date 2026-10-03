import { useState, useEffect, useMemo, useRef } from 'react';
import {
    X, CheckCircle, XCircle, Search, Download, Printer,
    AlertTriangle, UserCheck, Trash2, Edit2, ShieldAlert,
    Clock, CheckSquare, Square, RefreshCw, Calendar, Link2,
    UserPlus, ArrowRightLeft, Sparkles, Filter, ChevronDown, Check,
    Phone, GraduationCap, AlertCircle, Award, UserX, ExternalLink, HelpCircle,
    Zap, Users
} from 'lucide-react';
import { db } from '../../firebase';
import {
    collection, query, where, onSnapshot, doc, updateDoc,
    getDocs, addDoc, serverTimestamp, increment, arrayUnion, arrayRemove,
    deleteDoc, writeBatch
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useSettings } from '../../contexts/SettingsContext';
import { logPointsChange } from '../../utils/pointsLedger';
import { sortStudentsArabic, cleanClassString, getOfficialReportHeaderHtml, getStandardPrintStyles, printHtmlDocument, getOfficialReportFooterHtml } from '../../utils/reportUtils';
import AdvancedPrintModal from '../ui/AdvancedPrintModal';

export default function LinkSubmissionsDrawer({ isOpen, onClose, link, onLinkUpdated, onEditLink }) {
    const { schoolInfo } = useSettings();
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [submissions, setSubmissions] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isApproving, setIsApproving] = useState(false);
    const processingSubIdsRef = useRef(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | pending | approved | rejected | waitlist | matched | unregistered | discrepancy | duplicate
    const [gradeFilter, setGradeFilter] = useState('all'); // all | unknown | specific grade
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [editingSubmission, setEditingSubmission] = useState(null);
    const [showCreateStudentModal, setShowCreateStudentModal] = useState(null); // fallback single choice modal
    const [showBulkCreateModal, setShowBulkCreateModal] = useState(null); // { unregCount, totalCount, unregisteredSubs, registeredSubs }
    const [bulkPoints, setBulkPoints] = useState(0);
    const [bulkTiming, setBulkTiming] = useState('immediate');
    const [studentActionSub, setStudentActionSub] = useState(null); // Active submission in dealing modal
    const [actionPointsOverride, setActionPointsOverride] = useState(null); // Custom points override in modal
    const [actionTimingOverride, setActionTimingOverride] = useState(null); // 'immediate' | 'on_event_done' override in modal
    const [chosenStudentOverride, setChosenStudentOverride] = useState(null); // Manually picked student
    const [reassignSearchQuery, setReassignSearchQuery] = useState('');
    const [showManualReassign, setShowManualReassign] = useState(false);

    // Real-time Submissions Listener
    useEffect(() => {
        if (!isOpen || !link?.id) return;

        const q = query(
            collection(db, 'link_submissions'),
            where('linkId', '==', link.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
            // Sort by createdAt descending
            list.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setSubmissions(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching submissions:", err);
            toast.error("فشل في تحميل المسجلين");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen, link?.id]);

    // Fetch active students for duplicate matching
    useEffect(() => {
        if (!isOpen) return;
        async function fetchStudents() {
            try {
                const snap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
                setStudents(snap.docs.map(d => ({ ...d.data(), id: d.id })));
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        }
        fetchStudents();
    }, [isOpen]);

    // Sync link count with approved count
    useEffect(() => {
        if (!link?.id || loading) return;
        const approvedCount = submissions.filter(s => s.status === 'approved').length;
        if (link.currentCount !== approvedCount) {
            updateDoc(doc(db, 'registration_links', link.id), { currentCount: approvedCount }).catch(console.error);
            if (onLinkUpdated) onLinkUpdated();
        }
    }, [submissions, link?.id, link?.currentCount, loading, onLinkUpdated]);

    // Arabic normalization helper
    const normalizeArabic = (str) => {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[ؤئ]/g, 'ي')
            .replace(/\u0640/g, '')
            .replace(/عبد\s+/g, 'عبد')
            .replace(/[\(\)\[\]{}.,،_+\-–—\\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Phone normalization helper
    const normalizePhone = (phone) => {
        if (!phone) return '';
        let digits = String(phone).replace(/\D/g, '');
        if (digits.startsWith('966')) {
            digits = '0' + digits.substring(3);
        } else if (digits.length === 9 && digits.startsWith('5')) {
            digits = '0' + digits;
        }
        return digits;
    };

    // Smart Duplicate & Existing Student Matching Engine
    const duplicateMap = useMemo(() => {
        const map = {};
        const nameCountInLink = {};
        const phoneCountInLink = {};

        submissions.forEach(sub => {
            const normName = normalizeArabic(sub.studentName);
            if (normName) {
                nameCountInLink[normName] = (nameCountInLink[normName] || 0) + 1;
            }
            const normP = normalizePhone(sub.phone);
            if (normP && normP.length >= 9) {
                phoneCountInLink[normP] = (phoneCountInLink[normP] || 0) + 1;
            }
        });

        const preparedStudents = students.map(s => {
            const sNorm = normalizeArabic(s.name);
            const sTokens = sNorm.split(' ').filter(Boolean);
            const sPhone = normalizePhone(s.phone);
            return { ...s, sNorm, sTokens, sPhone };
        });

        submissions.forEach(sub => {
            const subNorm = normalizeArabic(sub.studentName);
            const subPhone = normalizePhone(sub.phone);
            const subTokens = subNorm.split(' ').filter(Boolean);

            let matchedStudent = null;
            let matchType = null; // 'explicit' | 'exact_name' | 'phone_match' | 'fuzzy_name'
            let matchConfidence = 0;

            // 0. Explicit previously assigned student ID
            if (sub.matchedStudentId) {
                const found = preparedStudents.find(s => s.id === sub.matchedStudentId);
                if (found) {
                    matchedStudent = found;
                    matchType = 'explicit';
                    matchConfidence = 100;
                }
            }

            // 1. Exact Name
            if (!matchedStudent && subNorm) {
                const found = preparedStudents.find(s => s.sNorm === subNorm);
                if (found) {
                    matchedStudent = found;
                    matchType = 'exact_name';
                    matchConfidence = 100;
                }
            }

            // 2. Phone match
            if (!matchedStudent && subPhone && subPhone.length >= 9) {
                const found = preparedStudents.find(s => s.sPhone && s.sPhone === subPhone);
                if (found) {
                    matchedStudent = found;
                    matchType = 'phone_match';
                    matchConfidence = 95;
                }
            }

            // 3. Fuzzy / Token Overlap
            if (!matchedStudent && subTokens.length >= 2) {
                let bestScore = 0;
                let bestCand = null;

                for (const s of preparedStudents) {
                    if (s.sTokens.length < 2) continue;
                    const commonTokens = subTokens.filter(t => s.sTokens.includes(t));
                    const firstMatch = subTokens[0] === s.sTokens[0];
                    const lastMatch = subTokens[subTokens.length - 1] === s.sTokens[s.sTokens.length - 1];

                    if (firstMatch && lastMatch && commonTokens.length >= 2) {
                        const score = (commonTokens.length * 2) / (subTokens.length + s.sTokens.length);
                        if (score > bestScore && score >= 0.55) {
                            bestScore = score;
                            bestCand = s;
                        }
                    } else if (commonTokens.length >= 3) {
                        const score = (commonTokens.length * 2) / (subTokens.length + s.sTokens.length);
                        if (score > bestScore && score >= 0.65) {
                            bestScore = score;
                            bestCand = s;
                        }
                    }
                }

                if (bestCand) {
                    matchedStudent = bestCand;
                    matchType = 'fuzzy_name';
                    matchConfidence = Math.round(bestScore * 100);
                }
            }

            // Grade / Section Concordance
            let isSameGrade = false;
            let isSameSection = false;
            let isSamePhone = false;

            if (matchedStudent) {
                const subGradeNorm = normalizeArabic(sub.grade);
                const stuGradeNorm = normalizeArabic(matchedStudent.grade);
                const stuClassNorm = normalizeArabic(matchedStudent.class || '');
                const isSubUnknown = !subGradeNorm || subGradeNorm === 'غير معروف' || !!sub.isGradeUnknown;
                isSameGrade = isSubUnknown || stuGradeNorm === subGradeNorm || stuClassNorm.includes(subGradeNorm);

                const subSec = String(sub.section || '').trim();
                const stuSec = String(matchedStudent.section || '').trim();
                isSameSection = isSubUnknown || !subSec || !stuSec || subSec === stuSec;

                isSamePhone = !subPhone || !matchedStudent.sPhone || subPhone === matchedStudent.sPhone;
            }

            // Candidates
            const candidates = [];
            if (subTokens.length >= 2) {
                for (const s of preparedStudents) {
                    if (matchedStudent && s.id === matchedStudent.id) continue;
                    const common = subTokens.filter(t => s.sTokens.includes(t));
                    if (common.length >= 2) {
                        candidates.push(s);
                        if (candidates.length >= 3) break;
                    }
                }
            }

            const dupNameCount = subNorm ? (nameCountInLink[subNorm] || 0) : 0;
            const dupPhoneCount = subPhone && subPhone.length >= 9 ? (phoneCountInLink[subPhone] || 0) : 0;
            const duplicateCount = Math.max(dupNameCount, dupPhoneCount);

            map[sub.id] = {
                duplicateInLink: duplicateCount > 1,
                duplicateCount,
                matchedStudent: matchedStudent || null,
                matchType,
                matchConfidence,
                isExistingInGrade: !!matchedStudent && isSameGrade,
                isExistingOtherGrade: !!matchedStudent && !isSameGrade,
                isSameSection,
                isSamePhone,
                hasDiscrepancy: !!matchedStudent && (!isSameGrade || !isSameSection),
                existingGrade: matchedStudent?.grade || matchedStudent?.class || '',
                existingSection: matchedStudent?.section || '',
                existingPhone: matchedStudent?.phone || '',
                existingPoints: Number(matchedStudent?.totalPoints) || 0,
                candidates
            };
        });

        return map;
    }, [submissions, students]);

    // Parse custom fields (backward compatible)
    const customFields = Array.isArray(link?.customFields) && link.customFields.length > 0
        ? link.customFields
        : (link?.customFieldLabel ? [{ id: 'f_legacy', label: link.customFieldLabel, required: !!link.customFieldRequired }] : []);

    // Parse specializations display
    const specializationsDisplay = Array.isArray(link?.specializations) && link.specializations.length > 0
        ? link.specializations.join('، ')
        : (link?.specialization || 'عام');

    // Available unique grades & unknown grade count
    const availableGrades = useMemo(() => {
        const set = new Set();
        submissions.forEach(s => {
            if (s.grade && s.grade !== 'غير معروف') {
                set.add(s.grade);
            }
        });
        return Array.from(set).sort();
    }, [submissions]);

    const unknownGradesCount = useMemo(() => {
        return submissions.filter(s => !s.grade || s.grade === 'غير معروف' || !!s.isGradeUnknown).length;
    }, [submissions]);

    // Dynamic Columns for Print
    const printColumnsDefinition = useMemo(() => {
        const cols = [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'studentName', label: 'اسم الطالب', defaultVisible: true },
            { id: 'class', label: 'الصف والشعبة', defaultVisible: true }
        ];

        if (customFields.length > 0) {
            customFields.forEach(f => {
                cols.push({
                    id: `custom_${f.id}`,
                    label: f.label || 'بيان إضافي',
                    defaultVisible: true
                });
            });
        } else if (link?.customFieldLabel) {
            cols.push({
                id: 'custom_legacy',
                label: link.customFieldLabel,
                defaultVisible: true
            });
        }

        cols.push({ id: 'phone', label: 'رقم الجوال', defaultVisible: false, badge: 'اتصال' });
        cols.push({ id: 'status', label: 'حالة الاعتماد', defaultVisible: true });
        cols.push({ id: 'date', label: 'تاريخ التسجيل', defaultVisible: false });

        return cols;
    }, [customFields, link?.customFieldLabel]);

    if (!isOpen || !link) return null;

    // Filtered Submissions
    const filteredSubmissions = submissions.filter(sub => {
        const matchesSearch =
            (sub.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.grade || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.section || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.phone || '').includes(searchTerm) ||
            (sub.customFieldValue || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.customValues && Object.values(sub.customValues).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())));

        const dup = duplicateMap[sub.id] || {};
        let matchesStatus = true;
        if (statusFilter === 'all') matchesStatus = true;
        else if (statusFilter === 'pending') matchesStatus = sub.status === 'pending';
        else if (statusFilter === 'approved') matchesStatus = sub.status === 'approved';
        else if (statusFilter === 'waitlist') matchesStatus = sub.status === 'waitlist';
        else if (statusFilter === 'rejected') matchesStatus = sub.status === 'rejected';
        else if (statusFilter === 'matched') matchesStatus = !!dup.matchedStudent;
        else if (statusFilter === 'unregistered') matchesStatus = !dup.matchedStudent;
        else if (statusFilter === 'discrepancy') matchesStatus = !!dup.hasDiscrepancy;
        else if (statusFilter === 'duplicate') matchesStatus = !!dup.duplicateInLink;

        let matchesGrade = true;
        if (gradeFilter === 'unknown') {
            matchesGrade = !sub.grade || sub.grade === 'غير معروف' || !!sub.isGradeUnknown;
        } else if (gradeFilter !== 'all') {
            matchesGrade = sub.grade === gradeFilter;
        }

        return matchesSearch && matchesStatus && matchesGrade;
    });

    // Counts
    const counts = {
        total: submissions.length,
        approved: submissions.filter(s => s.status === 'approved').length,
        pending: submissions.filter(s => s.status === 'pending').length,
        waitlist: submissions.filter(s => s.status === 'waitlist').length,
        rejected: submissions.filter(s => s.status === 'rejected').length,
        matched: submissions.filter(s => !!duplicateMap[s.id]?.matchedStudent).length,
        unregistered: submissions.filter(s => !duplicateMap[s.id]?.matchedStudent).length,
        discrepancy: submissions.filter(s => !!duplicateMap[s.id]?.hasDiscrepancy).length,
        duplicate: submissions.filter(s => !!duplicateMap[s.id]?.duplicateInLink).length,
    };

    // Selection helpers
    const allFilteredSelected = filteredSubmissions.length > 0 && filteredSubmissions.every(s => selectedIds.includes(s.id));
    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredSubmissions.map(s => s.id));
        }
    };

    const handleToggleSelectSubmission = (id, event) => {
        if (event?.shiftKey && lastSelectedId && lastSelectedId !== id) {
            const lastIdx = filteredSubmissions.findIndex(s => s.id === lastSelectedId);
            const currIdx = filteredSubmissions.findIndex(s => s.id === id);
            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);
                const rangeIds = filteredSubmissions.slice(start, end + 1).map(s => s.id);
                setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
                setLastSelectedId(id);
                return;
            }
        }

        setLastSelectedId(id);
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    // Comprehensive student approval & action handler
    const handleApproveStudent = async ({
        sub,
        targetStudent = null,
        updateProfile = false,
        createProfile = false,
        eventOnly = false,
        customPoints = null,
        timingOverride = null
    }) => {
        if (!sub || !sub.id || processingSubIdsRef.current.has(sub.id) || isApproving) {
            return;
        }

        if (sub.status === 'approved') {
            toast.error("هذا الطالب تم اعتماده مسبقاً");
            setStudentActionSub(null);
            return;
        }

        processingSubIdsRef.current.add(sub.id);
        setIsApproving(true);

        try {
            const rawPoints = customPoints !== null ? Number(customPoints) : (Number(link.pointsPerStudent) || 0);
            const effectiveTiming = timingOverride || link.pointsTiming || 'immediate';
            const isDeferred = !eventOnly && effectiveTiming === 'on_event_done' && Boolean(link.eventId);
            const pointsToAwardNow = (isDeferred || eventOnly) ? 0 : rawPoints;

            let studentId = targetStudent?.id || null;
            let finalStudentName = sub.studentName;
            let finalGrade = sub.grade || '';
            let finalSection = sub.section || '';

            if (createProfile) {
                const specializationsList = (Array.isArray(link.specializations) && link.specializations.length > 0)
                    ? link.specializations
                    : (link.specialization ? [link.specialization] : ['عام / جوكر']);

                const newStudentRef = await addDoc(collection(db, 'students'), {
                    name: sub.studentName,
                    grade: sub.grade || '',
                    section: sub.section || '',
                    class: `${sub.grade || ''} / ${sub.section || ''}`.trim(),
                    phone: sub.phone || '',
                    specializations: specializationsList,
                    totalPoints: pointsToAwardNow,
                    active: true,
                    joinedAt: serverTimestamp(),
                    notes: `مسجل عبر رابط: ${link.title}`
                });
                studentId = newStudentRef.id;

                setStudents(prev => [...prev, {
                    id: newStudentRef.id,
                    name: sub.studentName,
                    grade: sub.grade || '',
                    section: sub.section || '',
                    class: `${sub.grade || ''} / ${sub.section || ''}`.trim(),
                    phone: sub.phone || '',
                    totalPoints: pointsToAwardNow,
                    active: true
                }]);
            } else if (targetStudent && updateProfile) {
                const updates = {
                    grade: sub.grade || targetStudent.grade || '',
                    section: sub.section || targetStudent.section || '',
                    class: `${sub.grade || targetStudent.grade || ''} / ${sub.section || targetStudent.section || ''}`.trim(),
                    updatedAt: serverTimestamp()
                };
                if (sub.phone) updates.phone = sub.phone;
                if (pointsToAwardNow > 0) updates.totalPoints = increment(pointsToAwardNow);

                await updateDoc(doc(db, 'students', targetStudent.id), updates);

                finalStudentName = targetStudent.name;
                finalGrade = updates.grade;
                finalSection = updates.section;

                setStudents(prev => prev.map(s => s.id === targetStudent.id ? {
                    ...s,
                    ...updates,
                    totalPoints: (Number(s.totalPoints) || 0) + pointsToAwardNow
                } : s));
            } else if (targetStudent && pointsToAwardNow > 0) {
                await updateDoc(doc(db, 'students', targetStudent.id), {
                    totalPoints: increment(pointsToAwardNow)
                });

                finalStudentName = targetStudent.name;
                finalGrade = targetStudent.grade || sub.grade || '';
                finalSection = targetStudent.section || sub.section || '';

                setStudents(prev => prev.map(s => s.id === targetStudent.id ? {
                    ...s,
                    totalPoints: (Number(s.totalPoints) || 0) + pointsToAwardNow
                } : s));
            }

            if (studentId && pointsToAwardNow > 0) {
                const prevPts = createProfile ? 0 : Math.max(0, Number(targetStudent?.totalPoints) || 0);
                const nextPts = prevPts + pointsToAwardNow;
                logPointsChange({
                    studentId,
                    studentName: finalStudentName,
                    grade: finalGrade,
                    section: finalSection,
                    class: `${finalGrade} / ${finalSection}`.trim(),
                    change: pointsToAwardNow,
                    previousTotalPoints: prevPts,
                    newTotalPoints: nextPts,
                    reason: `اعتماد تسجيل عبر رابط: ${link.title}`,
                    actionType: 'link_registration',
                    eventId: link.eventId || null,
                    eventTitle: link.eventTitle || link.title
                }).catch(console.warn);
            }

            if (link.eventId && studentId) {
                const eventUpdates = {
                    participatingStudents: arrayUnion(studentId),
                    linkStudentIds: arrayUnion(studentId)
                };

                if (isDeferred) {
                    eventUpdates[`deferredLinkStudents.${studentId}`] = rawPoints;
                } else if (link.pointsPolicy === 'combine_both') {
                    eventUpdates[`combineLinkStudents.${studentId}`] = true;
                }

                const customFieldsList = link.customFields || [];
                const detailsForStudent = {};
                if (sub.customValues && typeof sub.customValues === 'object') {
                    Object.entries(sub.customValues).forEach(([fId, val]) => {
                        const matchedField = customFieldsList.find(f => f.id === fId);
                        const label = matchedField?.label || fId;
                        if (val !== undefined && val !== null && String(val).trim()) {
                            detailsForStudent[label] = val;
                        }
                    });
                }
                if (Object.keys(detailsForStudent).length === 0 && sub.customFieldValue) {
                    const fallbackLabel = customFieldsList[0]?.label || 'ملاحظات / الدور';
                    detailsForStudent[fallbackLabel] = sub.customFieldValue;
                }

                if (Object.keys(detailsForStudent).length > 0) {
                    eventUpdates[`participantDetails.${studentId}`] = detailsForStudent;
                }

                await updateDoc(doc(db, 'events', link.eventId), eventUpdates).catch(console.warn);
            }

            await updateDoc(doc(db, 'link_submissions', sub.id), {
                status: 'approved',
                matchedStudentId: studentId || null,
                approvedAt: serverTimestamp(),
                approvalMode: eventOnly ? 'event_only' : createProfile ? 'new_profile' : updateProfile ? 'profile_updated' : 'linked',
                deferredPoints: isDeferred,
                pendingPoints: isDeferred ? rawPoints : 0,
                pointsAwarded: pointsToAwardNow
            });

            if (isDeferred) {
                toast.success(`تم اعتماد الطالب: ${sub.studentName} (سيتم رصد ${rawPoints} نقطة عند إنجاز الفعالية)`);
            } else {
                toast.success(`تم اعتماد الطالب: ${sub.studentName}${pointsToAwardNow > 0 ? ` ورصد ${pointsToAwardNow} نقطة` : ''}`);
            }

            setStudentActionSub(null);
            setShowCreateStudentModal(null);
            setChosenStudentOverride(null);
            setShowManualReassign(false);
            setReassignSearchQuery('');
            setActionPointsOverride(null);
        } catch (err) {
            console.error("Approve error:", err);
            toast.error("فشل في اعتماد الطالب: " + err.message);
        } finally {
            if (sub?.id) {
                processingSubIdsRef.current.delete(sub.id);
            }
            setIsApproving(false);
        }
    };

    // Fast direct approve wrapper
    const handleApprove = async (sub, createProfile = false) => {
        const dupInfo = duplicateMap[sub.id];
        const targetStudent = dupInfo?.matchedStudent || null;
        return handleApproveStudent({
            sub,
            targetStudent,
            updateProfile: false,
            createProfile: !targetStudent && createProfile,
            eventOnly: !targetStudent && !createProfile
        });
    };

    // Reject a submission
    const handleReject = async (sub) => {
        try {
            await updateDoc(doc(db, 'link_submissions', sub.id), {
                status: 'rejected',
                rejectedAt: serverTimestamp()
            });

            // If previously linked to an event, remove from event
            if (link.eventId && sub.matchedStudentId) {
                await updateDoc(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayRemove(sub.matchedStudentId),
                    linkStudentIds: arrayRemove(sub.matchedStudentId)
                }).catch(console.warn);
            }

            toast.success(`تم رفض الطلب: ${sub.studentName}`);
        } catch (err) {
            toast.error("فشل في الرفض: " + err.message);
        }
    };

    // Delete submission
    const handleDelete = async (subId) => {
        if (!window.confirm("هل أنت متأكد من حذف هذا التسجيل؟")) return;
        try {
            const subToDelete = submissions.find(s => s.id === subId);
            await deleteDoc(doc(db, 'link_submissions', subId));
            setSelectedIds(prev => prev.filter(id => id !== subId));

            // If was participating in linked event, remove
            if (link.eventId && subToDelete?.matchedStudentId) {
                await updateDoc(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayRemove(subToDelete.matchedStudentId),
                    linkStudentIds: arrayRemove(subToDelete.matchedStudentId)
                }).catch(console.warn);
            }

            toast.success("تم الحذف بنجاح");
        } catch (err) {
            toast.error("فشل في الحذف: " + err.message);
        }
    };

    // Bulk Approve Click Handler
    const handleBulkApproveClick = () => {
        if (selectedIds.length === 0) return;

        const subsToProcess = selectedIds
            .map(id => submissions.find(s => s.id === id))
            .filter(s => s && s.status !== 'approved');

        if (subsToProcess.length === 0) {
            toast.error("جميع الطلاب المحددين معتمدون مسبقاً");
            return;
        }

        const unregisteredSubs = subsToProcess.filter(sub => !duplicateMap[sub.id]?.matchedStudent);
        const registeredSubs = subsToProcess.filter(sub => !!duplicateMap[sub.id]?.matchedStudent);

        setBulkPoints(Number(link.pointsPerStudent) || 0);
        setBulkTiming(link.pointsTiming || 'immediate');

        setShowBulkCreateModal({
            unregCount: unregisteredSubs.length,
            regCount: registeredSubs.length,
            totalCount: subsToProcess.length,
            unregisteredSubs,
            registeredSubs
        });
    };

    // Execute Bulk Approve
    const executeBulkApprove = async (createProfilesForUnregistered, explicitData = null) => {
        const data = explicitData || showBulkCreateModal;
        if (!data) return;

        setShowBulkCreateModal(null);
        const toastId = toast.loading("جاري الاعتماد الجماعي...");

        try {
            const points = Number(bulkPoints) >= 0 ? Number(bulkPoints) : (Number(link.pointsPerStudent) || 0);
            const effectiveTiming = bulkTiming || link.pointsTiming || 'immediate';
            const isDeferred = effectiveTiming === 'on_event_done' && Boolean(link.eventId);
            const pointsToAwardNow = isDeferred ? 0 : points;

            const pointsPerStudent = {};
            const studentIdsToAddToEvent = new Set();
            const subsToApprove = [];
            const batch = writeBatch(db);

            // 1. Process unregistered submissions
            for (const sub of data.unregisteredSubs) {
                let studentId = null;
                if (createProfilesForUnregistered) {
                    const specializationsList = (Array.isArray(link.specializations) && link.specializations.length > 0)
                        ? link.specializations
                        : (link.specialization ? [link.specialization] : ['عام / جوكر']);

                    const newStudentRef = doc(collection(db, 'students'));
                    batch.set(newStudentRef, {
                        name: sub.studentName,
                        grade: sub.grade || '',
                        section: sub.section || '',
                        class: `${sub.grade || ''} / ${sub.section || ''}`.trim(),
                        phone: sub.phone || '',
                        specializations: specializationsList,
                        totalPoints: pointsToAwardNow,
                        active: true,
                        joinedAt: serverTimestamp(),
                        notes: `مسجل عبر رابط: ${link.title}`
                    });
                    studentId = newStudentRef.id;

                    if (link.eventId) {
                        studentIdsToAddToEvent.add(studentId);
                    }
                }
                subsToApprove.push({ sub, studentId, isNew: createProfilesForUnregistered });
            }

            // 2. Process already registered submissions
            for (const sub of data.registeredSubs) {
                const dupInfo = duplicateMap[sub.id];
                const studentId = dupInfo?.matchedStudent?.id;

                if (studentId && pointsToAwardNow > 0) {
                    pointsPerStudent[studentId] = (pointsPerStudent[studentId] || 0) + pointsToAwardNow;
                }

                if (link.eventId && studentId) {
                    studentIdsToAddToEvent.add(studentId);
                }

                subsToApprove.push({ sub, studentId, isNew: false });
            }

            // 3. Update submissions
            subsToApprove.forEach(({ sub, studentId, isNew }) => {
                batch.update(doc(db, 'link_submissions', sub.id), {
                    status: 'approved',
                    matchedStudentId: studentId || null,
                    approvedAt: serverTimestamp(),
                    approvalMode: !studentId ? 'event_only' : isNew ? 'new_profile' : 'linked',
                    deferredPoints: isDeferred,
                    pendingPoints: isDeferred ? points : 0,
                    pointsAwarded: pointsToAwardNow
                });
            });

            // 4. Update points for existing registered students (if immediate points)
            if (pointsToAwardNow > 0) {
                Object.entries(pointsPerStudent).forEach(([stuId, pts]) => {
                    if (pts > 0) {
                        batch.update(doc(db, 'students', stuId), {
                            totalPoints: increment(pts)
                        });
                    }
                });
            }

            // 5. Update event participants and details if eventId exists
            if (link.eventId && studentIdsToAddToEvent.size > 0) {
                const idsToAdd = Array.from(studentIdsToAddToEvent);
                const eventUpdates = {
                    participatingStudents: arrayUnion(...idsToAdd),
                    linkStudentIds: arrayUnion(...idsToAdd)
                };

                if (isDeferred) {
                    idsToAdd.forEach(id => {
                        eventUpdates[`deferredLinkStudents.${id}`] = points;
                    });
                } else if (link.pointsPolicy === 'combine_both') {
                    idsToAdd.forEach(id => {
                        eventUpdates[`combineLinkStudents.${id}`] = true;
                    });
                }

                const customFieldsList = link.customFields || [];
                subsToApprove.forEach(({ sub, studentId }) => {
                    if (!studentId) return;

                    const detailsForStudent = {};
                    if (sub.customValues && typeof sub.customValues === 'object') {
                        Object.entries(sub.customValues).forEach(([fId, val]) => {
                            const matchedField = customFieldsList.find(f => f.id === fId);
                            const label = matchedField?.label || fId;
                            if (val !== undefined && val !== null && String(val).trim()) {
                                detailsForStudent[label] = val;
                            }
                        });
                    }
                    if (Object.keys(detailsForStudent).length === 0 && sub.customFieldValue) {
                        const fallbackLabel = customFieldsList[0]?.label || 'ملاحظات / الدور';
                        detailsForStudent[fallbackLabel] = sub.customFieldValue;
                    }

                    if (Object.keys(detailsForStudent).length > 0) {
                        eventUpdates[`participantDetails.${studentId}`] = detailsForStudent;
                    }
                });

                batch.update(doc(db, 'events', link.eventId), eventUpdates);
            }

            await batch.commit();

            if (pointsToAwardNow > 0) {
                subsToApprove.forEach(({ sub, studentId }) => {
                    if (!studentId) return;
                    logPointsChange({
                        studentId,
                        studentName: sub.studentName,
                        grade: sub.grade || '',
                        section: sub.section || '',
                        class: `${sub.grade || ''} / ${sub.section || ''}`.trim(),
                        change: pointsToAwardNow,
                        reason: `اعتماد جماعي عبر رابط: ${link.title}`,
                        actionType: 'link_registration',
                        eventId: link.eventId || null,
                        eventTitle: link.eventTitle || link.title
                    }).catch(console.warn);
                });
            }

            setSelectedIds([]);
            if (isDeferred) {
                toast.success(`تم الاعتماد الجماعي لـ (${subsToApprove.length}) طالب (النقاط مؤجلة عند إنجاز الفعالية)`, { id: toastId });
            } else {
                toast.success(`تم الاعتماد الجماعي لـ (${subsToApprove.length}) طالب بنجاح (+${pointsToAwardNow} نقطة)`, { id: toastId });
            }
        } catch (err) {
            console.error("Bulk approve error:", err);
            toast.error("حدث خطأ أثناء الاعتماد الجماعي: " + err.message, { id: toastId });
        }
    };

    // Bulk Reject
    const handleBulkReject = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`هل أنت متأكد من رفض ${selectedIds.length} طلب؟`)) return;

        try {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.update(doc(db, 'link_submissions', id), {
                    status: 'rejected',
                    rejectedAt: serverTimestamp()
                });
            });
            await batch.commit();
            setSelectedIds([]);
            toast.success("تم رفض الطلبات المحددة");
        } catch {
            toast.error("فشل في الرفض الجماعي");
        }
    };

    // Save Edited Submission
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editingSubmission) return;
        try {
            await updateDoc(doc(db, 'link_submissions', editingSubmission.id), {
                studentName: editingSubmission.studentName,
                grade: editingSubmission.grade,
                section: editingSubmission.section,
                class: `${editingSubmission.grade || ''} / ${editingSubmission.section || ''}`.trim(),
                phone: editingSubmission.phone || '',
                customValues: editingSubmission.customValues || {},
                customFieldValue: editingSubmission.customFieldValue || '',
                updatedAt: serverTimestamp()
            });
            toast.success("تم حفظ تعديل البيانات");
            setEditingSubmission(null);
        } catch (err) {
            toast.error("فشل في حفظ التعديلات: " + err.message);
        }
    };

    // Excel Export
    const handleExportExcel = async () => {
        if (submissions.length === 0) {
            toast.error("لا توجد بيانات للتصدير");
            return;
        }

        const XLSX = await import('xlsx');

        const customHeaders = customFields.length > 0
            ? customFields.map(f => f.label)
            : [link.customFieldLabel || "الملاحظة/الصنف"];

        const data = [
            ["م", "اسم الطالب", "المرحلة", "الشعبة", ...customHeaders, "رقم الجوال", "الحالة", "تاريخ الإدخال"],
            ...submissions.map((s, idx) => {
                const customVals = customFields.length > 0
                    ? customFields.map(f => s.customValues?.[f.id] || (f.id === 'f_legacy' ? s.customFieldValue : '') || (customFields.length === 1 ? s.customFieldValue : '') || '-')
                    : [s.customFieldValue || '-'];

                const isUnknown = s.grade === 'غير معروف' || !!s.isGradeUnknown;
                const gradeStr = isUnknown ? 'غير معروف' : (s.grade || '');
                const sectionStr = isUnknown ? '-' : (s.section || '');

                return [
                    idx + 1,
                    s.studentName || '',
                    gradeStr,
                    sectionStr,
                    ...customVals,
                    s.phone || '',
                    s.status === 'approved' ? 'معتمد' : s.status === 'pending' ? 'بانتظار المراجعة' : s.status === 'waitlist' ? 'قائمة انتظار' : 'مرفوض',
                    s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-SA') : ''
                ];
            })
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Auto-fit column widths & set RTL
        const maxColLengths = data[0].map((_, colIdx) => {
            let maxLen = 10;
            data.forEach(row => {
                const valStr = String(row[colIdx] ?? '');
                if (valStr.length > maxLen) maxLen = valStr.length;
            });
            return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
        });
        ws['!cols'] = maxColLengths;
        ws['!views'] = [{ RTL: true }];

        const wb = XLSX.utils.book_new();
        if (!wb.Workbook) wb.Workbook = {};
        wb.Workbook.Views = [{ RTL: true }];
        XLSX.utils.book_append_sheet(wb, ws, "المسجلون");
        XLSX.writeFile(wb, `سجل_تسجيل_${link.title.replace(/\s+/g, '_')}.xlsx`);
        toast.success("تم تصدير ملف Excel بنجاح");
    };


    // Advanced Print Execution
    const handleExecuteAdvancedPrint = async (options) => {
        const {
            columns = [],
            theme = 'classic',
            orientation = 'portrait',
            density = 'standard',
            scope = 'all',
            showHeader = true,
            showKpis = true,
            showSignatures = true,
            showSignatureCol = false,
            signatures = [],
            customTitle = '',
            footerNote = ''
        } = options;

        const toastId = toast.loading('جاري تجهيز كشف المسجلين للطباعة...');
        try {
            let targetList = (scope === 'selected' && selectedIds.length > 0)
                ? submissions.filter(s => selectedIds.includes(s.id))
                : [...filteredSubmissions];

            if (targetList.length === 0) {
                toast.error("لا توجد بيانات للطباعة", { id: toastId });
                return;
            }

            const sortedList = sortStudentsArabic(targetList, 'studentName');

            // Table Headers
            const ths = [];
            if (columns.includes('index')) ths.push('<th style="width: 40px; text-align: center;">#</th>');
            if (columns.includes('studentName')) ths.push('<th>اسم الطالب</th>');
            if (columns.includes('class')) ths.push('<th style="width: 120px; text-align: center;">الصف والشعبة</th>');

            if (customFields.length > 0) {
                customFields.forEach(f => {
                    if (columns.includes(`custom_${f.id}`)) {
                        ths.push(`<th>${f.label}</th>`);
                    }
                });
            } else if (link?.customFieldLabel && columns.includes('custom_legacy')) {
                ths.push(`<th>${link.customFieldLabel}</th>`);
            }

            if (columns.includes('phone')) ths.push('<th style="width: 110px; text-align: center;">رقم الجوال</th>');
            if (columns.includes('status')) ths.push('<th style="width: 100px; text-align: center;">حالة الاعتماد</th>');
            if (columns.includes('date')) ths.push('<th style="width: 110px; text-align: center;">تاريخ التسجيل</th>');
            if (showSignatureCol) ths.push('<th style="width: 140px; text-align: center;">توقيع الاستلام / الحضور</th>');

            // Table Rows
            const rowsHtml = sortedList.map((s, idx) => {
                const tds = [];
                if (columns.includes('index')) tds.push(`<td style="text-align: center; font-weight: bold;">${idx + 1}</td>`);
                if (columns.includes('studentName')) tds.push(`<td style="font-weight: bold;">${s.studentName || ''}</td>`);
                if (columns.includes('class')) tds.push(`<td style="text-align: center;">${cleanClassString(s)}</td>`);

                if (customFields.length > 0) {
                    customFields.forEach(f => {
                        if (columns.includes(`custom_${f.id}`)) {
                            const val = s.customValues?.[f.id] || (f.id === 'f_legacy' ? s.customFieldValue : '') || (customFields.length === 1 ? s.customFieldValue : '') || '-';
                            tds.push(`<td>${val}</td>`);
                        }
                    });
                } else if (link?.customFieldLabel && columns.includes('custom_legacy')) {
                    tds.push(`<td>${s.customFieldValue || '-'}</td>`);
                }

                if (columns.includes('phone')) tds.push(`<td style="text-align: center; direction: ltr;">${s.phone || '-'}</td>`);
                if (columns.includes('status')) {
                    const statusLabel = s.status === 'approved' ? 'معتمد' : s.status === 'pending' ? 'بانتظار الاعتماد' : s.status === 'waitlist' ? 'انتظار' : 'مرفوض';
                    const statusClass = s.status === 'approved' ? 'success' : s.status === 'rejected' ? 'danger' : '';
                    tds.push(`<td style="text-align: center;"><span class="status ${statusClass}">${statusLabel}</span></td>`);
                }
                if (columns.includes('date')) {
                    const dateStr = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-SA') : '-';
                    tds.push(`<td style="text-align: center; font-size: 11px;">${dateStr}</td>`);
                }
                if (showSignatureCol) tds.push('<td style="width: 130px; border-bottom: 1px dotted #94a3b8;"></td>');

                return `<tr>${tds.join('')}</tr>`;
            }).join('');

            const pageTitle = customTitle.trim() || `كشف حصر المشاركات والتسليم - ${link.title}`;

            // Header
            let headerHtml = '';
            if (showHeader) {
                headerHtml = getOfficialReportHeaderHtml({
                    schoolInfo,
                    title: pageTitle,
                    subTitle: link.title,
                    centerDetails: [
                        `المجال: ${specializationsDisplay}`,
                        `إشراف الطالب المفوض: ${link.delegateName || '-'}`
                    ],
                    leftDetails: [
                        { label: 'إجمالي المسجلين', value: `${sortedList.length} طالب` },
                        { label: 'الحد الأقصى', value: link.maxCapacity ? `${link.maxCapacity} مقعد` : 'غير محدود (مفتوح)' }
                    ]
                });
            }

            // KPI Cards
            let kpiHtml = '';
            if (showKpis) {
                const approvedCount = sortedList.filter(s => s.status === 'approved').length;
                const pendingCount = sortedList.filter(s => s.status === 'pending').length;
                const waitlistCount = sortedList.filter(s => s.status === 'waitlist').length;
                kpiHtml = `
                    <div class="kpi-grid">
                        <div class="kpi-card">
                            <div class="kpi-label">إجمالي الطلاب بالكشف</div>
                            <div class="kpi-value">${sortedList.length}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">المعتمدون</div>
                            <div class="kpi-value points">${approvedCount}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">بانتظار الاعتماد</div>
                            <div class="kpi-value">${pendingCount}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">قائمة الانتظار</div>
                            <div class="kpi-value">${waitlistCount}</div>
                        </div>
                    </div>
                `;
            }

            // Footer
            let footerHtml = '';
            if (showSignatures) {
                footerHtml = getOfficialReportFooterHtml({
                    signatures: signatures.length ? signatures : [
                        { role: 'الطالب المفوض', name: link.delegateName || '' },
                        { role: 'مشرف النشاط الطلابي', name: '' },
                        { role: 'مدير المدرسة', name: schoolInfo?.principalName || '' }
                    ],
                    note: footerNote,
                    systemCredit: 'نظام إدارة روابط التسجيل المدرسية'
                });
            }

            const htmlContent = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="utf-8">
                    <title>${pageTitle}</title>
                    <style>
                        ${getStandardPrintStyles({ theme, orientation, density })}
                    </style>
                </head>
                <body>
                    ${headerHtml}
                    ${kpiHtml}
                    <table>
                        <thead>
                            <tr>${ths.join('')}</tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                    ${footerHtml}
                </body>
                </html>
            `;

            toast.dismiss(toastId);
            await printHtmlDocument(htmlContent, pageTitle);
        } catch (err) {
            console.error("Print submissions sheet error:", err);
            toast.error("فشل تجهيز الكشف للطباعة", { id: toastId });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border-r border-slate-800 w-full max-w-4xl h-full flex flex-col text-right shadow-2xl overflow-hidden" dir="rtl">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-800/80 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                                <UserCheck size={22} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white flex items-center gap-2">
                                    <span>سجل المسجلين: {link.title}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-normal">
                                        المفوض: {link.delegateName}
                                    </span>
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-slate-400">
                                        متابعة واعتماد الطلاب المسجلين عبر الرابط مع الكشف الذكي عن التكرار
                                    </p>
                                    <span className="text-slate-600">•</span>
                                    {link.eventTitle ? (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <Calendar size={12} /> مرتبط بـ: {link.eventTitle}
                                            </span>
                                            {onEditLink && (
                                                <button
                                                    type="button"
                                                    onClick={() => onEditLink(link)}
                                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                                                >
                                                    تغيير
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                                                غير مرتبط بفعالية
                                            </span>
                                            {onEditLink && (
                                                <button
                                                    type="button"
                                                    onClick={() => onEditLink(link)}
                                                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline flex items-center gap-0.5"
                                                >
                                                    <Link2 size={12} /> ربط الآن
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-center">
                            <span className="text-[11px] text-slate-400 block">الإجمالي / المقاعد</span>
                            <span className="text-sm font-black text-white">
                                {counts.total} {link.maxCapacity ? `/ ${link.maxCapacity}` : '(مفتوح)'}
                            </span>
                        </div>
                        <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/40 text-center">
                            <span className="text-[11px] text-amber-300 block">بانتظار المراجعة</span>
                            <span className="text-sm font-black text-amber-400">{counts.pending}</span>
                        </div>
                        <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-800/40 text-center">
                            <span className="text-[11px] text-emerald-300 block">المعتمدون</span>
                            <span className="text-sm font-black text-emerald-400">{counts.approved}</span>
                        </div>
                        <div className="bg-blue-950/30 p-2.5 rounded-xl border border-blue-800/40 text-center">
                            <span className="text-[11px] text-blue-300 block">قائمة الانتظار</span>
                            <span className="text-sm font-black text-blue-400">{counts.waitlist}</span>
                        </div>
                        <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-800/40 text-center">
                            <span className="text-[11px] text-rose-300 block">المرفوضون</span>
                            <span className="text-sm font-black text-rose-400">{counts.rejected}</span>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute right-3 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="بحث بالاسم، الصف، أو المساهمة..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-3 pr-9 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                            <option value="all">كل الحالات ({counts.total})</option>
                            <option value="pending">بانتظار الاعتماد ({counts.pending})</option>
                            <option value="approved">المعتمدون ({counts.approved})</option>
                            <option value="matched">🟢 مقيدون بالمدرسة ({counts.matched})</option>
                            <option value="unregistered">✨ غير مقيدين (جدد) ({counts.unregistered})</option>
                            {counts.discrepancy > 0 && (
                                <option value="discrepancy">⚠️ اختلاف بالصف/الشعبة ({counts.discrepancy})</option>
                            )}
                            {counts.duplicate > 0 && (
                                <option value="duplicate">⚠️ مكرر بالرابط ({counts.duplicate})</option>
                            )}
                            <option value="waitlist">قائمة انتظار ({counts.waitlist})</option>
                            <option value="rejected">مرفوض ({counts.rejected})</option>
                        </select>

                        {/* Grade Filter */}
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-semibold"
                        >
                            <option value="all">كل الصفوف</option>
                            <option value="unknown">❓ غير معروف ({unknownGradesCount})</option>
                            {availableGrades.map(g => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                    </div>

                    {/* Export & Print */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                            <Download size={14} />
                            <span>تصدير Excel</span>
                        </button>
                        <button
                            onClick={() => setIsPrintModalOpen(true)}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                            <Printer size={14} />
                            <span>طباعة الكشف</span>
                        </button>
                    </div>
                </div>

                {/* Bulk Actions Banner */}
                {selectedIds.length > 0 && (
                    <div className="px-5 py-2.5 bg-indigo-950/60 border-b border-indigo-800/40 flex items-center justify-between animate-in fade-in">
                        <span className="text-xs text-indigo-200 font-bold">
                            تم تحديد {selectedIds.length} طالب
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleBulkApproveClick}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
                            >
                                <CheckCircle size={14} /> اعتماد المحدد
                            </button>
                            <button
                                onClick={handleBulkReject}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
                            >
                                <XCircle size={14} /> رفض المحدد
                            </button>
                            <button
                                onClick={() => setIsPrintModalOpen(true)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600/40 hover:bg-indigo-600 border border-indigo-500/40 text-white text-xs font-bold flex items-center gap-1"
                                title="طباعة كشف المسجلين المحددين"
                            >
                                <Printer size={14} /> طباعة المحدد
                            </button>
                            <button
                                onClick={() => setSelectedIds([])}
                                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                )}

                {/* Submissions Table / List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                            <RefreshCw size={24} className="animate-spin text-indigo-400" />
                            <span className="text-xs">جاري تحميل المسجلين...</span>
                        </div>
                    ) : filteredSubmissions.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm">
                            لا توجد تسجيلات تطابق معايير البحث
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {/* Select All Bar */}
                            <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 mb-1">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                                >
                                    {allFilteredSelected ? (
                                        <CheckSquare size={16} className="text-indigo-400" />
                                    ) : (
                                        <Square size={16} className="text-slate-400" />
                                    )}
                                    <span>تحديد جميع المعروض ({filteredSubmissions.length})</span>
                                </button>
                                <span className="text-[11px] text-slate-400">
                                    {selectedIds.length > 0 ? `المحدد: ${selectedIds.length}` : `إجمالي المعروض: ${filteredSubmissions.length}`}
                                </span>
                            </div>

                            {filteredSubmissions.map((sub) => {
                                const isSelected = selectedIds.includes(sub.id);
                                const dupInfo = duplicateMap[sub.id] || {};

                                return (
                                    <div
                                        key={sub.id}
                                        className={`p-3.5 rounded-xl border transition-all ${
                                            isSelected
                                                ? 'bg-indigo-950/40 border-indigo-500/60'
                                                : sub.status === 'approved'
                                                ? 'bg-slate-800/40 border-slate-700/60'
                                                : sub.status === 'rejected'
                                                ? 'bg-rose-950/20 border-rose-800/30'
                                                : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            {/* Checkbox & Student Details */}
                                            <div className="flex items-start gap-3 flex-1">
                                                <button
                                                    onClick={(e) => handleToggleSelectSubmission(sub.id, e)}
                                                    className="mt-1 text-slate-400 hover:text-indigo-400"
                                                >
                                                    {isSelected ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                                                </button>

                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-bold text-white text-sm">
                                                            {sub.studentName}
                                                        </h4>
                                                        <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                                                            sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                                ? 'bg-amber-950/70 border border-amber-600/50 text-amber-300'
                                                                : 'bg-slate-700 text-slate-300'
                                                        }`}>
                                                            {sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                                ? 'الصف غير معروف'
                                                                : `${sub.grade} - شعبة ${sub.section || '1'}`
                                                            }
                                                        </span>

                                                        {/* Smart Status Badges */}
                                                        {dupInfo.matchedStudent && (
                                                            <>
                                                                {dupInfo.matchType === 'exact_name' && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-950/70 border border-emerald-700/50 text-emerald-300 font-semibold flex items-center gap-1">
                                                                        <UserCheck size={11} /> مقيد بالمدرسة: {dupInfo.matchedStudent.name} • {dupInfo.existingPoints} ن
                                                                    </span>
                                                                )}
                                                                {dupInfo.matchType === 'phone_match' && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-700/50 text-cyan-300 font-semibold flex items-center gap-1">
                                                                        <Phone size={11} /> مطابق بالجوال: {dupInfo.matchedStudent.name} • {dupInfo.existingPoints} ن
                                                                    </span>
                                                                )}
                                                                {dupInfo.matchType === 'fuzzy_name' && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-950/70 border border-blue-700/50 text-blue-300 font-semibold flex items-center gap-1">
                                                                        <Sparkles size={11} /> تطابق تقريبي ({dupInfo.matchConfidence}%): {dupInfo.matchedStudent.name} • {dupInfo.existingPoints} ن
                                                                    </span>
                                                                )}
                                                                {dupInfo.matchType === 'explicit' && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-950/70 border border-indigo-700/50 text-indigo-300 font-semibold flex items-center gap-1">
                                                                        <UserCheck size={11} /> مرتبط بملف: {dupInfo.matchedStudent.name} • {dupInfo.existingPoints} ن
                                                                    </span>
                                                                )}
                                                                {dupInfo.hasDiscrepancy && (
                                                                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-600/60 text-amber-300 font-semibold flex items-center gap-1">
                                                                        <AlertTriangle size={11} /> اختلاف: بالرابط ({sub.grade} - {sub.section || '1'}) / بالمدرسة ({dupInfo.existingGrade} - {dupInfo.existingSection || '1'})
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}

                                                        {!dupInfo.matchedStudent && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-950/70 border border-purple-700/50 text-purple-300 font-semibold flex items-center gap-1">
                                                                <UserPlus size={11} /> ✨ طالب غير مقيد بالمدرسة
                                                            </span>
                                                        )}

                                                        {dupInfo.duplicateInLink && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-700/60 text-rose-300 font-semibold flex items-center gap-1">
                                                                <AlertCircle size={11} /> ⚠️ مكرر بالرابط ({dupInfo.duplicateCount} مرات)
                                                            </span>
                                                        )}

                                                        {/* Status Badge */}
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-bold ${
                                                            sub.status === 'approved'
                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                : sub.status === 'pending'
                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                : sub.status === 'waitlist'
                                                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                        }`}>
                                                            {sub.status === 'approved' ? (
                                                                sub.deferredPoints ? (
                                                                    <span className="flex items-center gap-1">
                                                                        <Clock size={11} className="text-amber-400" />
                                                                        <span>معتمد (مؤجل للإنجاز: {sub.pendingPoints || link.pointsPerStudent || 0} ن)</span>
                                                                    </span>
                                                                ) : sub.pointsAwarded > 0 ? (
                                                                    <span>معتمد (+{sub.pointsAwarded} ن)</span>
                                                                ) : (
                                                                    <span>معتمد</span>
                                                                )
                                                            ) : sub.status === 'pending' ? 'بانتظار الاعتماد' : sub.status === 'waitlist' ? 'قائمة انتظار' : 'مرفوض'}
                                                        </span>
                                                    </div>

                                                    {/* Custom Fields and Phone */}
                                                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 flex-wrap">
                                                        {customFields.length > 0 ? (
                                                            customFields.map(f => {
                                                                const val = sub.customValues?.[f.id] || (f.id === 'f_legacy' ? sub.customFieldValue : '') || (customFields.length === 1 ? sub.customFieldValue : null);
                                                                if (!val) return null;
                                                                return (
                                                                    <div key={f.id}>
                                                                        <span className="text-slate-500">{f.label}: </span>
                                                                        <span className="text-indigo-300 font-semibold">{val}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            sub.customFieldValue && (
                                                                <div>
                                                                    <span className="text-slate-500">المساهمة: </span>
                                                                    <span className="text-indigo-300 font-semibold">{sub.customFieldValue}</span>
                                                                </div>
                                                            )
                                                        )}
                                                        {sub.phone && (
                                                            <div>
                                                                <span className="text-slate-500">الجوال: </span>
                                                                <span className="font-mono text-slate-300">{sub.phone}</span>
                                                            </div>
                                                        )}
                                                        {sub.createdAt?.toDate && (
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                                <Clock size={11} />
                                                                <span>{sub.createdAt.toDate().toLocaleString('ar-SA')}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Row Action Buttons */}
                                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap justify-end">
                                                {/* Smart Dealing & Options Modal Trigger */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setChosenStudentOverride(dupInfo.matchedStudent || null);
                                                        setShowManualReassign(false);
                                                        setReassignSearchQuery('');
                                                        setActionPointsOverride(Number(link.pointsPerStudent) || 0);
                                                        setActionTimingOverride(link.pointsTiming || 'immediate');
                                                        setStudentActionSub(sub);
                                                    }}
                                                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all ${
                                                        dupInfo.hasDiscrepancy
                                                            ? 'bg-amber-600/25 hover:bg-amber-600/40 border-amber-500/50 text-amber-300'
                                                            : !dupInfo.matchedStudent
                                                            ? 'bg-purple-600/25 hover:bg-purple-600/40 border-purple-500/50 text-purple-300'
                                                            : 'bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/30 text-indigo-300'
                                                    }`}
                                                    title="خيارات التعامل والربط الذكي"
                                                >
                                                    <Sparkles size={14} />
                                                    <span>خيارات التعامل</span>
                                                </button>

                                                {/* Direct Fast Approve if already matched with no discrepancy */}
                                                {sub.status !== 'approved' && dupInfo.matchedStudent && !dupInfo.hasDiscrepancy && (
                                                    <button
                                                        type="button"
                                                        disabled={isApproving}
                                                        onClick={() => handleApproveStudent({
                                                            sub,
                                                            targetStudent: dupInfo.matchedStudent,
                                                            updateProfile: false,
                                                            createProfile: false,
                                                            eventOnly: false
                                                        })}
                                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                                        title="اعتماد مباشر وربط بالملف ورصد النقاط"
                                                    >
                                                        <CheckCircle size={14} />
                                                        <span className="hidden sm:inline">اعتماد</span>
                                                    </button>
                                                )}

                                                {sub.status !== 'rejected' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReject(sub)}
                                                        className="px-2 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 transition-colors"
                                                        title="رفض الطلب"
                                                    >
                                                        <XCircle size={14} />
                                                        <span className="hidden sm:inline">رفض</span>
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setEditingSubmission({
                                                        ...sub,
                                                        customValues: { ...(sub.customValues || {}) }
                                                    })}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                                                    title="تعديل البيانات"
                                                >
                                                    <Edit2 size={15} />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(sub.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors"
                                                    title="حذف"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Edit Modal */}
                {editingSubmission && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-right space-y-4" dir="rtl">
                            <h3 className="font-bold text-white text-base">تعديل بيانات التسجيل</h3>
                            <form onSubmit={handleSaveEdit} className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">اسم الطالب</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingSubmission.studentName}
                                        onChange={(e) => setEditingSubmission({ ...editingSubmission, studentName: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الصف</label>
                                        <input
                                            type="text"
                                            value={editingSubmission.grade}
                                            onChange={(e) => setEditingSubmission({ ...editingSubmission, grade: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الشعبة</label>
                                        <input
                                            type="text"
                                            value={editingSubmission.section}
                                            onChange={(e) => setEditingSubmission({ ...editingSubmission, section: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                </div>
                                {customFields.length > 0 ? (
                                    customFields.map(field => (
                                        <div key={field.id}>
                                            <label className="block text-xs text-slate-400 mb-1">
                                                {field.label} {field.required && <span className="text-rose-400">*</span>}
                                            </label>
                                            <input
                                                type="text"
                                                required={field.required}
                                                value={editingSubmission.customValues?.[field.id] ?? (field.id === 'f_legacy' ? editingSubmission.customFieldValue : '') ?? ''}
                                                onChange={(e) => {
                                                    const newValues = {
                                                        ...(editingSubmission.customValues || {}),
                                                        [field.id]: e.target.value
                                                    };
                                                    setEditingSubmission({
                                                        ...editingSubmission,
                                                        customValues: newValues,
                                                        customFieldValue: Object.values(newValues).filter(Boolean).join(' | ')
                                                    });
                                                }}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                            />
                                        </div>
                                    ))
                                ) : (
                                    editingSubmission.customFieldValue && (
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">المساهمة / البيان</label>
                                            <input
                                                type="text"
                                                value={editingSubmission.customFieldValue || ''}
                                                onChange={(e) => setEditingSubmission({ ...editingSubmission, customFieldValue: e.target.value })}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                            />
                                        </div>
                                    )
                                )}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
                                    <input
                                        type="text"
                                        value={editingSubmission.phone || ''}
                                        onChange={(e) => setEditingSubmission({ ...editingSubmission, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingSubmission(null)}
                                        className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                                    >
                                        حفظ
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Smart Dealing & Options Modal (Individual Student) */}
                {studentActionSub && (() => {
                    const sub = studentActionSub;
                    const dupInfo = duplicateMap[sub.id] || {};
                    const matchedStudent = chosenStudentOverride || dupInfo.matchedStudent;
                    const rawPoints = actionPointsOverride !== null ? Number(actionPointsOverride) : (Number(link.pointsPerStudent) || 0);
                    const effectiveTiming = actionTimingOverride !== null ? actionTimingOverride : (link.pointsTiming || 'immediate');
                    const isDeferred = effectiveTiming === 'on_event_done' && Boolean(link.eventId);
                    const isOverridden = chosenStudentOverride && chosenStudentOverride.id !== dupInfo.matchedStudent?.id;

                    const normSubGrade = normalizeArabic(sub.grade);
                    const normStuGrade = normalizeArabic(matchedStudent?.grade);
                    const normStuClass = normalizeArabic(matchedStudent?.class || '');
                    const isGradeMatch = !matchedStudent || !normSubGrade || normStuGrade === normSubGrade || normStuClass.includes(normSubGrade);

                    const subSec = String(sub.section || '').trim();
                    const stuSec = String(matchedStudent?.section || '').trim();
                    const isSecMatch = !matchedStudent || !subSec || !stuSec || subSec === stuSec;

                    const subPhone = normalizePhone(sub.phone);
                    const stuPhone = normalizePhone(matchedStudent?.phone);
                    const isPhoneMatch = !matchedStudent || !subPhone || !stuPhone || subPhone === stuPhone;

                    return (
                        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
                            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl p-5 sm:p-6 text-right space-y-4 shadow-2xl my-auto" dir="rtl">
                                {/* Header */}
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                            <Sparkles size={22} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-base">إدارة واعتماد تسجيل الطالب</h3>
                                            <p className="text-xs text-slate-400">التحقق الذكي والربط بقاعدة بيانات المدرسة ورصد النقاط</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStudentActionSub(null);
                                            setChosenStudentOverride(null);
                                            setShowManualReassign(false);
                                            setReassignSearchQuery('');
                                            setActionPointsOverride(null);
                                            setActionTimingOverride(null);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Match Status Banner */}
                                <div className="space-y-2">
                                    {matchedStudent ? (
                                        <div className={`p-3 rounded-xl border text-xs leading-relaxed space-y-1 ${
                                            isOverridden
                                                ? 'bg-indigo-950/60 border-indigo-600/50 text-indigo-200'
                                                : dupInfo.matchType === 'exact_name'
                                                ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-200'
                                                : dupInfo.matchType === 'phone_match'
                                                ? 'bg-cyan-950/50 border-cyan-700/50 text-cyan-200'
                                                : 'bg-blue-950/50 border-blue-700/50 text-blue-200'
                                        }`}>
                                            <div className="flex items-center gap-2 font-bold">
                                                <UserCheck size={16} className="shrink-0" />
                                                <span>
                                                    {isOverridden
                                                        ? 'تم اختيار الربط يدوياً مع ملف الطالب التالي:'
                                                        : dupInfo.matchType === 'exact_name'
                                                        ? 'تم العثور على ملف مقيد بالمدرسة مطابق بالاسم تماماً:'
                                                        : dupInfo.matchType === 'phone_match'
                                                        ? 'تمت المطابقة مع ملف مقيد بالمدرسة بواسطة رقم الجوال:'
                                                        : `تطابق تقريبي بالاسم بنسبة (${dupInfo.matchConfidence}%) مع:`
                                                    }
                                                </span>
                                            </div>
                                            <div className="font-bold text-white text-sm pr-6">
                                                {matchedStudent.name}
                                                <span className="text-xs font-normal text-slate-300 mr-2">
                                                    ({matchedStudent.grade || matchedStudent.class} - شعبة {matchedStudent.section || '1'})
                                                </span>
                                                <span className="text-xs text-indigo-300 mr-2 font-mono">
                                                    • رصيده الحالي: {matchedStudent.totalPoints || 0} نقطة
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-xl bg-purple-950/50 border border-purple-700/50 text-purple-200 text-xs flex items-center gap-2 font-semibold">
                                            <UserPlus size={16} className="shrink-0" />
                                            <span>الطالب غير مقيد حالياً بقاعدة بيانات المدرسة (تسجيل جديد). يمكنك إنشاء ملف جديد له أو اعتماده للمناسبة الحالية فقط.</span>
                                        </div>
                                    )}

                                    {/* Discrepancy Alert */}
                                    {matchedStudent && (!isGradeMatch || !isSecMatch || (!isPhoneMatch && subPhone)) && (
                                        <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-600/50 text-amber-200 text-xs flex items-start gap-2">
                                            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                            <div className="space-y-0.5">
                                                <span className="font-bold block">تنبيه: توجد اختلافات بين بيانات الرابط والملف بالمدرسة:</span>
                                                {!isGradeMatch && (
                                                    <div className="text-[11px] text-amber-300">
                                                        • الصف: بالاستمارة (<span className="underline font-bold">{sub.grade}</span>) مقابل سجل المدرسة (<span className="underline font-bold">{matchedStudent.grade || matchedStudent.class}</span>)
                                                    </div>
                                                )}
                                                {!isSecMatch && (
                                                    <div className="text-[11px] text-amber-300">
                                                        • الشعبة: بالاستمارة (<span className="underline font-bold">{sub.section || '1'}</span>) مقابل سجل المدرسة (<span className="underline font-bold">{matchedStudent.section || '1'}</span>)
                                                    </div>
                                                )}
                                                {!isPhoneMatch && subPhone && (
                                                    <div className="text-[11px] text-amber-300">
                                                        • رقم الجوال: بالاستمارة (<span className="underline font-bold">{sub.phone}</span>) مقابل سجل المدرسة (<span className="underline font-bold">{matchedStudent.phone || 'غير مسجل'}</span>)
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Duplicate alert */}
                                    {dupInfo.duplicateInLink && (
                                        <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-700/50 text-rose-200 text-xs flex items-center gap-2">
                                            <AlertCircle size={16} className="text-rose-400 shrink-0" />
                                            <span>هذا الطالب قام بالتسجيل {dupInfo.duplicateCount} مرات في هذا الرابط. يُرجى الانتباه لتفادي رصد النقاط مرتين لنفس النشاط.</span>
                                        </div>
                                    )}
                                </div>

                                {/* Comparison Card */}
                                <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-3 space-y-2">
                                    <span className="text-[11px] text-slate-400 font-bold block">مقارنة البيانات:</span>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                            <span className="text-[10px] text-indigo-400 font-bold block uppercase tracking-wider">البيانات المدخلة بالرابط</span>
                                            <div className="font-bold text-white">{sub.studentName}</div>
                                            <div className="text-slate-300 text-[11px]">الصف: {sub.grade} - شعبة {sub.section || '1'}</div>
                                            {sub.phone && <div className="text-slate-400 text-[11px] font-mono">الجوال: {sub.phone}</div>}
                                            <div className="text-emerald-400 font-bold text-[11px] pt-1">
                                                نقاط الفعالية: {isDeferred ? `⏳ مؤجلة للإنجاز (${rawPoints} ن)` : `⚡ +${rawPoints} نقطة فوراً`}
                                            </div>
                                        </div>

                                        <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 space-y-1">
                                            <span className="text-[10px] text-indigo-400 font-bold block uppercase tracking-wider">سجل الطالب بالمدرسة</span>
                                            {matchedStudent ? (
                                                <>
                                                    <div className="font-bold text-white">{matchedStudent.name}</div>
                                                    <div className="text-slate-300 text-[11px]">الصف: {matchedStudent.grade || matchedStudent.class} - شعبة {matchedStudent.section || '1'}</div>
                                                    <div className="text-slate-400 text-[11px] font-mono">الجوال: {matchedStudent.phone || 'غير مسجل'}</div>
                                                    <div className="text-indigo-300 font-bold text-[11px] pt-1">
                                                        الرصيد: {matchedStudent.totalPoints || 0} نقطة {isDeferred ? `(يُضاف ${rawPoints} ن عند إنجاز الفعالية)` : `(يصبح: ${(Number(matchedStudent.totalPoints) || 0) + rawPoints})`}
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-slate-500 py-3 text-center">لا يوجد ملف مسجل حالياً</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Points & Timing Configuration Box */}
                                <div className="bg-slate-950/70 rounded-xl border border-slate-800 p-3.5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                            <Award size={14} className="text-amber-400" />
                                            <span>النقاط المقررة لهذا الطالب:</span>
                                        </label>
                                        <span className="text-[11px] text-slate-400 font-mono">
                                            افتراضي الرابط: {link.pointsPerStudent ?? 0} ن
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={rawPoints}
                                            onChange={(e) => setActionPointsOverride(Math.max(0, Number(e.target.value)))}
                                            className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                                        />
                                        <div className="flex items-center gap-1">
                                            {[0, 2, 5, 10, 15].map(pts => (
                                                <button
                                                    key={pts}
                                                    type="button"
                                                    onClick={() => setActionPointsOverride(pts)}
                                                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                                        rawPoints === pts
                                                            ? 'bg-indigo-600 text-white font-bold'
                                                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {pts} ن
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Points Timing Choice (if linked to an event) */}
                                    {link.eventId && (
                                        <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5">
                                            <span className="text-[11px] font-bold text-slate-400 block">توقيت رصد النقاط:</span>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setActionTimingOverride('immediate')}
                                                    className={`p-2.5 rounded-lg border text-right transition-all text-xs flex items-center gap-2 ${
                                                        effectiveTiming === 'immediate'
                                                            ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-bold'
                                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                                    }`}
                                                >
                                                    <Zap size={15} className="shrink-0 text-emerald-400" />
                                                    <div>
                                                        <div className="font-bold text-white text-xs">⚡ رصد فوري الآن</div>
                                                        <div className="text-[10px] text-slate-400">إيداع النقاط فور اعتماد الطلب</div>
                                                    </div>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setActionTimingOverride('on_event_done')}
                                                    className={`p-2.5 rounded-lg border text-right transition-all text-xs flex items-center gap-2 ${
                                                        effectiveTiming === 'on_event_done'
                                                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-bold'
                                                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                                    }`}
                                                >
                                                    <Clock size={15} className="shrink-0 text-indigo-400" />
                                                    <div>
                                                        <div className="font-bold text-white text-xs">⏳ مؤجل لإنجاز النشاط</div>
                                                        <div className="text-[10px] text-slate-400">تُرصد مع كافة المشاركين</div>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Options */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-400 font-bold block">اختر طريقة الاعتماد والتعامل:</span>
                                        {isApproving && (
                                            <span className="text-[11px] text-indigo-400 font-bold flex items-center gap-1.5 animate-pulse">
                                                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                                <span>جاري الاعتماد...</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Option 1: Direct link & award points */}
                                    {matchedStudent && (
                                        <button
                                            type="button"
                                            disabled={isApproving}
                                            onClick={() => handleApproveStudent({
                                                sub,
                                                targetStudent: matchedStudent,
                                                updateProfile: false,
                                                createProfile: false,
                                                eventOnly: false,
                                                customPoints: rawPoints,
                                                timingOverride: effectiveTiming
                                            })}
                                            className="w-full p-3 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/40 text-right text-xs text-white flex flex-col gap-1 transition-all group cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                                                    <CheckCircle size={15} />
                                                    <span>١. اعتماد وربط بملف الطالب {isDeferred ? `(نقاط مؤجلة: ${rawPoints} ن)` : `ورصد النقاط (+${rawPoints})`}</span>
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">موصى به</span>
                                            </div>
                                            <span className="text-[11px] text-slate-300 leading-normal pr-5">
                                                ربط التسجيل بملف ({matchedStudent.name}) وإلحاقه بالنشاط {isDeferred ? `، وسيتم إيداع (${rawPoints}) نقطة تلقائياً عند تنفيذ النشاط بالجدول.` : `وإضافة (${rawPoints}) نقطة إلى رصيده فوراً وتوثيقها بسجل النقاط.`}
                                            </span>
                                        </button>
                                    )}

                                    {/* Option 2: Link, update student profile info & award points */}
                                    {matchedStudent && (!isGradeMatch || !isSecMatch || (!isPhoneMatch && subPhone)) && (
                                        <button
                                            type="button"
                                            disabled={isApproving}
                                            onClick={() => handleApproveStudent({
                                                sub,
                                                targetStudent: matchedStudent,
                                                updateProfile: true,
                                                createProfile: false,
                                                eventOnly: false,
                                                customPoints: rawPoints,
                                                timingOverride: effectiveTiming
                                            })}
                                            className="w-full p-3 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/40 text-right text-xs text-white flex flex-col gap-1 transition-all group cursor-pointer"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                                                    <RefreshCw size={15} />
                                                    <span>٢. اعتماد وتحديث بيانات ملف الطالب بالمدرسة {isDeferred ? `(نقاط مؤجلة: ${rawPoints} ن)` : `ورصد النقاط (+${rawPoints})`}</span>
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">تحديث الصف/الشعبة</span>
                                            </div>
                                            <span className="text-[11px] text-slate-300 leading-normal pr-5">
                                                تحديث بيانات الطالب إلى: الصف ({sub.grade}) والشعبة ({sub.section || '1'}){sub.phone ? ` والجوال (${sub.phone})` : ''} في قاعدة البيانات، {isDeferred ? `مع جدولة (${rawPoints}) نقطة عند إنجاز الفعالية.` : `ورصد (+${rawPoints}) نقطة في سجله الآن.`}
                                            </span>
                                        </button>
                                    )}

                                    {/* Option 3: Event-only approval (no points or profile modification) */}
                                    <button
                                        type="button"
                                        disabled={isApproving}
                                        onClick={() => handleApproveStudent({
                                            sub,
                                            targetStudent: matchedStudent,
                                            updateProfile: false,
                                            createProfile: false,
                                            eventOnly: true,
                                            customPoints: 0,
                                            timingOverride: 'immediate'
                                        })}
                                        className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-750 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 text-right text-xs text-white flex flex-col gap-1 transition-all cursor-pointer"
                                    >
                                        <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                            <Calendar size={15} className="text-slate-400" />
                                            <span>{matchedStudent ? '٣.' : '١.'} اعتماد للمناسبة الحالية فقط (دون رصد نقاط أو تعديل ملف الطالب)</span>
                                        </span>
                                        <span className="text-[11px] text-slate-400 leading-normal pr-5">
                                            اعتماد مشاركة الطالب في كشف هذا الرابط فقط. لن يتم تغيير نقاط الطالب أو تعديل بياناته بالمدرسة.
                                        </span>
                                    </button>

                                    {/* Option 4: Create new student profile in school */}
                                    <button
                                        type="button"
                                        disabled={isApproving}
                                        onClick={() => handleApproveStudent({
                                            sub,
                                            targetStudent: null,
                                            updateProfile: false,
                                            createProfile: true,
                                            eventOnly: false,
                                            customPoints: rawPoints,
                                            timingOverride: effectiveTiming
                                        })}
                                        className={`w-full p-3 rounded-xl border text-right text-xs text-white flex flex-col gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                            !matchedStudent
                                                ? 'bg-indigo-600/20 hover:bg-indigo-600/30 border-indigo-500/40'
                                                : 'bg-slate-800 hover:bg-slate-750 border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                                                <UserPlus size={15} />
                                                <span>{matchedStudent ? '٤.' : '٢.'} اعتماد وإنشاء ملف طالب جديد منفصل في المدرسة {isDeferred ? `(نقاط مؤجلة: ${rawPoints} ن)` : `ورصد النقاط (+${rawPoints})`}</span>
                                            </span>
                                            {!matchedStudent && (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">موصى به لغير المقيد</span>
                                            )}
                                        </div>
                                        <span className="text-[11px] text-slate-300 leading-normal pr-5">
                                            إضافة الطالب رسمياً لقاعدة بيانات طلاب المدرسة باسم ({sub.studentName}) وصف ({sub.grade} - {sub.section || '1'}) {isDeferred ? `مع رصد (${rawPoints}) نقطة عند إنجاز الفعالية بالجدول.` : `ومنحه (+${rawPoints}) نقطة كبداية.`}
                                        </span>
                                    </button>
                                </div>

                                {/* Option 5: Manual Search / Reassign to another student in school */}
                                <div className="pt-2 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setShowManualReassign(prev => !prev)}
                                        className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-between transition-colors"
                                    >
                                        <span className="flex items-center gap-2">
                                            <ArrowRightLeft size={14} className="text-indigo-400" />
                                            <span>البحث عن طالب آخر في المدرسة والربط بملفه</span>
                                        </span>
                                        <ChevronDown size={14} className={`transform transition-transform ${showManualReassign ? 'rotate-180' : ''}`} />
                                    </button>

                                    {showManualReassign && (
                                        <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5 animate-in fade-in">
                                            <div className="relative">
                                                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    placeholder="ابحث باسم الطالب أو الصف أو الشعبة..."
                                                    value={reassignSearchQuery}
                                                    onChange={(e) => setReassignSearchQuery(e.target.value)}
                                                    className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>

                                            {/* Candidate suggestions */}
                                            {dupInfo.candidates?.length > 0 && !reassignSearchQuery && (
                                                <div className="space-y-1">
                                                    <span className="text-[11px] text-slate-400 block font-semibold">مرشحون مقترحون لتشابه الاسم:</span>
                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                        {dupInfo.candidates.map(cand => (
                                                            <button
                                                                key={cand.id}
                                                                type="button"
                                                                onClick={() => setChosenStudentOverride(cand)}
                                                                className={`w-full p-2 rounded-lg text-right text-xs flex items-center justify-between border transition-colors ${
                                                                    matchedStudent?.id === cand.id
                                                                        ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                                                                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                                                                }`}
                                                            >
                                                                <div>
                                                                    <span className="font-bold text-white block">{cand.name}</span>
                                                                    <span className="text-[11px] text-slate-400">{cand.grade || cand.class} - شعبة {cand.section || '1'}</span>
                                                                </div>
                                                                <span className="text-[11px] text-indigo-400 font-mono">{cand.totalPoints || 0} نقطة</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Filtered School Students */}
                                            {reassignSearchQuery.trim() && (
                                                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {students
                                                        .filter(s =>
                                                            s.name.toLowerCase().includes(reassignSearchQuery.toLowerCase()) ||
                                                            (s.grade || '').toLowerCase().includes(reassignSearchQuery.toLowerCase()) ||
                                                            (s.section || '').includes(reassignSearchQuery)
                                                        )
                                                        .slice(0, 10)
                                                        .map(cand => (
                                                            <button
                                                                key={cand.id}
                                                                type="button"
                                                                onClick={() => setChosenStudentOverride(cand)}
                                                                className={`w-full p-2 rounded-lg text-right text-xs flex items-center justify-between border transition-colors ${
                                                                    matchedStudent?.id === cand.id
                                                                        ? 'bg-indigo-600/30 border-indigo-500 text-white font-bold'
                                                                        : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                                                                }`}
                                                            >
                                                                <div>
                                                                    <span className="font-bold text-white block">{cand.name}</span>
                                                                    <span className="text-[11px] text-slate-400">{cand.grade || cand.class} - شعبة {cand.section || '1'}</span>
                                                                </div>
                                                                <span className="text-[11px] text-indigo-400 font-mono">{cand.totalPoints || 0} نقطة</span>
                                                            </button>
                                                        ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Footer Actions */}
                                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStudentActionSub(null);
                                            setChosenStudentOverride(null);
                                            setShowManualReassign(false);
                                            setReassignSearchQuery('');
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                    >
                                        إلغاء
                                    </button>
                                    {sub.status !== 'rejected' && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleReject(sub);
                                                setStudentActionSub(null);
                                            }}
                                            className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 text-xs font-bold transition-colors"
                                        >
                                            رفض الطلب
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Student Profile Creation Choice Modal (Single) */}
                {showCreateStudentModal && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 text-right space-y-4" dir="rtl">
                            <div className="flex items-center gap-3 text-indigo-400">
                                <ShieldAlert size={24} />
                                <h3 className="font-bold text-white text-base">طالب جديد غير مقيد بالنظام</h3>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                الطالب <strong className="text-white">{showCreateStudentModal.studentName}</strong> غير مسجل حالياً في قاعدة بيانات طلاب المدرسة. كيف ترغب في اعتماد مشاركته؟
                            </p>
                            <div className="space-y-2 pt-2">
                                <button
                                    onClick={() => handleApprove(showCreateStudentModal, true)}
                                    className="w-full p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-right text-xs text-white flex flex-col gap-1 transition-colors"
                                >
                                    <span className="font-bold text-indigo-300">١. اعتماد وإنشاء ملف طالب جديد في المدرسة</span>
                                    <span className="text-[11px] text-slate-400">سيتم إضافة الطالب رسمياً لقائمة الطلاب ومنحه النقاط المقررة.</span>
                                </button>
                                <button
                                    onClick={() => handleApprove(showCreateStudentModal, false)}
                                    className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-right text-xs text-white flex flex-col gap-1 transition-colors"
                                >
                                    <span className="font-bold text-slate-200">٢. اعتماد للمناسبة الحالية فقط</span>
                                    <span className="text-[11px] text-slate-400">اعتماد المشاركة في هذا الكشف دون إنشاء ملف طالب جديد في سجلات المدرسة.</span>
                                </button>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setShowCreateStudentModal(null)}
                                    className="text-xs text-slate-400 hover:text-white"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Bulk Student Profile Creation & Points Choice Modal */}
                {showBulkCreateModal && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
                        <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-5 sm:p-6 text-right space-y-4 shadow-2xl my-auto" dir="rtl">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div className="flex items-center gap-3 text-indigo-400">
                                    <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30">
                                        <Users size={22} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white text-base">اعتماد جماعي للطلاب المحددين</h3>
                                        <p className="text-xs text-slate-400">
                                            إجمالي: {showBulkCreateModal.totalCount} طالب ({showBulkCreateModal.regCount || (showBulkCreateModal.totalCount - showBulkCreateModal.unregCount)} مقيد بالمدرسة، {showBulkCreateModal.unregCount} غير مقيد)
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowBulkCreateModal(null)}
                                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Bulk Points Configuration Box */}
                            <div className="bg-slate-950/70 rounded-xl border border-slate-800 p-3.5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                        <Award size={14} className="text-amber-400" />
                                        <span>النقاط الممنوحة لكل طالب بالدفعة:</span>
                                    </label>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                        افتراضي الرابط: {link.pointsPerStudent ?? 0} ن
                                    </span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={bulkPoints}
                                        onChange={(e) => setBulkPoints(Math.max(0, Number(e.target.value)))}
                                        className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono text-center focus:outline-none focus:border-indigo-500"
                                    />
                                    <div className="flex items-center gap-1">
                                        {[0, 2, 5, 10, 15].map(pts => (
                                            <button
                                                key={pts}
                                                type="button"
                                                onClick={() => setBulkPoints(pts)}
                                                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                                    bulkPoints === pts
                                                        ? 'bg-indigo-600 text-white font-bold'
                                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                                }`}
                                            >
                                                {pts} ن
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Bulk Timing Option (if linked to an event) */}
                                {link.eventId && (
                                    <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5">
                                        <span className="text-[11px] font-bold text-slate-400 block">توقيت رصد النقاط:</span>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setBulkTiming('immediate')}
                                                className={`p-2.5 rounded-lg border text-right transition-all text-xs flex items-center gap-2 ${
                                                    bulkTiming === 'immediate'
                                                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 font-bold'
                                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                                }`}
                                            >
                                                <Zap size={15} className="shrink-0 text-emerald-400" />
                                                <div>
                                                    <div className="font-bold text-white text-xs">⚡ رصد فوري الآن</div>
                                                    <div className="text-[10px] text-slate-400">إيداع النقاط للدفعة فوراً</div>
                                                </div>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setBulkTiming('on_event_done')}
                                                className={`p-2.5 rounded-lg border text-right transition-all text-xs flex items-center gap-2 ${
                                                    bulkTiming === 'on_event_done'
                                                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300 font-bold'
                                                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                                }`}
                                            >
                                                <Clock size={15} className="shrink-0 text-indigo-400" />
                                                <div>
                                                    <div className="font-bold text-white text-xs">⏳ مؤجل لإنجاز النشاط</div>
                                                    <div className="text-[10px] text-slate-400">تُرصد عند إنجاز الفعالية</div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Unregistered students action choices */}
                            {showBulkCreateModal.unregCount > 0 ? (
                                <div className="space-y-2">
                                    <span className="text-xs text-slate-300 font-bold block">
                                        طريقة التعامل مع الطلاب غير المقيدين بالمدرسة ({showBulkCreateModal.unregCount} طالب):
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => executeBulkApprove(true)}
                                        className="w-full p-3.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-right text-xs text-white flex flex-col gap-1 transition-all"
                                    >
                                        <span className="font-bold text-indigo-300">١. اعتماد الجميع وإنشاء ملفات جديدة لغير المقيدين ({bulkTiming === 'on_event_done' && link.eventId ? `نقاط مؤجلة للإنجاز: ${bulkPoints} ن` : `رصد +${bulkPoints} ن`})</span>
                                        <span className="text-[11px] text-slate-400">
                                            سيتم إنشاء ملفات جديدة لـ ({showBulkCreateModal.unregCount}) طلاب في سجل المدرسة وربط جميع الطلاب بالفعالية.
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => executeBulkApprove(false)}
                                        className="w-full p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-right text-xs text-white flex flex-col gap-1 transition-all"
                                    >
                                        <span className="font-bold text-slate-200">٢. اعتماد للمناسبة الحالية فقط (دون إنشاء ملفات جديدة)</span>
                                        <span className="text-[11px] text-slate-400">
                                            اعتماد مشاركتهم في هذا الكشف فقط. الطلاب المسجلون مسبقاً تُمنح لهم النقاط وتُربط الفعالية بسجلاتهم، ولن يتم إنشاء ملفات جديدة لمن ليس لديه ملف.
                                        </span>
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3 pt-1">
                                    <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-emerald-200 text-xs flex items-center gap-2">
                                        <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                                        <span>جميع الطلاب المحددين ({showBulkCreateModal.totalCount}) مقيدون ومطابقون في قاعدة بيانات المدرسة.</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => executeBulkApprove(false)}
                                        className="w-full p-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
                                    >
                                        <CheckCircle size={16} />
                                        <span>تأكيد اعتماد الدفعة بالكامل ({showBulkCreateModal.totalCount} طالب {bulkTiming === 'on_event_done' && link.eventId ? `• نقاط مؤجلة للإنجاز: ${bulkPoints} ن` : `• +${bulkPoints} ن`})</span>
                                    </button>
                                </div>
                            )}

                            <div className="flex justify-end pt-2 border-t border-slate-800">
                                <button
                                    onClick={() => setShowBulkCreateModal(null)}
                                    className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Advanced Universal Print Modal */}
                <AdvancedPrintModal
                    isOpen={isPrintModalOpen}
                    onClose={() => setIsPrintModalOpen(false)}
                    reportType={`link_submissions_${link.id}`}
                    availableColumns={printColumnsDefinition}
                    defaultTitle={`كشف حصر المشاركات والتسليم - ${link.title}`}
                    totalRecordsCount={filteredSubmissions.length}
                    selectedRecordsCount={selectedIds.length}
                    onPrint={handleExecuteAdvancedPrint}
                />
            </div>
        </div>
    );
}

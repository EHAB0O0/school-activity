import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, doc, updateDoc, orderBy, onSnapshot, writeBatch, getDocs, limit } from 'firebase/firestore';
import { Search, Plus, Trash2, Award, User, FileText, Clock, Edit3, X, Save, ArrowUpDown, Tag, Filter, Printer, AlertTriangle, Sparkles, BellOff, Layers, TrendingUp, ArrowUpRight, ArrowDownLeft, CheckCircle2, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';
import MultiSelect from '../components/ui/MultiSelect';

import ConfirmModal from '../components/ui/ConfirmModal';
import BulkActionsBar from '../components/students/BulkActionsBar';
import BulkOperationsModal from '../components/students/BulkOperationsModal';
import BulkPrintCertificatesModal from '../components/students/BulkPrintCertificatesModal';
import DuplicateResolverModal from '../components/students/DuplicateResolverModal';
import { findDuplicateGroups, enrichDuplicateGroupsWithEvents, normalizeArabic } from '../utils/studentDuplicates';
import { logPointsChange, clampPoints, sanitizeNegativePoints, fetchStudentPointsLogs } from '../utils/pointsLedger';
import { sortStudentsArabic, cleanClassString, getOfficialReportHeaderHtml, getStandardPrintStyles, printHtmlDocument, getOfficialReportFooterHtml } from '../utils/reportUtils';
import AdvancedPrintModal from '../components/ui/AdvancedPrintModal';

export default function StudentsPage() {
    const [students, setStudents] = useState([]);
    const [allEvents, setAllEvents] = useState([]);
    const [allLinks, setAllLinks] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name'); // name | points
    const [gradeFilter, setGradeFilter] = useState('');
    const [sectionFilter, setSectionFilter] = useState('');
    const [specFilter, setSpecFilter] = useState('All');

    // Duplicate detection state
    const [isDuplicateAlertDismissed, setIsDuplicateAlertDismissed] = useState(false);
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

    // Selection & Bulk Actions State
    const [selectedIds, setSelectedIds] = useState([]);
    const [lastSelectedId, setLastSelectedId] = useState(null);
    const [isOperationsModalOpen, setIsOperationsModalOpen] = useState(false);
    const [operationsInitialTab, setOperationsInitialTab] = useState('transfer');
    const [isCertificatesModalOpen, setIsCertificatesModalOpen] = useState(false);
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

    // Advanced Universal Print Modal State
    const [printModalConfig, setPrintModalConfig] = useState({
        isOpen: false,
        reportType: 'students_consolidated_sheet',
        title: 'كشف مجمّع لبيانات الطلاب',
        columns: [],
        scopeTotalCount: 0,
        selectedCount: 0,
        onExecute: null
    });

    const { eventTypes, grades, settings, schoolInfo } = useSettings();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', class: '', grade: '', section: '', isGradeUnknown: false, specializations: [] });

    // Spec Options Construction
    const specOptions = [
        { value: 'General', label: 'عام / جوكر' },
        ...(eventTypes || []).map(t => ({ value: t.name, label: t.name }))
    ];

    // Profile Modal State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [profileTab, setProfileTab] = useState('info'); // info | notes | history | points
    const [studentPointsLogs, setStudentPointsLogs] = useState([]);
    const [loadingPointsLogs, setLoadingPointsLogs] = useState(false);
    const [includePointsInPrint, setIncludePointsInPrint] = useState(false);

    const [studentHistory, setStudentHistory] = useState([]);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // --- Real-time Students Listener ---
    useEffect(() => {
        const q = query(collection(db, 'students'), where('active', '==', true));
        const unsubscribe = onSnapshot(q, (snap) => {
            const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setStudents(loaded);
            // Silently sanitize any negative points without creating audit noise
            sanitizeNegativePoints(loaded);
        }, (err) => {
            console.warn("Students sync error:", err.message);
        });
        return () => unsubscribe();
    }, []);

    // --- Real-time Events Listener (for activity cross-referencing) ---
    useEffect(() => {
        const qEvents = query(collection(db, 'events'));
        const unsubscribeEvents = onSnapshot(qEvents, (snap) => {
            setAllEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.warn("Events sync error:", err.message);
        });
        return () => unsubscribeEvents();
    }, []);

    // --- Real-time Registration Links Listener (for delegate cross-referencing) ---
    useEffect(() => {
        const qLinks = query(collection(db, 'registration_links'));
        const unsubscribeLinks = onSnapshot(qLinks, (snap) => {
            setAllLinks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.warn("Registration links sync error:", err.message);
        });
        return () => unsubscribeLinks();
    }, []);

    // --- Smart Duplicate Detection ---
    const rawDuplicateGroups = useMemo(() => findDuplicateGroups(students), [students]);
    const duplicateGroups = useMemo(() => {
        return enrichDuplicateGroupsWithEvents(rawDuplicateGroups, allEvents);
    }, [rawDuplicateGroups, allEvents]);

    // Helper to format student class cleanly without trailing hyphens
    const cleanClassString = (stOrClass, grade, section) => {
        if (!stOrClass) return '-';
        if (typeof stOrClass === 'object') {
            const isUnknown = stOrClass.grade === 'غير معروف' || 
                              stOrClass.grade === 'Unknown' || 
                              !!stOrClass.isGradeUnknown || 
                              (stOrClass.class && String(stOrClass.class).startsWith('غير معروف'));
            if (isUnknown) return 'غير معروف';
            const g = (stOrClass.grade || '').trim();
            const s = (stOrClass.section || '').trim();
            if (g && s) return `${g} - ${s}`;
            if (g) return g;
            return (stOrClass.class || '').replace(/\s*-\s*$/, '').trim() || '-';
        }
        const str = String(stOrClass || '').trim();
        if (!str || str.startsWith('غير معروف') || grade === 'غير معروف' || grade === 'Unknown') return 'غير معروف';
        if (grade && section) return `${grade} - ${section}`;
        return str.replace(/\s*-\s*$/, '').trim() || '-';
    };

    // --- Add Student ---
    async function handleAdd(e) {
        e.preventDefault();
        try {
            const isUnknown = !!newStudent.isGradeUnknown || newStudent.grade === 'غير معروف';
            const finalGrade = isUnknown ? 'غير معروف' : (newStudent.grade || '');
            const finalSection = isUnknown ? '' : (newStudent.section || '');
            const finalClass = isUnknown ? 'غير معروف' : (finalSection ? `${finalGrade} - ${finalSection}` : finalGrade).trim();

            await addDoc(collection(db, 'students'), {
                name: newStudent.name.trim(),
                grade: finalGrade,
                section: finalSection,
                class: finalClass,
                isGradeUnknown: isUnknown,
                specializations: newStudent.specializations || [],
                active: true,
                totalPoints: 0,
                joinedAt: new Date()
            });
            setNewStudent({ name: '', class: '', grade: '', section: '', isGradeUnknown: false, specializations: [] });
            setIsAddModalOpen(false);
            toast.success('تمت إضافة الطالب بنجاح');
        } catch (err) {
            console.error("Add student error:", err);
            toast.error('حدث خطأ أثناء إضافة الطالب');
        }
    }

    // --- Delete Student ---
    async function handleDelete(id) {
        setConfirmModal({
            isOpen: true,
            title: "نقل للأرشيف",
            message: "هل أنت متأكد من نقل هذا الطالب للأرشيف؟",
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, 'students', id), { active: false });
                    setStudents(students.filter(s => s.id !== id));
                    toast.success('تم الأرشفة');
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch { toast.error('فشل'); }
            }
        });
    }

    // --- Profile Logic ---
    const openProfile = (student) => {
        setStudentHistory([]);
        setStudentPointsLogs([]);
        setIncludePointsInPrint(false);
        setSelectedStudent(student);
        setProfileTab('info');
    };

    // Live History Listener: Events participation + Delegated links (Only run when opening a different student or links change)
    useEffect(() => {
        if (!selectedStudent?.id) return;

        const q = query(
            collection(db, 'events'),
            where('participatingStudents', 'array-contains', selectedStudent.id),
            orderBy('startTime', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            const evts = snap.docs.map(d => ({ id: d.id, ...d.data(), isDelegate: false }));

            // Cross-reference delegated registration links for this student
            const normName = normalizeArabic(selectedStudent.name || '');
            const delegatedLinks = allLinks.filter(l => {
                if (l.delegateStudentId && l.delegateStudentId === selectedStudent.id) return true;
                if (l.delegateName && normName) {
                    const normDel = normalizeArabic(l.delegateName);
                    return normDel.includes(normName) || normName.includes(normDel);
                }
                return false;
            }).map(link => ({
                id: `link_${link.id}`,
                linkId: link.id,
                title: link.title || 'رابط تسجيل',
                typeName: 'طالب مفوض (إشراف وتنظيم)',
                venueId: link.eventTitle ? `مرتبط بـ: ${link.eventTitle}` : 'رابط تسجيل إلكتروني',
                status: link.delegatePointsAwarded ? 'Done' : (link.status === 'paused' ? 'موقوف' : 'نشط'),
                isDelegate: true,
                role: 'طالب مفوض',
                eventTitle: link.eventTitle || '',
                eventId: link.eventId || null,
                currentCount: Number(link.currentCount) || 0,
                delegateRewardPoints: Number(link.delegateRewardPoints) || 0,
                delegatePointsAwarded: !!link.delegatePointsAwarded,
                date: link.createdAt?.toDate ? link.createdAt.toDate().toLocaleDateString('ar-SA') : (link.createdAt?.seconds ? new Date(link.createdAt.seconds * 1000).toLocaleDateString('ar-SA') : '-'),
                startTime: link.createdAt || null
            }));

            const combined = [...evts, ...delegatedLinks].sort((a, b) => {
                const timeA = a.startTime?.toMillis ? a.startTime.toMillis() : (a.startTime?.seconds ? a.startTime.seconds * 1000 : (a.date ? new Date(a.date).getTime() : 0));
                const timeB = b.startTime?.toMillis ? b.startTime.toMillis() : (b.startTime?.seconds ? b.startTime.seconds * 1000 : (b.date ? new Date(b.date).getTime() : 0));
                return timeB - timeA;
            });

            setStudentHistory(combined);
        }, (error) => {
            console.error("History sync error:", error);
        });

        return () => unsubscribe();
    }, [selectedStudent?.id, selectedStudent?.name, allLinks]);

    // Points History Fetcher (Only run when opening a different student)
    useEffect(() => {
        if (!selectedStudent?.id) return;
        setLoadingPointsLogs(true);
        fetchStudentPointsLogs(selectedStudent.id)
            .then(logs => {
                setStudentPointsLogs(logs || []);
                setLoadingPointsLogs(false);
            })
            .catch(err => {
                console.warn("Points logs fetch error:", err?.message || err);
                setStudentPointsLogs([]);
                setLoadingPointsLogs(false);
            });
    }, [selectedStudent?.id]);

    const saveProfileChanges = async () => {
        if (!selectedStudent) return;
        try {
            const originalStudent = students.find(s => s.id === selectedStudent.id);
            const oldPoints = Number(originalStudent?.totalPoints) || 0;
            const newPoints = Math.max(0, Number(selectedStudent.totalPoints) || 0);
            const pointsDiff = newPoints - oldPoints;

            const isUnknown = selectedStudent.grade === 'غير معروف' || !!selectedStudent.isGradeUnknown;
            const finalGrade = isUnknown ? 'غير معروف' : (selectedStudent.grade || '');
            const finalSection = isUnknown ? '' : (selectedStudent.section || '');
            const finalClass = isUnknown ? 'غير معروف' : (finalSection ? `${finalGrade} - ${finalSection}` : (selectedStudent.class || finalGrade)).replace(/\s*-\s*$/, '').trim();

            await updateDoc(doc(db, 'students', selectedStudent.id), {
                name: selectedStudent.name.trim(),
                class: finalClass,
                grade: finalGrade,
                section: finalSection,
                isGradeUnknown: isUnknown,
                totalPoints: newPoints,
                notes: selectedStudent.notes || '',
                specializations: selectedStudent.specializations || []
            });

            if (pointsDiff !== 0) {
                await logPointsChange({
                    studentId: selectedStudent.id,
                    studentName: selectedStudent.name,
                    grade: finalGrade,
                    section: finalSection,
                    class: finalClass,
                    change: pointsDiff,
                    previousTotalPoints: oldPoints,
                    newTotalPoints: newPoints,
                    actionType: pointsDiff > 0 ? 'manual_add' : 'manual_deduct',
                    reason: pointsDiff > 0 ? 'تعديل يدوي للملف (زيادة)' : 'تعديل يدوي للملف (خصم)',
                    performedBy: 'المشرف'
                });
                const updatedLogs = await fetchStudentPointsLogs(selectedStudent.id);
                setStudentPointsLogs(updatedLogs);
            }

            toast.success("تم تحديث الملف الشخصي");
        } catch (err) {
            console.error("Save profile error:", err);
            toast.error("فشل التحديث");
        }
    };

    // --- Student Profile PDF / Print ---
    const generateStudentProfilePDF = async (student, history = [], includePoints = false, pointsLogs = [], options = {}) => {
        const {
            columns = ['banner', 'kpis', 'specs', 'activities', includePoints ? 'points' : null, 'notes'].filter(Boolean),
            theme = 'classic',
            orientation = 'portrait',
            density = 'standard',
            showHeader = true,
            showKpis = true,
            showSignatures = true,
            signatures = [],
            customTitle = '',
            footerNote = ''
        } = options;

        const toastId = toast.loading('جاري تجهيز ملف الطالب للطباعة...');
        try {
            const classDisplay = cleanClassString(student);
            const isDark = theme === 'dark';
            const isMonochrome = theme === 'monochrome';

            // Specializations HTML
            const specsHtml = (student.specializations && student.specializations.length > 0)
                ? student.specializations.map(s => `<span class="badge">${s === 'General' ? 'عام' : s}</span>`).join(' ')
                : '<span style="color:#94a3b8; font-size:12px;">لا يوجد تخصيص محدد</span>';

            // Activities Rows (Sorted by date descending)
            const sortedHistory = [...history].sort((a, b) => {
                const timeA = a.startTime?.toMillis ? a.startTime.toMillis() : (a.date ? new Date(a.date).getTime() : 0);
                const timeB = b.startTime?.toMillis ? b.startTime.toMillis() : (b.date ? new Date(b.date).getTime() : 0);
                return timeB - timeA;
            });

            const historyRows = sortedHistory.length > 0
                ? sortedHistory.map((evt, i) => {
                    const statusLabel = evt.isDelegate
                        ? (evt.delegatePointsAwarded ? 'مفوض (ممنوح)' : 'طالب مفوض')
                        : (evt.status === 'Done' ? 'مكتمل' : (evt.status || 'مسجّل'));
                    const statusClass = (evt.status === 'Done' || (evt.isDelegate && evt.delegatePointsAwarded)) ? 'success' : '';
                    const typeLabel = evt.isDelegate ? 'طالب مفوض (إشراف وتنظيم)' : (evt.typeName || '-');

                    return `
                    <tr>
                        <td style="text-align: center; font-weight: bold;">${i + 1}</td>
                        <td style="font-weight: bold;">${evt.title || '-'}</td>
                        <td>${typeLabel}</td>
                        <td style="color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'}; font-size: 12px;">${evt.date || (evt.startTime?.toDate ? evt.startTime.toDate().toLocaleDateString('ar-SA') : '-')}</td>
                        <td style="text-align: center;">
                            <span class="status ${statusClass}">
                                ${statusLabel}
                            </span>
                        </td>
                    </tr>
                    `;
                }).join('')
                : `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 20px;">لا توجد مشاركات مسجلة لهذا الطالب حتى الآن</td></tr>`;

            const shouldIncludePoints = columns.includes('points') || includePoints;
            let pointsSectionHtml = '';
            if (shouldIncludePoints) {
                // Ensure points logs are sorted descending
                const sortedLogs = [...(pointsLogs || [])].sort((a, b) => {
                    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                    return timeB - timeA;
                });

                const pointsRows = sortedLogs.length > 0
                    ? sortedLogs.map((log, i) => {
                        const isPos = (Number(log.change) || 0) > 0;
                        const changeStr = isPos ? `+${log.change}` : `${log.change}`;
                        const logDate = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('ar-SA') : (log.date || '-');
                        const logTime = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
                        return `
                            <tr>
                                <td style="text-align: center; font-weight: bold;">${i + 1}</td>
                                <td style="color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'}; font-size: 12px;">${logDate} ${logTime ? `• ${logTime}` : ''}</td>
                                <td style="font-weight: bold;">${log.reason || log.eventTitle || 'حركة نقاط'}</td>
                                <td style="text-align: center;">
                                    <span class="type-pill">${log.eventType || (log.actionType === 'manual_add' || log.actionType === 'manual_deduct' ? 'يدوي' : 'نشاط')}</span>
                                </td>
                                <td style="text-align: center; font-weight: bold; ${isPos ? (isDark ? 'color: #34d399;' : isMonochrome ? 'color: #000;' : 'color: #059669;') : (isDark ? 'color: #fb7185;' : isMonochrome ? 'color: #000;' : 'color: #dc2626;')} direction: ltr;">
                                    ${changeStr} ن
                                </td>
                                <td style="text-align: center; font-weight: bold; color: ${isDark ? '#34d399' : isMonochrome ? '#000;' : '#047857;'}">${log.newTotalPoints ?? '-'}</td>
                            </tr>
                        `;
                    }).join('')
                    : `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 20px;">الرصيد الحالي لهذا الطالب (${student.totalPoints || 0} نقطة) معتمد كرصيد افتتاحي سابق دون حركات مسجلة</td></tr>`;

                pointsSectionHtml = `
                    <div class="section-container">
                        <div class="section-title">
                            <h3>سجل وتفاصيل حركات نقاط التميز (${sortedLogs.length} حركة مسجلة)</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 5%; text-align: center;">#</th>
                                    <th style="width: 22%;">التاريخ والوقت</th>
                                    <th style="width: 33%;">سبب الحركة / النشاط</th>
                                    <th style="width: 14%; text-align: center;">نوع العملية</th>
                                    <th style="width: 13%; text-align: center;">مقدار التغيير</th>
                                    <th style="width: 13%; text-align: center;">الرصيد بعد الحركة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pointsRows}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            const joinDateStr = student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('ar-SA') : '-';

            const defaultTitle = shouldIncludePoints ? 'تقرير السجل الشامل ونقاط التميز' : 'تقرير الملف الفردي للطالب';
            const pageTitle = customTitle.trim() || defaultTitle;

            let headerHtml = '';
            if (showHeader) {
                headerHtml = getOfficialReportHeaderHtml({
                    schoolInfo,
                    title: pageTitle,
                    subTitle: 'قسم النشاط الطلابي المدرسي',
                    studentName: student.name,
                    centerDetails: [
                        `الصف / الشعبة: ${classDisplay}`
                    ],
                    leftDetails: [
                        { label: 'حالة القيد', value: student.active !== false ? 'طالب منتظم' : 'مؤرشف' },
                        { label: 'رصيد النقاط', value: `${student.totalPoints || 0} نقطة` }
                    ]
                });
            }

            const bannerHtml = columns.includes('banner') ? `
                <div class="student-banner">
                    <div class="avatar">${student.name.charAt(0)}</div>
                    <div class="student-banner-info">
                        <h2>${student.name}</h2>
                        <p>سجل تفصيلي معتمد لجميع المشاركات وبيانات نقاط التميز</p>
                    </div>
                </div>
            ` : '';

            const kpiHtml = (columns.includes('kpis') && showKpis) ? `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">الصف / الشعبة</div>
                        <div class="kpi-value">${classDisplay}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">رصيد نقاط التميز</div>
                        <div class="kpi-value points">${student.totalPoints || 0} نقطة</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">الأنشطة المسجلة</div>
                        <div class="kpi-value">${history.length} نشاط</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">${shouldIncludePoints ? 'حركات النقاط' : 'تاريخ الانضمام'}</div>
                        <div class="kpi-value">${shouldIncludePoints ? `${pointsLogs ? pointsLogs.length : 0} حركة` : joinDateStr}</div>
                    </div>
                </div>
            ` : '';

            const specsSectionHtml = columns.includes('specs') ? `
                <div class="specs-section">
                    <span class="specs-label">التخصصات والفرق:</span>
                    <div>${specsHtml}</div>
                </div>
            ` : '';

            const activitiesSectionHtml = columns.includes('activities') ? `
                <div class="section-container">
                    <div class="section-title">
                        <h3>سجل الأنشطة والمشاركات (${history.length})</h3>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 5%; text-align: center;">#</th>
                                <th style="width: 40%;">اسم النشاط</th>
                                <th style="width: 20%;">النوع / التصنيف</th>
                                <th style="width: 20%;">التاريخ والوقت</th>
                                <th style="width: 15%; text-align: center;">الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${historyRows}
                        </tbody>
                    </table>
                </div>
            ` : '';

            const notesSectionHtml = (columns.includes('notes') && student.notes) ? `
                <div class="section-container">
                    <div class="section-title">
                        <h3>ملاحظات المرشد والمشرف</h3>
                    </div>
                    <div style="padding: 12px 16px; background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'}; border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'}; border-radius: 8px; font-size: 12px; color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#334155'};">
                        ${student.notes}
                    </div>
                </div>
            ` : '';

            let footerHtml = '';
            if (showSignatures) {
                footerHtml = getOfficialReportFooterHtml({
                    signatures: signatures.length ? signatures : [
                        { role: 'مشرف النشاط الطلابي', name: '' },
                        { role: 'مدير المدرسة', name: schoolInfo?.principalName || '' }
                    ],
                    note: footerNote,
                    systemCredit: 'نظام إدارة النشاط الطلابي المدرسي'
                });
            }

            const htmlContent = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>${pageTitle} - ${student.name}</title>
                    <style>
                        ${getStandardPrintStyles({
                            theme,
                            orientation,
                            density,
                            extraCss: `
                                .avatar {
                                    width: 52px;
                                    height: 52px;
                                    background: ${isMonochrome ? '#000000' : 'linear-gradient(135deg, #4f46e5, #7c3aed)'};
                                    color: #ffffff;
                                    border-radius: 50%;
                                    font-size: 22px;
                                    font-weight: bold;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    flex-shrink: 0;
                                }
                                .student-banner {
                                    display: flex;
                                    align-items: center;
                                    gap: 16px;
                                    background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
                                    border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    border-radius: 12px;
                                    padding: 14px 18px;
                                    margin-bottom: 20px;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .student-banner-info { flex: 1; }
                                .student-banner-info h2 { margin: 0 0 3px 0; font-size: 19px; color: ${isDark ? '#f8fafc' : isMonochrome ? '#000000' : '#0f172a'}; }
                                .student-banner-info p { margin: 0; font-size: 12px; color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'}; }
                                .specs-section {
                                    background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
                                    border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    border-radius: 10px;
                                    padding: 10px 14px;
                                    margin-bottom: 20px;
                                    display: flex;
                                    align-items: center;
                                    gap: 12px;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .specs-label { font-size: 12px; font-weight: bold; color: ${isDark ? '#cbd5e1' : isMonochrome ? '#000000' : '#334155'}; white-space: nowrap; }
                                .section-container {
                                    margin-bottom: 25px;
                                    page-break-inside: auto;
                                    break-inside: auto;
                                }
                                .section-title {
                                    border-bottom: 2px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    padding-bottom: 6px;
                                    margin-bottom: 12px;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .section-title h3 {
                                    margin: 0;
                                    font-size: 15px;
                                    color: ${isDark ? '#38bdf8' : isMonochrome ? '#000000' : '#1e293b'};
                                    font-weight: bold;
                                }
                            `
                        })}
                    </style>
                </head>
                <body>
                    ${headerHtml}
                    ${bannerHtml}
                    ${kpiHtml}
                    ${specsSectionHtml}
                    ${activitiesSectionHtml}
                    ${pointsSectionHtml}
                    ${notesSectionHtml}
                    ${footerHtml}
                </body>
                </html>
            `;

            toast.dismiss(toastId);
            await printHtmlDocument(htmlContent, `${pageTitle} - ${student.name}`);
        } catch (e) {
            console.error(e);
            toast.error("فشل تجهيز الملف للطباعة", { id: toastId });
        }
    };

    // --- Filtering & Sorting ---
    const displayedStudents = useMemo(() => {
        const rawTokens = searchTerm.trim().split(/\s+/).filter(Boolean);
        const normalizedTokens = rawTokens.map(t => normalizeArabic(t));

        return students
            .filter(s => {
                if (normalizedTokens.length > 0) {
                    const corpus = normalizeArabic([
                        s.name || '',
                        s.grade || '',
                        s.section || '',
                        s.class || '',
                        (s.specializations || []).join(' '),
                        String(s.totalPoints ?? ''),
                        s.notes || ''
                    ].join(' '));

                    const matchesAllTokens = normalizedTokens.every(tok => corpus.includes(tok));
                    if (!matchesAllTokens) return false;
                }

                const matchesSpec = specFilter === 'All'
                    ? true
                    : (s.specializations && s.specializations.includes(specFilter));

                const matchesGrade = !gradeFilter
                    ? true
                    : gradeFilter === 'غير معروف'
                        ? (!s.grade || s.grade === 'غير معروف' || s.grade === 'Unknown' || !!s.isGradeUnknown || s.class === 'غير معروف')
                        : s.grade === gradeFilter;
                const matchesSection = !sectionFilter || s.section === sectionFilter;

                return matchesSpec && matchesGrade && matchesSection;
            })
            .sort((a, b) => {
                if (sortBy === 'points') return (b.totalPoints || 0) - (a.totalPoints || 0);
                return (a.name || '').localeCompare(b.name || '', 'ar');
            });
    }, [students, searchTerm, specFilter, gradeFilter, sectionFilter, sortBy]);

    // Selection Computed Properties
    const isAllDisplayedSelected = displayedStudents.length > 0 && displayedStudents.every(s => selectedIds.includes(s.id));
    const isPartiallySelected = selectedIds.length > 0 && !isAllDisplayedSelected;
    const selectedStudentsList = students.filter(s => selectedIds.includes(s.id));

    // Selection Handlers
    const toggleSelectStudent = (id, event) => {
        if (event?.shiftKey && lastSelectedId && lastSelectedId !== id) {
            const currentIndex = displayedStudents.findIndex(s => s.id === id);
            const lastIndex = displayedStudents.findIndex(s => s.id === lastSelectedId);
            if (currentIndex !== -1 && lastIndex !== -1) {
                const start = Math.min(currentIndex, lastIndex);
                const end = Math.max(currentIndex, lastIndex);
                const rangeIds = displayedStudents.slice(start, end + 1).map(s => s.id);
                setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
                setLastSelectedId(id);
                return;
            }
        }
        setLastSelectedId(id);
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAllHeader = () => {
        if (isAllDisplayedSelected) {
            setSelectedIds(prev => prev.filter(id => !displayedStudents.some(s => s.id === id)));
        } else {
            setSelectedIds(Array.from(new Set([...selectedIds, ...displayedStudents.map(s => s.id)])));
        }
    };

    const handleSelectAllDisplayed = () => {
        setSelectedIds(Array.from(new Set([...selectedIds, ...displayedStudents.map(s => s.id)])));
    };

    const handleSelectAllSchool = () => {
        setSelectedIds(students.map(s => s.id));
    };

    const handleClearSelection = () => {
        setSelectedIds([]);
    };

    const handleOpenOperationsModal = (tab = 'transfer') => {
        setOperationsInitialTab(tab);
        setIsOperationsModalOpen(true);
    };

    // --- Bulk Action Handlers ---
    // 1. Bulk Transfer Grade & Section
    const handleBulkTransfer = async ({ targetGrade, targetSection }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري نقل ${selectedIds.length} طالب إلى ${targetGrade} - ${targetSection}...`);
        try {
            const classString = `${targetGrade} - ${targetSection}`;
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    batch.update(doc(db, 'students', id), {
                        grade: targetGrade,
                        section: targetSection,
                        class: classString
                    });
                });
                await batch.commit();
            }
            toast.success(`تم نقل ${selectedIds.length} طالب بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk transfer error:", err);
            toast.error('حدث خطأ أثناء نقل الطلاب', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 2. Bulk Specializations
    const handleBulkSpecialization = async ({ specializations, mode }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تحديث تخصصات ${selectedIds.length} طالب...`);
        try {
            const selectedMap = new Map(students.filter(s => selectedIds.includes(s.id)).map(s => [s.id, s]));
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    const currentStudent = selectedMap.get(id);
                    let newSpecs = [];
                    if (mode === 'append') {
                        const existing = currentStudent?.specializations || [];
                        newSpecs = Array.from(new Set([...existing, ...specializations]));
                    } else {
                        newSpecs = [...specializations];
                    }
                    batch.update(doc(db, 'students', id), {
                        specializations: newSpecs
                    });
                });
                await batch.commit();
            }
            toast.success(`تم تحديث التخصصات بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk specialization error:", err);
            toast.error('حدث خطأ أثناء تحديث التخصصات', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 3. Bulk Points
    const handleBulkPoints = async ({ points, reason }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تحديث نقاط ${selectedIds.length} طالب...`);
        try {
            const selectedMap = new Map(students.filter(s => selectedIds.includes(s.id)).map(s => [s.id, s]));
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                const logsToCreate = [];

                chunk.forEach(id => {
                    const currentStudent = selectedMap.get(id);
                    const oldPoints = Number(currentStudent?.totalPoints) || 0;
                    const updatedPoints = Math.max(0, oldPoints + points);
                    const payload = { totalPoints: updatedPoints };
                    if (reason) {
                        payload.lastPointsNote = reason;
                    }
                    batch.update(doc(db, 'students', id), payload);

                    const diff = updatedPoints - oldPoints;
                    if (diff !== 0) {
                        logsToCreate.push({
                            studentId: id,
                            studentName: currentStudent?.name || '',
                            grade: currentStudent?.grade || '',
                            section: currentStudent?.section || '',
                            class: currentStudent?.class || '',
                            change: diff,
                            previousTotalPoints: oldPoints,
                            newTotalPoints: updatedPoints,
                            actionType: 'bulk_adjustment',
                            reason: reason || (diff > 0 ? 'إضافة نقاط جماعية' : 'خصم نقاط جماعي'),
                            performedBy: 'المشرف'
                        });
                    }
                });
                await batch.commit();

                for (const logItem of logsToCreate) {
                    await logPointsChange(logItem);
                }
            }
            toast.success(`تم تحديث نقاط التميز بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk points error:", err);
            toast.error('حدث خطأ أثناء تحديث النقاط', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 4. Bulk Status
    const handleBulkStatus = async ({ status }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تعديل حالة ${selectedIds.length} طالب...`);
        try {
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    batch.update(doc(db, 'students', id), {
                        status: status,
                        active: status === 'active'
                    });
                });
                await batch.commit();
            }
            toast.success(`تم تعديل الحالة بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk status error:", err);
            toast.error('حدث خطأ أثناء تعديل الحالة', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 5. Bulk Archive
    const handleBulkArchive = () => {
        setConfirmModal({
            isOpen: true,
            title: "أرشفة الطلاب المحددين",
            message: `هل أنت متأكد من نقل ${selectedIds.length} طالب إلى الأرشيف؟ يمكنك استعادتهم لاحقاً.`,
            isDestructive: true,
            onConfirm: async () => {
                setIsProcessingBulk(true);
                const toastId = toast.loading(`جاري أرشفة ${selectedIds.length} طالب...`);
                try {
                    const chunks = [];
                    for (let i = 0; i < selectedIds.length; i += 400) {
                        chunks.push(selectedIds.slice(i, i + 400));
                    }
                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(id => {
                            batch.update(doc(db, 'students', id), { active: false });
                        });
                        await batch.commit();
                    }
                    toast.success(`تم أرشفة ${selectedIds.length} طالب بنجاح!`, { id: toastId });
                    setSelectedIds([]);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch (err) {
                    console.error("Bulk archive error:", err);
                    toast.error('فشل نقل الطلاب للأرشيف', { id: toastId });
                } finally {
                    setIsProcessingBulk(false);
                }
            }
        });
    };

    // 6. Bulk Export to Excel (.xlsx)
    // 6. Bulk Export to Excel (.xlsx)
    const handleExportCSV = async () => {
        const rawList = students.filter(s => selectedIds.includes(s.id));
        if (rawList.length === 0) return;
        const selectedList = sortStudentsArabic(rawList, 'name');

        const toastId = toast.loading('جاري تجهيز ملف Excel...');
        try {
            const XLSX = await import('xlsx');
            const headers = ["م", "اسم الطالب", "الصف", "الشعبة", "الفصل الكامل", "نقاط التميز", "التخصصات", "تاريخ الانضمام"];
            const rows = selectedList.map((s, idx) => {
                const isUnknown = s.grade === 'غير معروف' || s.grade === 'Unknown' || !!s.isGradeUnknown || (s.class && String(s.class).startsWith('غير معروف'));
                const gradeVal = isUnknown ? 'غير معروف' : (s.grade || '-');
                const sectionVal = isUnknown ? '-' : (s.section || '-');
                const classVal = cleanClassString(s);
                return [
                    idx + 1,
                    s.name || '',
                    gradeVal,
                    sectionVal,
                    classVal,
                    s.totalPoints || 0,
                    (s.specializations || []).join('، ') || '-',
                    s.joinedAt?.toDate ? s.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'
                ];
            });

            const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

            // Auto column widths & RTL
            const maxCols = headers.map((h, colIdx) => {
                let maxLen = h.length;
                rows.forEach(r => {
                    const str = String(r[colIdx] ?? '');
                    if (str.length > maxLen) maxLen = str.length;
                });
                return { wch: Math.min(Math.max(maxLen + 3, 10), 35) };
            });
            ws['!cols'] = maxCols;
            ws['!views'] = [{ RTL: true }];

            const wb = XLSX.utils.book_new();
            if (!wb.Workbook) wb.Workbook = {};
            wb.Workbook.Views = [{ RTL: true }];
            XLSX.utils.book_append_sheet(wb, ws, "الطلاب المحددين");
            XLSX.writeFile(wb, `كشف_الطلاب_${new Date().toLocaleDateString('en-CA')}.xlsx`);

            toast.success(`تم تصدير كشف ${selectedList.length} طالب إلى Excel بنجاح!`, { id: toastId });
        } catch (err) {
            console.error("Export Excel error:", err);
            toast.error("فشل تصدير ملف Excel", { id: toastId });
        }
    };

    // 7. Universal Consolidated Student Sheet Print
    const handleOpenConsolidatedPrintModal = () => {
        setPrintModalConfig({
            isOpen: true,
            reportType: 'students_consolidated_sheet',
            title: gradeFilter ? `كشف طلاب ${gradeFilter}${sectionFilter ? ` - ${sectionFilter}` : ''}` : 'كشف مجمّع لبيانات الطلاب',
            columns: [
                { id: 'index', label: '#', defaultVisible: true },
                { id: 'name', label: 'اسم الطالب', defaultVisible: true },
                { id: 'class', label: 'الصف والشعبة', defaultVisible: true },
                { id: 'specializations', label: 'التخصصات والفرق', defaultVisible: true },
                { id: 'points', label: 'نقاط التميز', defaultVisible: true },
                { id: 'activitiesCount', label: 'الأنشطة المسجلة', defaultVisible: false, badge: 'إحصائي' },
                { id: 'notes', label: 'ملاحظات', defaultVisible: true }
            ],
            scopeTotalCount: displayedStudents.length,
            selectedCount: selectedIds.length,
            onExecute: executeConsolidatedPrint
        });
    };

    const executeConsolidatedPrint = async (options) => {
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

        const toastId = toast.loading('جاري تجهيز كشف الطلاب للطباعة...');
        try {
            let targetList = (scope === 'selected' && selectedIds.length > 0)
                ? students.filter(s => selectedIds.includes(s.id))
                : [...displayedStudents];

            if (targetList.length === 0) {
                toast.error("لا يوجد طلاب للطباعة", { id: toastId });
                return;
            }

            const sortedList = sortStudentsArabic(targetList, 'name');

            // Construct Table Headers
            const ths = [];
            if (columns.includes('index')) ths.push('<th style="width: 5%; text-align: center;">#</th>');
            if (columns.includes('name')) ths.push('<th style="width: 28%;">اسم الطالب</th>');
            if (columns.includes('class')) ths.push('<th style="width: 18%; text-align: center;">الصف / الشعبة</th>');
            if (columns.includes('specializations')) ths.push('<th>التخصصات والأنشطة</th>');
            if (columns.includes('points')) ths.push('<th style="width: 12%; text-align: center;">نقاط التميز</th>');
            if (columns.includes('activitiesCount')) ths.push('<th style="width: 12%; text-align: center;">الأنشطة</th>');
            if (columns.includes('notes')) ths.push('<th style="width: 15%;">ملاحظات</th>');
            if (showSignatureCol) ths.push('<th style="width: 120px; text-align: center;">التوقيع / الحضور</th>');

            // Construct Table Rows
            const rowsHtml = sortedList.map((st, idx) => {
                const tds = [];
                if (columns.includes('index')) tds.push(`<td style="text-align: center; font-weight: bold;">${idx + 1}</td>`);
                if (columns.includes('name')) tds.push(`<td style="font-weight: bold;">${st.name}</td>`);
                if (columns.includes('class')) tds.push(`<td style="text-align: center;">${cleanClassString(st)}</td>`);
                if (columns.includes('specializations')) tds.push(`<td>${(st.specializations || []).map(s => s === 'General' ? 'عام' : s).join('، ') || 'عام'}</td>`);
                if (columns.includes('points')) tds.push(`<td style="text-align: center; font-weight: bold; color: #047857;">${st.totalPoints || 0}</td>`);
                if (columns.includes('activitiesCount')) {
                    const normStName = normalizeArabic(st.name || '');
                    const stEventsCount = allEvents.filter(e => e.participatingStudents?.includes(st.id)).length;
                    const stLinksCount = allLinks.filter(l => l.delegateStudentId === st.id || (l.delegateName && normStName && normalizeArabic(l.delegateName).includes(normStName))).length;
                    tds.push(`<td style="text-align: center; font-weight: 600;">${stEventsCount + stLinksCount}</td>`);
                }
                if (columns.includes('notes')) tds.push(`<td style="font-size: 11px; color: #64748b;">${st.notes || ''}</td>`);
                if (showSignatureCol) tds.push('<td style="min-width: 100px; border-bottom: 1px dotted #94a3b8;"></td>');

                return `<tr>${tds.join('')}</tr>`;
            }).join('');

            // Document Title
            const defaultTitle = gradeFilter ? `كشف طلاب ${gradeFilter}${sectionFilter ? ` - ${sectionFilter}` : ''}` : 'كشف مجمّع لبيانات الطلاب';
            const pageTitle = customTitle.trim() || defaultTitle;

            // Header
            let headerHtml = '';
            if (showHeader) {
                headerHtml = getOfficialReportHeaderHtml({
                    schoolInfo,
                    title: pageTitle,
                    subTitle: 'قسم النشاط الطلابي المدرسي',
                    centerDetails: [
                        gradeFilter && gradeFilter !== 'All' ? `الصف: ${gradeFilter}` : null,
                        sectionFilter && sectionFilter !== 'All' ? `الشعبة: ${sectionFilter}` : null,
                        scope === 'selected' ? `(طلاب محددون: ${sortedList.length} من أصل ${displayedStudents.length})` : null
                    ].filter(Boolean),
                    leftDetails: [
                        { label: 'تاريخ الاستخراج', value: new Date().toLocaleDateString('ar-SA') },
                        { label: 'إجمالي الطلاب', value: `${sortedList.length} طالب` }
                    ]
                });
            }

            // KPI Cards
            let kpiHtml = '';
            if (showKpis) {
                const totalPts = sortedList.reduce((acc, s) => acc + (Number(s.totalPoints) || 0), 0);
                const avgPts = sortedList.length ? Math.round(totalPts / sortedList.length) : 0;
                kpiHtml = `
                    <div class="kpi-grid">
                        <div class="kpi-card">
                            <div class="kpi-label">إجمالي الطلاب بالكشف</div>
                            <div class="kpi-value">${sortedList.length}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">مجموع نقاط التميز</div>
                            <div class="kpi-value points">${totalPts}</div>
                        </div>
                        <div class="kpi-card">
                            <div class="kpi-label">متوسط النقاط لكل طالب</div>
                            <div class="kpi-value">${avgPts}</div>
                        </div>
                    </div>
                `;
            }

            // Footer
            let footerHtml = '';
            if (showSignatures) {
                footerHtml = getOfficialReportFooterHtml({
                    signatures: signatures.length ? signatures : [
                        { role: 'مشرف النشاط الطلابي', name: '' },
                        { role: 'مدير المدرسة', name: schoolInfo?.principalName || '' }
                    ],
                    note: footerNote,
                    systemCredit: 'نظام إدارة النشاط الطلابي المدرسي'
                });
            }

            const htmlContent = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
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
            console.error("Print consolidated error:", err);
            toast.error("فشل تجهيز كشف الطلاب للطباعة", { id: toastId });
        }
    };

    // 8. Bulk Detailed Records Print
    const handleOpenDetailedBatchPrintModal = () => {
        setPrintModalConfig({
            isOpen: true,
            reportType: 'students_detailed_batch',
            title: 'سجلات تفصيلية للطلاب',
            columns: [
                { id: 'banner', label: 'بيانات وهوية الطالب', defaultVisible: true },
                { id: 'specs', label: 'التخصصات والفرق المسجل بها', defaultVisible: true },
                { id: 'activities', label: 'سجل الأنشطة والمشاركات', defaultVisible: true }
            ],
            scopeTotalCount: displayedStudents.length,
            selectedCount: selectedIds.length,
            onExecute: executeDetailedBatchPrint
        });
    };

    const executeDetailedBatchPrint = async (options) => {
        const {
            columns = ['banner', 'specs', 'activities'],
            theme = 'classic',
            orientation = 'portrait',
            density = 'standard',
            scope = 'all',
            showHeader = true,
            showSignatures = true,
            signatures = [],
            customTitle = '',
            footerNote = ''
        } = options;

        let targetList = (scope === 'selected' && selectedIds.length > 0)
            ? students.filter(s => selectedIds.includes(s.id))
            : [...displayedStudents];

        if (targetList.length === 0) return;
        const selectedList = sortStudentsArabic(targetList, 'name');

        const toastId = toast.loading(`جاري تجهيز سجلات ${selectedList.length} طالب للطباعة...`);
        try {
            const eventsSnap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'desc'), limit(150)));
            const allEvts = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const isDark = theme === 'dark';
            const isMonochrome = theme === 'monochrome';

            const pagesHtml = selectedList.map(st => {
                const normName = normalizeArabic(st.name || '');
                const stEvents = allEvts.filter(e => e.participatingStudents && e.participatingStudents.includes(st.id));
                const stLinks = allLinks.filter(l => {
                    if (l.delegateStudentId && l.delegateStudentId === st.id) return true;
                    if (l.delegateName && normName) {
                        const normDel = normalizeArabic(l.delegateName);
                        return normDel.includes(normName) || normName.includes(normDel);
                    }
                    return false;
                }).map(link => ({
                    id: `link_${link.id}`,
                    title: link.title || 'رابط تسجيل',
                    typeName: 'طالب مفوض (إشراف وتنظيم)',
                    date: link.createdAt?.toDate ? link.createdAt.toDate().toLocaleDateString('en-GB') : '',
                    status: link.delegatePointsAwarded ? 'Done' : 'مفوض',
                    isDelegate: true,
                    delegatePointsAwarded: !!link.delegatePointsAwarded
                }));
                const studentEvents = [...stEvents, ...stLinks];
                const eventsRows = studentEvents.length > 0 ? studentEvents.map((evt, idx) => `
                    <tr>
                        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
                        <td style="font-weight: bold;">${evt.title}</td>
                        <td>${evt.isDelegate ? 'طالب مفوض (إشراف وتنظيم)' : (evt.typeName || '-')}</td>
                        <td style="direction: ltr; text-align: right;">${evt.date || (evt.startTime?.toDate ? evt.startTime.toDate().toLocaleDateString('en-GB') : '-')}</td>
                        <td style="text-align: center;"><span class="status ${evt.status === 'Done' ? 'success' : ''}">${evt.isDelegate ? (evt.delegatePointsAwarded ? 'مفوض (ممنوح)' : 'طالب مفوض') : (evt.status === 'Done' ? 'مكتمل' : (evt.status || 'مجدول'))}</span></td>
                    </tr>
                `).join('') : '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #9ca3af;">لا توجد مشاركات مسجلة لهذا الطالب حتى الآن</td></tr>';

                const specsHtml = (st.specializations || []).map(sp => `<span class="badge">${sp === 'General' ? 'عام' : sp}</span>`).join(' ') || '<span style="color:#9ca3af">لا يوجد تخصيص</span>';

                let studentHeaderHtml = '';
                if (showHeader) {
                    studentHeaderHtml = getOfficialReportHeaderHtml({
                        schoolInfo,
                        title: customTitle.trim() || 'الملف الفردي للطالب',
                        subTitle: 'قسم النشاط الطلابي المدرسي',
                        studentName: st.name,
                        centerDetails: [
                            `الصف / الشعبة: ${cleanClassString(st)}`
                        ],
                        leftDetails: [
                            { label: 'حالة القيد', value: st.active !== false ? 'طالب منتظم' : 'مؤرشف' },
                            { label: 'نقاط التميز', value: `${st.totalPoints || 0} نقطة` }
                        ]
                    });
                }

                const bannerHtml = columns.includes('banner') ? `
                    <div class="student-banner">
                        <div class="avatar">${st.name.charAt(0)}</div>
                        <div class="student-banner-info">
                            <h2>${st.name}</h2>
                            <p>الصف: <strong>${cleanClassString(st)}</strong> • رصيد النقاط: <strong style="color: #059669;">${st.totalPoints || 0} نقطة</strong></p>
                        </div>
                    </div>
                ` : '';

                const specsSectionHtml = columns.includes('specs') ? `
                    <div class="specs-section">
                        <span class="specs-label">التخصصات والفرق المسجل بها:</span>
                        <div>${specsHtml}</div>
                    </div>
                ` : '';

                const activitiesSectionHtml = columns.includes('activities') ? `
                    <div class="section-container">
                        <div class="section-title">
                            <h3>سجل الأنشطة والمشاركات (${studentEvents.length})</h3>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 5%; text-align: center;">#</th>
                                    <th style="width: 45%;">اسم النشاط</th>
                                    <th style="width: 20%;">النوع / التصنيف</th>
                                    <th style="width: 15%;">التاريخ</th>
                                    <th style="width: 15%; text-align: center;">الحالة</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${eventsRows}
                            </tbody>
                        </table>
                    </div>
                ` : '';

                let footerHtml = '';
                if (showSignatures) {
                    footerHtml = getOfficialReportFooterHtml({
                        signatures: signatures.length ? signatures : [
                            { role: 'مشرف النشاط الطلابي', name: '' },
                            { role: 'مدير المدرسة', name: schoolInfo?.principalName || '' }
                        ],
                        note: footerNote,
                        systemCredit: 'نظام إدارة النشاط الطلابي المدرسي'
                    });
                }

                return `
                    <div class="student-page">
                        ${studentHeaderHtml}
                        ${bannerHtml}
                        ${specsSectionHtml}
                        ${activitiesSectionHtml}
                        ${footerHtml}
                    </div>
                `;
            }).join('');

            const pageTitle = customTitle.trim() || 'سجلات تفصيلية للطلاب';

            const htmlContent = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>${pageTitle}</title>
                    <style>
                        ${getStandardPrintStyles({
                            theme,
                            orientation,
                            density,
                            extraCss: `
                                .student-page {
                                    page-break-after: always;
                                    break-after: page;
                                    min-height: 250mm;
                                    display: flex;
                                    flex-direction: column;
                                }
                                .student-banner {
                                    display: flex;
                                    align-items: center;
                                    gap: 14px;
                                    background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
                                    border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    border-radius: 10px;
                                    padding: 12px 16px;
                                    margin-bottom: 16px;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .avatar {
                                    width: 44px;
                                    height: 44px;
                                    border-radius: 50%;
                                    background: ${isMonochrome ? '#000000' : 'linear-gradient(135deg, #4f46e5, #7c3aed)'};
                                    color: white;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 20px;
                                    font-weight: bold;
                                    flex-shrink: 0;
                                }
                                .student-banner-info h2 { margin: 0 0 3px 0; font-size: 17px; color: ${isDark ? '#f8fafc' : isMonochrome ? '#000000' : '#0f172a'}; }
                                .student-banner-info p { margin: 0; font-size: 12px; color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#475569'}; }
                                .specs-section {
                                    background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
                                    border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    border-radius: 8px;
                                    padding: 10px 14px;
                                    margin-bottom: 16px;
                                    display: flex;
                                    align-items: center;
                                    gap: 10px;
                                    page-break-inside: avoid !important;
                                    break-inside: avoid !important;
                                }
                                .specs-label { font-size: 12px; font-weight: bold; color: ${isDark ? '#cbd5e1' : isMonochrome ? '#000000' : '#334155'}; white-space: nowrap; }
                                .section-container {
                                    margin-bottom: 20px;
                                    flex: 1;
                                }
                                .section-title {
                                    border-bottom: 2px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
                                    padding-bottom: 5px;
                                    margin-bottom: 10px;
                                }
                                .section-title h3 {
                                    margin: 0;
                                    font-size: 14px;
                                    color: ${isDark ? '#38bdf8' : isMonochrome ? '#000000' : '#1e293b'};
                                    font-weight: bold;
                                }
                            `
                        })}
                    </style>
                </head>
                <body>
                    ${pagesHtml}
                </body>
                </html>
            `;

            toast.dismiss(toastId);
            await printHtmlDocument(htmlContent, pageTitle);
        } catch (err) {
            console.error("Print detailed error:", err);
            toast.error("فشل تجهيز السجلات للطباعة", { id: toastId });
        }
    };

    // 9. Single Student Profile Print Modal Opener
    const handleOpenStudentProfilePrintModal = (student, withPoints = false) => {
        if (!student) return;
        setPrintModalConfig({
            isOpen: true,
            reportType: 'student_individual_profile',
            title: withPoints ? `تقرير السجل الشامل ونقاط التميز - ${student.name}` : `تقرير الملف الفردي - ${student.name}`,
            columns: [
                { id: 'banner', label: 'بيانات وهوية الطالب الأساسية', defaultVisible: true },
                { id: 'kpis', label: 'بطاقات المؤشرات الإحصائية (الصف، النقاط، الأنشطة)', defaultVisible: true },
                { id: 'specs', label: 'التخصصات والفرق المسجل بها', defaultVisible: true },
                { id: 'activities', label: 'جدول سجل الأنشطة والمشاركات', defaultVisible: true },
                { id: 'points', label: 'جدول سجل وتفاصيل حركات النقاط', defaultVisible: Boolean(withPoints) },
                { id: 'notes', label: 'ملاحظات المرشد والمشرف', defaultVisible: Boolean(student.notes) }
            ],
            scopeTotalCount: 1,
            selectedCount: 0,
            onExecute: (options) => generateStudentProfilePDF(student, studentHistory, options.columns?.includes('points') ?? withPoints, studentPointsLogs, options)
        });
    };


    return (
        <div className="space-y-6 font-cairo h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">إدارة الطلاب</h1>
                    <p className="text-indigo-200">سجلات، نقاط التميز، والملفات الشخصية</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    {duplicateGroups.length > 0 && isDuplicateAlertDismissed && (
                        <button
                            onClick={() => setIsDuplicateModalOpen(true)}
                            className="bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-300 px-4 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 font-bold text-sm"
                            title="عرض وحل حالات تكرار الطلاب"
                        >
                            <Sparkles size={18} />
                            حالات التكرار ({duplicateGroups.length})
                        </button>
                    )}
                    <button
                        onClick={handleOpenConsolidatedPrintModal}
                        className="bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl border border-white/10 shadow-lg transition-all flex items-center gap-2 font-bold text-sm"
                        title="خيارات طباعة كشف الطلاب"
                    >
                        <Printer size={18} className="text-indigo-400" />
                        <span>طباعة الكشف</span>
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-6 py-3 rounded-xl shadow-lg transition-all flex items-center shadow-emerald-500/20 font-bold"
                    >
                        <Plus className="ml-2" size={20} />
                        تسجيل طالب
                    </button>
                </div>
            </div>

            {/* Intelligent Duplicate Alert Banner */}
            {duplicateGroups.length > 0 && !isDuplicateAlertDismissed && (
                <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-amber-500/10 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md animate-fade-in">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <AlertTriangle size={24} className="animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base sm:text-lg font-bold text-white">
                                    تنبيه ذكي: تم رصد طلاب مكررين في السجلات
                                </h3>
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                    {duplicateGroups.length} حالات تكرار
                                </span>
                            </div>
                            <p className="text-gray-300 text-xs sm:text-sm mt-0.5">
                                تم اكتشاف أسماء متطابقة في قاعدة البيانات. يمكنك التعامل معها وحذف السجلات غير المرتبطة أو دمج المشاركات فوراً.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 w-full md:w-auto justify-end shrink-0">
                        <button
                            onClick={() => setIsDuplicateAlertDismissed(true)}
                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors border border-white/5"
                        >
                            <BellOff size={16} />
                            اطفي التنبيه
                        </button>
                        <button
                            onClick={() => setIsDuplicateModalOpen(true)}
                            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-xl text-xs sm:text-sm shadow-lg flex items-center gap-2 transition-all shadow-amber-500/20 transform hover:scale-[1.02]"
                        >
                            <Sparkles size={16} />
                            التعامل
                        </button>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 relative">
                    <input
                        type="text"
                        placeholder="ابحث بالاسم..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-12 pl-4 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute right-4 top-3.5 text-gray-400" size={20} />
                </div>
                <button
                    onClick={() => setSortBy(sortBy === 'name' ? 'points' : 'name')}
                    className={`flex items-center justify-center p-3 rounded-xl border transition-all font-bold ${sortBy === 'points' ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-gray-400'}`}
                >
                    <ArrowUpDown size={18} className="ml-2" />
                    {sortBy === 'points' ? 'الأعلى نقاطاً' : 'ترتيب أبجدي'}
                </button>

                <div className="md:col-span-4 flex flex-col md:flex-row items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Filter size={18} className="text-indigo-400 shrink-0" />
                        <span className="text-gray-400 text-sm font-bold shrink-0">تصفية:</span>
                    </div>

                    <select
                        className="bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 w-full md:w-48"
                        value={gradeFilter}
                        onChange={e => { setGradeFilter(e.target.value); setSectionFilter(''); }}
                    >
                        <option value="">جميع الصفوف</option>
                        <option value="غير معروف">❓ غير معروف</option>
                        {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                    </select>

                    <select
                        className="bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 w-full md:w-48 disabled:opacity-50"
                        value={sectionFilter}
                        onChange={e => setSectionFilter(e.target.value)}
                        disabled={!gradeFilter || gradeFilter === 'غير معروف'}
                    >
                        <option value="">جميع الشعب</option>
                        {grades?.find(g => g.name === gradeFilter)?.sections?.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                    </select>

                    <div className="h-6 w-px bg-white/10 hidden md:block mx-2"></div>

                    <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                        <button
                            onClick={() => setSpecFilter('All')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === 'All' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                            الكل
                        </button>
                        {specOptions.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setSpecFilter(opt.value)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === opt.value ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mobile Horizontal Scroll Indicator (Option 3-A) */}
            <div className="md:hidden flex items-center justify-between px-3 py-1.5 mb-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-xs shrink-0">
                <span className="flex items-center gap-1.5 font-medium">
                    <span>💡 اسحب القائمة لليسار لعرض بقية بيانات الطلاب</span>
                </span>
                <span className="animate-pulse font-bold text-sm">⟵</span>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar min-h-0 bg-white/5 border border-white/10 rounded-2xl relative">
                {/* Edge fade indicator on mobile */}
                <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/40 to-transparent z-20 md:hidden" />
                <table className="w-full min-w-[700px] text-right bg-transparent">
                    <thead className="bg-black/20 text-gray-300 sticky top-0 backdrop-blur-md z-10">
                        <tr>
                            <th className="p-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    ref={el => {
                                        if (el) {
                                            el.indeterminate = isPartiallySelected && !isAllDisplayedSelected;
                                        }
                                    }}
                                    checked={isAllDisplayedSelected && displayedStudents.length > 0}
                                    onChange={toggleSelectAllHeader}
                                    aria-label="تحديد جميع الطلاب الظاهرين"
                                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                />
                            </th>
                            <th className="p-4 font-medium">اسم الطالب</th>
                            <th className="p-4 font-medium hidden md:table-cell">التخصصات</th>
                            <th className="p-4 font-medium hidden md:table-cell">الفصل</th>
                            <th className="p-4 font-medium">النقاط</th>
                            <th className="p-4 font-medium hidden md:table-cell">تاريخ الانضمام</th>
                            <th className="p-4 font-medium text-left">خيارات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {displayedStudents.map((student) => (
                            <tr
                                key={student.id}
                                onClick={() => openProfile(student)}
                                className={`hover:bg-white/5 transition-colors group cursor-pointer ${selectedIds.includes(student.id) ? 'bg-indigo-600/10' : ''}`}
                            >
                                <td className="p-4 w-12 text-center" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(student.id)}
                                        onChange={() => toggleSelectStudent(student.id)}
                                        aria-label={`تحديد الطالب ${student.name}`}
                                        className="w-4 h-4 rounded bg-white/10 border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                    />
                                </td>
                                <td className="p-4 text-white font-bold flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-sm font-bold ml-3 border border-white/10 shadow-lg">
                                        {student.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div>{student.name}</div>
                                        <div className="md:hidden text-xs text-gray-400 mt-1">
                                            {student.grade === 'غير معروف' || student.class === 'غير معروف' || !student.grade ? (
                                                <span className="text-amber-300 font-semibold">❓ غير معروف</span>
                                            ) : (
                                                student.class || '-'
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 hidden md:table-cell">
                                    <div className="flex flex-wrap gap-1">
                                        {student.specializations && student.specializations.length > 0 ? (
                                            student.specializations.map((spec, i) => (
                                                <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${spec === 'General' ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-indigo-900/50 text-indigo-300 border-indigo-500/30'}`}>
                                                    {spec === 'General' ? 'عام' : spec}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 text-gray-300 hidden md:table-cell">
                                    {student.grade === 'غير معروف' || student.class === 'غير معروف' || !student.grade ? (
                                        <span className="text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-semibold">
                                            ❓ غير معروف
                                        </span>
                                    ) : (
                                        student.class || '-'
                                    )}
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${student.totalPoints > 50 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-gray-700/30 text-gray-400 border-gray-600/30'}`}>
                                        <Award size={14} className="ml-1" />
                                        {student.totalPoints}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-400 text-sm hidden md:table-cell">
                                    {student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'}
                                </td>
                                <td className="p-4 text-left">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
                                        aria-label="أرشفة الطالب"
                                        className="text-red-400 hover:text-white hover:bg-red-500 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- ADD MODAL --- */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-6">تسجيل طالب جديد</h3>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الاسم الرباعي <span className="text-rose-400">*</span></label>
                                <input required className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                    placeholder="أدخل اسم الطالب الرباعي..."
                                    value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} />
                            </div>

                            {/* Option: الصف / الفصل غير معروف */}
                            <div className="bg-black/30 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={!!newStudent.isGradeUnknown || newStudent.grade === 'غير معروف'}
                                        onChange={(e) => {
                                            const isUnknown = e.target.checked;
                                            setNewStudent(prev => ({
                                                ...prev,
                                                isGradeUnknown: isUnknown,
                                                grade: isUnknown ? 'غير معروف' : '',
                                                section: isUnknown ? '' : '',
                                                class: isUnknown ? 'غير معروف' : ''
                                            }));
                                        }}
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700 cursor-pointer"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-gray-200 block">الصف / الفصل غير معروف</span>
                                        <span className="text-[11px] text-gray-400">حدد هذا الخيار إذا كان صف الطالب أو فصله غير محدد حالياً</span>
                                    </div>
                                </label>
                                {(newStudent.isGradeUnknown || newStudent.grade === 'غير معروف') && (
                                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
                                        صف غير معروف
                                    </span>
                                )}
                            </div>

                            {(newStudent.isGradeUnknown || newStudent.grade === 'غير معروف') ? (
                                <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                                    <span>⚠️ سيتم تسجيل الطالب كـ <strong>صف غير معروف</strong>، ولا يلزم اختيار الصف أو الشعبة.</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">الصف / المرحلة <span className="text-rose-400">*</span></label>
                                        <select
                                            required
                                            className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none cursor-pointer"
                                            value={newStudent.grade || ''}
                                            onChange={e => {
                                                setNewStudent({ ...newStudent, grade: e.target.value, section: '', class: `${e.target.value} - ` });
                                            }}
                                        >
                                            <option value="">اختر الصف...</option>
                                            {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">الشعبة <span className="text-rose-400">*</span></label>
                                        <select
                                            required
                                            className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none cursor-pointer"
                                            value={newStudent.section || ''}
                                            onChange={e => setNewStudent({
                                                ...newStudent,
                                                section: e.target.value,
                                                class: `${newStudent.grade} - ${e.target.value}`
                                            })}
                                            disabled={!newStudent.grade}
                                        >
                                            <option value="">اختر الشعبة...</option>
                                            {grades?.find(g => g.name === newStudent.grade)?.sections?.map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <input type="hidden" value={newStudent.class} /> {/* Legacy Support */}
                            <div>
                                <MultiSelect
                                    label="التخصصات / الفرق"
                                    placeholder="اختر التخصصات..."
                                    options={specOptions}
                                    selectedValues={newStudent.specializations}
                                    onChange={vals => setNewStudent({ ...newStudent, specializations: vals })}
                                    icon={Tag}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 space-x-reverse pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">إلغاء</button>
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold">تسجيل</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- PROFILE MODAL --- */}
            {selectedStudent && (

                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedStudent(null)}
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden pointer-events-auto relative">
                            {/* Removed animate-scale-in to be safe unless defined */}
                            {/* Modal Header */}
                            <div className="p-6 bg-gradient-to-l from-indigo-900/50 to-transparent border-b border-white/10 flex justify-between items-start">
                                <div className="flex items-center">
                                    <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                                        {selectedStudent.name.charAt(0)}
                                    </div>
                                    <div className="mr-4">
                                        <h2 className="text-2xl font-bold text-white mb-1">{selectedStudent.name}</h2>
                                        <div className="flex items-center space-x-3 space-x-reverse text-sm">
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                                selectedStudent.grade === 'غير معروف' || selectedStudent.class === 'غير معروف' || selectedStudent.isGradeUnknown
                                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                                    : 'text-gray-400 bg-white/5'
                                            }`}>
                                                {selectedStudent.grade === 'غير معروف' || selectedStudent.class === 'غير معروف' || selectedStudent.isGradeUnknown
                                                    ? '❓ صف غير معروف'
                                                    : selectedStudent.class || '-'
                                                }
                                            </span>
                                            <span className="text-amber-400 flex items-center font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                <Award size={14} className="ml-1" /> {selectedStudent.totalPoints} نقطة
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg cursor-pointer border border-white/10 text-xs text-indigo-200 transition-colors select-none" title="تضمين كشف سجل النقاط مع الملف المطبوع">
                                        <input
                                            type="checkbox"
                                            checked={includePointsInPrint}
                                            onChange={e => setIncludePointsInPrint(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded bg-black/40 border-white/30 text-indigo-600 focus:ring-0 cursor-pointer"
                                        />
                                        <span>تضمين سجل النقاط</span>
                                    </label>
                                    <button
                                        onClick={() => handleOpenStudentProfilePrintModal(selectedStudent, includePointsInPrint)}
                                        aria-label="خيارات طباعة الملف"
                                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg flex items-center transition-all border border-white/5 shadow-sm"
                                        title="خيارات طباعة الملف"
                                    >
                                        <Printer size={20} />
                                    </button>
                                    <button onClick={() => setSelectedStudent(null)} aria-label="إغلاق الملف الشخصي" className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10"><X size={24} /></button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-white/10 px-6 bg-black/20 overflow-x-auto">
                                {[
                                    { id: 'info', label: 'البيانات الأساسية', icon: User },
                                    { id: 'notes', label: 'ملاحظات المعلم', icon: FileText },
                                    { id: 'history', label: 'سجل النشاط', icon: Clock },
                                    { id: 'points', label: 'سجل النقاط', icon: TrendingUp },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setProfileTab(tab.id)}
                                        className={`px-4 py-4 flex items-center space-x-2 space-x-reverse border-b-2 transition-all whitespace-nowrap ${profileTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                                    >
                                        <tab.icon size={18} /> <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 bg-black/10">
                                {profileTab === 'info' && (
                                    <div className="space-y-6 max-w-lg mx-auto pt-4">
                                        <div>
                                            <label className="block text-gray-400 text-sm mb-1">الاسم الكامل</label>
                                            <input className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                                value={selectedStudent.name} onChange={e => setSelectedStudent({ ...selectedStudent, name: e.target.value })} />
                                        </div>
                                        {/* Option: الصف / الفصل غير معروف في ملف الطالب */}
                                        <div className="bg-black/30 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedStudent.grade === 'غير معروف' || !!selectedStudent.isGradeUnknown}
                                                    onChange={(e) => {
                                                        const isUnknown = e.target.checked;
                                                        if (isUnknown) {
                                                            setSelectedStudent(prev => ({
                                                                ...prev,
                                                                isGradeUnknown: true,
                                                                grade: 'غير معروف',
                                                                section: '',
                                                                class: 'غير معروف'
                                                            }));
                                                        } else {
                                                            const firstGrade = grades?.[0]?.name || '';
                                                            setSelectedStudent(prev => ({
                                                                ...prev,
                                                                isGradeUnknown: false,
                                                                grade: firstGrade,
                                                                section: '',
                                                                class: firstGrade ? `${firstGrade} - ` : ''
                                                            }));
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-gray-800 border-gray-700 cursor-pointer"
                                                />
                                                <div>
                                                    <span className="text-xs font-bold text-gray-200 block">الصف / الفصل غير معروف</span>
                                                    <span className="text-[11px] text-gray-400">تحديد حالة الطالب كصف غير معروف في قاعدة البيانات</span>
                                                </div>
                                            </label>
                                            {(selectedStudent.grade === 'غير معروف' || !!selectedStudent.isGradeUnknown) && (
                                                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
                                                    صف غير معروف
                                                </span>
                                            )}
                                        </div>

                                        {(selectedStudent.grade === 'غير معروف' || !!selectedStudent.isGradeUnknown) ? (
                                            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                                                <span>⚠️ تم تعيين الصف كـ <strong>غير معروف</strong>. ألغِ التحديد أعلاه لتحديد صف وشعبة الطالب.</span>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-gray-400 text-sm mb-1">الصف</label>
                                                    <select
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none cursor-pointer"
                                                        value={selectedStudent.grade || ''}
                                                        onChange={e => {
                                                            setSelectedStudent({
                                                                ...selectedStudent,
                                                                grade: e.target.value,
                                                                section: '',
                                                                class: `${e.target.value} - `
                                                            });
                                                        }}
                                                    >
                                                        <option value="">اختر الصف...</option>
                                                        {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-gray-400 text-sm mb-1">الشعبة</label>
                                                    <select
                                                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none cursor-pointer"
                                                        value={selectedStudent.section || ''}
                                                        onChange={e => setSelectedStudent({
                                                            ...selectedStudent,
                                                            section: e.target.value,
                                                            class: `${selectedStudent.grade} - ${e.target.value}`
                                                        })}
                                                        disabled={!selectedStudent.grade}
                                                    >
                                                        <option value="">اختر الشعبة...</option>
                                                        {grades?.find(g => g.name === selectedStudent.grade)?.sections?.map(s => (
                                                            <option key={s.id} value={s.name}>{s.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-gray-400 text-sm mb-1">رصيد النقاط (تعديل يدوي)</label>
                                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none font-mono"
                                                value={selectedStudent.totalPoints} onChange={e => setSelectedStudent({ ...selectedStudent, totalPoints: e.target.value })} />
                                        </div>

                                        <div>
                                            <MultiSelect
                                                label="التخصصات / الفرق المسجلة"
                                                placeholder="تعديل التخصصات..."
                                                options={specOptions}
                                                selectedValues={selectedStudent.specializations || []}
                                                onChange={vals => setSelectedStudent({ ...selectedStudent, specializations: vals })}
                                                icon={Tag}
                                            />
                                        </div>
                                        <button onClick={saveProfileChanges} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold flex items-center justify-center shadow-lg">
                                            <Save size={18} className="ml-2" /> حفظ التعديلات
                                        </button>
                                    </div>
                                )}

                                {profileTab === 'notes' && (
                                    <div className="h-full flex flex-col">
                                        <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl mb-4 text-amber-200 text-sm flex items-center">
                                            <FileText size={16} className="ml-2" /> هذه الملاحظات خاصة فقط بالإدارة ولا تظهر للطالب.
                                        </div>
                                        <textarea
                                            className="flex-1 w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-indigo-500 outline-none resize-none"
                                            placeholder="اكتب ملاحظاتك ومتابعاتك عن الطالب هنا..."
                                            value={selectedStudent.notes || ''}
                                            onChange={e => setSelectedStudent({ ...selectedStudent, notes: e.target.value })}
                                        ></textarea>
                                        <div className="mt-4 flex justify-end">
                                            <button onClick={saveProfileChanges} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold">حفظ الملاحظة</button>
                                        </div>
                                    </div>
                                )}

                                {profileTab === 'history' && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                            <h3 className="text-white font-bold m-0 border-none">سجل الأنشطة الكامل ({studentHistory.length})</h3>
                                            <button
                                                onClick={() => handleOpenStudentProfilePrintModal(selectedStudent, false)}
                                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg flex items-center transition-all"
                                            >
                                                <Printer size={14} className="ml-1" /> طباعة السجل
                                            </button>
                                        </div>
                                        {studentHistory.length > 0 ? studentHistory.map(evt => (
                                            <div key={evt.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                                                <div className="flex items-center">
                                                    <div className={`w-2 h-12 rounded-full mr-4 ${
                                                        evt.isDelegate
                                                            ? (evt.delegatePointsAwarded ? 'bg-amber-400' : 'bg-indigo-500')
                                                            : (evt.status === 'Done' ? 'bg-emerald-500' : 'bg-gray-600')
                                                    }`}></div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-white text-lg">{evt.title}</span>
                                                            {evt.isDelegate && (
                                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                                                    <Award size={12} />
                                                                    <span>طالب مفوض</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-gray-400 text-sm flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span>{evt.typeName}</span>
                                                            {evt.venueId && <span>| {evt.venueId}</span>}
                                                            {evt.isDelegate && evt.currentCount !== undefined && (
                                                                <span className="text-slate-400 text-xs">({evt.currentCount} مسجل)</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-left flex flex-col items-end">
                                                    <div className="text-emerald-400 font-bold font-mono">
                                                        {evt.date || (evt.startTime?.toDate ? evt.startTime.toDate().toLocaleDateString('en-GB') : '-')}
                                                    </div>
                                                    {evt.isDelegate ? (
                                                        <div className="mt-1">
                                                            {evt.delegatePointsAwarded ? (
                                                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                                    <CheckCircle2 size={11} /> مكافأة ممنوحة {evt.delegateRewardPoints > 0 ? `(+${evt.delegateRewardPoints} ن)` : ''}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                                                    <Clock size={11} /> مكافأة محددة {evt.delegateRewardPoints > 0 ? `(+${evt.delegateRewardPoints} ن)` : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {evt.startTime?.toDate ? evt.startTime.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-20 opacity-50">
                                                <Clock size={48} className="mx-auto mb-4" />
                                                <p>لا يوجد سجل أنشطة لهذا الطالب حتى الآن</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {profileTab === 'points' && (
                                    <div className="space-y-4">
                                        {/* KPI Mini-cards */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-center">
                                                <div className="text-gray-400 text-xs mb-1">الرصيد الحالي</div>
                                                <div className="text-amber-400 font-bold text-lg font-mono">{selectedStudent.totalPoints} ن</div>
                                            </div>
                                            <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center">
                                                <div className="text-emerald-300 text-xs mb-1">إجمالي المكتسب</div>
                                                <div className="text-emerald-400 font-bold text-lg font-mono">
                                                    +{studentPointsLogs.filter(l => (Number(l.change) || 0) > 0).reduce((sum, l) => sum + Number(l.change), 0)} ن
                                                </div>
                                            </div>
                                            <div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-center">
                                                <div className="text-rose-300 text-xs mb-1">إجمالي المخصوم</div>
                                                <div className="text-rose-400 font-bold text-lg font-mono">
                                                    -{studentPointsLogs.filter(l => (Number(l.change) || 0) < 0).reduce((sum, l) => sum + Math.abs(Number(l.change)), 0)} ن
                                                </div>
                                            </div>
                                            <div className="bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 text-center">
                                                <div className="text-indigo-300 text-xs mb-1">عدد العمليات</div>
                                                <div className="text-indigo-400 font-bold text-lg font-mono">{studentPointsLogs.length}</div>
                                            </div>
                                        </div>

                                        {/* Section Header */}
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp size={16} className="text-amber-400" />
                                                <h3 className="text-white font-bold m-0 text-sm">سجل حركات نقاط التميز ({studentPointsLogs.length})</h3>
                                            </div>
                                            <button
                                                onClick={() => handleOpenStudentProfilePrintModal(selectedStudent, true)}
                                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg flex items-center transition-all"
                                            >
                                                <Printer size={14} className="ml-1" /> طباعة سجل النقاط
                                            </button>
                                        </div>

                                        {/* Points Transaction List */}
                                        {loadingPointsLogs ? (
                                            <div className="text-center py-12 text-indigo-400 text-sm animate-pulse">
                                                جاري تحميل سجل النقاط...
                                            </div>
                                        ) : studentPointsLogs.length > 0 ? (
                                            <div className="space-y-2">
                                                {studentPointsLogs.map((log) => {
                                                    const isPositive = (Number(log.change) || 0) > 0;
                                                    const logDate = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleDateString('ar-SA') : (log.date || '-');
                                                    const logTime = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                                                    return (
                                                        <div key={log.id} className="bg-white/5 p-3.5 rounded-xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPositive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                                                                    {isPositive ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-white text-sm flex items-center gap-2">
                                                                        <span>{log.reason || log.eventTitle || 'حركة نقاط'}</span>
                                                                        {log.eventType && (
                                                                            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-normal">
                                                                                {log.eventType}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-gray-400 text-xs mt-0.5 flex items-center gap-2">
                                                                        <span>{logDate} {logTime && `• ${logTime}`}</span>
                                                                        {log.performedBy && (
                                                                            <span className="text-gray-500 text-[11px]">(بواسطة: {log.performedBy})</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-left shrink-0">
                                                                <div className={`font-bold font-mono text-base ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                    {isPositive ? `+${log.change}` : log.change} ن
                                                                </div>
                                                                <div className="text-[11px] text-gray-400 mt-0.5 font-mono">
                                                                    الرصيد: {log.newTotalPoints ?? '-'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center space-y-3">
                                                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
                                                    <Sparkles size={24} />
                                                </div>
                                                <h4 className="text-white font-bold text-base">رصيد افتتاحي سابق</h4>
                                                <p className="text-gray-300 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                                                    الرصيد الحالي لهذا الطالب ({selectedStudent.totalPoints} نقطة) معتمد كنقطة انطلاق. وسيتم رصد وتفصيل أي زيادة أو خصم قادم تلقائياً في هذا السجل مع التاريخ والسبب.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            {/* --- BULK ACTIONS FLOATING BAR & MODALS --- */}
            <BulkActionsBar
                selectedCount={selectedIds.length}
                totalDisplayed={displayedStudents.length}
                totalAll={students.length}
                isAllDisplayedSelected={isAllDisplayedSelected}
                onSelectAllDisplayed={handleSelectAllDisplayed}
                onSelectAllSchool={handleSelectAllSchool}
                onClearSelection={handleClearSelection}
                onOpenOperationsModal={handleOpenOperationsModal}
                onOpenCertificatesModal={() => setIsCertificatesModalOpen(true)}
                onPrintConsolidated={handleOpenConsolidatedPrintModal}
                onPrintDetailed={handleOpenDetailedBatchPrintModal}
                onExportCSV={handleExportCSV}
                onBulkArchive={handleBulkArchive}
                isProcessing={isProcessingBulk}
            />

            <BulkOperationsModal
                key={operationsInitialTab + (isOperationsModalOpen ? '_open' : '_closed')}
                isOpen={isOperationsModalOpen}
                onClose={() => setIsOperationsModalOpen(false)}
                initialTab={operationsInitialTab}
                selectedStudents={selectedStudentsList}
                grades={grades}
                eventTypes={eventTypes}
                onApplyTransfer={handleBulkTransfer}
                onApplySpecialization={handleBulkSpecialization}
                onApplyPoints={handleBulkPoints}
                onApplyStatus={handleBulkStatus}
                isProcessing={isProcessingBulk}
            />

            <BulkPrintCertificatesModal
                isOpen={isCertificatesModalOpen}
                onClose={() => setIsCertificatesModalOpen(false)}
                selectedStudents={selectedStudentsList}
            />

            {/* Smart Duplicate Resolver Modal */}
            <DuplicateResolverModal
                isOpen={isDuplicateModalOpen}
                onClose={() => setIsDuplicateModalOpen(false)}
                duplicateGroups={duplicateGroups}
                allEvents={allEvents}
                onResolved={() => {
                    // onSnapshot updates students and events automatically
                }}
            />

            {/* Advanced Universal Print Modal */}
            <AdvancedPrintModal
                isOpen={printModalConfig.isOpen}
                onClose={() => setPrintModalConfig(prev => ({ ...prev, isOpen: false }))}
                reportType={printModalConfig.reportType}
                availableColumns={printModalConfig.columns}
                defaultTitle={printModalConfig.title}
                totalRecordsCount={printModalConfig.scopeTotalCount}
                selectedRecordsCount={printModalConfig.selectedCount}
                onPrint={printModalConfig.onExecute}
            />
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, runTransaction, increment } from 'firebase/firestore';

import { FileText, Download, Calendar, Users, Box, Filter, Printer, Search, X, Eye, Trash2, RefreshCw, Pen, Hash, Table, Archive, RotateCcw, TrendingUp, ArrowUpRight, ArrowDownLeft, Layers, Sparkles, AlertCircle, Copy, ExternalLink } from 'lucide-react';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import EventModal from '../components/EventModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import { updateEventWithSmartSync } from '../utils/EventLogic';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Tag, CheckSquare, Square } from 'lucide-react';
import MultiSelect from '../components/ui/MultiSelect';
import { normalizeArabic } from '../utils/studentDuplicates';
import {
    sortStudentsArabic,
    sortStudentsByMode,
    STUDENT_SORT_OPTIONS,
    cleanClassString,
    getOfficialReportHeaderHtml,
    getOfficialReportFooterHtml,
    getStandardPrintStyles,
    printHtmlDocument
} from '../utils/reportUtils';
import AdvancedPrintModal from '../components/ui/AdvancedPrintModal';

const getReportColumnsDefinition = (tab, archiveSub) => {
    if (tab === 'activities') {
        return [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'title', label: 'النشاط', defaultVisible: true },
            { id: 'type', label: 'نوع النشاط', defaultVisible: true },
            { id: 'date', label: 'التاريخ والوقت', defaultVisible: true },
            { id: 'venue', label: 'المكان / المقر', defaultVisible: true },
            { id: 'status', label: 'الحالة', defaultVisible: true },
            { id: 'studentsCount', label: 'عدد الطلاب', defaultVisible: true },
            { id: 'studentsList', label: 'قائمة الطلاب المشاركين', defaultVisible: false, badge: 'تفصيلي' },
            { id: 'assetsList', label: 'الموارد المستخدمة', defaultVisible: false, badge: 'تفصيلي' },
            { id: 'customData', label: 'الحقول المخصصة للنشاط', defaultVisible: false, badge: 'تفصيلي' }
        ];
    } else if (tab === 'students') {
        return [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'name', label: 'اسم الطالب', defaultVisible: true },
            { id: 'class', label: 'الصف والشعبة', defaultVisible: true },
            { id: 'specializations', label: 'التخصصات والفرق', defaultVisible: true },
            { id: 'points', label: 'نقاط التميز', defaultVisible: true },
            { id: 'history', label: 'سجل مشاركات الطالب في الأنشطة', defaultVisible: false, badge: 'تفصيلي' }
        ];
    } else if (tab === 'assets') {
        return [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'name', label: 'اسم المورد', defaultVisible: true },
            { id: 'type', label: 'النوع', defaultVisible: true },
            { id: 'status', label: 'الحالة الحالية', defaultVisible: true },
            { id: 'history', label: 'سجل استخدام المورد في الأنشطة', defaultVisible: false, badge: 'تفصيلي' }
        ];
    } else if (tab === 'points') {
        return [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'studentName', label: 'اسم الطالب', defaultVisible: true },
            { id: 'class', label: 'الصف / الشعبة', defaultVisible: true },
            { id: 'reason', label: 'سبب الحركة / النشاط', defaultVisible: true },
            { id: 'actionType', label: 'نوع العملية', defaultVisible: true },
            { id: 'change', label: 'مقدار التغيير', defaultVisible: true },
            { id: 'newTotalPoints', label: 'الرصيد بعد الحركة', defaultVisible: true },
            { id: 'performedBy', label: 'المنفّذ', defaultVisible: true },
            { id: 'date', label: 'التاريخ والوقت', defaultVisible: true }
        ];
    } else if (tab === 'archive') {
        if (archiveSub === 'students') {
            return [
                { id: 'index', label: '#', defaultVisible: true },
                { id: 'name', label: 'اسم الطالب', defaultVisible: true },
                { id: 'class', label: 'الصف / الشعبة', defaultVisible: true },
                { id: 'specializations', label: 'التخصصات', defaultVisible: true },
                { id: 'points', label: 'النقاط السابقة', defaultVisible: true }
            ];
        } else {
            return [
                { id: 'index', label: '#', defaultVisible: true },
                { id: 'title', label: 'النشاط', defaultVisible: true },
                { id: 'type', label: 'نوع النشاط', defaultVisible: true },
                { id: 'date', label: 'التاريخ والوقت', defaultVisible: true },
                { id: 'venue', label: 'المكان', defaultVisible: true },
                { id: 'status', label: 'الحالة', defaultVisible: true },
                { id: 'studentsCount', label: 'عدد الطلاب', defaultVisible: true }
            ];
        }
    }
    return [];
};

const FIREBASE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAuthenticated() { return request.auth != null; }

    match /events/{eventId} {
      allow read: if true;
      allow create: if isAuthenticated()
                    && request.resource.data.title is string
                    && request.resource.data.date is string
                    && request.resource.data.venueId is string;
      allow update: if isAuthenticated() && request.resource.data.title is string;
      allow delete: if isAuthenticated();
    }

    match /students/{studentId} {
      allow read, write: if isAuthenticated() || true;
    }

    match /assets/{assetId} {
      allow read, write: if isAuthenticated() || true;
    }

    match /venues/{venueId} {
      allow read: if true;
      allow write: if isAuthenticated() || true;
    }

    match /time_profiles/{profileId} {
      allow read: if true;
      allow write: if isAuthenticated() || true;
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write: if isAuthenticated() || true;
    }

    match /registration_links/{linkId} {
      allow read: if true;
      allow create: if isAuthenticated() || (request.resource.data.title is string && request.resource.data.delegateName is string);
      allow update: if isAuthenticated()
                    || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['currentCount']) && request.resource.data.currentCount is number)
                    || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']))
                    || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['passcode']))
                    || (request.resource.data.title is string);
      allow delete: if isAuthenticated() || true;
    }

    match /link_submissions/{submissionId} {
      allow read: if true;
      allow create: if request.resource.data.linkId is string && request.resource.data.studentName is string;
      allow update: if isAuthenticated()
                    || (request.resource.data.status == resource.data.status && request.resource.data.linkId == resource.data.linkId)
                    || request.resource.data.status in ['approved', 'rejected', 'pending', 'waitlist'];
      allow delete: if isAuthenticated() || resource.data.status in ['pending', 'waitlist', 'approved', 'rejected'] || true;
    }

    match /points_logs/{logId} {
      allow read: if true;
      allow create, update: if isAuthenticated() || true;
      allow delete: if isAuthenticated() || true;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

// --- Helper: Arabic Status ---
const getStatusLabel = (status) => {
    const map = {
        'Done': 'مكتمل',
        'Draft': 'مسودة',
        'In Progress': 'قيد التنفيذ',
        'Cancelled': 'ملغي',
        'archived': 'مؤرشف'
    };
    return map[status] || status;
};

// --- Helper: Arabic Venue ---
const getVenueLabel = (venueId) => {
    const map = {
        'Auditorium': 'المسرح المدرسي',
        'Gym': 'الصالة الرياضية',
        'Playground': 'الملعب الخارجي',
        'Lab': 'معمل الحاسب',
        'Library': 'المكتبة'
    };
    return map[venueId] || venueId;
};

// Sub-component for Print Controls
const PrintControls = ({ event, onPrint }) => {
    return (
        <button
            onClick={() => onPrint(event)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs sm:text-sm"
            title="طباعة التقرير أو حفظه كـ PDF"
        >
            <Printer size={16} className="ml-2" /> طباعة تقرير النشاط (A4)
        </button>
    );
};

import { useSettings } from '../contexts/SettingsContext';

export default function ReportsPage() {
    const location = useLocation();
    const { grades, eventTypes, activeProfile, schoolInfo } = useSettings(); // Use Global Grades
    const [activeTab, setActiveTab] = useState(() => {
        const searchParams = new URLSearchParams(window.location.search);
        return location.state?.tab || searchParams.get('tab') || 'activities';
    });

    useEffect(() => {
        if (location.state?.tab) {
            setActiveTab(location.state.tab);
        }
    }, [location.state?.tab]);
    const [loading, setLoading] = useState(false);

    // Data States
    const [rawData, setRawData] = useState([]);
    const [previewData, setPreviewData] = useState([]);
    const [studentMap, setStudentMap] = useState({}); // id -> name

    // --- Archive Hub State ---
    const [archiveSubTab, setArchiveSubTab] = useState('students'); // students | activities
    const [archiveCounts, setArchiveCounts] = useState({ students: 0, activities: 0 });
    const [archiveSearchTerm, setArchiveSearchTerm] = useState('');

    // --- Advanced Printing & Selection State ---
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [selectedReportRowIds, setSelectedReportRowIds] = useState([]);

    useEffect(() => {
        setSelectedReportRowIds([]);
    }, [activeTab, archiveSubTab]);

    const toggleSelectReportRow = (id) => {
        setSelectedReportRowIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleSelectAllReportRows = () => {
        const allIds = previewData.map(r => r.id || r.name);
        const isAllSelected = allIds.length > 0 && allIds.every(id => selectedReportRowIds.includes(id));
        if (isAllSelected) {
            setSelectedReportRowIds(prev => prev.filter(id => !allIds.includes(id)));
        } else {
            setSelectedReportRowIds(Array.from(new Set([...selectedReportRowIds, ...allIds])));
        }
    };

    // --- Advanced Filters State ---
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedTypes, setSelectedTypes] = useState([]); // MultiSelect array

    // Student Filters
    const [gradeFilter, setGradeFilter] = useState('');
    const [sectionFilter, setSectionFilter] = useState('');
    const [specFilter, setSpecFilter] = useState('All');
    const [pointsRange, setPointsRange] = useState({ min: 0, max: 2000 });
    // Asset Filters
    const [assetStatusFilter, setAssetStatusFilter] = useState('All');

    // Venue Filter
    const [venueFilter, setVenueFilter] = useState('All');

    // --- Points Ledger Filters State ---
    const [pointsSearchTerm, setPointsSearchTerm] = useState('');
    const [pointsDateRange, setPointsDateRange] = useState({ start: '', end: '' });
    const [pointsChangeType, setPointsChangeType] = useState('all'); // all | positive | negative
    const [pointsActionTypes, setPointsActionTypes] = useState([]); // Array of actionType strings
    const [pointsSelectedGrades, setPointsSelectedGrades] = useState([]); // Array of grade strings
    const [pointsSelectedSections, setPointsSelectedSections] = useState([]); // Array of section strings
    const [pointsSelectedEventTypes, setPointsSelectedEventTypes] = useState([]); // Array of eventType strings
    const [pointsSortBy, setPointsSortBy] = useState('date_desc'); // date_desc | date_asc | change_desc | change_asc | student_name
    const [pointsPermissionNeeded, setPointsPermissionNeeded] = useState(false);
    const [showRulesGuideModal, setShowRulesGuideModal] = useState(false);

    const handleClearPointsFilters = () => {
        setPointsSearchTerm('');
        setPointsDateRange({ start: '', end: '' });
        setPointsChangeType('all');
        setPointsActionTypes([]);
        setPointsSelectedGrades([]);
        setPointsSelectedSections([]);
        setPointsSelectedEventTypes([]);
        setPointsSortBy('date_desc');
    };

    const isAnyPointsFilterActive = Boolean(
        pointsSearchTerm ||
        pointsDateRange.start ||
        pointsDateRange.end ||
        pointsChangeType !== 'all' ||
        pointsActionTypes.length > 0 ||
        pointsSelectedGrades.length > 0 ||
        pointsSelectedSections.length > 0 ||
        pointsSelectedEventTypes.length > 0 ||
        pointsSortBy !== 'date_desc'
    );

    // --- Report Options (Toggles) ---
    const [reportOptions, setReportOptions] = useState({
        showStudents: false,
        showAssets: false,
        showCustomFields: false,
        showStudentHistory: false,
        showAssetHistory: false
    });

    // Detail Modal State
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [editEventData, setEditEventData] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // --- Dedicated Single Event Print State ---
    const [isSingleEventPrintModalOpen, setIsSingleEventPrintModalOpen] = useState(false);
    const [singleEventPrintEvent, setSingleEventPrintEvent] = useState(null);
    const [singleEventPointsMap, setSingleEventPointsMap] = useState({});

    // Automatically load points logs & link points for selected event
    useEffect(() => {
        const targetId = selectedEvent?.id;
        if (!targetId) {
            setSingleEventPointsMap({});
            return;
        }
        let isSubscribed = true;
        (async () => {
            const pointsMap = {};
            try {
                const snap = await getDocs(query(collection(db, 'points_logs'), where('eventId', '==', targetId)));
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.studentId && data.change !== undefined) {
                        pointsMap[data.studentId] = (pointsMap[data.studentId] || 0) + (Number(data.change) || 0);
                    }
                });
            } catch (e) {
                console.warn("Could not query points_logs for selectedEvent:", e);
            }

            try {
                const linksSnap = await getDocs(query(collection(db, 'registration_links'), where('eventId', '==', targetId)));
                linksSnap.docs.forEach(lDoc => {
                    const lData = lDoc.data();
                    const linkPts = Number(lData.pointsPerStudent);
                    if (!isNaN(linkPts) && linkPts > 0) {
                        (selectedEvent?.linkStudentIds || []).forEach(sid => {
                            if (pointsMap[sid] === undefined) {
                                pointsMap[sid] = linkPts;
                            }
                        });
                    }
                });
            } catch (e) {
                console.warn("Could not query registration_links for selectedEvent:", e);
            }

            if (isSubscribed) {
                setSingleEventPointsMap(pointsMap);
            }
        })();
        return () => {
            isSubscribed = false;
        };
    }, [selectedEvent?.id]);

    const [assetMap, setAssetMap] = useState({});
    const [studentParticipationMap, setStudentParticipationMap] = useState({});
    const [assetUsageMap, setAssetUsageMap] = useState({});

    // Helper to build participation and asset usage histories
    const buildHistoryMaps = (eventDocs, sMap = studentMap, aMap = assetMap, linkDocs = []) => {
        const pMap = {};
        const uMap = {};

        eventDocs.forEach(d => {
            const pd = d.data();
            const ev = {
                id: d.id,
                title: pd.title || 'بدون عنوان',
                date: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'yyyy-MM-dd') : (pd.date || ''),
                formattedDate: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'd MMMM yyyy', { locale: ar }) : (pd.date || ''),
                time: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'hh:mm a') : (pd.startTime || ''),
                venue: getVenueLabel(pd.venueId),
                status: getStatusLabel(pd.status || 'Draft'),
                rawStatus: pd.status || 'Draft',
                points: pd.points || 10
            };

            if (Array.isArray(pd.participatingStudents)) {
                pd.participatingStudents.forEach(stId => {
                    if (!pMap[stId]) pMap[stId] = [];
                    pMap[stId].push(ev);

                    const sName = sMap[stId]?.name;
                    if (sName) {
                        if (!pMap[sName]) pMap[sName] = [];
                        pMap[sName].push(ev);
                    }
                });
            }

            if (Array.isArray(pd.assets)) {
                pd.assets.forEach(assId => {
                    if (!uMap[assId]) uMap[assId] = [];
                    uMap[assId].push(ev);

                    const aName = aMap[assId];
                    if (aName) {
                        if (!uMap[aName]) uMap[aName] = [];
                        pMap[aName].push(ev);
                    }
                });
            }
        });

        // Cross-reference delegated links for students
        if (Array.isArray(linkDocs)) {
            linkDocs.forEach(d => {
                const ld = d.data ? d.data() : d;
                const delegateId = ld.delegateStudentId;
                const delegateName = ld.delegateName;
                const ev = {
                    id: `link_${d.id}`,
                    title: ld.title || 'رابط تسجيل',
                    date: ld.createdAt?.toDate ? format(ld.createdAt.toDate(), 'yyyy-MM-dd') : '',
                    formattedDate: ld.createdAt?.toDate ? format(ld.createdAt.toDate(), 'd MMMM yyyy', { locale: ar }) : '',
                    time: ld.createdAt?.toDate ? format(ld.createdAt.toDate(), 'hh:mm a') : '',
                    venue: ld.eventTitle ? `مرتبط بـ: ${ld.eventTitle}` : 'رابط تسجيل إلكتروني',
                    status: ld.delegatePointsAwarded ? 'مكتمل (ممنوح)' : (ld.status === 'paused' ? 'موقوف' : 'طالب مفوض'),
                    rawStatus: ld.status || 'Active',
                    points: ld.delegateRewardPoints || 0,
                    isDelegate: true,
                    role: 'طالب مفوض'
                };

                if (delegateId) {
                    if (!pMap[delegateId]) pMap[delegateId] = [];
                    pMap[delegateId].push(ev);
                }
                if (delegateName) {
                    const cleanDelName = String(delegateName).replace(/\(.*?\)/g, '').trim();
                    if (!pMap[delegateName]) pMap[delegateName] = [];
                    pMap[delegateName].push(ev);
                    if (cleanDelName && cleanDelName !== delegateName) {
                        if (!pMap[cleanDelName]) pMap[cleanDelName] = [];
                        pMap[cleanDelName].push(ev);
                    }
                }
            });
        }

        setStudentParticipationMap(pMap);
        setAssetUsageMap(uMap);
    };

    // --- 1. Fetch Data Logic ---
    useEffect(() => {
        const loadInitialData = async () => {
            let sMap = {};
            let aMap = {};
            let eDocs = [];
            try {
                try {
                    const eSnap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'desc')));
                    eDocs = eSnap.docs;
                } catch {
                    const fallbackSnap = await getDocs(collection(db, 'events'));
                    eDocs = fallbackSnap.docs;
                }
            } catch (e) {
                console.warn("Notice loading events for history:", e);
            }

            let initialArchivedStCount = 0;
            try {
                const sSnap = await getDocs(collection(db, 'students'));
                sSnap.docs.forEach(d => {
                    const sData = d.data();
                    if (sData.active === false || sData.status === 'archived') {
                        initialArchivedStCount++;
                    }
                    sMap[d.id] = {
                        name: sData.name,
                        grade: sData.grade || '',
                        section: sData.section || ''
                    };
                });
                setStudentMap(sMap);
            } catch (e) {
                console.warn("Notice loading students map:", e);
            }

            const initialArchivedEvCount = eDocs.filter(d => d.data().status === 'archived').length;
            setArchiveCounts({
                students: initialArchivedStCount,
                activities: initialArchivedEvCount
            });

            try {
                const aSnap = await getDocs(collection(db, 'assets'));
                aSnap.docs.forEach(d => { aMap[d.id] = d.data().name; });
                setAssetMap(aMap);
            } catch (e) {
                console.warn("Notice loading assets map:", e);
            }

            let lDocs = [];
            try {
                const lSnap = await getDocs(collection(db, 'registration_links'));
                lDocs = lSnap.docs;
            } catch (e) {
                console.warn("Notice loading links for history:", e);
            }

            buildHistoryMaps(eDocs, sMap, aMap, lDocs);
        };
        loadInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, archiveSubTab, studentMap, assetMap]); // Refetch when tab changes or map is ready

    // --- 2. Filter Logic ---
    useEffect(() => {
        applyFilters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawData, dateRange, pointsRange, assetStatusFilter, gradeFilter, sectionFilter, venueFilter, activeTab, archiveSubTab, archiveSearchTerm, pointsSearchTerm, pointsDateRange, pointsChangeType, pointsActionTypes, pointsSelectedGrades, pointsSelectedSections, pointsSelectedEventTypes, pointsSortBy]);

    // --- 3. Handlers ---
    const handleEditClick = async (event) => {
        try {
            const docRef = doc(db, 'events', event.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setEditEventData({ id: event.id, ...docSnap.data() });
                setIsEditModalOpen(true);
            } else {
                toast.error("هذا النشاط غير موجود");
            }
        } catch (e) {
            console.error(e);
            toast.error("فشل تحميل بيانات النشاط");
        }
    };

    const handleSaveEditedEvent = async (updatedData) => {
        try {
            // Use Smart Sync Logic
            await updateEventWithSmartSync(updatedData.id, updatedData, editEventData);
            toast.success("تم تحديث النشاط ورصد النقاط بنجاح");
            setIsEditModalOpen(false);
            setEditEventData(null);
            fetchData(); // Refresh list
        } catch (e) {
            console.error(e);
            toast.error("حدث خطأ أثناء حفظ التعديلات");
        }
    };

    const handleDeleteEvent = async (event) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف النشاط",
            message: "هل أنت متأكد من حذف هذا النشاط؟ سيتم حذفه نهائياً.",
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'events', event.id));
                    toast.success("تم حذف النشاط");
                    setIsEditModalOpen(false); // If open
                    setSelectedEvent(null);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    fetchData();
                } catch (e) {
                    console.error(e);
                    toast.error("فشل الحذف");
                }
            }
        });
    };

    // --- Archive Specific Handlers ---
    const handleRestoreStudent = async (student) => {
        const toastId = toast.loading(`جاري استعادة الطالب ${student.name}...`);
        try {
            await updateDoc(doc(db, 'students', student.id), {
                active: true,
                status: 'active'
            });
            toast.success(`تمت استعادة الطالب "${student.name}" بنجاح وإعادته للسجلات النشطة`, { id: toastId });
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("فشل استعادة الطالب", { id: toastId });
        }
    };

    const handlePermanentDeleteStudent = (student) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف نهائي للطالب",
            message: `تحذير: هل أنت متأكد من حذف الطالب "${student.name}" نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء وسيتم مسحه تماماً.`,
            isDestructive: true,
            onConfirm: async () => {
                const toastId = toast.loading("جاري الحذف النهائي للطالب...");
                try {
                    await deleteDoc(doc(db, 'students', student.id));
                    toast.success(`تم حذف الطالب "${student.name}" نهائياً`, { id: toastId });
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    fetchData();
                } catch (e) {
                    console.error(e);
                    toast.error("فشل حذف الطالب", { id: toastId });
                }
            }
        });
    };

    const handleRestoreArchivedEvent = async (event) => {
        const toastId = toast.loading(`جاري استعادة النشاط "${event.title}"...`);
        try {
            await updateDoc(doc(db, 'events', event.id), { status: 'Done' });
            toast.success(`تم استعادة النشاط بنجاح`, { id: toastId });
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("فشل استعادة النشاط", { id: toastId });
        }
    };

    const handlePermanentDeleteArchivedEvent = (event) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف نهائي للنشاط",
            message: `تحذير: هذا إجراء نهائي!\n\nسيتم حذف النشاط "${event.title}" نهائياً من السجلات والأرشيف دون المساس بنقاط الطلاب المشاركين.\n\nهل أنت متأكد؟`,
            isDestructive: true,
            onConfirm: async () => {
                const toastId = toast.loading("جاري حذف النشاط نهائياً من الأرشيف...");
                try {
                    await deleteDoc(doc(db, 'events', event.id));
                    toast.success("تم حذف النشاط نهائياً من الأرشيف", { id: toastId });
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    fetchData();
                } catch (e) {
                    console.error(e);
                    toast.error("فشل في حذف النشاط", { id: toastId });
                }
            }
        });
    };

    async function fetchData() {
        setLoading(true);
        try {
            let data = [];
            if (activeTab === 'activities') {
                const snap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'desc')));
                let lDocs = [];
                try {
                    const lSnap = await getDocs(collection(db, 'registration_links'));
                    lDocs = lSnap.docs;
                } catch {}
                buildHistoryMaps(snap.docs, studentMap, assetMap, lDocs);
                data = snap.docs.map(d => {
                    const pd = d.data();
                    const participatingStudents = pd.participatingStudents?.map(id => {
                        const s = studentMap[id];
                        return s ? { ...s, id } : { name: 'طالب غير معروف', grade: '', section: '' };
                    }) || [];
                    return {
                        id: d.id,
                        title: pd.title,
                        rawDate: pd.startTime?.toDate ? pd.startTime.toDate() : new Date(pd.date),
                        date: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'yyyy-MM-dd') : pd.date,
                        formattedDate: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'EEEE d MMMM yyyy', { locale: ar }) : pd.date,
                        time: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'hh:mm a') : pd.startTime,
                        venueId: pd.venueId, // Store ID for filtering
                        venue: getVenueLabel(pd.venueId),
                        status: getStatusLabel(pd.status || 'Draft'),
                        rawStatus: pd.status || 'Draft',
                        rawParticipatingStudents: pd.participatingStudents || [],
                        linkStudentIds: pd.linkStudentIds || [],
                        deferredLinkStudents: pd.deferredLinkStudents || {},
                        participantPoints: pd.participantPoints || {},
                        combineLinkStudents: pd.combineLinkStudents || {},
                        studentsCount: participatingStudents.length,
                        studentNames: participatingStudents, // Now Array of Objects {name, grade, section}
                        type: pd.typeName || 'عام',
                        typeId: pd.typeId,
                        assets: pd.assets?.map(id => assetMap[id] || id) || [], // Map ID to Name
                        customData: pd.customData || pd.customFields || {},
                        participantDetails: pd.participantDetails || {},
                        points: pd.points || 10 // Sortable
                    };
                }).filter(e => e.rawStatus !== 'archived');
            } else if (activeTab === 'students') {
                const snap = await getDocs(query(collection(db, 'students'), orderBy('totalPoints', 'desc')));
                data = snap.docs
                    .map(d => ({
                        id: d.id,
                        name: d.data().name,
                        class: d.data().class, // Legacy
                        grade: d.data().grade || '', // New
                        section: d.data().section || '', // New
                        specializations: d.data().specializations || [],
                        points: d.data().totalPoints || 0,
                        active: d.data().active,
                        status: d.data().status
                    }))
                    .filter(s => s.active !== false && s.status !== 'archived');
            } else if (activeTab === 'assets') {
                const snap = await getDocs(collection(db, 'assets'));
                data = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name,
                    type: d.data().type,
                    status: d.data().status
                }));
            } else if (activeTab === 'archive') {
                let archivedStList = [];
                let archivedEvList = [];

                try {
                    const sSnap = await getDocs(collection(db, 'students'));
                    archivedStList = sSnap.docs
                        .map(d => ({
                            id: d.id,
                            name: d.data().name,
                            class: d.data().class,
                            grade: d.data().grade || '',
                            section: d.data().section || '',
                            specializations: d.data().specializations || [],
                            points: d.data().totalPoints || 0,
                            active: d.data().active,
                            status: d.data().status,
                            joinedAt: d.data().joinedAt
                        }))
                        .filter(s => s.active === false || s.status === 'archived');
                } catch (err) {
                    console.error("Error fetching archived students:", err);
                }

                try {
                    const eSnap = await getDocs(collection(db, 'events'));
                    archivedEvList = eSnap.docs
                        .map(d => {
                            const pd = d.data();
                            const participatingStudents = pd.participatingStudents?.map(id => {
                                const s = studentMap[id];
                                return s ? { ...s, id } : { name: 'طالب غير معروف', grade: '', section: '' };
                            }) || [];
                            return {
                                id: d.id,
                                title: pd.title,
                                rawDate: pd.startTime?.toDate ? pd.startTime.toDate() : new Date(pd.date),
                                date: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'yyyy-MM-dd') : pd.date,
                                formattedDate: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'EEEE d MMMM yyyy', { locale: ar }) : pd.date,
                                time: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'hh:mm a') : pd.startTime,
                                venueId: pd.venueId,
                                venue: getVenueLabel(pd.venueId),
                                status: getStatusLabel(pd.status || 'archived'),
                                rawStatus: pd.status || 'archived',
                                rawParticipatingStudents: pd.participatingStudents || [],
                                linkStudentIds: pd.linkStudentIds || [],
                                deferredLinkStudents: pd.deferredLinkStudents || {},
                                participantPoints: pd.participantPoints || {},
                                combineLinkStudents: pd.combineLinkStudents || {},
                                studentsCount: participatingStudents.length,
                                studentNames: participatingStudents,
                                type: pd.typeName || 'عام',
                                typeId: pd.typeId,
                                assets: pd.assets?.map(id => assetMap[id] || id) || [],
                                customData: pd.customData || pd.customFields || {},
                                participantDetails: pd.participantDetails || {},
                                points: pd.points || 10
                            };
                        })
                        .filter(e => e.rawStatus === 'archived');
                } catch (err) {
                    console.error("Error fetching archived events:", err);
                }

                setArchiveCounts({
                    students: archivedStList.length,
                    activities: archivedEvList.length
                });

                data = archiveSubTab === 'students' ? archivedStList : archivedEvList;
            } else if (activeTab === 'points') {
                setPointsPermissionNeeded(false);
                try {
                    const snap = await getDocs(query(collection(db, 'points_logs'), orderBy('createdAt', 'desc')));
                    data = snap.docs.map(d => {
                        const pd = d.data();
                        const createdDate = pd.createdAt?.toDate ? pd.createdAt.toDate() : (pd.createdAt ? new Date(pd.createdAt) : new Date());
                        return {
                            id: d.id,
                            studentId: pd.studentId,
                            studentName: pd.studentName || 'طالب',
                            grade: pd.grade || '',
                            section: pd.section || '',
                            class: pd.class || ((pd.grade && pd.section) ? `${pd.grade} - ${pd.section}` : ''),
                            change: Number(pd.change) || 0,
                            previousTotalPoints: Number(pd.previousTotalPoints) || 0,
                            newTotalPoints: Number(pd.newTotalPoints) || 0,
                            reason: pd.reason || 'تعديل نقاط',
                            actionType: pd.actionType || 'manual_edit',
                            eventId: pd.eventId || null,
                            eventTitle: pd.eventTitle || null,
                            eventType: pd.eventType || null,
                            performedBy: pd.performedBy || 'النظام',
                            rawDate: createdDate,
                            date: format(createdDate, 'yyyy-MM-dd'),
                            formattedDate: format(createdDate, 'd MMMM yyyy - hh:mm a', { locale: ar }),
                            time: format(createdDate, 'hh:mm a')
                        };
                    });
                } catch (pointsErr) {
                    if (pointsErr?.code === 'permission-denied') {
                        setPointsPermissionNeeded(true);
                        data = [];
                    } else {
                        console.warn("Could not load points_logs with orderBy, attempting unsorted:", pointsErr);
                        try {
                            const snap = await getDocs(collection(db, 'points_logs'));
                            data = snap.docs.map(d => {
                                const pd = d.data();
                                const createdDate = pd.createdAt?.toDate ? pd.createdAt.toDate() : (pd.createdAt ? new Date(pd.createdAt) : new Date());
                                return {
                                    id: d.id,
                                    studentId: pd.studentId,
                                    studentName: pd.studentName || 'طالب',
                                    grade: pd.grade || '',
                                    section: pd.section || '',
                                    class: pd.class || ((pd.grade && pd.section) ? `${pd.grade} - ${pd.section}` : ''),
                                    change: Number(pd.change) || 0,
                                    previousTotalPoints: Number(pd.previousTotalPoints) || 0,
                                    newTotalPoints: Number(pd.newTotalPoints) || 0,
                                    reason: pd.reason || 'تعديل نقاط',
                                    actionType: pd.actionType || 'manual_edit',
                                    eventId: pd.eventId || null,
                                    eventTitle: pd.eventTitle || null,
                                    eventType: pd.eventType || null,
                                    performedBy: pd.performedBy || 'النظام',
                                    rawDate: createdDate,
                                    date: format(createdDate, 'yyyy-MM-dd'),
                                    formattedDate: format(createdDate, 'd MMMM yyyy - hh:mm a', { locale: ar }),
                                    time: format(createdDate, 'hh:mm a')
                                };
                            });
                            data.sort((a, b) => b.rawDate - a.rawDate);
                        } catch (fallbackErr) {
                            if (fallbackErr?.code === 'permission-denied') {
                                setPointsPermissionNeeded(true);
                            } else {
                                console.warn("Points logs collection empty or inaccessible:", fallbackErr);
                            }
                            data = [];
                        }
                    }
                }
            }
            setRawData(data);
        } catch (error) {
            console.error(error);
            if (activeTab !== 'points' || !pointsPermissionNeeded) {
                toast.error("فشل تحميل البيانات");
            }
        } finally {
            setLoading(false);
        }
    }

    function applyFilters() {
        let filtered = [...rawData];

        if (activeTab === 'activities') {
            if (dateRange.start) filtered = filtered.filter(item => item.date >= dateRange.start);
            if (dateRange.end) filtered = filtered.filter(item => item.date <= dateRange.end);
            if (venueFilter !== 'All') filtered = filtered.filter(item => item.venueId === venueFilter);
            if (selectedTypes.length > 0) filtered = filtered.filter(item => selectedTypes.includes(item.type));

        } else if (activeTab === 'students') {
            if (pointsRange.min > 0) filtered = filtered.filter(item => item.points >= pointsRange.min);
            if (pointsRange.max < 2000) filtered = filtered.filter(item => item.points <= pointsRange.max);

            if (gradeFilter) filtered = filtered.filter(item => item.grade === gradeFilter);
            if (sectionFilter) filtered = filtered.filter(item => item.section === sectionFilter);
            if (specFilter !== 'All') {
                filtered = filtered.filter(item => {
                    if (specFilter === 'General') return item.specializations.includes('General');
                    return item.specializations.includes(specFilter);
                });
            }

        } else if (activeTab === 'assets') {
            if (assetStatusFilter !== 'All') {
                filtered = filtered.filter(item => item.status === assetStatusFilter);
            }
        } else if (activeTab === 'archive') {
            if (archiveSearchTerm) {
                const term = archiveSearchTerm.toLowerCase().trim();
                filtered = filtered.filter(item => {
                    if (archiveSubTab === 'students') {
                        return (item.name || '').toLowerCase().includes(term) ||
                            (item.class || '').toLowerCase().includes(term) ||
                            (item.grade || '').toLowerCase().includes(term) ||
                            (item.section || '').toLowerCase().includes(term);
                    } else {
                        return (item.title || '').toLowerCase().includes(term) ||
                            (item.venue || '').toLowerCase().includes(term) ||
                            (item.type || '').toLowerCase().includes(term);
                    }
                });
            }
        } else if (activeTab === 'points') {
            // 1. Smart multi-term search with Arabic normalization
            if (pointsSearchTerm) {
                const rawTokens = pointsSearchTerm.trim().split(/\s+/).filter(Boolean);
                const tokens = rawTokens.map(t => normalizeArabic(t));
                filtered = filtered.filter(item => {
                    const corpus = normalizeArabic([
                        item.studentName || '',
                        item.grade || '',
                        item.section || '',
                        item.class || '',
                        item.reason || '',
                        item.eventTitle || '',
                        item.eventType || '',
                        item.performedBy || '',
                        String(item.change || ''),
                        String(item.newTotalPoints || '')
                    ].join(' '));
                    return tokens.every(tok => corpus.includes(tok));
                });
            }

            // 2. Date Range
            if (pointsDateRange.start) {
                filtered = filtered.filter(item => item.date >= pointsDateRange.start);
            }
            if (pointsDateRange.end) {
                filtered = filtered.filter(item => item.date <= pointsDateRange.end);
            }

            // 3. Change Type (+ / -)
            if (pointsChangeType === 'positive') {
                filtered = filtered.filter(item => item.change > 0);
            } else if (pointsChangeType === 'negative') {
                filtered = filtered.filter(item => item.change < 0);
            }

            // 4. Action Types
            if (pointsActionTypes.length > 0) {
                filtered = filtered.filter(item => pointsActionTypes.includes(item.actionType));
            }

            // 5. Grades
            if (pointsSelectedGrades.length > 0) {
                filtered = filtered.filter(item => pointsSelectedGrades.includes(item.grade));
            }

            // 6. Sections
            if (pointsSelectedSections.length > 0) {
                filtered = filtered.filter(item => pointsSelectedSections.includes(item.section));
            }

            // 7. Event Types
            if (pointsSelectedEventTypes.length > 0) {
                filtered = filtered.filter(item => pointsSelectedEventTypes.includes(item.eventType));
            }

            // 8. Sorting
            filtered.sort((a, b) => {
                if (pointsSortBy === 'date_asc') return (a.rawDate?.getTime?.() || 0) - (b.rawDate?.getTime?.() || 0);
                if (pointsSortBy === 'change_desc') return b.change - a.change;
                if (pointsSortBy === 'change_asc') return a.change - b.change;
                if (pointsSortBy === 'student_name') return (a.studentName || '').localeCompare(b.studentName || '', 'ar');
                return (b.rawDate?.getTime?.() || 0) - (a.rawDate?.getTime?.() || 0);
            });
        }

        setPreviewData(filtered);
    }

    // --- Excel Export ---
    const handleExportExcel = async () => {
        if (!previewData || previewData.length === 0) return toast.error("لا توجد بيانات للتصدير");

        const XLSX = await import('xlsx');

        // 1. Format Data for Excel
        let exportData = [];
        if (activeTab === 'activities') {
            exportData = previewData.map(e => ({
                "النشاط": e.title,
                "النوع": e.type,
                "التاريخ": e.formattedDate || e.date,
                "الوقت": e.time,
                "المكان": e.venue,
                "الحالة": e.status,
                "عدد الطلاب": e.studentsCount,
                "الموارد المستخدمة": (e.assets || []).map(a => assetMap[a] || a).join(', ') || '-'
            }));
        } else if (activeTab === 'students') {
            exportData = previewData.map((s, i) => {
                const history = studentParticipationMap[s.id] || studentParticipationMap[s.name] || [];
                const isUnknown = s.grade === 'غير معروف' || s.grade === 'Unknown' || !!s.isGradeUnknown || (s.class && String(s.class).startsWith('غير معروف'));
                const gradeVal = isUnknown ? 'غير معروف' : (s.grade || '');
                const sectionVal = isUnknown ? '-' : (s.section || '');
                const classVal = isUnknown ? 'غير معروف' : ((s.grade && s.section) ? `${s.grade} - ${s.section}` : (s.class || s.grade || '')).replace(/\s*-\s*$/, '');

                const row = {
                    "م": i + 1,
                    "الاسم": s.name,
                    "الصف": gradeVal,
                    "الشعبة": sectionVal,
                    "الفصل": classVal,
                    "إجمالي النقاط": s.points,
                    "التخصصات": s.specializations?.join(', ') || '-'
                };
                if (reportOptions.showStudentHistory) {
                    row["عدد المشاركات"] = history.length;
                    row["سجل الأنشطة"] = history.map(h => `${h.title} (${h.formattedDate})`).join(' | ') || '-';
                }
                return row;
            });
        } else if (activeTab === 'assets') {
            exportData = previewData.map(a => {
                const history = assetUsageMap[a.id] || assetUsageMap[a.name] || [];
                const row = {
                    "المورد": a.name,
                    "النوع": a.type,
                    "الحالة": a.status
                };
                if (reportOptions.showAssetHistory) {
                    row["عدد مرات الاستخدام"] = history.length;
                    row["سجل الاستخدام في الأنشطة"] = history.map(h => `${h.title} (${h.formattedDate})`).join(' | ') || '-';
                }
                return row;
            });
        } else if (activeTab === 'archive') {
            if (archiveSubTab === 'students') {
                exportData = previewData.map((s, i) => {
                    const isUnknown = s.grade === 'غير معروف' || s.grade === 'Unknown' || !!s.isGradeUnknown || (s.class && String(s.class).startsWith('غير معروف'));
                    const gradeVal = isUnknown ? 'غير معروف' : (s.grade || '');
                    const sectionVal = isUnknown ? '-' : (s.section || '');
                    const classVal = isUnknown ? 'غير معروف' : ((s.grade && s.section) ? `${s.grade} - ${s.section}` : (s.class || s.grade || '')).replace(/\s*-\s*$/, '');

                    return {
                        "م": i + 1,
                        "اسم الطالب": s.name,
                        "الصف": gradeVal,
                        "الشعبة": sectionVal,
                        "الفصل": classVal,
                        "النقاط السابقة": s.points || 0,
                        "التخصصات": (s.specializations || []).join('، ') || '-'
                    };
                });
            } else {
                exportData = previewData.map(e => ({
                    "النشاط": e.title,
                    "النوع": e.type,
                    "التاريخ": e.formattedDate || e.date,
                    "الوقت": e.time,
                    "المكان": e.venue,
                    "الحالة": "مؤرشف",
                    "عدد الطلاب": e.studentsCount
                }));
            }
        } else if (activeTab === 'points') {
            exportData = previewData.map((p, i) => {
                const isUnknown = p.grade === 'غير معروف' || p.grade === 'Unknown' || (p.class && String(p.class).startsWith('غير معروف'));
                const gradeVal = isUnknown ? 'غير معروف' : (p.grade || '');
                const sectionVal = isUnknown ? '-' : (p.section || '');
                const classVal = isUnknown ? 'غير معروف' : ((p.grade && p.section) ? `${p.grade} - ${p.section}` : (p.class || p.grade || '')).replace(/\s*-\s*$/, '');

                return {
                    "م": i + 1,
                    "اسم الطالب": p.studentName,
                    "الصف": gradeVal,
                    "الشعبة": sectionVal,
                    "الفصل": classVal,
                    "نوع الحركة": p.change > 0 ? `+${p.change} (إضافة)` : `${p.change} (خصم)`,
                    "التغيير": p.change,
                    "الرصيد السابق": p.previousTotalPoints,
                    "الرصيد الجديد": p.newTotalPoints,
                    "سبب الحركة": p.reason,
                    "النشاط المرتبط": p.eventTitle || '-',
                    "نوع النشاط": p.eventType || '-',
                    "المنفّذ": p.performedBy || 'النظام',
                    "التاريخ والوقت": p.formattedDate || p.date
                };
            });
        }

        // 2. Create Workbook
        const wb = XLSX.utils.book_new();
        if (!wb.Workbook) wb.Workbook = {};
        wb.Workbook.Views = [{ RTL: true }];

        const ws = XLSX.utils.json_to_sheet(exportData);

        // Auto-width columns based on content
        const keys = Object.keys(exportData[0] || {});
        const wscols = keys.map(k => {
            let maxLen = k.length;
            exportData.forEach(row => {
                const valStr = String(row[k] ?? '');
                if (valStr.length > maxLen) maxLen = valStr.length;
            });
            return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
        });
        ws['!cols'] = wscols;
        ws['!views'] = [{ RTL: true }];

        XLSX.utils.book_append_sheet(wb, ws, "تقرير");

        // 3. Download
        const fileName = `Export_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success("تم تصدير ملف Excel بنجاح");
    };

    // --- Advanced Universal Report Print Executor ---
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

        const toastId = toast.loading('جاري تحضير ملف الطباعة المخصص...');

        try {
            // 1. Filter Records by Scope
            let targetData = [...previewData];
            if (scope === 'selected' && selectedReportRowIds.length > 0) {
                targetData = previewData.filter(r => selectedReportRowIds.includes(r.id || r.name));
            }

            if (targetData.length === 0) {
                toast.error("لا توجد سجلات مطابقة للطباعة", { id: toastId });
                return;
            }

            // 2. Sort Records (user-chosen mode for student lists)
            if (activeTab === 'students' || (activeTab === 'archive' && archiveSubTab === 'students')) {
                targetData = sortStudentsByMode(targetData, options.sortBy || 'alphabetical', s => Number(s.points) || 0);
            } else if (activeTab === 'points' && options.sortBy) {
                const withName = targetData.map(r => ({ ...r, name: r.studentName }));
                targetData = sortStudentsByMode(withName, options.sortBy, r => Number(r.change) || 0);
            } else if (activeTab === 'points' && pointsSortBy === 'student_name') {
                targetData = sortStudentsArabic(targetData, 'studentName');
            }

            // 3. Document Title
            const titleMap = {
                'activities': 'سجل الأنشطة المدرسي',
                'students': 'قائمة الطلاب المتميزين',
                'assets': 'جرد الموارد والمعدات',
                'points': 'سجل حركات نقاط التميز للطلاب',
                'archive': archiveSubTab === 'students' ? 'أرشيف الطلاب المستبعدين' : 'أرشيف الأنشطة السابقة'
            };

            let pageTitle = customTitle.trim() || titleMap[activeTab] || 'تقرير مدرسي شامل';
            if (!customTitle.trim() && activeTab === 'students' && gradeFilter) {
                pageTitle = `تقرير طلاب ${gradeFilter}`;
                if (sectionFilter) pageTitle += ` - ${sectionFilter}`;
            }

            // 4. Header HTML
            let headerHtml = '';
            if (showHeader) {
                headerHtml = getOfficialReportHeaderHtml({
                    schoolInfo,
                    title: pageTitle,
                    subTitle: 'قسم النشاط الطلابي المدرسي',
                    centerDetails: [
                        `التصنيف: ${titleMap[activeTab] || 'تقرير عام'}`,
                        gradeFilter && gradeFilter !== 'All' ? `الصف: ${gradeFilter}` : null,
                        sectionFilter && sectionFilter !== 'All' ? `الشعبة: ${sectionFilter}` : null,
                        scope === 'selected' ? `(سجلات محددة: ${targetData.length} من أصل ${previewData.length})` : null
                    ].filter(Boolean),
                    leftDetails: [
                        { label: 'التاريخ', value: new Date().toLocaleDateString('ar-SA') },
                        { label: 'الوقت', value: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) },
                        { label: 'إجمالي السجلات', value: `${targetData.length} سجل` }
                    ]
                });
            }

            // 5. KPI Cards HTML
            let kpiHtml = '';
            if (showKpis) {
                if (activeTab === 'points') {
                    const posPts = targetData.filter(p => (Number(p.change) || 0) > 0).reduce((sum, p) => sum + Number(p.change), 0);
                    const negPts = targetData.filter(p => (Number(p.change) || 0) < 0).reduce((sum, p) => sum + Math.abs(Number(p.change)), 0);
                    const netPts = targetData.reduce((sum, p) => sum + (Number(p.change) || 0), 0);
                    kpiHtml = `
                        <div class="kpi-grid">
                            <div class="kpi-card">
                                <div class="kpi-label">إجمالي الحركات</div>
                                <div class="kpi-value">${targetData.length}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">النقاط الممنوحة</div>
                                <div class="kpi-value points">+${posPts} ن</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">النقاط المخصومة</div>
                                <div class="kpi-value" style="color: #dc2626;">-${negPts} ن</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">صافي النقاط</div>
                                <div class="kpi-value ${netPts >= 0 ? 'points' : ''}" style="${netPts < 0 ? 'color: #dc2626;' : ''}">
                                    ${netPts > 0 ? '+' : ''}${netPts} ن
                                </div>
                            </div>
                        </div>
                    `;
                } else if (activeTab === 'activities' || (activeTab === 'archive' && archiveSubTab === 'activities')) {
                    const completedCount = targetData.filter(a => a.rawStatus === 'Done' || a.status === 'مكتمل').length;
                    const totalStudents = targetData.reduce((sum, a) => sum + (a.studentsCount || 0), 0);
                    kpiHtml = `
                        <div class="kpi-grid">
                            <div class="kpi-card">
                                <div class="kpi-label">إجمالي الأنشطة</div>
                                <div class="kpi-value">${targetData.length}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">الأنشطة المكتملة</div>
                                <div class="kpi-value points">${completedCount}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">مشاركات الطلاب</div>
                                <div class="kpi-value">${totalStudents} طالب</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">متوسط المشاركة</div>
                                <div class="kpi-value">${targetData.length ? Math.round(totalStudents / targetData.length) : 0} لكل نشاط</div>
                            </div>
                        </div>
                    `;
                } else if (activeTab === 'students' || (activeTab === 'archive' && archiveSubTab === 'students')) {
                    const totalPts = targetData.reduce((sum, s) => sum + (s.points || 0), 0);
                    const avgPts = targetData.length ? Math.round(totalPts / targetData.length) : 0;
                    kpiHtml = `
                        <div class="kpi-grid">
                            <div class="kpi-card">
                                <div class="kpi-label">إجمالي الطلاب</div>
                                <div class="kpi-value">${targetData.length}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">مجموع نقاط التميز</div>
                                <div class="kpi-value points">${totalPts} نقطة</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">متوسط نقاط الطالب</div>
                                <div class="kpi-value points">${avgPts} نقطة</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">أعلى رصيد نقاط</div>
                                <div class="kpi-value points">${Math.max(0, ...targetData.map(s => s.points || 0))} نقطة</div>
                            </div>
                        </div>
                    `;
                } else if (activeTab === 'assets') {
                    const availCount = targetData.filter(a => a.status === 'Available').length;
                    kpiHtml = `
                        <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
                            <div class="kpi-card">
                                <div class="kpi-label">إجمالي الموارد</div>
                                <div class="kpi-value">${targetData.length}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">المتاحة للاستخدام</div>
                                <div class="kpi-value points">${availCount}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">صيانة / قيد الاستخدام</div>
                                <div class="kpi-value">${targetData.length - availCount}</div>
                            </div>
                        </div>
                    `;
                }
            }

            // 6. Dynamic Table Columns & Rows
            const colSet = new Set(columns);
            let ths = [];

            if (colSet.has('index')) ths.push('<th style="width: 35px; text-align: center;">#</th>');
            if (colSet.has('title')) ths.push('<th>النشاط</th>');
            if (colSet.has('name') || colSet.has('studentName')) ths.push('<th>اسم الطالب</th>');
            if (colSet.has('type')) ths.push('<th>النوع والتصنيف</th>');
            if (colSet.has('date')) ths.push('<th>التاريخ والوقت</th>');
            if (colSet.has('venue')) ths.push('<th>المكان / المقر</th>');
            if (colSet.has('class')) ths.push('<th style="text-align: center;">الصف والشعبة</th>');
            if (colSet.has('specializations')) ths.push('<th>التخصصات</th>');
            if (colSet.has('status')) ths.push('<th style="text-align: center;">الحالة</th>');
            if (colSet.has('studentsCount')) ths.push('<th style="text-align: center;">عدد الطلاب</th>');
            if (colSet.has('points')) ths.push('<th style="text-align: center;">نقاط التميز</th>');
            if (colSet.has('reason')) ths.push('<th>سبب الحركة / النشاط</th>');
            if (colSet.has('actionType')) ths.push('<th style="text-align: center;">نوع العملية</th>');
            if (colSet.has('change')) ths.push('<th style="text-align: center;">مقدار التغيير</th>');
            if (colSet.has('newTotalPoints')) ths.push('<th style="text-align: center;">الرصيد بعد</th>');
            if (colSet.has('performedBy')) ths.push('<th>المنفّذ</th>');

            if (showSignatureCol) {
                ths.push('<th style="width: 120px; text-align: center;">التوقيع / الحضور</th>');
            }

            const tableHeaderHtml = `<tr>${ths.join('')}</tr>`;
            const mainColSpan = ths.length || 1;

            const tableRowsHtml = targetData.map((item, i) => {
                let tds = [];

                if (colSet.has('index')) tds.push(`<td style="text-align: center;">${i + 1}</td>`);
                if (colSet.has('title')) tds.push(`<td style="font-weight: bold;">${item.title || '-'}</td>`);
                if (colSet.has('name')) tds.push(`<td style="font-weight: bold;">${item.name || '-'}</td>`);
                if (colSet.has('studentName')) tds.push(`<td style="font-weight: bold;">${item.studentName || '-'}</td>`);
                if (colSet.has('type')) tds.push(`<td>${item.type || '-'}</td>`);
                if (colSet.has('date')) tds.push(`<td>${item.formattedDate || item.date || '-'}</td>`);
                if (colSet.has('venue')) tds.push(`<td>${item.venue || '-'}</td>`);
                if (colSet.has('class')) tds.push(`<td style="text-align: center;">${cleanClassString(item)}</td>`);
                if (colSet.has('specializations')) {
                    const specs = (item.specializations && item.specializations.length > 0)
                        ? item.specializations.map(s => s === 'General' ? 'عام' : s).join('، ')
                        : '-';
                    tds.push(`<td>${specs}</td>`);
                }
                if (colSet.has('status')) {
                    const isSuccess = item.status === 'مكتمل' || item.status === 'Available';
                    tds.push(`<td style="text-align: center;"><span class="badge ${isSuccess ? 'success' : ''}">${item.status || '-'}</span></td>`);
                }
                if (colSet.has('studentsCount')) tds.push(`<td style="text-align: center; font-weight: bold;">${item.studentsCount ?? 0}</td>`);
                if (colSet.has('points')) tds.push(`<td style="text-align: center; font-weight: bold; color: #047857;">${item.points ?? 0}</td>`);
                if (colSet.has('reason')) tds.push(`<td>${item.reason || item.eventTitle || '-'}</td>`);
                if (colSet.has('actionType')) {
                    const actionLabel = item.actionType === 'activity_award' ? 'اعتماد نشاط' :
                        item.actionType === 'activity_deduct' ? 'إلغاء نشاط' :
                        item.actionType === 'bulk_adjustment' ? 'تعديل جماعي' :
                        item.actionType === 'link_registration' ? 'رابط تسجيل' :
                        item.actionType === 'duplicate_merge' ? 'دمج مكرر' : 'تعديل يدوي';
                    tds.push(`<td style="text-align: center;"><span class="badge">${actionLabel}</span></td>`);
                }
                if (colSet.has('change')) {
                    const isPos = (Number(item.change) || 0) > 0;
                    const changeStr = isPos ? `+${item.change}` : `${item.change}`;
                    tds.push(`<td style="text-align: center; font-weight: bold; ${isPos ? 'color: #059669;' : 'color: #dc2626;'} direction: ltr;">${changeStr} ن</td>`);
                }
                if (colSet.has('newTotalPoints')) tds.push(`<td style="text-align: center; font-weight: bold; color: #047857;">${item.newTotalPoints ?? '-'}</td>`);
                if (colSet.has('performedBy')) tds.push(`<td>${item.performedBy || 'النظام'}</td>`);

                if (showSignatureCol) {
                    tds.push('<td style="width: 120px; border-bottom: 1px dotted #94a3b8;"></td>');
                }

                const mainRow = `<tr>${tds.join('')}</tr>`;

                // Sub-details rows (if checked)
                let detailSections = [];

                // 1. Students in activity
                if (colSet.has('studentsList') && item.studentNames && item.studentNames.length > 0) {
                    const tags = sortStudentsByMode(item.studentNames, options.sortBy || 'alphabetical', s => getStudentActivityPoints(item, s.id)).map(s => {
                        const cls = cleanClassString(s);
                        return `<span class="badge" style="margin: 2px;">${s.name} (${cls})</span>`;
                    }).join(' ');
                    detailSections.push(`<div><strong>الطلاب المشاركون (${item.studentNames.length}):</strong> ${tags}</div>`);
                }

                // 2. Assets in activity
                if (colSet.has('assetsList') && item.assets && item.assets.length > 0) {
                    const tags = item.assets.map(a => `<span class="badge" style="margin: 2px;">${assetMap[a] || a}</span>`).join(' ');
                    detailSections.push(`<div><strong>الموارد المستخدمة (${item.assets.length}):</strong> ${tags}</div>`);
                }

                // 3. Custom data in activity
                if (colSet.has('customData') && item.customData && Object.keys(item.customData).length > 0) {
                    const tags = Object.entries(item.customData).map(([k, v]) => `<span><strong>${k}:</strong> ${v}</span>`).join(' • ');
                    detailSections.push(`<div><strong>بيانات إضافية:</strong> ${tags}</div>`);
                }

                // 4. Student or Asset History
                if (colSet.has('history')) {
                    if (activeTab === 'students') {
                        const history = studentParticipationMap[item.id] || studentParticipationMap[item.name] || [];
                        if (history.length > 0) {
                            const tags = history.map(h => `<span class="badge" style="margin: 2px;">${h.title} (${h.formattedDate}) +${h.points}ن</span>`).join(' ');
                            detailSections.push(`<div><strong>سجل مشاركات الطالب (${history.length}):</strong> ${tags}</div>`);
                        }
                    } else if (activeTab === 'assets') {
                        const history = assetUsageMap[item.id] || assetUsageMap[item.name] || [];
                        if (history.length > 0) {
                            const tags = history.map(h => `<span class="badge" style="margin: 2px;">${h.title} (${h.formattedDate})</span>`).join(' ');
                            detailSections.push(`<div><strong>سجل استخدام المورد (${history.length}):</strong> ${tags}</div>`);
                        }
                    }
                }

                let subRow = '';
                if (detailSections.length > 0) {
                    subRow = `
                        <tr>
                            <td colspan="${mainColSpan}" style="padding: 6px 12px; background: rgba(0,0,0,0.02); font-size: 10.5px; line-height: 1.6;">
                                ${detailSections.join('<div style="height: 4px;"></div>')}
                            </td>
                        </tr>
                    `;
                }

                return mainRow + subRow;
            }).join('');

            // 7. Footer Signatures & Notes HTML
            const footerHtml = getOfficialReportFooterHtml({
                signatures,
                footerNote,
                showSignatures
            });

            // 8. Full Document Assembly
            const fullHtml = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>${pageTitle}</title>
                    <style>
                        ${getStandardPrintStyles({
                            theme,
                            orientation,
                            density
                        })}
                    </style>
                </head>
                <body>
                    ${headerHtml}
                    ${kpiHtml}
                    <table>
                        <thead>
                            ${tableHeaderHtml}
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                    ${footerHtml}
                </body>
                </html>
            `;

            toast.dismiss(toastId);
            await printHtmlDocument(fullHtml, pageTitle);
            toast.success("تم فتح نافذة الطباعة / حفظ PDF بنجاح");
        } catch (error) {
            console.error("Print generation error:", error);
            toast.error("فشل في إنشاء التقرير", { id: toastId });
        }
    };

    const generateBulkPDF = () => {
        setIsPrintModalOpen(true);
    };

    // --- 4. Dedicated Single Event Print & Reporting Engine ---

    // Dynamic Columns Definition for Single Event Print Modal (Includes Points Column)
    const singleEventPrintColumnsDefinition = useMemo(() => {
        const evt = singleEventPrintEvent || selectedEvent;
        const cols = [
            { id: 'index', label: '#', defaultVisible: true },
            { id: 'studentName', label: 'اسم الطالب', defaultVisible: true },
            { id: 'class', label: 'الصف والشعبة', defaultVisible: true },
            { id: 'points', label: 'نقاط المشاركة في النشاط', defaultVisible: true, badge: 'نقاط' }
        ];

        // Custom fields from participant details if any
        if (evt?.participantDetails && typeof evt.participantDetails === 'object') {
            const customFieldLabels = new Set();
            Object.values(evt.participantDetails).forEach(pMap => {
                if (pMap && typeof pMap === 'object') {
                    Object.keys(pMap).forEach(k => {
                        if (!/^نقاط|^النقاط|points|point/i.test(k.trim())) {
                            customFieldLabels.add(k);
                        }
                    });
                }
            });
            customFieldLabels.forEach(label => {
                cols.push({
                    id: `custom_${label}`,
                    label: label,
                    defaultVisible: true
                });
            });
        }

        return cols;
    }, [singleEventPrintEvent, selectedEvent]);

    // Helper to resolve exact points earned by a student in an activity
    const getStudentActivityPoints = (event, studentId, pointsMap = {}) => {
        if (!event) return 0;

        // 1. Direct from pre-queried points_logs or registration_links
        if (pointsMap && pointsMap[studentId] !== undefined) {
            return Number(pointsMap[studentId]) || 0;
        }

        // 2. Specific deferred link points recorded on the event
        if (event.deferredLinkStudents && event.deferredLinkStudents[studentId] !== undefined) {
            return Number(event.deferredLinkStudents[studentId]) || 0;
        }

        // 3. Direct participant points override on event object
        if (event.participantPoints && event.participantPoints[studentId] !== undefined) {
            return Number(event.participantPoints[studentId]) || 0;
        }

        // 4. Custom participant details field (e.g. 'النقاط', 'نقاط', 'points')
        const pDetails = event.participantDetails?.[studentId];
        if (pDetails && typeof pDetails === 'object') {
            for (const [k, v] of Object.entries(pDetails)) {
                if (/^نقاط|^النقاط|points|point/i.test(k.trim()) && !isNaN(Number(v))) {
                    return Number(v);
                }
            }
        }

        // 5. Fallback to event base points
        return Number(event.points) || 10;
    };

    // Open Single Event Advanced Print Modal
    const openSingleEventPrintModal = async (event) => {
        const targetEvent = event || selectedEvent;
        if (!targetEvent) return;
        setSingleEventPrintEvent(targetEvent);

        if (targetEvent.id) {
            const pointsMap = { ...(singleEventPointsMap || {}) };
            try {
                const snap = await getDocs(query(collection(db, 'points_logs'), where('eventId', '==', targetEvent.id)));
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.studentId && data.change !== undefined) {
                        pointsMap[data.studentId] = (pointsMap[data.studentId] || 0) + (Number(data.change) || 0);
                    }
                });
            } catch (err) {
                console.warn("Could not query points_logs for single event print:", err);
            }

            try {
                const linksSnap = await getDocs(query(collection(db, 'registration_links'), where('eventId', '==', targetEvent.id)));
                linksSnap.docs.forEach(lDoc => {
                    const lData = lDoc.data();
                    const linkPts = Number(lData.pointsPerStudent);
                    if (!isNaN(linkPts) && linkPts > 0) {
                        (targetEvent.linkStudentIds || []).forEach(sid => {
                            if (pointsMap[sid] === undefined) {
                                pointsMap[sid] = linkPts;
                            }
                        });
                    }
                });
            } catch (err) {
                console.warn("Could not query registration_links for single event print:", err);
            }

            setSingleEventPointsMap(pointsMap);
        }

        setIsSingleEventPrintModalOpen(true);
    };

    // Keep alias for compatibility
    const generateSingleEventPDF = openSingleEventPrintModal;

    // Execute Single Event Advanced Print
    const handleExecuteSingleEventPrint = async (options) => {
        const event = singleEventPrintEvent || selectedEvent;
        if (!event) return;

        const toastId = toast.loading('جاري تحضير ملف طباعة التقرير...');

        try {
            const {
                columns = [],
                theme = 'classic',
                orientation = 'portrait',
                density = 'standard',
                showHeader = true,
                showKpis = true,
                showSignatures = true,
                showSignatureCol = false,
                signatures = [],
                customTitle = '',
                footerNote = ''
            } = options;

            const colSet = new Set(columns);
            const isDark = theme === 'dark';
            const isMonochrome = theme === 'monochrome';

            // Extract custom fields from event
            const customFieldLabels = [];
            if (event.participantDetails && typeof event.participantDetails === 'object') {
                const seen = new Set();
                Object.values(event.participantDetails).forEach(pMap => {
                    if (pMap && typeof pMap === 'object') {
                        Object.keys(pMap).forEach(k => {
                            if (!/^نقاط|^النقاط|points|point/i.test(k.trim()) && !seen.has(k)) {
                                seen.add(k);
                                customFieldLabels.push(k);
                            }
                        });
                    }
                });
            }

            const activeCustomCols = customFieldLabels.filter(label => colSet.has(`custom_${label}`));

            // Sort students per chosen mode
            const sortedStudents = sortStudentsByMode(
                event.studentNames || [],
                options.sortBy || 'alphabetical',
                s => getStudentActivityPoints(event, s.id, singleEventPointsMap)
            );
            const sortLabelMap = {
                alphabetical: 'مرتبين أبجدياً',
                class: 'مرتبين حسب الصف والشعبة',
                points_desc: 'مرتبين حسب النقاط تنازلياً',
                points_asc: 'مرتبين حسب النقاط تصاعدياً'
            };
            const sortLabel = sortLabelMap[options.sortBy] || sortLabelMap.alphabetical;

            // Activity custom fields (filled once per activity)
            const showActivityCustomFields = options.extraToggles?.activityCustomFields !== false;
            const rawCustomData = event.customData || event.customFields || {};
            const customDataEntries = Object.entries(rawCustomData)
                .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
            const customDataHtml = (showActivityCustomFields && customDataEntries.length > 0) ? `
                <div style="margin-bottom: 16px; page-break-inside: avoid !important; break-inside: avoid !important;">
                    <h3 style="font-size: 13px; font-weight: 800; color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#1e293b'}; margin: 0 0 8px 0;">
                        بيانات النشاط:
                    </h3>
                    <table style="margin-top: 0;">
                        <tbody>
                            ${customDataEntries.map(([k, v]) => `
                                <tr>
                                    <th style="width: 30%; text-align: right;">${k}</th>
                                    <td>${Array.isArray(v) ? v.join('، ') : v}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : '';

            // Table Header THs
            let ths = [];
            if (colSet.has('index')) ths.push('<th style="width: 35px; text-align: center;">#</th>');
            if (colSet.has('studentName')) ths.push('<th style="text-align: right;">اسم الطالب</th>');
            if (colSet.has('class')) ths.push('<th style="width: 130px; text-align: center;">الصف والشعبة</th>');
            if (colSet.has('points')) ths.push('<th style="width: 110px; text-align: center;">نقاط المشاركة</th>');
            activeCustomCols.forEach(col => {
                ths.push(`<th style="padding: 8px 12px; text-align: right;">${col}</th>`);
            });
            if (showSignatureCol) {
                ths.push('<th style="width: 120px; text-align: center;">التوقيع / الحضور</th>');
            }

            const tableHeaderHtml = `<tr>${ths.join('')}</tr>`;

            // Table Body TRs
            let tableRowsHtml = '';
            if (sortedStudents.length > 0) {
                tableRowsHtml = sortedStudents.map((s, i) => {
                    const pDetails = event.participantDetails?.[s.id] || {};
                    const cls = cleanClassString(s);
                    const studentPts = getStudentActivityPoints(event, s.id, singleEventPointsMap);

                    let tds = [];
                    if (colSet.has('index')) tds.push(`<td style="text-align: center; width: 35px;">${i + 1}</td>`);
                    if (colSet.has('studentName')) tds.push(`<td style="font-weight: bold; color: ${isDark ? '#f8fafc' : isMonochrome ? '#000' : '#0f172a'};">${s.name}</td>`);
                    if (colSet.has('class')) tds.push(`<td style="text-align: center;">${cls}</td>`);
                    if (colSet.has('points')) {
                        const ptsStyle = isDark ? 'color: #38bdf8;' : isMonochrome ? 'color: #000;' : 'color: #059669;';
                        tds.push(`<td style="text-align: center; font-weight: bold; font-family: monospace; ${ptsStyle} direction: ltr;">+${studentPts} ن</td>`);
                    }
                    activeCustomCols.forEach(col => {
                        const val = pDetails[col] || '-';
                        tds.push(`<td style="text-align: right;">${val}</td>`);
                    });
                    if (showSignatureCol) {
                        tds.push(`<td style="width: 120px; border-bottom: 1px dotted ${isDark ? '#475569' : isMonochrome ? '#000' : '#94a3b8'};"></td>`);
                    }

                    return `<tr>${tds.join('')}</tr>`;
                }).join('');
            }

            let studentsListHtml = '';
            if (sortedStudents.length > 0 && ths.length > 0) {
                studentsListHtml = `
                    <table>
                        <thead>${tableHeaderHtml}</thead>
                        <tbody>${tableRowsHtml}</tbody>
                    </table>
                `;
            } else if (sortedStudents.length === 0) {
                studentsListHtml = `<div style="padding: 20px; text-align: center; color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 13px;">لا يوجد طلاب مشاركون مسجلون لهذا النشاط</div>`;
            }

            // Assets List HTML
            const assetsListHtml = (event.assets && event.assets.length > 0)
                ? event.assets.map(a => {
                    const name = assetMap[a] || a;
                    return `<span class="asset-pill">${name}</span>`;
                }).join(' ')
                : `<div style="color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 12px;">لا توجد موارد أو أدوات مسجلة لهذا النشاط</div>`;

            // Official Header HTML
            const reportTitle = customTitle || 'تقرير النشاط الطلابي';
            const headerHtml = showHeader ? getOfficialReportHeaderHtml({
                schoolInfo,
                title: reportTitle,
                subTitle: event.title,
                centerDetails: [
                    `المجال / النوع: ${event.type || 'عام'}`,
                    `المقر: ${event.venue || 'المدرسة'}`
                ],
                leftDetails: [
                    { label: 'التاريخ', value: event.formattedDate || event.date || new Date().toLocaleDateString('ar-SA') },
                    { label: 'الوقت', value: event.time || '-' },
                    { label: 'إجمالي المشاركين', value: `${sortedStudents.length} طالب` },
                    { label: 'حالة النشاط', value: event.status || 'مكتمل' }
                ]
            }) : '';

            // KPI Summary HTML
            const kpiHtml = showKpis ? `
                <div class="event-summary">
                    <div class="event-summary-item">
                        <div class="event-summary-label">تاريخ النشاط</div>
                        <div class="event-summary-val">${event.formattedDate || event.date || '-'}</div>
                    </div>
                    <div class="event-summary-item">
                        <div class="event-summary-label">الوقت المحدد</div>
                        <div class="event-summary-val">${event.time || '-'}</div>
                    </div>
                    <div class="event-summary-item">
                        <div class="event-summary-label">المقر / المكان</div>
                        <div class="event-summary-val">${event.venue || '-'}</div>
                    </div>
                    <div class="event-summary-item">
                        <div class="event-summary-label">نقاط الفعالية الأساسية</div>
                        <div class="event-summary-val" style="color: ${isDark ? '#38bdf8' : isMonochrome ? '#000' : '#059669'}">${event.points || 10} نقطة</div>
                    </div>
                    <div class="event-summary-item">
                        <div class="event-summary-label">حالة الفعالية</div>
                        <div class="event-summary-val" style="color: ${event.status === 'مكتمل' ? (isDark ? '#4ade80' : '#059669') : (isDark ? '#fcd34d' : '#d97706')}">${event.status || 'مكتمل'}</div>
                    </div>
                    <div class="event-summary-item">
                        <div class="event-summary-label">إجمالي المسجلين</div>
                        <div class="event-summary-val">${sortedStudents.length} طالب</div>
                    </div>
                </div>
            ` : '';

            // Signatures & Notes HTML
            const footerHtml = getOfficialReportFooterHtml({
                signatures,
                footerNote,
                showSignatures
            });

            const extraCss = `
                .event-summary {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                    gap: 8px;
                    margin-bottom: 16px;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .event-summary-item {
                    background: ${isDark ? 'rgba(255, 255, 255, 0.04)' : isMonochrome ? '#ffffff' : '#f8fafc'};
                    border: 1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : isMonochrome ? '#000000' : '#e2e8f0'};
                    border-radius: 8px;
                    padding: 8px 10px;
                    text-align: center;
                }
                .event-summary-label {
                    font-size: 11px;
                    color: ${isDark ? '#94a3b8' : isMonochrome ? '#222222' : '#64748b'};
                    font-weight: 700;
                    margin-bottom: 3px;
                }
                .event-summary-val {
                    font-size: 13px;
                    font-weight: 800;
                    color: ${isDark ? '#ffffff' : isMonochrome ? '#000000' : '#0f172a'};
                }
                .event-assets-box {
                    background: ${isDark ? 'rgba(255, 255, 255, 0.03)' : isMonochrome ? '#ffffff' : '#f8fafc'};
                    border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : isMonochrome ? '#000000' : '#e2e8f0'};
                    border-radius: 8px;
                    padding: 10px 12px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .asset-pill {
                    display: inline-block;
                    background: ${isDark ? 'rgba(245, 158, 11, 0.15)' : isMonochrome ? '#ffffff' : '#fffbeb'};
                    color: ${isDark ? '#fcd34d' : isMonochrome ? '#000000' : '#92400e'};
                    border: 1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : isMonochrome ? '#000000' : '#fcd34d'};
                    padding: 3px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    font-weight: 600;
                }
            `;

            const fullHtml = `
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>${reportTitle} - ${event.title}</title>
                    <style>
                        ${getStandardPrintStyles({
                            theme,
                            orientation,
                            density,
                            extraCss
                        })}
                    </style>
                </head>
                <body>
                    ${headerHtml}
                    ${kpiHtml}
                    ${customDataHtml}

                    <div style="margin-bottom: 20px;">
                        <h3 style="font-size: 13px; font-weight: 800; color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#1e293b'}; margin: 0 0 10px 0;">
                            كشف بأسماء الطلاب المشاركين (${sortedStudents.length} طالب - ${sortLabel}):
                        </h3>
                        ${studentsListHtml}
                    </div>

                    <div style="margin-bottom: 20px; page-break-inside: avoid !important; break-inside: avoid !important;">
                        <h3 style="font-size: 13px; font-weight: 800; color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#1e293b'}; margin: 0 0 8px 0;">
                            الموارد والأدوات المستخدمة (${event.assets?.length || 0}):
                        </h3>
                        <div class="event-assets-box">
                            ${assetsListHtml}
                        </div>
                    </div>

                    ${footerHtml}
                </body>
                </html>
            `;

            toast.dismiss(toastId);
            await printHtmlDocument(fullHtml, `تقرير_${event.title}`);
            toast.success("تم فتح نافذة الطباعة بنجاح");
        } catch (error) {
            console.error("Print generation error:", error);
            toast.error("فشل في إنشاء التقرير", { id: toastId });
        }
    };

    // --- Archive Handling ---
    const handleRestore = async () => {
        if (!selectedEvent) return;
        const confirm = window.confirm("هل أنت متأكد من استعادة هذا النشاط؟ سيتم تغيير حالته إلى 'مكتمل'.");
        if (!confirm) return;

        const toastId = toast.loading("جاري الاستعادة...");
        try {
            await updateDoc(doc(db, 'events', selectedEvent.id), { status: 'Done' });
            toast.success("تم استعادة النشاط بنجاح", { id: toastId });
            setSelectedEvent(null);
            fetchData(); // Refresh list
        } catch (e) {
            console.error(e);
            toast.error("فشل في الاستعادة", { id: toastId });
        }
    };

    const handleForceDelete = async () => {
        if (!selectedEvent) return;
        const confirm = window.confirm("تحذير: هذا إجراء نهائي!\n\nسيتم حذف النشاط تماماً من السجلات وسحب النقاط (10 نقاط) من جميع الطلاب المشاركين.\n\nهل أنت متأكد؟");
        if (!confirm) return;

        const toastId = toast.loading("جاري الحذف وسحب النقاط...");
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', selectedEvent.id);

                // 1. Deduct Points (excluding link-registered students)
                const linkStudents = selectedEvent.linkStudentIds || [];
                const eligibleStudents = (selectedEvent.rawParticipatingStudents || []).filter(id => !linkStudents.includes(id));
                if (eligibleStudents.length > 0) {
                    for (const studentId of eligibleStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, { totalPoints: increment(-10) });
                    }
                }

                // 2. Delete Event
                transaction.delete(eventRef);
            });

            toast.success("تم الحذف وسحب النقاط بنجاح", { id: toastId });
            setSelectedEvent(null);
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("فشل في الحذف", { id: toastId });
        }
    };

    return (
        <div className="font-cairo space-y-6 h-full flex flex-col pb-20">
            {/* ... (Header & Sidebar remain same) ... */}

            {/* Header */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">منشئ التقارير المتقدم</h1>
                    <p className="text-gray-400 text-sm">تصدير، طباعة، وتحليل البيانات</p>
                </div>
                <button
                    onClick={generateBulkPDF}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center transition-all transform hover:scale-105"
                >
                    <Download className="ml-2" size={20} /> تقرير شامل (PDF)
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0 overflow-hidden">

                {/* Sidebar Controls */}
                <div className="md:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto custom-scrollbar">
                    <h3 className="font-bold text-white mb-4 flex items-center"><Filter size={18} className="ml-2 text-indigo-400" /> لوحة التحكم</h3>

                    {/* Tab Switcher */}
                    <div className="space-y-2 mb-8">
                        <button onClick={() => activeTab !== 'activities' && setActiveTab('activities')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'activities' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Calendar size={18} className="ml-2" /> سجل الأنشطة
                        </button>
                        <button onClick={() => activeTab !== 'students' && setActiveTab('students')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'students' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Users size={18} className="ml-2" /> قائمة الطلاب
                        </button>
                        <button onClick={() => activeTab !== 'assets' && setActiveTab('assets')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'assets' ? 'bg-amber-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Box size={18} className="ml-2" /> جرد الموارد
                        </button>
                        <button onClick={() => activeTab !== 'points' && setActiveTab('points')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'points' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20 font-bold' : 'hover:bg-white/5 text-gray-400'}`}>
                            <TrendingUp size={18} className="ml-2" /> سجلات النقاط
                        </button>
                        <button onClick={() => activeTab !== 'archive' && setActiveTab('archive')} className={`w-full p-3 rounded-xl flex items-center justify-between transition-all ${activeTab === 'archive' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'hover:bg-white/5 text-gray-400'}`}>
                            <span className="flex items-center">
                                <Archive size={18} className="ml-2" /> الأرشيف العام
                            </span>
                            {(archiveCounts.students > 0 || archiveCounts.activities > 0) && (
                                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                                    {archiveCounts.students + archiveCounts.activities}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* --- ACTIVITIES FILTERS --- */}
                    {activeTab === 'activities' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الفترة الزمنية</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="date" className="bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs"
                                        value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                                    <input type="date" className="bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs"
                                        value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                                </div>
                            </div>

                            <MultiSelect
                                label="أنواع الأنشطة"
                                placeholder="اختر الأنواع..."
                                options={eventTypes.map(t => ({ label: t.name, value: t.name }))}
                                selectedValues={selectedTypes}
                                onChange={setSelectedTypes}
                                icon={Filter}
                            />

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">المكان / Venue</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={venueFilter} onChange={e => setVenueFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="Auditorium">المسرح</option>
                                    <option value="Gym">الصالة الرياضية</option>
                                    <option value="Playground">الملعب</option>
                                    <option value="Lab">المعمل</option>
                                </select>
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <label className="block text-indigo-300 text-sm font-bold mb-2">خيارات التقرير</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showStudents ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showStudents && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={reportOptions.showStudents} onChange={e => setReportOptions({ ...reportOptions, showStudents: e.target.checked })} />
                                        <span className="text-gray-400 text-sm group-hover:text-white">إظهار قائمة الطلاب</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showAssets ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showAssets && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={reportOptions.showAssets} onChange={e => setReportOptions({ ...reportOptions, showAssets: e.target.checked })} />
                                        <span className="text-gray-400 text-sm group-hover:text-white">إظهار الموارد المستخدمة</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showCustomFields ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showCustomFields && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={reportOptions.showCustomFields} onChange={e => setReportOptions({ ...reportOptions, showCustomFields: e.target.checked })} />
                                        <span className="text-gray-400 text-sm group-hover:text-white">إظهار الحقول الخاصة</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- STUDENTS FILTERS --- */}
                    {activeTab === 'students' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الصف</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSectionFilter(''); }}>
                                    <option value="">الكل</option>
                                    {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                </select>
                            </div>

                            {gradeFilter && (
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الشعبة</label>
                                    <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                        value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                                        <option value="">الكل</option>
                                        {grades?.find(g => g.name === gradeFilter)?.sections?.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">التخصص</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={specFilter} onChange={e => setSpecFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="General">عام</option>
                                    {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">نطاق النقاط</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" placeholder="min" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-xs"
                                        value={pointsRange.min} onChange={e => setPointsRange({ ...pointsRange, min: Number(e.target.value) })} />
                                    <span className="text-gray-400">-</span>
                                    <input type="number" placeholder="max" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-xs"
                                        value={pointsRange.max} onChange={e => setPointsRange({ ...pointsRange, max: Number(e.target.value) })} />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <label className="block text-emerald-300 text-sm font-bold mb-2">خيارات التقرير</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showStudentHistory ? 'bg-emerald-600 border-emerald-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showStudentHistory && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={reportOptions.showStudentHistory}
                                            onChange={e => setReportOptions(prev => ({ ...prev, showStudentHistory: e.target.checked }))}
                                        />
                                        <span className="text-gray-300 text-sm group-hover:text-white">عرض سجل ومشاركات الطالب في الأنشطة</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ASSETS FILTERS --- */}
                    {activeTab === 'assets' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الحالة</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={assetStatusFilter} onChange={e => setAssetStatusFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="Available">متاح (Available)</option>
                                    <option value="Maintenance">صيانة (Maintenance)</option>
                                    <option value="In Use">قيد الاستخدام (In Use)</option>
                                </select>
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <label className="block text-amber-300 text-sm font-bold mb-2">خيارات التقرير</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showAssetHistory ? 'bg-amber-600 border-amber-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showAssetHistory && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={reportOptions.showAssetHistory}
                                            onChange={e => setReportOptions(prev => ({ ...prev, showAssetHistory: e.target.checked }))}
                                        />
                                        <span className="text-gray-300 text-sm group-hover:text-white">عرض سجل استخدام المورد في الأنشطة</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ARCHIVE FILTERS --- */}
                    {activeTab === 'archive' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-2 font-bold">نوع المحتوى المؤرشف</label>
                                <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                                    <button
                                        onClick={() => setArchiveSubTab('students')}
                                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                            archiveSubTab === 'students'
                                                ? 'bg-rose-600 text-white shadow'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        <Users size={14} />
                                        الطلاب ({archiveCounts.students})
                                    </button>
                                    <button
                                        onClick={() => setArchiveSubTab('activities')}
                                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                            archiveSubTab === 'activities'
                                                ? 'bg-rose-600 text-white shadow'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        <Calendar size={14} />
                                        الأنشطة ({archiveCounts.activities})
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">البحث في الأرشيف</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder={archiveSubTab === 'students' ? 'ابحث باسم الطالب أو الصف...' : 'ابحث باسم النشاط أو المكان...'}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 pr-9 text-white text-xs outline-none focus:border-rose-500"
                                        value={archiveSearchTerm}
                                        onChange={e => setArchiveSearchTerm(e.target.value)}
                                    />
                                    <Search size={14} className="absolute right-3 top-2.5 text-gray-400" />
                                    {archiveSearchTerm && (
                                        <button
                                            onClick={() => setArchiveSearchTerm('')}
                                            className="absolute left-2.5 top-2.5 text-gray-400 hover:text-white"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="pt-3 border-t border-white/10 text-xs text-gray-400 space-y-2">
                                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300">
                                    <p className="font-bold flex items-center gap-1 mb-1">
                                        <Archive size={14} /> التحكم بالأرشيف:
                                    </p>
                                    <p className="text-[11px] leading-relaxed">
                                        يمكنك استعادة أي طالب أو نشاط لإعادته فوراً للسجلات النشطة، أو حذفه نهائياً لمسح بياناته تماماً من قاعدة البيانات.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- POINTS FILTERS --- */}
                    {activeTab === 'points' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            {/* Clear All Filters Button */}
                            {isAnyPointsFilterActive && (
                                <button
                                    onClick={handleClearPointsFilters}
                                    className="w-full py-2 px-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm"
                                >
                                    <X size={14} /> إلغاء جميع الفلاتر
                                </button>
                            )}

                            {/* Smart Search */}
                            <div>
                                <label className="block text-gray-400 text-sm mb-1 font-bold">بحث ذكي في سجلات النقاط</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="ابحث بالاسم، السبب، النشاط..."
                                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pr-10 pl-3 text-white text-xs placeholder-gray-500 outline-none focus:border-amber-500 transition-colors"
                                        value={pointsSearchTerm}
                                        onChange={e => setPointsSearchTerm(e.target.value)}
                                    />
                                    <Search size={16} className="absolute right-3 top-3 text-gray-400" />
                                    {pointsSearchTerm && (
                                        <button
                                            onClick={() => setPointsSearchTerm('')}
                                            className="absolute left-3 top-2.5 text-gray-400 hover:text-white"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Date Range */}
                            <div>
                                <label className="block text-gray-400 text-sm mb-1 font-bold">النطاق الزمني</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[11px] text-gray-500 block mb-1">من:</span>
                                        <input
                                            type="date"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs outline-none focus:border-amber-500"
                                            value={pointsDateRange.start}
                                            onChange={e => setPointsDateRange({ ...pointsDateRange, start: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[11px] text-gray-500 block mb-1">إلى:</span>
                                        <input
                                            type="date"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs outline-none focus:border-amber-500"
                                            value={pointsDateRange.end}
                                            onChange={e => setPointsDateRange({ ...pointsDateRange, end: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Change Type: All / Positive / Negative */}
                            <div>
                                <label className="block text-gray-400 text-sm mb-1.5 font-bold">نوع الحركة (زيادة / خصم)</label>
                                <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-bold">
                                    <button
                                        onClick={() => setPointsChangeType('all')}
                                        className={`py-1.5 rounded-lg transition-all ${pointsChangeType === 'all' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        الكل
                                    </button>
                                    <button
                                        onClick={() => setPointsChangeType('positive')}
                                        className={`py-1.5 rounded-lg transition-all ${pointsChangeType === 'positive' ? 'bg-emerald-600 text-white' : 'text-emerald-400/70 hover:text-emerald-300'}`}
                                    >
                                        + زيادة
                                    </button>
                                    <button
                                        onClick={() => setPointsChangeType('negative')}
                                        className={`py-1.5 rounded-lg transition-all ${pointsChangeType === 'negative' ? 'bg-rose-600 text-white' : 'text-rose-400/70 hover:text-rose-300'}`}
                                    >
                                        - خصم
                                    </button>
                                </div>
                            </div>

                            {/* Action Types / Reason Categories (MultiSelect) */}
                            <div>
                                <MultiSelect
                                    label="تصنيف العملية والسبب"
                                    placeholder="اختر التصنيفات..."
                                    options={[
                                        { value: 'activity_award', label: 'نقاط اعتماد نشاط' },
                                        { value: 'activity_deduct', label: 'خصم إلغاء نشاط' },
                                        { value: 'manual_add', label: 'تعديل يدوي (زيادة)' },
                                        { value: 'manual_deduct', label: 'تعديل يدوي (خصم)' },
                                        { value: 'bulk_adjustment', label: 'تعديل جماعي للطلاب' },
                                        { value: 'link_registration', label: 'مكافأة رابط تسجيل' },
                                        { value: 'duplicate_merge', label: 'دمج سجلات مكررة' },
                                    ]}
                                    selectedValues={pointsActionTypes}
                                    onChange={setPointsActionTypes}
                                    icon={Tag}
                                />
                            </div>

                            {/* Grade Filter (MultiSelect) */}
                            <div>
                                <MultiSelect
                                    label="الصفوف الدراسية"
                                    placeholder="اختر الصفوف..."
                                    options={(grades || []).map(g => ({ value: g.name, label: g.name }))}
                                    selectedValues={pointsSelectedGrades}
                                    onChange={setPointsSelectedGrades}
                                    icon={Users}
                                />
                            </div>

                            {/* Section Filter (MultiSelect) */}
                            <div>
                                <MultiSelect
                                    label="الشعب"
                                    placeholder="اختر الشعب..."
                                    options={Array.from(new Set((grades || []).flatMap(g => (g.sections || []).map(s => s.name)))).map(s => ({ value: s, label: `شعبة ${s}` }))}
                                    selectedValues={pointsSelectedSections}
                                    onChange={setPointsSelectedSections}
                                    icon={Layers}
                                />
                            </div>

                            {/* Event Types Filter (MultiSelect) */}
                            <div>
                                <MultiSelect
                                    label="نوع النشاط المرتبط"
                                    placeholder="اختر أنواع الأنشطة..."
                                    options={(eventTypes || []).map(t => ({ value: t.name, label: t.name }))}
                                    selectedValues={pointsSelectedEventTypes}
                                    onChange={setPointsSelectedEventTypes}
                                    icon={Filter}
                                />
                            </div>

                            {/* Sorting */}
                            <div>
                                <label className="block text-gray-400 text-sm mb-1 font-bold">طريقة الترتيب</label>
                                <select
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                                    value={pointsSortBy}
                                    onChange={e => setPointsSortBy(e.target.value)}
                                >
                                    <option value="date_desc">الأحدث أولاً (تاريخ الحركة)</option>
                                    <option value="date_asc">الأقدم أولاً</option>
                                    <option value="change_desc">الأكبر زيادة (+ النقاط)</option>
                                    <option value="change_asc">الأكبر خصماً (- النقاط)</option>
                                    <option value="student_name">اسم الطالب أبجدياً</option>
                                </select>
                            </div>
                        </div>
                    )}
                    <div className="border-t border-white/10 pt-4 space-y-3">
                        <h4 className="text-gray-400 text-sm mb-2 font-bold">إجراءات سريعة</h4>

                        {activeTab === 'students' && (
                            <button
                                onClick={() => {
                                    if (!gradeFilter || !sectionFilter) {
                                        toast.error("الرجاء اختيار الصف والشعبة أولاً من شريط التصفية بالأعلى");
                                        return;
                                    }
                                    // Generate PDF for just these students
                                    // We can reuse generateBulkPDF but we need to ensure it uses the filtered data
                                    if (previewData.length === 0) {
                                        toast.error("لا يوجد طلاب في القائمة الحالية");
                                        return;
                                    }
                                    generateBulkPDF();
                                }}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow transition-all flex items-center justify-center gap-2"
                            >
                                <Printer size={18} />
                                طباعة تقرير الفصل المحدد
                            </button>
                        )}

                        <div className="relative group w-full">
                            <Menu as="div" className="relative w-full">
                                <Menu.Button className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                                    <Download size={18} />
                                    <span>تصدير البيانات</span>
                                </Menu.Button>
                                <Transition
                                    as={Fragment}
                                    enter="transition ease-out duration-100"
                                    enterFrom="transform opacity-0 scale-95"
                                    enterTo="transform opacity-100 scale-100"
                                    leave="transition ease-in duration-75"
                                    leaveFrom="transform opacity-100 scale-100"
                                    leaveTo="transform opacity-0 scale-95"
                                >
                                    <Menu.Items className="absolute left-0 right-0 bottom-full mb-2 bg-[#2a2a35] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 focus:outline-none">
                                        <Menu.Item>
                                            {({ active }) => (
                                                <button
                                                    onClick={generateBulkPDF}
                                                    className={`${active ? 'bg-indigo-600 text-white' : 'text-gray-300'
                                                        } group flex w-full items-center px-4 py-3 text-sm gap-3 transition-colors`}
                                                >
                                                    <FileText size={16} className="text-red-400" />
                                                    ملف PDF (للطباعة)
                                                </button>
                                            )}
                                        </Menu.Item>
                                        <Menu.Item>
                                            {({ active }) => (
                                                <button
                                                    onClick={handleExportExcel}
                                                    className={`${active ? 'bg-indigo-600 text-white' : 'text-gray-300'
                                                        } group flex w-full items-center px-4 py-3 text-sm gap-3 transition-colors border-t border-white/5`}
                                                >
                                                    <Table size={16} className="text-green-400" />
                                                    ملف Excel (للبيانات)
                                                </button>
                                            )}
                                        </Menu.Item>
                                    </Menu.Items>
                                </Transition>
                            </Menu>
                        </div>

                        <div className="bg-white/5 p-3 rounded-xl text-xs text-gray-400 leading-relaxed mt-4">
                            <span className="text-indigo-400 font-bold block mb-1">تلميح:</span>
                            استخدم خيارات "تصفية النتائج" في الأعلى لتخصيص محتوى التقرير قبل الطباعة.
                        </div>
                    </div>
                </div>

                {/* Live Preview */}
                <div className="md:col-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col overflow-hidden shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white flex items-center"><Printer size={18} className="ml-2 text-indigo-400" /> معاينة البيانات ({previewData.length} سجل)</h3>
                        {loading && <span className="text-indigo-400 text-sm animate-pulse flex items-center gap-2">جاري التحميل...</span>}
                    </div>

                    {/* Points Ledger KPI Summary Bar */}
                    {activeTab === 'points' && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 shrink-0">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                                <div className="text-gray-400 text-xs mb-1">إجمالي الحركات المفحوصة</div>
                                <div className="text-white font-bold font-mono text-xl">{previewData.length}</div>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                                <div className="text-emerald-300 text-xs mb-1">إجمالي النقاط الممنوحة</div>
                                <div className="text-emerald-400 font-bold font-mono text-xl">
                                    +{previewData.filter(p => (Number(p.change) || 0) > 0).reduce((sum, p) => sum + Number(p.change), 0)} ن
                                </div>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                                <div className="text-rose-300 text-xs mb-1">إجمالي النقاط المخصومة</div>
                                <div className="text-rose-400 font-bold font-mono text-xl">
                                    -{previewData.filter(p => (Number(p.change) || 0) < 0).reduce((sum, p) => sum + Math.abs(Number(p.change)), 0)} ن
                                </div>
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                                <div className="text-amber-300 text-xs mb-1">صافي حركة النقاط</div>
                                <div className="text-amber-400 font-bold font-mono text-xl">
                                    {previewData.reduce((sum, p) => sum + (Number(p.change) || 0), 0) > 0 ? '+' : ''}
                                    {previewData.reduce((sum, p) => sum + (Number(p.change) || 0), 0)} ن
                                </div>
                            </div>
                        </div>
                    )}
 
                    {/* Points Permissions Required Banner */}
                    {activeTab === 'points' && pointsPermissionNeeded && (
                        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 animate-fade-in">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                                    <AlertCircle size={22} />
                                </div>
                                <div>
                                    <div className="font-bold text-white text-sm">مطلوب تفعيل صلاحيات سجلات النقاط في Firebase Console</div>
                                    <div className="text-xs text-amber-200/80 mt-0.5">
                                        تحتاج مجموعة <code>points_logs</code> إلى النشر في قواعد الأمان لتفعيل قراءة وحفظ السجلات فورياً.
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowRulesGuideModal(true)}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shrink-0 flex items-center gap-1.5"
                            >
                                <Copy size={14} /> عرض القواعد وطريقة التفعيل
                            </button>
                        </div>
                    )}

                    {/* Mobile Horizontal Scroll Indicator (Option 3-A) */}
                    <div className="md:hidden flex items-center justify-between px-3 py-1.5 mb-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span>💡 اسحب الجدول لليسار لمعاينة بقية الأعمدة</span>
                        </span>
                        <span className="animate-pulse font-bold text-sm">⟵</span>
                    </div>

                    {/* Selected Rows Action Banner */}
                    {selectedReportRowIds.length > 0 && (
                        <div className="flex items-center justify-between p-3 mb-3 bg-indigo-600/20 border border-indigo-500/40 rounded-xl text-white text-xs animate-fade-in shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="font-bold">تم تحديد {selectedReportRowIds.length} سجل من أصل {previewData.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsPrintModalOpen(true)}
                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow transition-all"
                                >
                                    <Printer size={14} /> طباعة السجلات المحددة
                                </button>
                                <button
                                    onClick={() => setSelectedReportRowIds([])}
                                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-gray-300 rounded-lg font-medium transition-all"
                                >
                                    إلغاء التحديد
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5 relative">
                        {/* Edge fade indicator on mobile */}
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/40 to-transparent z-20 md:hidden" />
                        <table className="w-full min-w-[700px] text-right text-sm">
                            <thead className="bg-[#1a1a20] text-gray-400 sticky top-0 backdrop-blur-md shadow-md z-10">
                                <tr>
                                    <th className="p-4 w-12 text-center">
                                        <input
                                            type="checkbox"
                                            checked={previewData.length > 0 && previewData.every(r => selectedReportRowIds.includes(r.id || r.name))}
                                            onChange={toggleSelectAllReportRows}
                                            className="w-4 h-4 rounded text-indigo-600 bg-white/10 border-white/20 focus:ring-0 cursor-pointer"
                                            title="تحديد كل السجلات المعروضة"
                                        />
                                    </th>
                                    {activeTab === 'activities' && (
                                        <>
                                            <th className="p-4">النشاط</th>
                                            <th className="p-4">التاريخ</th>
                                            <th className="p-4">المكان</th>
                                            <th className="p-4">الحالة</th>
                                            <th className="p-4 text-center">عدد الطلاب</th>
                                            <th className="p-4 text-center">إجراءات</th>
                                            <th className="p-4"></th>
                                        </>
                                    )}
                                    {activeTab === 'students' && (
                                        <>
                                            <th className="p-4">#</th>
                                            <th className="p-4">الطالب</th>
                                            <th className="p-4">التخصصات</th>
                                            <th className="p-4">الفصل</th>
                                            <th className="p-4">النقاط</th>
                                        </>
                                    )}
                                    {activeTab === 'assets' && (
                                        <>
                                            <th className="p-4">المورد</th>
                                            <th className="p-4">النوع</th>
                                            <th className="p-4">الحالة الحالية</th>
                                        </>
                                    )}
                                    {activeTab === 'points' && (
                                        <>
                                            <th className="p-4">#</th>
                                            <th className="p-4">الطالب</th>
                                            <th className="p-4">الصف / الشعبة</th>
                                            <th className="p-4">سبب الحركة / النشاط</th>
                                            <th className="p-4 text-center">التصنيف</th>
                                            <th className="p-4 text-center">التغيير</th>
                                            <th className="p-4 text-center">الرصيد بعد</th>
                                            <th className="p-4">المنفّذ</th>
                                            <th className="p-4">التاريخ والوقت</th>
                                        </>
                                    )}
                                    {activeTab === 'archive' && archiveSubTab === 'students' && (
                                        <>
                                            <th className="p-4">#</th>
                                            <th className="p-4">اسم الطالب</th>
                                            <th className="p-4">الصف / الشعبة</th>
                                            <th className="p-4">النقاط السابقة</th>
                                            <th className="p-4">التخصصات</th>
                                            <th className="p-4 text-center">خيارات الأرشيف</th>
                                        </>
                                    )}
                                    {activeTab === 'archive' && archiveSubTab === 'activities' && (
                                        <>
                                            <th className="p-4">النشاط</th>
                                            <th className="p-4">التاريخ</th>
                                            <th className="p-4">المكان</th>
                                            <th className="p-4 text-center">عدد الطلاب</th>
                                            <th className="p-4 text-center">خيارات الأرشيف</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="text-gray-300 divide-y divide-white/5">
                                {previewData.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={activeTab === 'points' ? 10 : (activeTab === 'archive' ? (archiveSubTab === 'students' ? 7 : 6) : (activeTab === 'activities' ? 8 : (activeTab === 'students' ? 6 : 4)))}
                                            className="p-12 text-center text-gray-400"
                                        >
                                            {activeTab === 'archive' ? 'لا توجد عناصر مؤرشفة حالياً' : 'لا توجد بيانات للعرض حالياً'}
                                        </td>
                                    </tr>
                                ) : (
                                    previewData.map((row, idx) => (
                                    <Fragment key={row.id || idx}>
                                        <tr
                                            onClick={() => (activeTab === 'activities' || (activeTab === 'archive' && archiveSubTab === 'activities')) && setSelectedEvent(row)}
                                            className={`hover:bg-white/5 transition-colors ${(activeTab === 'activities' || (activeTab === 'archive' && archiveSubTab === 'activities')) ? 'cursor-pointer' : ''} ${selectedReportRowIds.includes(row.id || row.name) ? 'bg-indigo-600/10' : ''}`}
                                        >
                                            <td className="p-4 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedReportRowIds.includes(row.id || row.name)}
                                                    onChange={() => toggleSelectReportRow(row.id || row.name)}
                                                    className="w-4 h-4 rounded text-indigo-600 bg-white/10 border-white/20 focus:ring-0 cursor-pointer"
                                                />
                                            </td>
                                            {activeTab === 'activities' && (
                                                <>
                                                    <td className="p-4 font-bold text-white max-w-[150px] truncate flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                        {row.title}
                                                    </td>
                                                    <td className="p-4 text-gray-400">
                                                        <div className="text-white">{row.formattedDate}</div>
                                                        <div className="text-xs opacity-60">{row.time}</div>
                                                    </td>
                                                    <td className="p-4">{row.venue}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${row.status === 'مكتمل' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="bg-white/10 px-2 py-1 rounded-md text-white font-mono">{row.studentsCount}</span>
                                                    </td>
                                                    <td className="p-4 flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(row); }}
                                                            aria-label="تعديل النشاط"
                                                            className="p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-all"
                                                            title="تعديل النشاط"
                                                        >
                                                            <Pen size={16} />
                                                        </button>
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        <button aria-label="عرض التفاصيل" className="text-indigo-400 hover:text-white p-1"><Eye size={16} /></button>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'students' && (
                                                <>
                                                    <td className="p-4 text-gray-400">{idx + 1}</td>
                                                    <td className="p-4 font-bold text-white">{row.name}</td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {row.specializations && row.specializations.length > 0 ? (
                                                                row.specializations.map((spec, i) => (
                                                                    <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${spec === 'General' ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-indigo-900/50 text-indigo-300 border-indigo-500/30'}`}>
                                                                        {spec === 'General' ? 'عام' : spec}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-600 text-xs">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">{(row.grade && row.section) ? `${row.grade} - ${row.section}` : (row.class || row.grade || '-')}</td>
                                                    <td className="p-4 font-bold text-emerald-400">{row.points}</td>
                                                </>
                                            )}
                                            {activeTab === 'assets' && (
                                                <>
                                                    <td className="p-4 font-bold text-white">{row.name}</td>
                                                    <td className="p-4">{row.type}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs ${row.status === 'Available' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'points' && (
                                                <>
                                                    <td className="p-4 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                                    <td className="p-4 font-bold text-white">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow">
                                                                {row.studentName?.charAt(0) || 'ط'}
                                                            </div>
                                                            <div>
                                                                <div>{row.studentName}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-gray-300 text-xs">
                                                        {row.class || (row.grade ? `${row.grade} - ${row.section}` : '-')}
                                                    </td>
                                                    <td className="p-4 text-gray-200">
                                                        <div className="font-medium">{row.reason}</div>
                                                        {row.eventTitle && (
                                                            <div className="text-xs text-amber-300/80 mt-0.5 flex items-center gap-1">
                                                                <span>📌 {row.eventTitle}</span>
                                                                {row.eventType && <span className="text-[10px] text-gray-400">({row.eventType})</span>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                            row.actionType === 'activity_award' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                                                            row.actionType === 'activity_deduct' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' :
                                                            row.actionType === 'bulk_adjustment' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                                                            row.actionType === 'link_registration' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                                                            'bg-white/5 text-gray-300 border-white/10'
                                                        }`}>
                                                            {row.actionType === 'activity_award' ? 'اعتماد نشاط' :
                                                             row.actionType === 'activity_deduct' ? 'إلغاء نشاط' :
                                                             row.actionType === 'bulk_adjustment' ? 'تعديل جماعي' :
                                                             row.actionType === 'link_registration' ? 'رابط تسجيل' :
                                                             row.actionType === 'duplicate_merge' ? 'دمج مكرر' : 'تعديل يدوي'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center font-bold font-mono">
                                                        <span className={`inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full text-xs ${
                                                            row.change > 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                                        }`}>
                                                            {row.change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                                                            {row.change > 0 ? `+${row.change}` : row.change} ن
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center font-bold font-mono text-amber-400">
                                                        {row.newTotalPoints}
                                                    </td>
                                                    <td className="p-4 text-gray-400 text-xs">
                                                        {row.performedBy || 'النظام'}
                                                    </td>
                                                    <td className="p-4 text-gray-400 text-xs">
                                                        <div className="text-white">{row.date}</div>
                                                        <div className="text-[11px] opacity-60">{row.time}</div>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'archive' && archiveSubTab === 'students' && (
                                                <>
                                                    <td className="p-4 text-gray-400">{idx + 1}</td>
                                                    <td className="p-4 font-bold text-white flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-xs font-bold text-rose-400 shrink-0">
                                                            {row.name?.charAt(0) || 'ط'}
                                                        </div>
                                                        <div>
                                                            <div>{row.name}</div>
                                                            <div className="text-[11px] text-gray-500 font-mono">#{row.id.slice(0, 6)}</div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-gray-300">
                                                        {row.class || (row.grade ? `${row.grade} - ${row.section}` : '-')}
                                                    </td>
                                                    <td className="p-4 font-bold text-amber-400">{row.points || 0}</td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(row.specializations || []).length > 0 ? (
                                                                row.specializations.map((sp, i) => (
                                                                    <span key={i} className="bg-white/5 text-gray-400 text-xs px-2 py-0.5 rounded">
                                                                        {sp === 'General' ? 'عام' : sp}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-500 text-xs">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRestoreStudent(row); }}
                                                                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                                                title="استعادة الطالب للسجلات النشطة"
                                                            >
                                                                <RefreshCw size={14} />
                                                                استعادة
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handlePermanentDeleteStudent(row); }}
                                                                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                                                title="حذف نهائي من قاعدة البيانات"
                                                            >
                                                                <Trash2 size={14} />
                                                                حذف نهائي
                                                            </button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'archive' && archiveSubTab === 'activities' && (
                                                <>
                                                    <td className="p-4 font-bold text-white max-w-[180px] truncate flex items-center gap-2">
                                                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></div>
                                                        <div>
                                                            <div>{row.title}</div>
                                                            <span className="text-[11px] text-gray-500">{row.type}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-gray-400">
                                                        <div className="text-white">{row.formattedDate || row.date}</div>
                                                        <div className="text-xs opacity-60">{row.time}</div>
                                                    </td>
                                                    <td className="p-4 text-gray-300">{row.venue}</td>
                                                    <td className="p-4 text-center">
                                                        <span className="bg-white/10 px-2.5 py-1 rounded-md text-white font-mono text-xs">{row.studentsCount}</span>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(row); }}
                                                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                                title="معاينة التفاصيل"
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleRestoreArchivedEvent(row); }}
                                                                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                                                title="استعادة النشاط"
                                                            >
                                                                <RefreshCw size={14} />
                                                                استعادة
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handlePermanentDeleteArchivedEvent(row); }}
                                                                className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                                                                title="حذف نهائي للنشاط وسحب النقاط"
                                                            >
                                                                <Trash2 size={14} />
                                                                حذف نهائي
                                                            </button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </tr>

                                        {/* STUDENT PARTICIPATION HISTORY ROW */}
                                        {activeTab === 'students' && reportOptions.showStudentHistory && (() => {
                                            const studentHistory = studentParticipationMap[row.id] || studentParticipationMap[row.name] || [];
                                            return (
                                                <tr className="bg-black/30 border-b border-white/5">
                                                    <td colSpan={6} className="p-4 pt-1 pr-10">
                                                        <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2">
                                                            <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                                                                <Calendar size={14} />
                                                                <span>الأنشطة التي شارك فيها ({studentHistory.length}):</span>
                                                            </div>
                                                            {studentHistory.length > 0 ? (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                    {studentHistory.map(act => (
                                                                        <div key={act.id} className="bg-black/40 p-2.5 rounded-lg border border-white/5 text-xs flex justify-between items-center">
                                                                            <div>
                                                                                <div className="text-white font-medium">{act.title}</div>
                                                                                <div className="text-gray-400 text-[10px] mt-0.5">{act.formattedDate} • {act.venue}</div>
                                                                            </div>
                                                                            <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
                                                                                +{act.points} ن
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-gray-400 text-xs italic">لا توجد مشاركات مسجلة لهذا الطالب حتى الآن</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}

                                        {/* ASSET USAGE HISTORY ROW */}
                                        {activeTab === 'assets' && reportOptions.showAssetHistory && (() => {
                                            const assetHistory = assetUsageMap[row.id] || assetUsageMap[row.name] || [];
                                            return (
                                                <tr className="bg-black/30 border-b border-white/5">
                                                    <td colSpan={4} className="p-4 pt-1 pr-10">
                                                        <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2">
                                                            <div className="text-xs font-bold text-amber-400 flex items-center gap-2">
                                                                <Box size={14} />
                                                                <span>الأنشطة التي استُخدم فيها هذا المورد ({assetHistory.length}):</span>
                                                            </div>
                                                            {assetHistory.length > 0 ? (
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                    {assetHistory.map(act => (
                                                                        <div key={act.id} className="bg-black/40 p-2.5 rounded-lg border border-white/5 text-xs flex justify-between items-center">
                                                                            <div>
                                                                                <div className="text-white font-medium">{act.title}</div>
                                                                                <div className="text-gray-400 text-[10px] mt-0.5">{act.formattedDate} • {act.venue}</div>
                                                                            </div>
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${act.rawStatus === 'Done' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-300'}`}>
                                                                                {act.status}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-gray-400 text-xs italic">لم يتم استخدام هذا المورد في أي نشاط مسجل حتى الآن</p>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                    </Fragment>
                                ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- Event Details Modal (Bottom Sheet on Mobile - Option 2-A) --- */}
            {
                selectedEvent && (
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[#1a1a20] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden">
                            {/* Mobile Pull Handle */}
                            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-2.5 sm:hidden shrink-0" />

                            {/* Modal Header */}
                            <div className="p-4 sm:p-6 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-bold text-white">{selectedEvent.title}</h2>
                                    <p className="text-indigo-300 text-xs mt-1">{selectedEvent.type}</p>
                                </div>
                                <button onClick={() => setSelectedEvent(null)} aria-label="إغلاق التفاصيل" className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-all"><X size={20} /></button>
                            </div>

                            {/* VISIBLE MODAL CONTENT */}
                            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-6 bg-[#1a1a20] flex-1">
                                {/* Key Details Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">التاريخ</div>
                                        <div className="text-white font-bold text-sm">{selectedEvent.formattedDate}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">الوقت</div>
                                        <div className="text-white font-bold text-sm">{selectedEvent.time}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">المكان</div>
                                        <div className="text-white font-bold text-sm truncate">{selectedEvent.venue}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">الحالة</div>
                                        <div className={`text-xs font-bold px-2 py-1 rounded inline-block mt-1 ${selectedEvent.status === 'مكتمل' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {selectedEvent.status}
                                        </div>
                                    </div>
                                </div>
                                {/* Students List */}
                                <div>
                                    <h3 className="text-white font-bold mb-3 flex items-center justify-between">
                                        <span className="flex items-center"><Users size={16} className="ml-2 text-emerald-400" /> الطلاب المشاركون ({selectedEvent.studentsCount})</span>
                                    </h3>
                                    <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                                        {selectedEvent.studentNames.length > 0 ? (
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                                                {sortStudentsArabic(selectedEvent.studentNames).map((s, idx) => (
                                                    <div key={idx} className="p-3 text-sm text-gray-300 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-white/5 gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-6 text-center text-gray-400 text-xs">{idx + 1}</span>
                                                            <span className="text-white font-medium">{s.name}</span>
                                                            {(s.grade || s.section) && (
                                                                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400">
                                                                    {s.grade} - {s.section}
                                                                </span>
                                                            )}
                                                            <span className="text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold px-2 py-0.5 rounded">
                                                                +{getStudentActivityPoints(selectedEvent, s.id, singleEventPointsMap)} ن
                                                            </span>
                                                        </div>
                                                        {(() => {
                                                            const pDetails = selectedEvent.participantDetails?.[s.id] || {};
                                                            const detailEntries = Object.entries(pDetails);
                                                            if (detailEntries.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1.5 mr-9 sm:mr-0">
                                                                    {detailEntries.map(([k, v], dIdx) => (
                                                                        <span key={dIdx} className="text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
                                                                            <span className="opacity-70 font-semibold">{k}:</span>
                                                                            <span className="font-bold">{v}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center text-gray-400 text-sm">لم يتم تسجيل أي طلاب في هذا النشاط</div>
                                        )}
                                    </div>
                                </div>

                                {/* Assets Used */}
                                <div>
                                    <h3 className="text-white font-bold mb-3 flex items-center justify-between">
                                        <span className="flex items-center"><Box size={16} className="ml-2 text-amber-400" /> الموارد والأدوات المستخدمة ({selectedEvent.assets?.length || 0})</span>
                                    </h3>
                                    <div className="bg-black/20 rounded-xl border border-white/5 p-4">
                                        {selectedEvent.assets && selectedEvent.assets.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {selectedEvent.assets.map((assetIdOrName, idx) => {
                                                    const name = assetMap[assetIdOrName] || assetIdOrName;
                                                    return (
                                                        <span key={idx} className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium">
                                                            <Box size={13} className="text-amber-400" />
                                                            {name}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-4 text-center text-gray-400 text-sm">لا توجد موارد أو أدوات مسجلة لهذا النشاط</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer - Sticky on Mobile */}
                            <div className="p-4 sm:p-6 border-t border-white/10 bg-[#141418] sticky bottom-0 z-20 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
                                <span className="text-gray-400 text-xs hidden md:block">رقم المعرف: <span className="font-mono select-all">{selectedEvent.id}</span></span>

                                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto">

                                    {/* ARCHIVE CONTROLS */}
                                    {selectedEvent.rawStatus === 'archived' && (
                                        <>
                                            <button
                                                onClick={handleForceDelete}
                                                className="px-3.5 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-xl font-bold flex items-center transition-all text-xs sm:text-sm"
                                            >
                                                <Trash2 size={16} className="ml-1.5" /> حذف
                                            </button>
                                            <button
                                                onClick={handleRestore}
                                                className="px-3.5 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-xl font-bold flex items-center transition-all text-xs sm:text-sm"
                                            >
                                                <RefreshCw size={16} className="ml-1.5" /> استعادة
                                            </button>
                                            <div className="hidden md:block w-px h-8 bg-gray-700 mx-1"></div>
                                        </>
                                    )}

                                    <PrintControls event={selectedEvent} onPrint={openSingleEventPrintModal} />

                                    <button
                                        onClick={() => setSelectedEvent(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl text-xs sm:text-sm transition-colors border border-white/5"
                                    >
                                        إغلاق
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            <EventModal
                key={editEventData?.id || 'new-modal'}
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                initialData={editEventData}
                onSave={handleSaveEditedEvent}
                onDelete={handleDeleteEvent}
                eventTypes={eventTypes}
                activeProfile={activeProfile}
            />

            {/* Rules Guide Modal */}
            {showRulesGuideModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" dir="rtl">
                    <div className="bg-[#121218] border border-amber-500/30 rounded-2xl max-w-2xl w-full p-6 text-right shadow-2xl relative max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center pb-4 border-b border-white/10">
                            <div className="flex items-center gap-2">
                                <Sparkles className="text-amber-400" size={20} />
                                <h3 className="text-lg font-bold text-white">تفعيل صلاحيات سجلات النقاط في Firebase</h3>
                            </div>
                            <button onClick={() => setShowRulesGuideModal(false)} className="text-gray-400 hover:text-white p-1 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="py-4 space-y-4 overflow-y-auto flex-1 text-sm text-gray-300 custom-scrollbar">
                            <p className="leading-relaxed text-xs sm:text-sm text-gray-300">
                                لحماية بياناتك، يتطلب Firebase تعريف كل مجموعة جديدة في قواعد الأمان (Rules). لتفعيل حفظ وقراءة سجلات حركات النقاط لجميع الطلاب، اتبع الخطوات البسيطة التالية (أقل من دقيقة):
                            </p>

                            <div className="space-y-2.5 bg-white/5 p-4 rounded-xl border border-white/10 text-xs">
                                <div className="flex items-start gap-2.5">
                                    <span className="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">1</span>
                                    <span>اضغط على زر <strong>نسخ القواعد</strong> بالأسفل لنسخ القواعد كاملة ومحدثة.</span>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <span className="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">2</span>
                                    <span>
                                        افتح صفحة قواعد Firebase Console مباشرة:
                                        <a
                                            href="https://console.firebase.google.com/project/school-activity-manageme-7c78f/firestore/rules"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-indigo-400 hover:underline mx-1 font-bold inline-flex items-center gap-1"
                                        >
                                            فتح قواعد المشروع في Firebase <ExternalLink size={12} />
                                        </a>
                                    </span>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <span className="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">3</span>
                                    <span>حدد النص بالكامل (Ctrl+A) واستبدله بالنص المنسوخ، ثم اضغط زر <strong>Publish (نشر)</strong>.</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-mono text-gray-400">قواعد الأمان المحدثة (جاهزة للنسخ):</span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(FIREBASE_RULES_SNIPPET);
                                            toast.success("تم نسخ القواعد بنجاح!");
                                        }}
                                        className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow"
                                    >
                                        <Copy size={13} /> نسخ القواعد
                                    </button>
                                </div>
                                <pre className="bg-black/60 p-3 rounded-xl border border-white/10 text-[11px] font-mono text-emerald-400 overflow-x-auto text-left max-h-48 custom-scrollbar select-all" dir="ltr">
                                    {FIREBASE_RULES_SNIPPET}
                                </pre>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                            <button
                                onClick={() => {
                                    setShowRulesGuideModal(false);
                                    fetchData();
                                }}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2"
                            >
                                <RefreshCw size={14} /> تم النشر - فحص السجلات الآن
                            </button>
                            <button
                                onClick={() => setShowRulesGuideModal(false)}
                                className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-gray-300 rounded-xl text-xs"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Universal Advanced Print Modal */}
            <AdvancedPrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                title={`خيارات طباعة ${activeTab === 'activities' ? 'سجل الأنشطة' : activeTab === 'students' ? 'قائمة الطلاب' : activeTab === 'assets' ? 'جرد الموارد' : activeTab === 'points' ? 'سجل النقاط' : 'الأرشيف'}`}
                reportType={`reports_${activeTab}_${activeTab === 'archive' ? archiveSubTab : ''}`}
                availableColumns={getReportColumnsDefinition(activeTab, archiveSubTab)}
                totalRecordsCount={previewData.length}
                selectedRecordsCount={selectedReportRowIds.length}
                hasSelectionSupport={true}
                initialCustomTitle={
                    activeTab === 'students' && gradeFilter
                        ? `تقرير طلاب ${gradeFilter}${sectionFilter ? ` - ${sectionFilter}` : ''}`
                        : ''
                }
                sortOptions={
                    (activeTab === 'students' || (activeTab === 'archive' && archiveSubTab === 'students'))
                        ? STUDENT_SORT_OPTIONS('النقاط المملوكة')
                        : activeTab === 'points'
                            ? STUDENT_SORT_OPTIONS('قيمة التغيير')
                            : (activeTab === 'activities' || (activeTab === 'archive' && archiveSubTab === 'activities'))
                                ? STUDENT_SORT_OPTIONS('النقاط المكتسبة')
                                : []
                }
                onPrint={handleExecuteAdvancedPrint}
            />

            {/* Dedicated Single Activity Advanced Print Modal */}
            <AdvancedPrintModal
                isOpen={isSingleEventPrintModalOpen}
                onClose={() => setIsSingleEventPrintModalOpen(false)}
                title={`خيارات طباعة تقرير: ${singleEventPrintEvent?.title || selectedEvent?.title || 'النشاط'}`}
                reportType="single_event_report"
                availableColumns={singleEventPrintColumnsDefinition}
                totalRecordsCount={(singleEventPrintEvent?.studentNames || selectedEvent?.studentNames || []).length}
                hasSelectionSupport={false}
                initialCustomTitle={singleEventPrintEvent?.title ? `تقرير نشاط: ${singleEventPrintEvent.title}` : 'تقرير النشاط الطلابي'}
                initialSignatures={[
                    { role: 'المشرف على النشاط', name: 'أ. ________________' },
                    { role: 'رائد النشاط الطلابي', name: 'أ. ________________' },
                    { role: 'مدير المدرسة', name: 'أ. ________________' }
                ]}
                sortOptions={STUDENT_SORT_OPTIONS('النقاط المكتسبة')}
                extraToggles={[
                    { id: 'activityCustomFields', label: 'الحقول المخصصة للنشاط (عنوان الإذاعة، المعد...)', defaultValue: true }
                ]}
                onPrint={handleExecuteSingleEventPrint}
            />
        </div>
    );
}

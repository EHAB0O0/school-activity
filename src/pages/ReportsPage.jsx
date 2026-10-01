import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, runTransaction, increment } from 'firebase/firestore';

import { FileText, Download, Calendar, Users, Box, Filter, Printer, Search, X, Eye, Trash2, RefreshCw, Pen, Hash, Table, Archive, RotateCcw, TrendingUp, ArrowUpRight, ArrowDownLeft, Layers, Sparkles } from 'lucide-react';
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
    const [theme, setTheme] = useState('light'); // Default to Ink Saver (Light)

    return (
        <div className="flex items-center gap-3">
            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                <button
                    onClick={() => setTheme('light')}
                    className={`p-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="وضع الطباعة (توفير الحبر)"
                >
                    <FileText size={16} /> {/* Using FileText as proxy for 'Document/White' look */}
                </button>
                <button
                    onClick={() => setTheme('dark')}
                    className={`p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="الوضع الليلي (كما في الشاشة)"
                >
                    <Box size={16} /> {/* Using Box as proxy for 'Dark/Screen' look */}
                </button>
            </div>

            <button
                onClick={() => onPrint(event, theme)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Printer size={16} className="ml-2" /> طباعة ({theme === 'light' ? 'عادي' : 'ليلي'})
            </button>
        </div>
    );
};

import { useSettings } from '../contexts/SettingsContext';

export default function ReportsPage() {
    const location = useLocation();
    const { grades, eventTypes, activeProfile } = useSettings(); // Use Global Grades
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

    const [assetMap, setAssetMap] = useState({});
    const [studentParticipationMap, setStudentParticipationMap] = useState({});
    const [assetUsageMap, setAssetUsageMap] = useState({});

    // Helper to build participation and asset usage histories
    const buildHistoryMaps = (eventDocs, sMap = studentMap, aMap = assetMap) => {
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
                        uMap[aName].push(ev);
                    }
                });
            }
        });

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

            buildHistoryMaps(eDocs, sMap, aMap);
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
                buildHistoryMaps(snap.docs);
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
                        studentsCount: participatingStudents.length,
                        studentNames: participatingStudents, // Now Array of Objects {name, grade, section}
                        type: pd.typeName || 'عام',
                        typeId: pd.typeId,
                        assets: pd.assets?.map(id => assetMap[id] || id) || [], // Map ID to Name
                        customData: pd.customData || {},
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
                                studentsCount: participatingStudents.length,
                                studentNames: participatingStudents,
                                type: pd.typeName || 'عام',
                                typeId: pd.typeId,
                                assets: pd.assets?.map(id => assetMap[id] || id) || [],
                                customData: pd.customData || {},
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
                        console.warn("Points logs collection empty or inaccessible:", fallbackErr);
                        data = [];
                    }
                }
            }
            setRawData(data);
        } catch (error) {
            console.error(error);
            toast.error("فشل تحميل البيانات");
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
                const row = {
                    "م": i + 1,
                    "الاسم": s.name,
                    "الصف": s.grade || '',
                    "الشعبة": s.section || '',
                    "الفصل": (s.grade && s.section) ? `${s.grade} - ${s.section}` : (s.class || ''),
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
                exportData = previewData.map((s, i) => ({
                    "م": i + 1,
                    "اسم الطالب": s.name,
                    "الصف": s.grade || '',
                    "الشعبة": s.section || '',
                    "الفصل": (s.grade && s.section) ? `${s.grade} - ${s.section}` : (s.class || ''),
                    "النقاط السابقة": s.points || 0,
                    "التخصصات": (s.specializations || []).join('، ') || '-'
                }));
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
            exportData = previewData.map((p, i) => ({
                "م": i + 1,
                "اسم الطالب": p.studentName,
                "الصف": p.grade || '',
                "الشعبة": p.section || '',
                "الفصل": (p.grade && p.section) ? `${p.grade} - ${p.section}` : (p.class || ''),
                "نوع الحركة": p.change > 0 ? `+${p.change} (إضافة)` : `${p.change} (خصم)`,
                "التغيير": p.change,
                "الرصيد السابق": p.previousTotalPoints,
                "الرصيد الجديد": p.newTotalPoints,
                "سبب الحركة": p.reason,
                "النشاط المرتبط": p.eventTitle || '-',
                "نوع النشاط": p.eventType || '-',
                "المنفّذ": p.performedBy || 'النظام',
                "التاريخ والوقت": p.formattedDate || p.date
            }));
        }

        // 2. Create Workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData, { rtl: true });

        // Auto-width columns
        const wscols = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "تقرير");

        // 3. Download
        const fileName = `Export_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success("تم تصدير ملف Excel بنجاح");
    };

    // --- Bulk PDF (Refactored for Arabic Support via Iframe Isolation) ---
    const generateBulkPDF = async () => {
        const toastId = toast.loading('جاري تحضير التقرير الشامل...');
        try {
            // 1. Create a hidden Iframe
            const iframe = document.createElement('iframe');
            iframe.style.left = '0';
            iframe.style.width = '1200px'; // Wider for table
            iframe.style.height = 'auto'; // Allow full height
            iframe.style.position = 'absolute'; // Use absolute to allow expansion
            iframe.style.visibility = 'hidden'; // Hide visual but keep render
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();

            // 2. Prepare Table Content Validation
            const titleMap = {
                'activities': 'سجل الأنشطة المدرسي',
                'students': 'قائمة الطلاب المتميزين',
                'assets': 'جرد الموارد والمعدات',
                'points': 'سجل حركات نقاط التميز للطلاب'
            };
            let pageTitle = titleMap[activeTab] || 'تقرير شامل';

            // Dynamic Title overrides
            if (activeTab === 'students' && gradeFilter) {
                pageTitle = `تقرير طلاب ${gradeFilter}`;
                if (sectionFilter) pageTitle += ` - ${sectionFilter}`;
            }
            if (activeTab === 'activities' && venueFilter !== 'All') {
                const vLabel = getVenueLabel(venueFilter);
                pageTitle = `تقرير أنشطة (مخصص): ${vLabel}`;
            }

            const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

            let tableHeader = '';
            let tableRowsHtml = '';

            if (activeTab === 'activities') {
                tableHeader = `
                    <tr>
                        <th style="width: 30%">النشاط</th>
                        <th style="width: 20%">التاريخ</th>
                        <th style="width: 15%">المكان</th>
                        <th style="width: 15%">الحالة</th>
                        <th style="width: 10%">الطلاب</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map(item => {
                    const mainRow = `
                        <tr>
                            <td class="bold">${item.title}</td>
                            <td class="dim">${item.formattedDate || item.date}</td>
                            <td>${item.venue}</td>
                            <td>
                                <span class="badge ${item.status === 'مكتمل' ? 'success' : 'neutral'}">
                                    ${item.status}
                                </span>
                            </td>
                            <td class="center">${item.studentsCount}</td>
                        </tr>
                    `;

                    let detailsRow = '';
                    let detailsContent = '';

                    // 1. Students (Grouped by Class)
                    if (reportOptions.showStudents && item.studentNames && item.studentNames.length > 0) {
                        // Group by Class
                        const studentsByClass = item.studentNames.reduce((acc, s) => {
                            const className = (s.grade && s.section) ? `${s.grade} - ${s.section}` : (s.grade || 'أخرى');
                            if (!acc[className]) acc[className] = [];
                            acc[className].push(s);
                            return acc;
                        }, {});

                        let groupsHtml = '';
                        Object.entries(studentsByClass).forEach(([cls, studentsInClass]) => {
                            const tags = studentsInClass.map(s => {
                                const pDetails = item.participantDetails?.[s.id] || {};
                                const detailEntries = Object.entries(pDetails);
                                const detailsBadge = detailEntries.length > 0
                                    ? `<span style="margin-right: 5px; color: #059669; font-weight: bold; font-size: 10px;">(${detailEntries.map(([k, v]) => `${k}: ${v}`).join(' | ')})</span>`
                                    : '';
                                return `<span class="student-tag">${s.name}${detailsBadge}</span>`;
                            }).join('');
                            groupsHtml += `
                                <div class="class-group">
                                    <div class="class-header">${cls} (${studentsInClass.length})</div>
                                    <div class="tags-container">${tags}</div>
                                </div>
                             `;
                        });

                        detailsContent += `
                            <div class="details-section">
                                <div class="details-title">الطلاب المشاركون (${item.studentNames.length}):</div>
                                ${groupsHtml}
                            </div>
                        `;
                    }

                    // 2. Assets (mapped to human-readable names)
                    if (reportOptions.showAssets && item.assets && item.assets.length > 0) {
                        const assetTags = item.assets.map(a => {
                            const name = assetMap[a] || a;
                            return `<span class="asset-tag">${name}</span>`;
                        }).join('');
                        detailsContent += `
                            <div class="details-section">
                                <div class="details-title">الموارد المستخدمة (${item.assets.length}):</div>
                                <div class="tags-container">${assetTags}</div>
                            </div>
                         `;
                    }

                    // 3. Custom Fields
                    if (reportOptions.showCustomFields && item.customData && Object.keys(item.customData).length > 0) {
                        const fieldTags = Object.entries(item.customData).map(([key, val]) =>
                            `<div class="field-item"><strong>${key}:</strong> ${val}</div>`
                        ).join('');

                        detailsContent += `
                            <div class="details-section">
                                <div class="details-title">بيانات إضافية:</div>
                                <div class="fields-container">${fieldTags}</div>
                            </div>
                        `;
                    }

                    if (detailsContent) {
                        detailsRow = `
                            <tr class="details-row">
                                <td colspan="5">
                                    <div class="details-box">
                                        ${detailsContent}
                                    </div>
                                </td>
                            </tr>
                         `;
                    }

                    return mainRow + detailsRow;
                }).join('');

            } else if (activeTab === 'students') {
                tableHeader = `
                    <tr>
                        <th style="width: 5%">#</th>
                        <th style="width: 35%">اسم الطالب</th>
                        <th style="width: 25%">التخصصات</th>
                        <th style="width: 20%">الصف والشعبة</th>
                        <th style="width: 15%">النقاط</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map((item, i) => {
                    const specs = item.specializations && item.specializations.length > 0
                        ? item.specializations.map(s => s === 'General' ? 'عام' : s).join(', ')
                        : '-';
                    const className = (item.grade && item.section) ? `${item.grade} - ${item.section}` : (item.class || item.grade || '-');
                    const mainRow = `
                    <tr>
                         <td class="center dim">${i + 1}</td>
                        <td class="bold">${item.name}</td>
                        <td>${specs}</td>
                        <td class="center">${className}</td>
                        <td class="center bold success-text">${item.points}</td>
                    </tr>
                    `;

                    let detailsRow = '';
                    if (reportOptions.showStudentHistory) {
                        const history = studentParticipationMap[item.id] || studentParticipationMap[item.name] || [];
                        let historyContent = '';
                        if (history.length > 0) {
                            const tags = history.map(act => `
                                <div class="history-tag">
                                    <span class="history-title">${act.title}</span>
                                    <span class="history-meta">${act.formattedDate} • ${act.venue}</span>
                                    <span class="history-points">+${act.points} ن</span>
                                </div>
                            `).join('');
                            historyContent = `
                                <div class="history-container">
                                    <div class="history-header">سجل الأنشطة المشارك فيها (${history.length}):</div>
                                    <div class="history-items">${tags}</div>
                                </div>
                            `;
                        } else {
                            historyContent = `
                                <div class="history-container">
                                    <span class="dim" style="font-size: 11px;">لا توجد مشاركات سابقة مسجلة</span>
                                </div>
                            `;
                        }

                        detailsRow = `
                            <tr class="details-row">
                                <td colspan="5">
                                    <div class="details-box">
                                        ${historyContent}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }

                    return mainRow + detailsRow;
                }).join('');
            } else if (activeTab === 'assets') {
                tableHeader = `
                    <tr>
                        <th style="width: 40%">اسم المورد</th>
                        <th style="width: 30%">النوع</th>
                        <th style="width: 30%">الحالة</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map(item => {
                    const mainRow = `
                    <tr>
                        <td class="bold">${item.name}</td>
                        <td>${item.type}</td>
                        <td>
                           <span class="badge ${item.status === 'Available' ? 'success' : 'danger'}">
                                ${item.status}
                            </span>
                        </td>
                    </tr>
                    `;

                    let detailsRow = '';
                    if (reportOptions.showAssetHistory) {
                        const history = assetUsageMap[item.id] || assetUsageMap[item.name] || [];
                        let historyContent = '';
                        if (history.length > 0) {
                            const tags = history.map(act => `
                                <div class="history-tag">
                                    <span class="history-title">${act.title}</span>
                                    <span class="history-meta">${act.formattedDate} • ${act.venue}</span>
                                    <span class="badge ${act.rawStatus === 'Done' ? 'success' : 'neutral'}">${act.status}</span>
                                </div>
                            `).join('');
                            historyContent = `
                                <div class="history-container">
                                    <div class="history-header">سجل استخدام المورد في الأنشطة (${history.length}):</div>
                                    <div class="history-items">${tags}</div>
                                </div>
                            `;
                        } else {
                            historyContent = `
                                <div class="history-container">
                                    <span class="dim" style="font-size: 11px;">لم يُستخدم هذا المورد في أي نشاط سابق</span>
                                </div>
                            `;
                        }

                        detailsRow = `
                            <tr class="details-row">
                                <td colspan="3">
                                    <div class="details-box">
                                        ${historyContent}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }

                    return mainRow + detailsRow;
                }).join('');
            } else if (activeTab === 'points') {
                tableHeader = `
                    <tr>
                        <th style="width: 5%">#</th>
                        <th style="width: 25%">اسم الطالب</th>
                        <th style="width: 15%">الصف والشعبة</th>
                        <th style="width: 25%">سبب الحركة / النشاط</th>
                        <th style="width: 10%">مقدار التغيير</th>
                        <th style="width: 10%">الرصيد بعد</th>
                        <th style="width: 10%">التاريخ</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map((item, i) => {
                    const isPos = (Number(item.change) || 0) > 0;
                    const changeStr = isPos ? `+${item.change}` : `${item.change}`;
                    const className = (item.grade && item.section) ? `${item.grade} - ${item.section}` : (item.class || '-');
                    return `
                    <tr>
                        <td class="center dim">${i + 1}</td>
                        <td class="bold">${item.studentName}</td>
                        <td class="center">${className}</td>
                        <td>${item.reason || item.eventTitle || '-'}</td>
                        <td class="center bold" style="${isPos ? 'color: #059669;' : 'color: #dc2626;'}">${changeStr}</td>
                        <td class="center bold success-text">${item.newTotalPoints}</td>
                        <td class="center dim" style="font-size: 11px;">${item.date}</td>
                    </tr>
                    `;
                }).join('');
            }

            // 3. Write Full HTML Document
            // Using "Light Mode" styles by default for printing friendly bulk reports
            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background-color: #ffffff;
                            color: #1f2937;
                            margin: 0;
                            padding: 40px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 40px;
                            border-bottom: 2px solid #e5e7eb;
                            padding-bottom: 20px;
                        }
                        h1 { margin: 0; font-size: 24px; color: #111827; }
                        p.subtitle { margin: 5px 0 0; color: #6b7280; font-size: 14px; }
                        
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                            font-size: 14px; /* Increased from 12px */
                        }
                        th {
                            background-color: #f3f4f6;
                            color: #374151;
                            text-align: right;
                            padding: 14px; /* Increased padding */
                            border-bottom: 2px solid #e5e7eb;
                            font-weight: bold;
                        }
                        td {
                            padding: 12px 14px; /* Increased padding */
                            border-bottom: 1px solid #e5e7eb;
                            vertical-align: middle;
                        }
                        tr:nth-child(even) { background-color: #f9fafb; }
                        
                        .bold { font-weight: bold; }
                        .dim { color: #6b7280; }
                        .center { text-align: center; }
                        .success-text { color: #059669; }
                        
                        .badge {
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: bold;
                            display: inline-block;
                        }
                        .badge.success { background-color: #ecfdf5; color: #059669; }
                        .badge.neutral { background-color: #f3f4f6; color: #4b5563; }
                        .badge.danger { background-color: #fef2f2; color: #dc2626; }

                        /* DETAILS ROW STYLES */
                        .details-row { background-color: #ffffff !important; }
                        .details-box {
                            background-color: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 10px;
                            margin: 5px 0 15px 0;
                        }
                        .details-title {
                            font-weight: bold;
                            font-size: 12px;
                            color: #64748b;
                            margin-bottom: 5px;
                        }
                        .class-group { margin-bottom: 8px; border-right: 2px solid #e2e8f0; padding-right: 8px; }
                        .class-header { font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 4px; }
                        
                        .tags-container {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 6px;
                            align-items: center;
                        }
                        .student-tag {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            background-color: #fff;
                            border: 1px solid #cbd5e1;
                            padding: 3px 8px; /* Corrected padding */
                            border-radius: 4px;
                            font-size: 11px;
                            color: #334155;
                            line-height: 1.3;
                            margin-bottom: 2px;
                        }

                        .details-section { margin-top: 8px; margin-bottom: 8px; }
                        .asset-tag { display: inline-block; background: #fffbeb; color: #92400e; padding: 2px 6px; border-radius: 4px; border: 1px solid #fcd34d; font-size: 10px; margin-left: 4px; }
                        .fields-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; }
                        .field-item { font-size: 11px; background: #f8fafc; padding: 4px; border-radius: 4px; border: 1px solid #e2e8f0; }

                        /* HISTORY STYLES */
                        .history-container { margin: 2px 0; }
                        .history-header { font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 6px; }
                        .history-items { display: flex; flex-wrap: wrap; gap: 6px; }
                        .history-tag {
                            display: inline-flex;
                            align-items: center;
                            gap: 6px;
                            background-color: #ffffff;
                            border: 1px solid #cbd5e1;
                            padding: 3px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            color: #334155;
                        }
                        .history-title { font-weight: bold; color: #1e293b; }
                        .history-meta { font-size: 10px; color: #64748b; }
                        .history-points {
                            background-color: #ecfdf5;
                            color: #059669;
                            font-weight: bold;
                            font-size: 10px;
                            padding: 1px 4px;
                            border-radius: 3px;
                        }

                        .footer {
                            margin-top: 40px;
                            text-align: left;
                            font-size: 10px;
                            color: #9ca3af;
                            border-top: 1px solid #e5e7eb;
                            padding-top: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${pageTitle}</h1>
                        <p class="subtitle">تاريخ التقرير: ${dateStr}</p>
                    </div>

                    <table>
                        <thead>
                            ${tableHeader}
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>

                    <div class="footer">
                        Generated by School Management System
                    </div>
                </body>
                </html>
            `);
            doc.close();

            await new Promise(r => setTimeout(r, 100)); // Render wait

            // --- SMART PAGINATION LOGIC (Bulk) ---
            const pageHeightPx = 3394; // 1200px * 2 (scale) -> A4 Ratio = ~3394px height
            const rows = doc.querySelectorAll('tr'); // Target table rows

            rows.forEach(row => {
                const rect = row.getBoundingClientRect();
                const top = rect.top + window.scrollY;
                const height = rect.height;

                const startPage = Math.floor(top / pageHeightPx);
                const endPage = Math.floor((top + height) / pageHeightPx);

                if (endPage > startPage) {
                    // Row crosses page boundary -> Push to next page start
                    // Use CSS transform or margin on cells since tr margin is tricky
                    // Better to find the <td> content and pad it? Or simpler: 
                    // Add a spacer row? 
                    // Actually, margin-top works on block-display elements. 
                    // Let's try adding a spacer div *before* the row using insertBefore? 
                    // Or simpler: set row display to block? No, breaks table.
                    // Solution: Add a spacer row.

                    const spacer = doc.createElement('tr');
                    spacer.style.height = `${(endPage * pageHeightPx) - top + 40}px`;
                    spacer.style.background = 'transparent';
                    row.parentNode.insertBefore(spacer, row);
                }
            });

            // 4. Capture & PDF
            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf')
            ]);
            await import('jspdf-autotable');

            const canvas = await html2canvas(doc.body, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: 1200,
                // height: doc.body.scrollHeight + 100, // Ensure full height capture
                backgroundColor: '#ffffff'
            });

            document.body.removeChild(iframe);

            const imgData = canvas.toDataURL('image/jpeg', 0.85); // Slightly higher quality
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = 595.28;
            const pageHeight = 841.89;

            // Calculate dimensions
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            // First Page
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
            heightLeft -= pageHeight;

            // Subsequent Pages (Slicing)
            while (heightLeft > 0) {
                position -= pageHeight; // Slice by moving image up
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                heightLeft -= pageHeight;
            }

            pdf.save(`Report_${activeTab}_${Date.now()}.pdf`);

            toast.success("تم تحميل التقرير الشامل", { id: toastId });

        } catch (error) {
            console.error(error);
            toast.error("فشل في إنشاء التقرير الشامل", { id: toastId });
        }
    };

    // --- 4. Single Event PDF (NUCLEAR OPTION: Iframe Isolation with Themes) ---
    const generateSingleEventPDF = async (event, theme = 'light') => {
        const toastId = toast.loading('جاري تحضير الملف...');

        try {
            // Theme Configuration
            const themes = {
                dark: {
                    bg: '#1a1a20',
                    text: '#ffffff',
                    textSec: '#9ca3af',
                    cardBg: 'rgba(255,255,255,0.05)',
                    cardBorder: 'rgba(255,255,255,0.05)',
                    listBg: 'rgba(0,0,0,0.2)',
                    listBorder: 'rgba(255,255,255,0.05)',
                    itemBorder: 'rgba(255,255,255,0.1)',
                    footerBorder: 'rgba(255,255,255,0.1)'
                },
                light: {
                    bg: '#ffffff',
                    text: '#000000',
                    textSec: '#4b5563', // gray-600
                    cardBg: '#f3f4f6', // gray-100
                    cardBorder: '#e5e7eb', // gray-200
                    listBg: '#ffffff',
                    listBorder: '#e5e7eb',
                    itemBorder: '#f3f4f6',
                    footerBorder: '#e5e7eb'
                }
            };

            const t = themes[theme];

            // 1. Create a hidden Iframe (Clean Slate Environment)
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '0';
            iframe.style.width = '800px';
            iframe.style.height = '1200px';
            iframe.style.border = 'none';

            document.body.appendChild(iframe);

            // 2. Write RAW HTML into the iframe document
            const doc = iframe.contentWindow.document;
            doc.open();

            // Extract all participant field labels present in this event
            const customFieldLabels = new Set();
            if (event.participantDetails && typeof event.participantDetails === 'object') {
                Object.values(event.participantDetails).forEach(pMap => {
                    if (pMap && typeof pMap === 'object') {
                        Object.keys(pMap).forEach(k => customFieldLabels.add(k));
                    }
                });
            }
            const activeCustomCols = Array.from(customFieldLabels);

            let studentsListHtml = '';
            if (event.studentNames.length > 0) {
                if (activeCustomCols.length > 0) {
                    // Render as a clean tabular view with columns for custom fields
                    const theadThs = activeCustomCols.map(col => `<th style="padding: 8px 12px; text-align: right; font-size: 11px; border-bottom: 2px solid ${t.itemBorder}; color: ${t.textSec};">${col}</th>`).join('');
                    const tbodyTrs = event.studentNames.map((s, i) => {
                        const pDetails = event.participantDetails?.[s.id] || {};
                        const colTds = activeCustomCols.map(col => {
                            const val = pDetails[col] || '-';
                            return `<td style="padding: 8px 12px; font-size: 11px; border-bottom: 1px solid ${t.itemBorder}; color: ${theme === 'light' ? '#1f2937' : '#e5e7eb'}; font-weight: 500;">${val}</td>`;
                        }).join('');

                        return `<tr>
                            <td style="padding: 8px 12px; font-size: 11px; border-bottom: 1px solid ${t.itemBorder}; color: ${t.textSec}; width: 30px; text-align: center;">${i + 1}</td>
                            <td style="padding: 8px 12px; font-size: 12px; border-bottom: 1px solid ${t.itemBorder}; font-weight: bold; color: ${t.text};">${s.name}</td>
                            <td style="padding: 8px 12px; font-size: 11px; border-bottom: 1px solid ${t.itemBorder}; color: ${t.textSec};">${(s.grade || s.section) ? `${s.grade} - ${s.section}` : '-'}</td>
                            ${colTds}
                        </tr>`;
                    }).join('');

                    studentsListHtml = `
                        <table style="width: 100%; border-collapse: collapse; text-align: right;">
                            <thead>
                                <tr style="background: ${t.cardBg};">
                                    <th style="padding: 8px 12px; text-align: center; width: 30px; font-size: 11px; border-bottom: 2px solid ${t.itemBorder}; color: ${t.textSec};">#</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 11px; border-bottom: 2px solid ${t.itemBorder}; color: ${t.textSec};">اسم الطالب</th>
                                    <th style="padding: 8px 12px; text-align: right; font-size: 11px; border-bottom: 2px solid ${t.itemBorder}; color: ${t.textSec};">الصف والشعبة</th>
                                    ${theadThs}
                                </tr>
                            </thead>
                            <tbody>
                                ${tbodyTrs}
                            </tbody>
                        </table>
                    `;
                } else {
                    studentsListHtml = event.studentNames.map((s, i) =>
                        `<div class="item">
                            <span class="idx">${i + 1}</span>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: bold;">${s.name}</span>
                                ${(s.grade || s.section) ? `<span style="font-size: 10px; color: ${theme === 'light' ? '#6b7280' : '#9ca3af'}">${s.grade} - ${s.section}</span>` : ''}
                            </div>
                         </div>`).join('');
                }
            } else {
                studentsListHtml = '<div class="empty">لا يوجد طلاب</div>';
            }

            const assetsListHtml = (event.assets && event.assets.length > 0)
                ? event.assets.map(a => {
                    const name = assetMap[a] || a;
                    return `<span class="asset-pill">${name}</span>`;
                }).join('')
                : `<div class="empty" style="color: ${t.textSec}; font-size: 12px;">لا توجد موارد أو أدوات مسجلة لهذا النشاط</div>`;

            const statusBg = event.status === 'مكتمل'
                ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ecfdf5') // green-900/20 vs green-50
                : (theme === 'dark' ? 'rgba(107, 114, 128, 0.2)' : '#f3f4f6'); // gray-800/20 vs gray-100

            // Adjust status text color for light mode readability if needed
            const statusTextColor = event.status === 'مكتمل'
                ? (theme === 'dark' ? '#34d399' : '#059669') // emerald-400 vs emerald-600
                : (theme === 'dark' ? '#9ca3af' : '#4b5563'); // gray-400 vs gray-600


            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <style>
                        body {
                            margin: 0;
                            padding: 40px;
                            background-color: ${t.bg};
                            color: ${t.text};
                            font-family: 'Arial', sans-serif;
                        }
                        h1 { margin: 0 0 5px 0; font-size: 28px; }
                        p.type { color: #6366f1; font-size: 14px; margin-bottom: 30px; }
                        .cards { display: flex; gap: 15px; margin-bottom: 30px; }
                        .card { 
                            flex: 1; 
                            background: ${t.cardBg}; 
                            border: 1px solid ${t.cardBorder}; 
                            border-radius: 12px; 
                            padding: 15px; 
                            text-align: center; 
                        }
                        .card .label { color: ${t.textSec}; font-size: 12px; margin-bottom: 5px; }
                        .card .value { font-weight: bold; font-size: 16px; }
                        .status-badge { 
                            padding: 4px 8px; 
                            border-radius: 4px; 
                            font-weight: bold; 
                            font-size: 14px; 
                            display: inline-block; 
                            margin-top: 2px;
                        }
                        h3 { 
                            font-size: 18px; 
                            margin-bottom: 15px; 
                            border-bottom: 1px solid ${t.footerBorder}; 
                            padding-bottom: 10px; 
                        }
                        .list { 
                            background: ${t.listBg}; 
                            border: 1px solid ${t.listBorder}; 
                            border-radius: 12px; 
                            overflow: hidden; 
                        }
                        .item { 
                            padding: 10px; 
                            border-bottom: 1px solid ${t.itemBorder}; 
                            color: ${theme === 'light' ? '#374151' : '#d1d5db'}; 
                            display: flex; 
                            align-items: center; 
                        }
                        .idx { 
                            width: 30px; 
                            color: ${t.textSec}; 
                            text-align: center;
                        }
                        .asset-pill {
                            display: inline-block;
                            background: ${theme === 'light' ? '#fef3c7' : 'rgba(245, 158, 11, 0.15)'};
                            color: ${theme === 'light' ? '#92400e' : '#fbbf24'};
                            border: 1px solid ${theme === 'light' ? '#fde68a' : 'rgba(245, 158, 11, 0.3)'};
                            padding: 5px 12px;
                            border-radius: 6px;
                            font-size: 12px;
                            font-weight: 500;
                        }
                        .footer { 
                            margin-top: 40px; 
                            border-top: 1px solid ${t.footerBorder}; 
                            padding-top: 20px; 
                            color: ${t.textSec}; 
                            font-size: 12px; 
                            display: flex; 
                            justify-content: space-between; 
                        }
                    </style>
                </head>
                <body>
                    <div style="text-align: right;">
                        <h1>${event.title}</h1>
                        <p class="type">${event.type}</p>
                        
                        <div class="cards">
                            <div class="card">
                                <div class="label">التاريخ</div>
                                <div class="value">${event.formattedDate}</div>
                            </div>
                            <div class="card">
                                <div class="label">الوقت</div>
                                <div class="value">${event.time}</div>
                            </div>
                            <div class="card">
                                <div class="label">المكان</div>
                                <div class="value">${event.venue}</div>
                            </div>
                            <div class="card">
                                <div class="label">الحالة</div>
                                <span class="status-badge" style="background: ${statusBg}; color: ${statusTextColor};">
                                    ${event.status}
                                </span>
                            </div>
                        </div>

                        <h3>الطلاب المشاركون (${event.studentsCount})</h3>
                        <div class="list">
                            ${studentsListHtml}
                        </div>

                        <h3 style="margin-top: 25px;">الموارد والأدوات المستخدمة (${event.assets?.length || 0})</h3>
                        <div style="background: ${t.listBg}; border: 1px solid ${t.listBorder}; border-radius: 12px; padding: 14px; display: flex; flex-wrap: wrap; gap: 8px;">
                            ${assetsListHtml}
                        </div>

                        <div class="footer">
                             <span>تم استخراج التقرير آلياً</span>
                             <span style="font-family: monospace;">ID: ${event.id}</span>
                        </div>
                    </div>
                </body>
                </html>
            `);
            doc.close();

            await new Promise(r => setTimeout(r, 100));

            // --- SMART PAGINATION LOGIC ---
            const pageHeightPx = 2262; // 800px * 2 (scale) -> A4 Ratio = ~2262px height
            const items = doc.querySelectorAll('.item'); // Target student rows

            items.forEach(item => {
                const rect = item.getBoundingClientRect();
                const top = rect.top + window.scrollY; // Handle relative to doc
                const height = rect.height;

                const startPage = Math.floor(top / pageHeightPx);
                const endPage = Math.floor((top + height) / pageHeightPx);

                if (endPage > startPage) {
                    // Item crosses page boundary -> Push to next page start
                    const nextPageStart = endPage * pageHeightPx;
                    const push = nextPageStart - top + 40; // +40px safe margin (header/padding)
                    item.style.marginTop = `${push}px`;
                }
            });

            // 3. Capture Iframe Body
            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf')
            ]);
            await import('jspdf-autotable');

            const canvas = await html2canvas(doc.body, {
                scale: 2,
                useCORS: true,
                backgroundColor: t.bg,
                logging: false,
                windowWidth: 800,
                windowHeight: 1200
            });

            // 4. Clean up
            document.body.removeChild(iframe);

            // OPTIMIZATION: JPEG 0.75 quality reduction
            const imgData = canvas.toDataURL('image/jpeg', 0.70);
            const imgWidth = 595.28;
            const pageHeight = 841.89;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            const pdf = new jsPDF('p', 'pt', 'a4');

            let heightLeft = imgHeight;
            let position = 0;

            // First Page
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
            heightLeft -= pageHeight;

            // Subsequent Pages
            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                heightLeft -= pageHeight;
            }

            pdf.save(`Activity_${event.title}_${theme}.pdf`);

            toast.success("تم تحميل تقرير النشاط", { id: toastId });
        } catch (error) {
            console.error("PDF Fail:", error);
            toast.error("فشل في إنشاء ملف PDF", { id: toastId });
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

                    {/* Mobile Horizontal Scroll Indicator (Option 3-A) */}
                    <div className="md:hidden flex items-center justify-between px-3 py-1.5 mb-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                            <span>💡 اسحب الجدول لليسار لمعاينة بقية الأعمدة</span>
                        </span>
                        <span className="animate-pulse font-bold text-sm">⟵</span>
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5 relative">
                        {/* Edge fade indicator on mobile */}
                        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/40 to-transparent z-20 md:hidden" />
                        <table className="w-full min-w-[700px] text-right text-sm">
                            <thead className="bg-[#1a1a20] text-gray-400 sticky top-0 backdrop-blur-md shadow-md z-10">
                                <tr>
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
                                            colSpan={activeTab === 'points' ? 9 : (activeTab === 'archive' ? (archiveSubTab === 'students' ? 6 : 5) : 6)}
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
                                            className={`hover:bg-white/5 transition-colors ${(activeTab === 'activities' || (activeTab === 'archive' && archiveSubTab === 'activities')) ? 'cursor-pointer' : ''}`}
                                        >
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
                                                    <td colSpan={5} className="p-4 pt-1 pr-10">
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
                                                    <td colSpan={3} className="p-4 pt-1 pr-10">
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
                                                {selectedEvent.studentNames.map((s, idx) => (
                                                    <div key={idx} className="p-3 text-sm text-gray-300 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-white/5 gap-2">
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-6 text-center text-gray-400 text-xs">{idx + 1}</span>
                                                            <span className="text-white font-medium">{s.name}</span>
                                                            {(s.grade || s.section) && (
                                                                <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-400">
                                                                    {s.grade} - {s.section}
                                                                </span>
                                                            )}
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

                                    <PrintControls event={selectedEvent} onPrint={generateSingleEventPDF} />

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
        </div>
    );
}

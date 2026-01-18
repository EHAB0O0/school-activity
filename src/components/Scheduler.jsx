import { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, Timestamp, writeBatch, doc, increment, deleteDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { checkConflicts } from '../utils/ConflictGuard';
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, isSameDay, parse, set, isPast } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, Plus, CheckCircle, Calendar, Clock, MapPin, AlertTriangle, Users, Box, X, Search, Check, Trash2, Edit3, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from './ui/ConfirmModal';
import DeleteEventModal from './ui/DeleteEventModal';

// --- Internal Component: MultiSelect moved to ui/MultiSelect.jsx ---
import MultiSelect from './ui/MultiSelect';


// --- Internal Component: Event Modal ---
function EventModal({ isOpen, onClose, initialData, onSave, onDelete, eventTypes }) {
    if (!isOpen) return null;

    const isPastEvent = initialData?.id && new Date(initialData.startTime?.toDate ? initialData.startTime.toDate() : `${initialData.date}T${initialData.endTime}`) < new Date();
    const isReadOnly = isPastEvent;

    const [formData, setFormData] = useState({
        title: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '08:00',
        endTime: '09:00',
        venueId: 'Auditorium',
        typeId: '',
        customFields: {},
        studentIds: [],
        assetIds: []
    });

    // Resource Lists
    const [studentsList, setStudentsList] = useState([]);
    const [assetsList, setAssetsList] = useState([]);
    const [venuesList, setVenuesList] = useState([]);

    const [conflict, setConflict] = useState(null);
    const [checking, setChecking] = useState(false);

    // Fetch Resources on Mount
    useEffect(() => {
        const fetchResources = async () => {
            try {
                // Students
                const studentsSnap = await getDocs(collection(db, 'students'));
                setStudentsList(studentsSnap.docs.map(d => ({
                    value: d.id,
                    label: d.data().name,
                    specializations: d.data().specializations || []
                })));

                // Assets (Only Available)
                const assetsSnap = await getDocs(collection(db, 'assets'));
                // Filter out 'Maintenance' assets
                setAssetsList(assetsSnap.docs
                    .map(d => ({ value: d.id, label: d.data().name, status: d.data().status }))
                    .filter(a => a.status !== 'Maintenance') // Strict filter
                );

                // Venues
                const venuesSnap = await getDocs(collection(db, 'venues'));
                if (!venuesSnap.empty) {
                    setVenuesList(venuesSnap.docs.map(d => ({
                        value: d.data().name,
                        label: d.data().name,
                        status: d.data().status || 'Available'
                    })));
                } else {
                    setVenuesList([
                        { value: 'Auditorium', label: 'المسرح المدرسي', status: 'Available' },
                        { value: 'Gym', label: 'الصالة الرياضية', status: 'Available' },
                        { value: 'Playground', label: 'الملعب الخارجي', status: 'Available' },
                        { value: 'Lab', label: 'معمل الحاسب', status: 'Available' }
                    ]);
                }
            } catch (e) {
                console.error("Failed to fetch resources", e);
            }
        };
        fetchResources();
    }, []);

    useEffect(() => {
        if (initialData) {
            setFormData(prev => ({ ...prev, ...initialData }));
        }
    }, [initialData]);

    const handleChange = (field, value) => {
        if (isReadOnly) return;
        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            setConflict(null);
            return updated;
        });
    };

    const handleCustomFieldChange = (key, value) => {
        if (isReadOnly) return;
        setFormData(prev => ({
            ...prev,
            customFields: { ...prev.customFields, [key]: value }
        }));
    };

    const activeType = eventTypes?.find(t => String(t?.id) === String(formData?.typeId));

    // Smart Filter: Filter students based on Active Type
    const filteredStudents = useMemo(() => {
        if (!activeType) return studentsList;
        return studentsList.filter(s => {
            // General / Joker always shows
            if (s.specializations && s.specializations.includes('General')) return true;
            // Exact Match
            if (s.specializations && s.specializations.includes(activeType.name)) return true;
            return false;
        });
    }, [studentsList, activeType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly) return;

        setChecking(true);
        const start = new Date(`${formData.date}T${formData.startTime}`);
        const end = new Date(`${formData.date}T${formData.endTime}`);

        const eventPayload = {
            ...initialData, // Preserve ID if exists
            title: formData.title,
            start, end,
            venueId: formData.venueId,
            participatingStudents: formData.studentIds,
            assets: formData.assetIds,
            startTime: Timestamp.fromDate(start),
            endTime: Timestamp.fromDate(end),
            typeId: formData.typeId,
            typeName: activeType?.name || 'General',
            customData: formData.customFields,
            status: 'Draft'
        };

        try {
            const result = await checkConflicts(eventPayload);
            setChecking(false);

            if (result.hasConflict) {
                setConflict(result.reason);
                return;
            }

            onSave(eventPayload);
        } catch (error) {
            console.error("Conflict check failed:", error);
            setChecking(false);
            if (error.code === 'failed-precondition') {
                toast.error("مطلوب إعداد الفهرس في قاعدة البيانات. انظر المتصفح (Console).");
            } else {
                toast.error("فشل التحقق من التعارضات");
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1a1a20] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                    <h2 className="text-2xl font-bold text-white flex items-center">
                        {initialData?.id ? 'تفاصيل النشاط' : 'إضافة نشاط جديد'}
                        {isReadOnly && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full mr-3 flex items-center"><Lock size={12} className="ml-1" /> منتهي</span>}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-all"><X size={20} /></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {isReadOnly && (
                        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-center text-amber-200 text-sm">
                            <AlertTriangle size={18} className="ml-2 text-amber-400" />
                            هذا النشاط انتهى بالفعل، لا يمكن تعديل بياناته ولكن يمكنك حذفه من السجلات.
                        </div>
                    )}
                    {conflict && (
                        <div className="bg-red-500/20 border border-red-500/50 p-4 rounded-xl flex items-start space-x-3 space-x-reverse animate-pulse-once">
                            <AlertTriangle className="text-red-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-red-400">يوجد تعارض!</h4>
                                <p className="text-red-200 text-sm">{conflict}</p>
                            </div>
                        </div>
                    )}

                    <form id="eventForm" onSubmit={handleSubmit}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-sm text-gray-400 mb-1">عنوان النشاط</label>
                                <input required disabled={isReadOnly} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    value={formData.title} onChange={e => handleChange('title', e.target.value)} />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">نوع النشاط</label>
                                <select disabled={isReadOnly} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
                                    value={formData.typeId} onChange={e => handleChange('typeId', e.target.value)}>
                                    <option value="">اختر النوع...</option>
                                    {eventTypes?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">المكان (القاعة)</label>
                                <select disabled={isReadOnly} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
                                    value={formData.venueId} onChange={e => handleChange('venueId', e.target.value)}>
                                    {venuesList.filter(v => v.status === 'Available' || v.value === formData.venueId).map((v, idx) => (
                                        <option key={`${v.value}-${idx}`} value={v.value}>{v.label}</option>
                                    ))}
                                </select>
                                {venuesList.length > 0 && venuesList.find(v => v.value === formData.venueId && v.status !== 'Available') && (
                                    <p className="text-xs text-amber-500 mt-1 flex items-center"><AlertTriangle size={12} className="ml-1" /> تنبيه: هذا المكان {venuesList.find(v => v.value === formData.venueId)?.status === 'Maintenance' ? 'تحت الصيانة' : 'مغلق'}</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">التاريخ</label>
                                <input type="date" disabled={isReadOnly} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
                                    value={formData.date} onChange={e => handleChange('date', e.target.value)} />
                            </div>

                            <div className="flex space-x-2 space-x-reverse">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-400 mb-1">من</label>
                                    <input type="time" disabled={isReadOnly} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
                                        value={formData.startTime} onChange={e => handleChange('startTime', e.target.value)} />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-400 mb-1">إلى</label>
                                    <input type="time" disabled={isReadOnly} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50"
                                        value={formData.endTime} onChange={e => handleChange('endTime', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        {/* Dynamic Fields Section */}
                        {activeType && activeType.fields && activeType.fields.length > 0 && (
                            <div className="border-t border-white/10 pt-4 mt-4">
                                <h3 className="font-bold text-white mb-3 flex items-center"><Box size={16} className="ml-2 text-purple-400" /> بيانات خاصة بـ {activeType.name}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {activeType.fields.map((field, idx) => (
                                        <div key={idx}>
                                            <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
                                            {field.type === 'select' ? (
                                                <select disabled={isReadOnly} className="w-full bg-purple-900/10 border border-purple-500/30 rounded-xl p-3 text-white focus:border-purple-500 outline-none disabled:opacity-50"
                                                    onChange={e => handleCustomFieldChange(field.label, e.target.value)}>
                                                    <option value="">اختر...</option>
                                                    <option value="Option 1">خيار 1</option>
                                                    <option value="Option 2">خيار 2</option>
                                                </select>
                                            ) : (
                                                <input disabled={isReadOnly} type={field.type === 'number' ? 'number' : 'text'}
                                                    className="w-full bg-purple-900/10 border border-purple-500/30 rounded-xl p-3 text-white focus:border-purple-500 outline-none disabled:opacity-50"
                                                    placeholder={`أدخل ${field.label}`}
                                                    onChange={e => handleCustomFieldChange(field.label, e.target.value)}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Resources Section */}
                        {!isReadOnly && (
                            <div className="border-t border-white/10 pt-4 space-y-4 mt-4">
                                <h3 className="font-bold text-white flex items-center"><Users size={16} className="ml-2 text-emerald-400" /> المشاركون والموارد</h3>
                                <MultiSelect
                                    label="الطلاب المشاركون"
                                    placeholder={activeType ? `طلاب ${activeType.name} + العام...` : "اختر الطلاب..."}
                                    options={filteredStudents}
                                    selectedValues={formData.studentIds}
                                    onChange={(vals) => handleChange('studentIds', vals)}
                                    icon={Users}
                                />
                                <MultiSelect
                                    label="الموارد والعهد (Mutaah Only)"
                                    placeholder="اختر الموارد المتاحة..."
                                    options={assetsList}
                                    selectedValues={formData.assetIds}
                                    onChange={(vals) => handleChange('assetIds', vals)}
                                    icon={Box}
                                />
                                <p className="text-xs text-gray-500">* الموارد التي "تحت الصيانة" لا تظهر هنا.</p>
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-6 border-t border-white/10 flex justify-between space-x-reverse bg-black/20">
                    {initialData?.id && (
                        <button type="button" onClick={() => onDelete(initialData)} className="px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 flex items-center transition-all">
                            <Trash2 size={18} className="ml-2" /> حذف النشاط
                        </button>
                    )}

                    <div className="flex space-x-3 space-x-reverse mr-auto">
                        <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl text-gray-400 hover:bg-white/5 transition-all">إلغاء</button>
                        {!isReadOnly ? (
                            <button form="eventForm" type="submit" disabled={checking} className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg transition-transform transform active:scale-95 flex items-center hover:shadow-indigo-500/25">
                                {checking ? 'جاري التحقق...' : (initialData?.id ? 'حفظ التعديلات' : 'إنشاء النشاط')}
                            </button>
                        ) : (
                            initialData?.status !== 'Done' && (
                                <button type="button" onClick={() => onSave({ ...initialData, status: 'Done', markDone: true })} className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg flex items-center">
                                    <CheckCircle size={20} className="ml-2" />
                                    تأكيد التنفيذ ورصد النقاط
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}


// --- Main Scheduler Component ---
export default function Scheduler() {
    const { activeProfile, eventTypes, weekends, holidays } = useSettings();
    const [events, setEvents] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('week'); // week | month
    const [calendarSystem, setCalendarSystem] = useState('gregory'); // gregory | hijri
    const [isLoading, setIsLoading] = useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });
    const [deleteOptsModal, setDeleteOptsModal] = useState({ isOpen: false, event: null });

    // --- Helpers ---
    const getHijriDate = (date) => {
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    };
    const getHijriDay = (date) => {
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric' }).format(date);
    };
    const getMonthTitle = (date) => {
        if (calendarSystem === 'hijri') {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(date);
        }
        return format(date, 'MMMM yyyy', { locale: ar });
    };

    // Fetch Events Logic
    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            let start, end;
            if (view === 'week') {
                start = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
                end = endOfWeek(currentDate, { weekStartsOn: 0 });
            } else {
                start = startOfMonth(currentDate);
                end = endOfMonth(currentDate);
            }

            const q = query(
                collection(db, 'events'),
                where('startTime', '>=', Timestamp.fromDate(start)),
                where('startTime', '<=', Timestamp.fromDate(end))
            );

            // Add archived filter
            // Note: Compound queries with status != 'archived' require index.
            // Client-side filtering is easier here given small dataset
            const querySnapshot = await getDocs(q);
            const eventsData = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(ev => ev.status !== 'archived');

            setEvents(eventsData);
        } catch (error) {
            console.error("Error fetching events:", error);
            toast.error("فشل في تحميل الجدول");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, [currentDate, view]);

    const handleSaveEvent = async (eventPayload) => {
        try {
            if (eventPayload.markDone) {
                await handleMarkEventDone(eventPayload);
                return;
            }

            if (eventPayload.id) {
                await updateDoc(doc(db, 'events', eventPayload.id), eventPayload);
                toast.success("تم تحديث النشاط");
            } else {
                await addDoc(collection(db, 'events'), eventPayload);
                toast.success("تمت إضافة النشاط بنجاح");
            }
            setIsModalOpen(false);
            fetchEvents();
        } catch (error) {
            console.error("Error saving document: ", error);
            toast.error("حدث خطأ أثناء الحفظ");
        }
    };

    const handleMarkEventDone = async (eventData) => {
        const loadingToast = toast.loading("جاري رصد النقاط...");
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);
                const pointsToAward = 10; // Fixed for now, or read from activeType

                // 1. Update Event Status
                transaction.update(eventRef, { status: 'Done' });

                // 2. Award Points to Students
                if (eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, {
                            totalPoints: increment(pointsToAward)
                            // Note: We use 'totalPoints' in StudentsPage, verify schema matches 'points' or 'totalPoints'
                            // StudentsPage uses 'totalPoints'. Scheduler delete used 'points'. Correcting to 'totalPoints'.
                        });
                    }
                }
            });
            toast.success("تم تنفيذ النشاط ورصد النقاط للطلاب!");
            setIsModalOpen(false);
            fetchEvents();
        } catch (e) {
            console.error(e);
            toast.error("فشل في العملية");
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    // Logic for deleting event click
    // Logic for deleting event click
    const confirmDeleteEvent = (eventData) => {
        let eventStart;
        // Robust Date Parsing
        if (eventData?.startTime?.toDate) {
            eventStart = eventData.startTime.toDate();
        } else if (eventData?.date && eventData?.startTime) {
            // Check if startTime is just HH:mm or full ISO
            const timeStr = eventData.startTime.includes('T') ? eventData.startTime.split('T')[1] : eventData.startTime;
            eventStart = new Date(`${eventData.date}T${timeStr}`);
        } else {
            // Fallback to current date to be safe (client-side only logic)
            eventStart = new Date();
        }

        const isPastEvent = eventStart < new Date();

        if (isPastEvent) {
            // Use Enhanced Smart Delete for Past Events
            setDeleteOptsModal({ isOpen: true, event: eventData });
        } else {
            // Standard Delete for Future Events
            setConfirmModal({
                isOpen: true,
                title: "حذف النشاط",
                message: "هل أنت متأكد من حذف هذا النشاط المستقبلي نهائياً؟",
                isDestructive: true,
                onConfirm: () => handleDeleteEventSimple(eventData.id)
            });
        }
    }

    const handleDeleteEventSimple = async (id) => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
            await deleteDoc(doc(db, 'events', id));
            toast.success("تم حذف النشاط");
            setIsModalOpen(false);
            fetchEvents();
        } catch (e) { toast.error("فشل الحذف"); }
    }

    const handleSmartDelete = async ({ reversePoints, actionType }) => {
        const eventData = deleteOptsModal.event;
        setDeleteOptsModal({ ...deleteOptsModal, isOpen: false });
        setIsModalOpen(false); // Close parent
        const loadingToast = toast.loading("جاري معالجة الطلب...");

        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);

                // 1. Reverse Points (if requested)
                if (reversePoints && eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    // We assume points awarded were e.g. 10 (hardcoded or from event type). 
                    // For now, let's assume a standard deduction or retrieve from event customData if implemented.
                    // Assuming 10 for demo or fetch logic. 
                    // Ideally, event document should store "pointsAwarded". Let's assume 10 for safety or skip if unknown.
                    const pointsToDeduct = -10; // Negative increment

                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        // Using totalPoints to match schema (verified in StudentsPage)
                        transaction.update(studentRef, { totalPoints: increment(pointsToDeduct) });
                    }
                }

                // 2. Action (Archive or Delete)
                if (actionType === 'archive') {
                    transaction.update(eventRef, { status: 'archived' });
                } else {
                    transaction.delete(eventRef);
                }
            });

            toast.dismiss(loadingToast);
            toast.success(reversePoints ? "تم الحذف وخصم النقاط بنجاح" : "تم الحذف بنجاح");
            fetchEvents();

        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error("فشل في العملية");
        }
    }

    const handleCellClick = (day, slot) => {
        if (slot && slot.type !== 'Class') return;
        setModalData({
            date: format(day, 'yyyy-MM-dd'),
            startTime: slot ? slot.start : '08:00',
            endTime: slot ? slot.end : '09:00',
            typeId: ''
        });
        setIsModalOpen(true);
    };

    const handleEventClick = (e, ev) => {
        e.stopPropagation();
        setModalData({
            ...ev,
            startTime: ev.startTime?.toDate ? format(ev.startTime.toDate(), 'HH:mm') : ev.startTime,
            endTime: ev.endTime?.toDate ? format(ev.endTime.toDate(), 'HH:mm') : ev.endTime,
            date: ev.startTime?.toDate ? format(ev.startTime.toDate(), 'yyyy-MM-dd') : ev.date
        });
        setIsModalOpen(true);
    };

    // Navigation
    const navigate = (direction) => {
        if (view === 'week') {
            setCurrentDate(addDays(currentDate, direction * 7));
        } else {
            const newDate = new Date(currentDate);
            newDate.setMonth(newDate.getMonth() + direction);
            setCurrentDate(newDate);
        }
    };

    // Days for Week View (Sun -> Thu)
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const days = [];
        for (let i = 0; i < 5; i++) { // Sun to Thu (5 days)
            days.push(addDays(start, i));
        }
        return days;
    }, [currentDate]);

    // Slots from Active Profile
    const slots = activeProfile?.slots || [];

    return (
        <div className="space-y-6 animate-fade-in font-cairo pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 to-indigo-300 mb-1">
                        {view === 'week' ? 'الجدول الدراسي' : 'التقويم الشهري'}
                    </h2>
                    <p className="text-gray-400 text-sm">
                        {activeProfile ? `الملف الزمني: ${activeProfile.name}` : 'لا يوجد ملف زمني نشط'}
                    </p>
                </div>

                <div className="flex items-center space-x-4 space-x-reverse bg-black/20 p-1 rounded-xl mt-4 md:mt-0">
                    <button onClick={() => setView('week')} className={`px-6 py-2 rounded-lg transition-all ${view === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>أسبوع</button>
                    <button onClick={() => setView('month')} className={`px-6 py-2 rounded-lg transition-all ${view === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>شهر</button>
                </div>

                <div className="flex items-center space-x-4 space-x-reverse mt-4 md:mt-0">
                    {/* Calendar Toggle */}
                    <div className="bg-black/30 p-1 rounded-lg flex items-center ml-4 border border-white/5">
                        <button
                            onClick={() => setCalendarSystem('gregory')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${calendarSystem === 'gregory' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            ميلادي
                        </button>
                        <button
                            onClick={() => setCalendarSystem('hijri')}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${calendarSystem === 'hijri' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        >
                            هجري
                        </button>
                    </div>

                    <div className="flex items-center bg-black/20 rounded-lg p-1">
                        <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-md text-white"><ChevronRight /></button>
                        <span className="px-4 font-bold text-white min-w-[160px] text-center">
                            {getMonthTitle(currentDate)}
                        </span>
                        <button onClick={() => navigate(1)} className="p-2 hover:bg-white/10 rounded-md text-white"><ChevronLeft /></button>
                    </div>
                    <button onClick={() => { setModalData({}); setIsModalOpen(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl shadow-lg transition-all"><Plus size={20} /></button>
                </div>
            </div>

            {/* WEEKLY GRID VIEW */}
            {view === 'week' && (
                <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-2xl bg-black/20 relative min-h-[400px]">
                    {isLoading && (
                        <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                        </div>
                    )}
                    <table className="w-full min-w-[1000px] border-collapse">
                        <thead>
                            <tr className="bg-white/5 text-white">
                                <th className="p-4 border-b border-white/10 text-right min-w-[120px]">اليوم</th>
                                {slots.map((slot, idx) => (
                                    <th key={idx} className={`p-4 border-b border-white/10 text-center min-w-[140px] ${slot.type !== 'Class' ? 'bg-gray-800/40 text-gray-400' : ''}`}>
                                        <div className="font-bold">{slot.label}</div>
                                        <div className="text-xs opacity-70 mt-1">{slot.start} - {slot.end}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {weekDays.map(day => (
                                <tr key={day.toString()} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                    <td className="p-4 border-l border-white/5 font-bold text-white bg-white/5 sticky right-0 z-10 w-32">
                                        <div className="flex flex-col">
                                            <span className="text-lg">{format(day, 'EEEE', { locale: ar })}</span>
                                            <span className="text-sm text-gray-400">
                                                {calendarSystem === 'hijri' ? getHijriDate(day) : format(day, 'd MMM')}
                                            </span>
                                        </div>
                                    </td>
                                    {slots.map((slot, idx) => {
                                        const slotStart = parse(`${format(day, 'yyyy-MM-dd')} ${slot.start}`, 'yyyy-MM-dd H:mm', new Date());
                                        const slotEnd = parse(`${format(day, 'yyyy-MM-dd')} ${slot.end}`, 'yyyy-MM-dd H:mm', new Date());

                                        const dayFormatted = format(day, 'yyyy-MM-dd');
                                        const isWeekend = weekends?.includes(day.getDay());
                                        const holiday = holidays?.find(h => h.date === dayFormatted);
                                        const isBlocked = isWeekend || !!holiday;
                                        const blockReason = holiday ? `إجازة: ${holiday.reason}` : 'عطلة أسبوعية';

                                        const cellEvents = events.filter(e => {
                                            const eStart = e.startTime.toDate();
                                            const eEnd = e.endTime.toDate();
                                            return eStart < slotEnd && eEnd > slotStart;
                                        });

                                        if (isBlocked && slot.type === 'Class') {
                                            return (
                                                <td key={idx} className="p-2 border-l border-white/5 relative h-32 align-top bg-rose-900/10 cursor-not-allowed">
                                                    <div className="h-full flex items-center justify-center">
                                                        <span className="text-rose-400/50 transform -rotate-45 text-sm font-bold border border-rose-500/20 px-2 py-1 rounded">
                                                            {blockReason}
                                                        </span>
                                                    </div>
                                                </td>
                                            );
                                        }

                                        return (
                                            <td
                                                key={idx}
                                                onClick={() => handleCellClick(day, slot)}
                                                className={`p-2 border-l border-white/5 relative h-32 align-top transition-all 
                                                    ${slot.type !== 'Class' ? 'bg-gray-900/40 cursor-default' : 'hover:bg-indigo-500/10 cursor-pointer'}
                                                `}
                                            >
                                                {slot.type === 'Class' ? (
                                                    <div className="space-y-2">
                                                        {cellEvents.map(ev => (
                                                            <div key={ev.id} onClick={(e) => handleEventClick(e, ev)}
                                                                className={`p-2 rounded-lg text-xs shadow-lg border border-white/10 group
                                                                    ${ev.status === 'Done' ? 'bg-emerald-900/80 border-emerald-500/30' : 'bg-indigo-900/80 border-indigo-500/30'}
                                                                    hover:scale-[1.02] transition-transform cursor-pointer
                                                                `}
                                                            >
                                                                <div className="font-bold text-white truncate">{ev.title}</div>
                                                                <div className="text-gray-300 truncate opacity-80">{ev.venueId}</div>
                                                                <div className="mt-1 flex justify-between items-center text-[10px] text-gray-400">
                                                                    <span>{ev.typeName}</span>
                                                                    {ev.status === 'Done' && <CheckCircle size={10} className="text-emerald-400" />}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {cellEvents.length === 0 && <div className="h-full w-full flex items-center justify-center text-white/5 opacity-0 hover:opacity-100 transition-opacity"><Plus /></div>}
                                                    </div>
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-gray-600 text-xs rotate-90 md:rotate-0">
                                                        {slot.label}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MONTHLY VIEW */}
            {view === 'month' && (
                <div className="bg-black/20 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                    {/* Days Header */}
                    <div className="grid grid-cols-7 bg-white/5 border-b border-white/10">
                        {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(d => (
                            <div key={d} className="p-4 text-center font-bold text-white border-l border-white/5 last:border-0">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-7 auto-rows-[140px]">
                        {(() => {
                            const monthStart = startOfMonth(currentDate);
                            const monthEnd = endOfMonth(monthStart);
                            const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
                            const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

                            const days = [];
                            let day = startDate;
                            while (day <= endDate) {
                                days.push(day);
                                day = addDays(day, 1);
                            }

                            return days.map((day, idx) => {
                                const dayFormatted = format(day, 'yyyy-MM-dd');
                                const isCurrentMonth = isSameDay(day, monthStart) || (day >= monthStart && day <= monthEnd);
                                const isToday = isSameDay(day, new Date());

                                // Blocking Logic
                                const isWeekend = weekends?.includes(day.getDay());
                                const holiday = holidays?.find(h => h.date === dayFormatted);
                                const isBlocked = isWeekend || !!holiday;
                                const blockReason = holiday ? holiday.reason : (isWeekend ? 'عطلة' : '');

                                // Events for this day
                                const dayEvents = events.filter(e => {
                                    const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                    return eDate === dayFormatted;
                                });

                                return (
                                    <div
                                        key={dayFormatted}
                                        onClick={() => !isBlocked && handleCellClick(day, { type: 'Class', start: '08:00', end: '09:00' })}
                                        className={`
                                            p-2 border-b border-l border-white/5 relative transition-all group
                                            ${!isCurrentMonth ? 'bg-black/40 opacity-50' : ''}
                                            ${isBlocked ? 'bg-rose-900/10 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'}
                                            ${isToday ? 'bg-indigo-500/10' : ''}
                                        `}
                                    >
                                        {/* Date Numbers */}
                                        <div className="flex justify-between items-start mb-2">
                                            {calendarSystem === 'hijri' && (
                                                <span className={`text-sm font-bold ${isBlocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {getHijriDay(day)}
                                                </span>
                                            )}
                                            <span className={`text-sm ${isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-400'}`}>
                                                {format(day, 'd')}
                                            </span>
                                        </div>

                                        {/* Blocked Overlay Label */}
                                        {isBlocked && (
                                            <div className="absolute inset-x-0 bottom-2 text-center">
                                                <span className="text-[10px] text-rose-400/70 border border-rose-500/20 px-1 rounded bg-rose-900/20">
                                                    {blockReason}
                                                </span>
                                            </div>
                                        )}

                                        {/* Events Dots/List */}
                                        <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                                            {dayEvents.map(ev => (
                                                <div
                                                    key={ev.id}
                                                    onClick={(e) => handleEventClick(e, ev)}
                                                    className={`
                                                        text-[10px] px-2 py-1 rounded truncate border
                                                        ${ev.status === 'Done'
                                                            ? 'bg-emerald-900/40 border-emerald-500/20 text-emerald-200'
                                                            : 'bg-indigo-900/40 border-indigo-500/20 text-indigo-200'}
                                                    `}
                                                    title={ev.title}
                                                >
                                                    {ev.title}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}

            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={modalData}
                onSave={handleSaveEvent}
                onDelete={confirmDeleteEvent}
                eventTypes={eventTypes}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            <DeleteEventModal
                isOpen={deleteOptsModal.isOpen}
                onClose={() => setDeleteOptsModal({ ...deleteOptsModal, isOpen: false })}
                onConfirm={handleSmartDelete}
                isPastEvent={true}
            />
        </div>
    );
}

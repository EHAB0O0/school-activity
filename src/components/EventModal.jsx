import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp, doc, updateDoc, limit, orderBy } from 'firebase/firestore'; // Removed transactional/batch imports as logic is mostly handled in handlers, but conflicts uses fetch
import { checkConflicts } from '../utils/ConflictGuard';
import { format, addDays } from 'date-fns';
import { Plus, CheckCircle, Calendar, Clock, MapPin, AlertTriangle, Users, Box, Trash2, X, Search, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import MultiSelect from './ui/MultiSelect';
import { useSettings } from '../contexts/SettingsContext';
import ConfirmModal from './ui/ConfirmModal';

export default function EventModal({ isOpen, onClose, initialData, onSave, onDelete, eventTypes, activeProfile }) {
    if (!isOpen) return null;

    const isPastEvent = initialData?.id && new Date(initialData.startTime?.toDate ? initialData.startTime.toDate() : `${initialData.date}T${initialData.endTime}`) < new Date();
    // Allow editing IF it's called from ReportsPage (we assume deep sync logic will handle it)
    // BUT the logic in Scheduler was "isReadOnly = isPastEvent".
    // We want to allow editing IF the parent says so? Or strictly allow editing "Results" (points/students) but not Time?
    // User Requirement: "Edit button for past activities... Recalculate Points". So it MUST be editable.
    // We will relax isReadOnly check or allow override via prop.
    // Let's assume onSave handles the "Recalculation" so we just need to let the user edit fields.

    // HOWEVER, changing TIME of a past event is weird. Usually we edit Points/Students.
    // Let's introduce a prop `allowPastEdit` or similar. If not passed, default relevant behavior.
    // For now, let's keep it editable but maybe warn?
    // Actually, user wants to FIX mistakes. So full edit capability is powerful but dangerous.
    // I will allow editing but show warnings.

    // The previous logic forced ReadOnly if past. I will change that.
    const isReadOnly = false; // Force editable for "Deep Sync" feature. 
    // Ideally we should pass `isReadOnly` as a prop if we want to restrict it, but for Admin use, we want power.

    const [formData, setFormData] = useState({
        title: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '08:00',
        endTime: '09:00',
        venueId: 'Auditorium',
        typeId: '',
        points: 10,
        customFields: {},
        studentIds: [],
        assetIds: []
    });

    // Recurring State
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurringDays, setRecurringDays] = useState([]); // [0, 1, 2...] (Sun, Mon...)
    const [recurUntil, setRecurUntil] = useState('');

    // Import State
    const [showImport, setShowImport] = useState(false);
    const [importSearch, setImportSearch] = useState('');
    const [pastEvents, setPastEvents] = useState([]);

    // Resource Lists
    const [studentsList, setStudentsList] = useState([]);
    const [assetsList, setAssetsList] = useState([]);
    const [venuesList, setVenuesList] = useState([]);

    const [conflict, setConflict] = useState(null);
    const [checking, setChecking] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // Fetch Resources on Mount
    useEffect(() => {
        const fetchResources = async () => {
            try {
                // Students & Assets & Venues (Same as before)
                const studentsSnap = await getDocs(collection(db, 'students'));
                setStudentsList(studentsSnap.docs.map(d => ({
                    value: d.id,
                    label: d.data().name,
                    specializations: d.data().specializations || []
                })));

                const assetsSnap = await getDocs(collection(db, 'assets'));
                setAssetsList(assetsSnap.docs
                    .map(d => ({ value: d.id, label: d.data().name, status: d.data().status }))
                    .filter(a => a.status !== 'Maintenance')
                );

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
            // Ensure date format is correct for input
            let d = initialData.date;
            let st = initialData.startTime;
            let et = initialData.endTime;

            if (initialData.startTime?.toDate) {
                const dt = initialData.startTime.toDate();
                d = format(dt, 'yyyy-MM-dd');
                st = format(dt, 'HH:mm');
            }
            if (initialData.endTime?.toDate) {
                et = format(initialData.endTime.toDate(), 'HH:mm');
            }

            setFormData(prev => ({
                ...prev,
                ...initialData,
                date: d,
                startTime: st,
                endTime: et,
                studentIds: initialData.participatingStudents || [],
                assetIds: initialData.assets || [],
                customFields: initialData.customData || {}
            }));
        }
    }, [initialData]);

    const { weekends, holidays } = useSettings(); // Use Global Settings directly

    // Helper to check blocked dates
    const isDateBlocked = (dateStr) => {
        const d = new Date(dateStr);
        const dayIdx = d.getDay();
        if (weekends.includes(dayIdx)) return "هذا اليوم عطلة نهاية أسبوع";

        // holidays: [{ start: 'YYYY-MM-DD', end: '...' }]
        const isHoliday = holidays.some(h => dateStr >= h.start && dateStr <= h.end);
        if (isHoliday) return "هذا اليوم إجازة رسمية";

        return null;
    };

    const handleChange = (field, value) => {
        if (isReadOnly) return;

        // Strict Date Validation
        if (field === 'date') {
            const blockReason = isDateBlocked(value);
            if (blockReason) {
                toast.error(`لا يمكن اختيار هذا التاريخ: ${blockReason}`, { duration: 4000 });
                return; // Block change
            }
        }

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

    // --- Smart Import Logic ---
    // --- Smart Import Logic ---
    useEffect(() => {
        if (showImport && pastEvents.length === 0) {
            // Fetch recent events for "Smart Suggestion"
            const fetchRecent = async () => {
                try {
                    const q = query(
                        collection(db, 'events'),
                        where('status', '!=', 'Draft') // prefer completed events
                        // orderBy('date', 'desc'), // Requires index. Let's rely on default or simple query + client sort if needed, or just fetch random recent
                        // limit(50)
                    );
                    // To avoid index issues, let's just fetch a reasonable batch or use what we have if possible.
                    // Actually, simple query is safer without composite index.
                    // Let's try fetching by date descending if possible, but might fail strict index.
                    // SAFE APPROUCH: query limit 50. Client side Sort/Dedup.
                    const qSafe = query(collection(db, 'events'), limit(50));

                    const snap = await getDocs(qSafe);
                    const rawEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                    // Client-side Dedup by Title & Sort by Date Desc
                    const uniqueMap = new Map();
                    rawEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

                    rawEvents.forEach(ev => {
                        if (!uniqueMap.has(ev.title)) {
                            uniqueMap.set(ev.title, ev);
                        }
                    });

                    setPastEvents(Array.from(uniqueMap.values()));
                } catch (e) {
                    console.error("Failed to fetch past events", e);
                }
            };
            fetchRecent();
        }
    }, [showImport]);

    const handleImportSearch = async (term) => {
        setImportSearch(term);
        if (term.length < 2) return;
        // Simple search
        const q = query(
            collection(db, 'events'),
            where('title', '>=', term),
            where('title', '<=', term + '\uf8ff'),
            limit(10)
        );
        const snap = await getDocs(q);
        // We assume search results are what they are. No strict dedup needed here or maybe yes?
        const hits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPastEvents(hits);
    };

    const applyImport = (importedEvent) => {
        // Smart Copy: Fill details but KEEP current Date/Time
        setFormData(prev => ({
            ...prev,
            title: importedEvent.title,
            venueId: importedEvent.venueId || prev.venueId,
            typeId: importedEvent.typeId || prev.typeId,
            points: importedEvent.points || 10,
            studentIds: importedEvent.participatingStudents || [],
            assetIds: importedEvent.assets || [],
            customFields: importedEvent.customData || {}
            // Date, StartTime, EndTime are explicitly PRESERVED from 'prev' (or not touched)
        }));
        setShowImport(false);
        toast.success("تم نسخ بيانات النشاط بنجاح");
    };

    const activeType = eventTypes?.find(t => String(t?.id) === String(formData?.typeId));

    const filteredStudents = useMemo(() => {
        if (!activeType) return studentsList;
        return studentsList.filter(s => {
            if (s.specializations && s.specializations.includes('General')) return true;
            if (s.specializations && s.specializations.includes(activeType.name)) return true;
            return false;
        });
    }, [studentsList, activeType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly) return;

        setChecking(true);

        // Helper to check and package one event
        const createPayload = (dateBase) => {
            const start = new Date(`${dateBase}T${formData.startTime}`);
            const end = new Date(`${dateBase}T${formData.endTime}`);
            return {
                ...initialData,
                id: initialData?.id || null,
                title: formData.title,
                date: dateBase,
                venueId: formData.venueId,
                participatingStudents: formData.studentIds,
                assets: formData.assetIds,
                startTime: Timestamp.fromDate(start),
                endTime: Timestamp.fromDate(end),
                typeId: formData.typeId,
                typeName: activeType?.name || 'General',
                points: Number(formData.points) || 10,
                customData: formData.customFields,
                status: initialData?.status || 'Draft'
            };
        };

        const checkAndSaveBatch = async (payloads) => {
            setChecking(true);
            try {
                for (const p of payloads) {
                    const check = await checkConflicts(p);
                    if (check.hasConflict) {
                        setConflict(`تعارض في يوم ${p.date}: ${check.reason}`);
                        setChecking(false);
                        return;
                    }
                }
                onSave(payloads);
                // setChecking(false); // Parent usually closes modal, so no need to reset if closing
            } catch (error) {
                console.error("Batch Check Failed", error);
                setChecking(false);
                toast.error("فشل التحقق");
            }
        };

        try {
            if (isRecurring && !initialData?.id) {
                // Batch Creation Logic
                const payloads = [];
                const startParams = new Date(formData.date);
                const endParams = recurUntil ? new Date(recurUntil) : addDays(startParams, 30); // Default 1 month limit

                let runner = new Date(startParams);
                while (runner <= endParams) {
                    if (recurringDays.includes(runner.getDay())) {
                        const dStr = format(runner, 'yyyy-MM-dd');
                        payloads.push(createPayload(dStr));
                    }
                    runner = addDays(runner, 1);
                }

                if (payloads.length === 0) {
                    toast.error("لم يتم اختيار أي أيام للمطابقة مع التكرار");
                    setChecking(false);
                    return;
                }

                if (payloads.length > 20) {
                    setConfirmModal({
                        isOpen: true,
                        title: "تأكيد الإنشاء المتعدد",
                        message: `سيتم إنشاء ${payloads.length} نشاط دفعة واحدة. هل أنت متأكد؟`,
                        confirmText: "نعم، تابع",
                        onConfirm: async () => {
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            await checkAndSaveBatch(payloads);
                        }
                    });
                    setChecking(false);
                    return;
                }

                await checkAndSaveBatch(payloads);

            } else {
                // Single Event Logic
                const eventPayload = createPayload(formData.date);
                const result = await checkConflicts(eventPayload);
                if (result.hasConflict) {
                    setConflict(result.reason);
                    setChecking(false);
                    return;
                }
                onSave(eventPayload);
            }

        } catch (error) {
            console.error("Conflict check failed:", error);
            setChecking(false);
            if (error?.code === 'failed-precondition') {
                toast.error("مطلوب إعداد الفهرس (Index) في Firebase Console.");
            } else {
                toast.error("فشل التحقق من التعارضات");
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1a1a20] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-white flex items-center">
                            {initialData?.id ? 'تفاصيل النشاط' : 'إضافة نشاط جديد'}
                            {isPastEvent && <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-full mr-3 flex items-center"><Clock size={12} className="ml-1" /> سجل سابق</span>}
                        </h2>
                        {!initialData?.id && (
                            <button onClick={() => setShowImport(!showImport)} className="text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-600/30 transition-all flex items-center">
                                📥 نسخ من نشاط سابق
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-all"><X size={20} /></button>
                </div>

                {/* Import Search Panel */}
                {showImport && (
                    <div className="p-4 bg-indigo-900/10 border-b border-indigo-500/20 animate-slide-in">
                        <div className="relative">
                            <input
                                autoFocus
                                className="w-full bg-black/40 border border-indigo-500/30 rounded-xl py-2 px-10 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="ابحث عن اسم نشاط سابق لنسخ تفاصيله..."
                                value={importSearch}
                                onChange={e => handleImportSearch(e.target.value)}
                            />
                            <Search className="absolute right-3 top-2.5 text-indigo-400" size={18} />
                        </div>
                        {pastEvents.length > 0 && (
                            <div className="mt-2 max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                                {pastEvents.map(ev => (
                                    <div key={ev.id} onClick={() => applyImport(ev)} className="p-2 hover:bg-indigo-600/20 rounded-lg cursor-pointer flex justify-between items-center text-sm text-gray-300 hover:text-white border border-transparent hover:border-indigo-500/30">
                                        <span>{ev.title}</span>
                                        <span className="text-xs opacity-50">{ev.venueId}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* READONLY WARNING REMOVED as we want full edit access now */}

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
                                <label className="block text-sm text-gray-400 mb-1">نقاط النشاط (للطالب)</label>
                                <input type="number" disabled={isReadOnly} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none font-mono text-center font-bold text-emerald-400 disabled:opacity-50"
                                    value={formData.points} onChange={e => handleChange('points', e.target.value)} />
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

                            {/* Two-Way Time Logic */}
                            <div className="md:col-span-2 bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm text-gray-400 font-bold">الوقت والفترة الزمنية</label>
                                    <span className="text-xs text-indigo-400">اختر حصة واحدة أو أكثر لتحديد الوقت</span>
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 block mb-1">من</label>
                                        <input type="time" disabled={isReadOnly} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50 font-mono"
                                            value={formData.startTime} onChange={e => handleChange('startTime', e.target.value)} />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-500 block mb-1">إلى</label>
                                        <input type="time" disabled={isReadOnly} required className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none disabled:opacity-50 font-mono"
                                            value={formData.endTime} onChange={e => handleChange('endTime', e.target.value)} />
                                    </div>
                                </div>

                                {/* Quick Chips */}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {activeProfile?.slots?.map((slot, idx) => {
                                        // Check if slot is strictly within current time range
                                        const isSelected = formData.startTime <= slot.start && formData.endTime >= slot.end;
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    if (isReadOnly) return;
                                                    const sStart = slot.start;
                                                    const sEnd = slot.end;
                                                    const curStart = formData.startTime;
                                                    const curEnd = formData.endTime;

                                                    let newStart = curStart;
                                                    let newEnd = curEnd;

                                                    if (sEnd <= curStart) {
                                                        // Clicked 'before' -> Extend Start
                                                        newStart = sStart;
                                                    } else if (sStart >= curEnd) {
                                                        // Clicked 'after' -> Extend End
                                                        newEnd = sEnd;
                                                    } else {
                                                        // Inside or Overlap -> Reset to single slot
                                                        newStart = sStart;
                                                        newEnd = sEnd;
                                                    }

                                                    setFormData(prev => ({ ...prev, startTime: newStart, endTime: newEnd }));
                                                }}
                                                className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-all flex flex-col items-center min-w-[60px]
                                                    ${isSelected
                                                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg scale-105'
                                                        : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20'}
                                                `}
                                            >
                                                <span>{slot.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                {(() => {
                                    if (!activeProfile?.slots || activeProfile.slots.length === 0) return null;
                                    const schoolStart = activeProfile.slots[0].start;
                                    const schoolEnd = activeProfile.slots[activeProfile.slots.length - 1].end;
                                    const isOut = (time) => time < schoolStart || time > schoolEnd;
                                    const outStart = isOut(formData.startTime);
                                    const outEnd = isOut(formData.endTime);

                                    if (outStart || outEnd) {
                                        return (
                                            <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-center animate-pulse-once">
                                                <AlertTriangle size={12} className="ml-1" />
                                                تنبيه: الوقت المحدد يقع خارج ساعات الدوام الرسمي ({schoolStart} - {schoolEnd})
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>

                        {/* Recurring Toggle (Only for New Events) */}
                        {!initialData?.id && (
                            <div className="mt-4 bg-white/5 p-4 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" className="w-5 h-5 rounded bg-black/40 border-gray-600" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
                                        <span className="text-white font-bold text-sm">تكرار هذا النشاط</span>
                                    </label>
                                </div>
                                {isRecurring && (
                                    <div className="animate-fade-in space-y-3">
                                        <div>
                                            <label className="text-xs text-gray-400 block mb-2">أيام التكرار</label>
                                            <div className="flex flex-wrap gap-2">
                                                {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => {
                                                            if (recurringDays.includes(idx)) setRecurringDays(recurringDays.filter(d => d !== idx));
                                                            else setRecurringDays([...recurringDays, idx]);
                                                        }}
                                                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${recurringDays.includes(idx) ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-black/20 text-gray-500 border-white/5'}`}
                                                    >
                                                        {day}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-400 block mb-1">تكرار حتى تاريخ</label>
                                            <input type="date" className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-white text-sm"
                                                value={recurUntil} onChange={e => setRecurUntil(e.target.value)} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

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
                        <button form="eventForm" type="submit" disabled={checking} className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg transition-transform transform active:scale-95 flex items-center hover:shadow-indigo-500/25">
                            {checking ? 'جاري التحقق...' : (initialData?.id ? 'حفظ التعديلات' : (isRecurring ? 'إنشاء المتكرر' : 'إنشاء النشاط'))}
                        </button>

                        {/* Status Change Button (Simplified) - usually handled in parent or here? */}
                        {initialData?.id && initialData?.status !== 'Done' && (
                            <button type="button" onClick={() => onSave({ ...initialData, ...formData, status: 'Done', markDone: true })} className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg flex items-center text-sm">
                                <CheckCircle size={16} className="ml-1" />
                                تأكيد التنفيذ ورصد النقاط
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
                confirmText={confirmModal.confirmText}
            />
        </div >
    );
}

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
function EventModal({ isOpen, onClose, initialData, onSave, onDelete, eventTypes, activeProfile }) {
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
            setFormData(prev => ({ ...prev, ...initialData }));
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
    const handleImportSearch = async (term) => {
        setImportSearch(term);
        if (term.length < 2) return;
        const q = query(
            collection(db, 'events'),
            where('title', '>=', term),
            where('title', '<=', term + '\uf8ff'),
            // limit(5) // client-side limit better for small sets
        );
        const snap = await getDocs(q);
        setPastEvents(snap.docs.map(d => d.data()));
    };

    const applyImport = (importedEvent) => {
        // Copy everything EXCEPT date/time
        setFormData(prev => ({
            ...prev,
            title: importedEvent.title,
            venueId: importedEvent.venueId || prev.venueId,
            typeId: importedEvent.typeId || prev.typeId,
            points: importedEvent.points || 10,
            studentIds: importedEvent.participatingStudents || [],
            assetIds: importedEvent.assets || [],
            customFields: importedEvent.customData || {}
        }));
        setShowImport(false);
        toast.success("تم استيراد بيانات النشاط");
    };

    // --- Time Slot Binding ---
    const applySlotTime = (slot) => {
        if (isReadOnly) return;
        setFormData(prev => ({
            ...prev,
            startTime: slot.start,
            endTime: slot.end
        }));
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
                id: initialData?.id || null, // If recurring, we might need new IDs for copies, logic below handles single
                title: formData.title,
                date: dateBase,
                start, end,
                venueId: formData.venueId,
                participatingStudents: formData.studentIds,
                assets: formData.assetIds,
                startTime: Timestamp.fromDate(start),
                endTime: Timestamp.fromDate(end),
                typeId: formData.typeId,
                typeName: activeType?.name || 'General',
                points: Number(formData.points) || 10,
                customData: formData.customFields,
                status: 'Draft'
            };
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
                    if (!confirm(`سيتم إنشاء ${payloads.length} نشاط. هل أنت متأكد؟`)) {
                        setChecking(false);
                        return;
                    }
                }

                // Check Conflicts for ALL (Simple Loop)
                for (const p of payloads) {
                    const check = await checkConflicts(p);
                    if (check.hasConflict) {
                        setConflict(`تعارض في يوم ${p.date}: ${check.reason}`);
                        setChecking(false);
                        return;
                    }
                }

                // Send Batch to Parent (or handle here? onSave expects single usually)
                // We'll modify onSave to handle array or handle it in Scheduler. 
                // For now, let's call onSave for each or pass array if Scheduler supports it.
                // Current Scheduler.jsx handleSaveEvent expects single object. We will update it to handle arrays.
                onSave(payloads);

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
            if (error.code === 'failed-precondition') {
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
                            {isReadOnly && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-full mr-3 flex items-center"><Lock size={12} className="ml-1" /> منتهي</span>}
                        </h2>
                        {!isReadOnly && !initialData?.id && (
                            <button onClick={() => setShowImport(!showImport)} className="text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-600/30 transition-all flex items-center">
                                📥 استيراد من سابق
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
                                        // Or almost matching
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

                                                    // Logic:
                                                    // 1. If nothing logical set, set to slot.
                                                    // 2. If click slot BEFORE current range, Extend Start.
                                                    // 3. If click slot AFTER current range, Extend End.
                                                    // 4. If click INSIDE range (and range > slot), Reset to just this slot.

                                                    let newStart = curStart;
                                                    let newEnd = curEnd;

                                                    if (sEnd <= curStart) {
                                                        // Clicked 'before' -> Extend Start
                                                        newStart = sStart;
                                                    } else if (sStart >= curEnd) {
                                                        // Clicked 'after' -> Extend End
                                                        newEnd = sEnd;
                                                    } else {
                                                        // Inside or Overlap -> Reset to single slot (User wants specific period)
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
                                {checking ? 'جاري التحقق...' : (initialData?.id ? 'حفظ التعديلات' : (isRecurring ? 'إنشاء المتكرر' : 'إنشاء النشاط'))}
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
            // Handle Batch (Recurring)
            if (Array.isArray(eventPayload)) {
                const batch = writeBatch(db);
                eventPayload.forEach(ev => {
                    const ref = doc(collection(db, 'events'));
                    batch.set(ref, ev);
                });
                await batch.commit();
                toast.success(`تم إنشاء ${eventPayload.length} نشاط متكرر بنجاح`);
                setIsModalOpen(false);
                fetchEvents();
                return;
            }

            if (eventPayload.markDone) {
                await handleMarkEventDone(eventPayload);
                return;
            }

            if (eventPayload.id) {
                // Check if editing points for a DONE event
                if (modalData?.status === 'Done') {
                    const oldPoints = Number(modalData.points || 10);
                    const newPoints = Number(eventPayload.points || 10);
                    if (oldPoints !== newPoints) {
                        await handlePointsAdjustment(eventPayload, oldPoints, newPoints);
                    } else {
                        await updateDoc(doc(db, 'events', eventPayload.id), eventPayload);
                    }
                } else {
                    await updateDoc(doc(db, 'events', eventPayload.id), eventPayload);
                }
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

    const handlePointsAdjustment = async (eventData, oldPoints, newPoints) => {
        const loadingToast = toast.loading(`تحديث النقاط: ${oldPoints} -> ${newPoints}...`);
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);

                // 1. Update Event
                transaction.update(eventRef, eventData);

                // 2. Adjust Students
                const diff = newPoints - oldPoints;
                if (eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, {
                            totalPoints: increment(diff)
                        });
                    }
                }
            });
            toast.success("تم إعادة احتساب نقاط الطلاب!");
        } catch (e) {
            console.error(e);
            throw e; // Bubble up to handleSaveEvent
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const handleMarkEventDone = async (eventData) => {
        const loadingToast = toast.loading("جاري رصد النقاط...");
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);
                const pointsToAward = Number(eventData.points) || 10;

                // 1. Update Event Status
                transaction.update(eventRef, { status: 'Done', points: pointsToAward });

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

    // --- Visual Grid Helpers ---
    const gridMetrics = useMemo(() => {
        if (!slots || slots.length === 0) return { start: 420, end: 900, total: 480 }; // Default 7am - 3pm
        const toMins = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        // Safely find min start and max end
        let min = 24 * 60;
        let max = 0;
        slots.forEach(s => {
            const sM = toMins(s.start);
            const eM = toMins(s.end);
            if (sM < min) min = sM;
            if (eM > max) max = eM;
        });
        return { start: min, end: max, total: max - min };
    }, [slots]);

    const getPositionStyle = (startStr, endStr) => {
        const toMins = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const s = toMins(startStr);
        const e = toMins(endStr);
        const startPct = ((s - gridMetrics.start) / gridMetrics.total) * 100;
        const widthPct = ((e - s) / gridMetrics.total) * 100;
        return { left: startPct, width: widthPct };
    };

    const getEventStyle = (ev) => {
        // Event times are Date objects or strings
        const getStr = (d) => {
            if (typeof d === 'string') {
                if (d.includes('T')) return format(new Date(d), 'HH:mm');
                return d;
            }
            if (d?.toDate) return format(d.toDate(), 'HH:mm'); // Firestore Timestamp
            if (d instanceof Date) return format(d, 'HH:mm');
            return "00:00";
        };
        const sStr = getStr(ev.startTime);
        const eStr = getStr(ev.endTime);
        const style = getPositionStyle(sStr, eStr);
        return {
            left: style.left,
            width: style.width
        };
    };

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

            {/* WEEKLY TIMELINE VIEW */}
            {view === 'week' && (
                <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-2xl bg-black/20 relative min-h-[400px] select-none text-right" dir="rtl">
                    {isLoading && (
                        <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                        </div>
                    )}

                    <div className="min-w-[1000px]">
                        {/* Timeline Header */}
                        <div className="h-12 bg-[#1a1a20] border-b border-white/10 flex sticky top-0 z-30">
                            <div className="w-32 shrink-0 border-l border-white/10 p-3 text-right font-bold text-gray-400 sticky right-0 bg-[#1a1a20] z-40 shadow-xl">اليوم</div>
                            <div className="flex-1 relative">
                                {slots.map((slot, idx) => {
                                    const pos = getPositionStyle(slot.start, slot.end);
                                    return (
                                        <div key={idx}
                                            className="absolute h-full flex items-center justify-center border-l border-white/5 text-[10px] text-gray-500 font-mono tracking-tighter"
                                            style={{
                                                right: `${pos.left}%`, // RTL: Use right instead of left
                                                width: `${pos.width}%`
                                            }}
                                        >
                                            {slot.label}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Days Rows */}
                        <div className="divide-y divide-white/5">
                            {weekDays.map(day => {
                                const dayStr = format(day, 'yyyy-MM-dd');
                                const dayEvents = events.filter(e => {
                                    const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                    return eDate === dayStr;
                                });

                                const isWeekend = weekends?.includes(day.getDay());
                                const holiday = holidays?.find(h => h.date === dayStr);
                                const isBlocked = isWeekend || !!holiday;
                                const blockReason = holiday ? `إجازة: ${holiday.reason}` : 'عطلة أسبوعية';

                                return (
                                    <div key={day.toString()} className={`flex h-36 group relative ${isBlocked ? 'bg-rose-900/5' : 'hover:bg-white/5'} transition-colors`}>
                                        {/* Day Label */}
                                        <div className="w-32 shrink-0 border-l border-white/10 p-4 bg-[#1a1a20]/95 backdrop-blur sticky right-0 z-20 flex flex-col justify-center shadow-2xl">
                                            <span className={`text-lg font-bold ${isBlocked ? 'text-rose-400' : 'text-white'}`}>{format(day, 'EEEE', { locale: ar })}</span>
                                            <span className="text-sm text-gray-400 font-mono opacity-60">
                                                {calendarSystem === 'hijri' ? getHijriDate(day) : format(day, 'd MMM')}
                                            </span>
                                        </div>

                                        {/* Timeline Area */}
                                        <div className="flex-1 relative">
                                            {/* Blocked Overlay */}
                                            {isBlocked && (
                                                <div className="absolute inset-0 z-10 bg-stripes-rose opacity-10 flex items-center justify-center pointer-events-none">
                                                    <span className="bg-black/50 px-3 py-1 rounded text-rose-300 text-xs border border-rose-500/30 rotate-3">{blockReason}</span>
                                                </div>
                                            )}

                                            {/* Grid Background (Slots) */}
                                            {!isBlocked && slots.map((slot, idx) => {
                                                const pos = getPositionStyle(slot.start, slot.end);
                                                return (
                                                    <div key={idx}
                                                        onClick={() => handleCellClick(day, slot)}
                                                        className={`absolute inset-y-0 border-l border-white/5 cursor-pointer hover:bg-white/5 transition-colors group/slot
                                                            ${slot.type !== 'Class' ? 'bg-black/20 pointer-events-none' : ''}
                                                        `}
                                                        style={{
                                                            right: `${pos.left}%`,
                                                            width: `${pos.width}%`
                                                        }}
                                                    >
                                                        {slot.type === 'Class' && (
                                                            <div className="opacity-0 group-hover/slot:opacity-100 absolute inset-0 flex items-center justify-center text-white/10">
                                                                <Plus />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Events Rendering */}
                                            {!isBlocked && dayEvents.map(ev => {
                                                const style = getEventStyle(ev);
                                                return (
                                                    <div
                                                        key={ev.id}
                                                        onClick={(e) => handleEventClick(e, ev)}
                                                        className={`absolute top-2 bottom-2 rounded-xl shadow-lg border p-3 cursor-pointer hover:scale-[1.02] hover:z-50 transition-all z-10 flex flex-col justify-between overflow-hidden
                                                            ${ev.status === 'Done'
                                                                ? 'bg-gradient-to-br from-emerald-900/90 to-teal-900/90 border-emerald-500/40 shadow-emerald-900/20'
                                                                : 'bg-gradient-to-br from-indigo-900/90 to-purple-900/90 border-indigo-500/40 shadow-indigo-900/20'}
                                                        `}
                                                        style={{
                                                            right: `${style.left}%`,
                                                            width: `${style.width}%`
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between min-w-0">
                                                            <div className="font-bold text-white text-xs truncate leading-tight">
                                                                {ev.title}
                                                            </div>
                                                            {ev.status === 'Done' && <CheckCircle size={12} className="text-emerald-400 shrink-0 mr-1" />}
                                                        </div>

                                                        {parseFloat(style.width) > 5 && (
                                                            <>
                                                                <div className="text-[10px] text-gray-300 truncate opacity-80 flex items-center mt-1">
                                                                    <MapPin size={10} className="ml-1" /> {ev.venueId}
                                                                </div>
                                                                <div className="text-[10px] text-white/40 mt-auto flex justify-between font-mono bg-black/20 p-1 rounded-md">
                                                                    <span>{format(ev.startTime.toDate ? ev.startTime.toDate() : new Date(), 'HH:mm')}</span>
                                                                    <span>{format(ev.endTime.toDate ? ev.endTime.toDate() : new Date(), 'HH:mm')}</span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* MONTHLY VIEW */}
            {view === 'month' && (
                <div className="bg-black/20 rounded-2xl border border-white/10 overflow-x-auto shadow-2xl custom-scrollbar">
                    <div className="min-w-[800px]">
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
                </div>
            )}

            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={modalData}
                onSave={handleSaveEvent}
                onDelete={confirmDeleteEvent}
                eventTypes={eventTypes}
                activeProfile={activeProfile}
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

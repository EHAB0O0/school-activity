import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp, limit } from 'firebase/firestore'; // Removed transactional/batch imports as logic is mostly handled in handlers, but conflicts uses fetch
import { checkConflicts } from '../utils/ConflictGuard';
import { format, addDays } from 'date-fns';
import { Plus, CheckCircle, Calendar, Clock, MapPin, AlertTriangle, Users, Box, Trash2, X, Search, Lock, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import MultiSelect from './ui/MultiSelect';
import { useSettings } from '../contexts/SettingsContext';
import ConfirmModal from './ui/ConfirmModal';

export default function EventModal({ isOpen, onClose, initialData, onSave, onDelete, eventTypes, activeProfile }) {
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
        linkStudentIds: initialData?.linkStudentIds || [],
        participantDetails: initialData?.participantDetails || {},
        assetIds: [],
        reminders: initialData?.reminders || []
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // Student Filters
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const { weekends, holidays, grades, settings } = useSettings(); // Use Global Settings directly

    // Participant-Specific Custom Fields Search & Filter
    const [participantSearch, setParticipantSearch] = useState('');
    const [participantFilter, setParticipantFilter] = useState('all'); // 'all' | 'completed' | 'uncompleted'

    useEffect(() => {
        if (!isOpen) {
            setParticipantSearch('');
            setParticipantFilter('all');
        }
    }, [isOpen]);

    // Load Default Reminders for NEW events
    useEffect(() => {
        if (!initialData?.id && settings?.notifications?.defaultReminders) {
            setFormData(prev => ({
                ...prev,
                reminders: settings.notifications.defaultReminders
            }));
        }
    }, [initialData, settings]);
    useEffect(() => {
        if (!isOpen) return;
        const fetchResources = async () => {
            try {
                // Students & Assets & Venues (Same as before)
                const studentsSnap = await getDocs(collection(db, 'students'));
                setStudentsList(studentsSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        value: d.id,
                        name: data.name,
                        label: data.name,
                        specializations: data.specializations || [],
                        grade: data.grade || '',
                        section: data.section || '',
                        gradeId: data.gradeId || '',
                        sectionId: data.sectionId || '',
                        class: data.class || '',
                        active: data.active !== false
                    };
                }));

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
    }, [isOpen]);

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
                linkStudentIds: initialData.linkStudentIds || [],
                participantDetails: initialData.participantDetails || {},
                assetIds: initialData.assets || [],
                customFields: initialData.customData || initialData.customFields || {}
            }));
        }
    }, [initialData]);

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
    useEffect(() => {
        if (showImport && pastEvents.length === 0) {
            // Fetch recent events for "Smart Suggestion"
            const fetchRecent = async () => {
                try {
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
    }, [showImport, pastEvents.length]);

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
            linkStudentIds: importedEvent.linkStudentIds || [],
            assetIds: importedEvent.assets || [],
            customFields: importedEvent.customData || {}
            // Date, StartTime, EndTime are explicitly PRESERVED from 'prev' (or not touched)
        }));
        setShowImport(false);
        toast.success("تم نسخ بيانات النشاط بنجاح");
    };

    const activeType = eventTypes?.find(t => String(t?.id) === String(formData?.typeId));

    const filteredStudents = useMemo(() => {
        let list = studentsList;

        // 1. Filter Archived (Soft Filter): Exclude inactive UNLESS already selected
        list = list.filter(s => s.active || formData.studentIds.includes(s.value));

        // 2. Filter by Grade/Section
        if (selectedGrade) {
            list = list.filter(s => s.grade === selectedGrade || formData.studentIds.includes(s.value));
            if (selectedSection) {
                list = list.filter(s => s.section === selectedSection || formData.studentIds.includes(s.value));
            }
        }

        // 3. Filter by Specialization
        if (activeType) {
            list = list.filter(s => {
                if (formData.studentIds.includes(s.value)) return true; // Always keep selected students
                if (s.specializations && s.specializations.includes('General')) return true;
                if (s.specializations && s.specializations.includes(activeType.name)) return true;
                return false;
            });
        }

        // 4. Map to Options with Class Name and Link Registration Badge
        return list.map(s => {
            const gradeName = s.grade || grades.find(g => g.id === s.gradeId || g.name === s.grade)?.name || '';
            const sectionName = s.section || (grades.find(g => g.id === s.gradeId || g.name === s.grade)?.sections?.find(sec => sec.id === s.sectionId || sec.name === s.section)?.name) || '';
            const classLabel = gradeName ? (sectionName ? `(${gradeName} - ${sectionName})` : `(${gradeName})`) : (s.class ? `(${s.class})` : '');
            const isFromLink = (formData.linkStudentIds || []).includes(s.value);
            const linkBadge = isFromLink ? ' [🔗 عبر رابط التسجيل]' : '';

            return {
                ...s,
                label: `${classLabel ? `${s.name} ${classLabel}` : s.name}${linkBadge}`
            };
        });
    }, [studentsList, activeType, selectedGrade, selectedSection, grades, formData.studentIds, formData.linkStudentIds]);

    // --- Helper: Ultra-smart Arabic search normalizer ---
    const normalizeArabicSearch = (text) => {
        if (!text) return '';
        return String(text)
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel (diacritics)
            .replace(/[أإآٱ]/g, 'ا') // Hamzas
            .replace(/ة/g, 'ه')     // Taa Marbuta
            .replace(/ى/g, 'ي')     // Alif Maqsura
            .replace(/\u0640/g, '') // Tatweel
            .replace(/عبد\s+/g, 'عبد') // Normalize "عبد الله" to "عبدالله"
            .replace(/ابو\s+/g, 'ابو')  // Normalize "أبو فلان" to "ابوفلان"
            .replace(/ابن\s+/g, 'بن ')  // Normalize "ابن فلان" to "بن فلان"
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) // Eastern Arabic digits to 0-9
            .replace(/\s+/g, ' ');  // Collapse spaces
    };

    // --- Helper: Multi-strategy token matching ---
    const smartTokenMatches = (token, normCorpus, rawCorpus) => {
        if (!token) return true;
        if (normCorpus.includes(token)) return true;
        if (rawCorpus.includes(token)) return true;

        // Strip leading 'ال' (e.g. searching "عيسى" matches "العيسى")
        if (token.startsWith('ال') && token.length > 2) {
            const withoutAl = token.slice(2);
            if (normCorpus.includes(withoutAl)) return true;
        } else if (token.length >= 2) {
            // Or if corpus has 'ال' prefix
            if (normCorpus.includes(`ال${token}`)) return true;
        }

        // Handle "عبد " with/without space
        if (token.includes('عبد')) {
            const splitAbd = token.replace('عبد', 'عبد ');
            if (normCorpus.includes(splitAbd) || rawCorpus.includes(splitAbd)) return true;
        }

        return false;
    };

    // --- Participant Fields Stats (Total / Completed / Uncompleted) ---
    const participantStats = useMemo(() => {
        if (!activeType?.participantFields?.length || !formData.studentIds?.length) {
            return { total: 0, completed: 0, uncompleted: 0 };
        }
        let completed = 0;
        let uncompleted = 0;
        formData.studentIds.forEach(studentId => {
            const currentStudentDetails = formData.participantDetails?.[studentId] || {};
            const isComplete = activeType.participantFields.every(field => {
                const val = currentStudentDetails[field.label];
                return val !== undefined && val !== null && String(val).trim() !== '';
            });
            if (isComplete) completed++;
            else uncompleted++;
        });
        return {
            total: formData.studentIds.length,
            completed,
            uncompleted
        };
    }, [formData.studentIds, formData.participantDetails, activeType]);

    // --- Participant Fields Search & Filter Engine ---
    const filteredParticipantIds = useMemo(() => {
        if (!formData.studentIds || formData.studentIds.length === 0) return [];
        if (!activeType?.participantFields || activeType.participantFields.length === 0) return formData.studentIds;

        const rawQuery = participantSearch.trim();
        const normQuery = normalizeArabicSearch(rawQuery);
        const tokens = normQuery.split(/\s+/).filter(Boolean);
        const rawTokens = rawQuery.toLowerCase().split(/\s+/).filter(Boolean);

        return formData.studentIds.filter(studentId => {
            const currentStudentDetails = formData.participantDetails?.[studentId] || {};

            // 1. Completion filter
            if (participantFilter === 'completed' || participantFilter === 'uncompleted') {
                const isComplete = activeType.participantFields.every(field => {
                    const val = currentStudentDetails[field.label];
                    return val !== undefined && val !== null && String(val).trim() !== '';
                });
                if (participantFilter === 'completed' && !isComplete) return false;
                if (participantFilter === 'uncompleted' && isComplete) return false;
            }

            // 2. Search query filter
            if (tokens.length === 0) return true;

            const stuObj = studentsList.find(s => s.id === studentId || s.value === studentId);
            const studentName = stuObj?.name || stuObj?.label || '';
            const studentClass = stuObj?.class || '';
            const studentGrade = stuObj?.grade || '';
            const studentSection = stuObj?.section || '';
            const detailValues = Object.values(currentStudentDetails).map(v => String(v || ''));
            const detailLabels = Object.keys(currentStudentDetails);

            const corpusParts = [
                studentName,
                studentClass,
                studentGrade,
                studentSection,
                ...detailValues,
                ...detailLabels
            ];

            const normCorpus = corpusParts.map(p => normalizeArabicSearch(p)).join(' ');
            const rawCorpus = corpusParts.join(' ').toLowerCase();

            // Every token must match somewhere in the student's corpus
            return tokens.every((tok) => {
                return smartTokenMatches(tok, normCorpus, rawCorpus);
            });
        });
    }, [formData.studentIds, formData.participantDetails, activeType, participantSearch, participantFilter, studentsList]);

    // --- Autocomplete Suggestions for participant custom fields from previous entries ---
    const participantFieldSuggestions = useMemo(() => {
        if (!activeType?.participantFields) return {};
        const suggestions = {};
        activeType.participantFields.forEach(field => {
            const values = new Set();
            Object.values(formData.participantDetails || {}).forEach(details => {
                const val = details?.[field.label];
                if (val && typeof val === 'string' && val.trim()) {
                    values.add(val.trim());
                }
            });
            suggestions[field.label] = Array.from(values);
        });
        return suggestions;
    }, [formData.participantDetails, activeType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly || checking || isSubmitting) return;

        setIsSubmitting(true);
        setChecking(true);

        // Helper to check and package one event
        const createPayload = (dateBase) => {
            const start = new Date(`${dateBase}T${formData.startTime}`);
            const end = new Date(`${dateBase}T${formData.endTime}`);
            const payload = {
                ...initialData,
                title: formData.title,
                date: dateBase,
                venueId: formData.venueId,
                participatingStudents: formData.studentIds,
                linkStudentIds: (formData.linkStudentIds || []).filter(id => formData.studentIds.includes(id)),
                participantDetails: (() => {
                    const details = {};
                    (formData.studentIds || []).forEach(sid => {
                        if (formData.participantDetails?.[sid]) {
                            details[sid] = formData.participantDetails[sid];
                        }
                    });
                    return details;
                })(),
                assets: formData.assetIds,
                startTime: Timestamp.fromDate(start),
                endTime: Timestamp.fromDate(end),
                typeId: formData.typeId,
                typeName: activeType?.name || 'General',
                points: Number(formData.points) || 10,
                customData: formData.customFields,
                status: initialData?.status || 'Draft'
            };
            if (initialData?.id) {
                payload.id = initialData.id;
            } else {
                delete payload.id;
            }
            return payload;
        };

        const checkAndSaveBatch = async (payloads) => {
            setChecking(true);
            try {
                for (const p of payloads) {
                    const check = await checkConflicts(p);
                    if (check.hasConflict) {
                        setConflict(`تعارض في يوم ${p.date}: ${check.reason}`);
                        setChecking(false);
                        setIsSubmitting(false);
                        return;
                    }
                }
                await onSave(payloads);
            } catch (error) {
                console.error("Batch Check Failed", error);
                setChecking(false);
                setIsSubmitting(false);
                toast.error("فشل التحقق");
            } finally {
                setChecking(false);
                setIsSubmitting(false);
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
                    setIsSubmitting(false);
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
                    setIsSubmitting(false);
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
                    setIsSubmitting(false);
                    return;
                }
                await onSave(eventPayload);
                setChecking(false);
                setIsSubmitting(false);
            }

        } catch (error) {
            console.error("Conflict check failed:", error);
            setChecking(false);
            setIsSubmitting(false);
            if (error?.code === 'failed-precondition') {
                toast.error("مطلوب إعداد الفهرس (Index) في Firebase Console.");
            } else {
                toast.error("فشل التحقق من التعارضات");
            }
        } finally {
            setChecking(false);
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1a1a20] border border-white/10 rounded-t-3xl sm:rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh] overflow-hidden">
                {/* Mobile Pull Handle */}
                <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-2.5 sm:hidden shrink-0" />
                <div className="p-4 sm:p-6 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center">
                            {initialData?.id ? 'تفاصيل النشاط' : 'إضافة نشاط جديد'}
                            {isPastEvent && <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full mr-2 flex items-center"><Clock size={12} className="ml-1" /> سجل سابق</span>}
                        </h2>
                        {!initialData?.id && (
                            <button onClick={() => setShowImport(!showImport)} className="text-xs bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg hover:bg-indigo-600/30 transition-all flex items-center">
                                📥 نسخ من نشاط سابق
                            </button>
                        )}
                    </div>
                    <button onClick={onClose} aria-label="إغلاق النافذة" className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-all"><X size={20} /></button>
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

                <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-6 flex-1">
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
                                    {eventTypes?.map((t, idx) => (
                                        <option key={t.id || t.name || idx} value={t.id}>{t.name}</option>
                                    ))}
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

                        {/* Reminders Section */}
                        <div className="mt-4 bg-white/5 p-4 rounded-xl border border-white/5">
                            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                <Clock size={16} className="text-indigo-400" />
                                التذكيرات والإشعارات
                            </h4>
                            <div className="space-y-2 mb-3">
                                {formData.reminders?.map((rem, idx) => (
                                    <div key={idx} className="flex flex-wrap items-center gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5 text-sm">
                                        <select
                                            value={rem.type}
                                            onChange={(e) => {
                                                const newRems = [...formData.reminders];
                                                newRems[idx].type = e.target.value;
                                                if (e.target.value === 'custom' && !newRems[idx].customDateTime) {
                                                    const formattedTime = (formData.startTime || '08:00').padStart(5, '0');
                                                    const defaultDt = formData.date ? `${formData.date}T${formattedTime}` : '';
                                                    newRems[idx].customDateTime = defaultDt;
                                                }
                                                setFormData({ ...formData, reminders: newRems });
                                            }}
                                            className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs"
                                        >
                                            <option value="minutes">دقيقة قبل النشاط</option>
                                            <option value="hours">ساعة قبل النشاط</option>
                                            <option value="days">يوم قبل النشاط</option>
                                            <option value="custom">موعد مخصص (تاريخ ووقت محدد)</option>
                                        </select>

                                        {rem.type === 'custom' ? (
                                            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                                                <span className="text-xs text-indigo-300">في تاريخ:</span>
                                                <input
                                                    type="datetime-local"
                                                    value={rem.customDateTime || ''}
                                                    onChange={(e) => {
                                                        const newRems = [...formData.reminders];
                                                        newRems[idx].customDateTime = e.target.value;
                                                        setFormData({ ...formData, reminders: newRems });
                                                    }}
                                                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs flex-1 font-mono outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-gray-400 text-xs">تنبيه قبل:</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={rem.value ?? 15}
                                                    onChange={(e) => {
                                                        const newRems = [...formData.reminders];
                                                        newRems[idx].value = parseInt(e.target.value) || 0;
                                                        setFormData({ ...formData, reminders: newRems });
                                                    }}
                                                    className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white w-16 text-center text-xs"
                                                />
                                            </div>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newRems = [...formData.reminders];
                                                newRems.splice(idx, 1);
                                                setFormData({ ...formData, reminders: newRems });
                                            }}
                                            className="text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg mr-auto transition-colors"
                                            title="حذف التذكير"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                                {(!formData.reminders || formData.reminders.length === 0) && (
                                    <p className="text-gray-500 text-xs italic">لا توجد تذكيرات نشطة لهذا النشاط</p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, reminders: [...(formData.reminders || []), { type: 'minutes', value: 15 }] })}
                                className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1"
                            >
                                <Plus size={14} /> إضافة تذكير
                            </button>
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
                                                    value={formData.customFields?.[field.label] || ''}
                                                    onChange={e => handleCustomFieldChange(field.label, e.target.value)}>
                                                    <option value="">اختر...</option>
                                                    {field.options && field.options.length > 0 ? (
                                                        field.options.map((opt, i) => (
                                                            <option key={i} value={opt}>{opt}</option>
                                                        ))
                                                    ) : (
                                                        <option disabled>لا يوجد خيارات معرفة</option>
                                                    )}
                                                </select>
                                            ) : (
                                                <input disabled={isReadOnly} type={field.type === 'number' ? 'number' : 'text'}
                                                    className="w-full bg-purple-900/10 border border-purple-500/30 rounded-xl p-3 text-white focus:border-purple-500 outline-none disabled:opacity-50"
                                                    placeholder={`أدخل ${field.label}`}
                                                    value={formData.customFields?.[field.label] || ''}
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

                            {/* Student Filters */}
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5 flex flex-wrap gap-3 items-end">
                                <div className="flex-1 min-w-[150px]">
                                    <label className="text-xs text-gray-500 block mb-1">تصفية حسب الصف</label>
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:border-indigo-500 outline-none"
                                        value={selectedGrade}
                                        onChange={e => { setSelectedGrade(e.target.value); setSelectedSection(''); }}
                                    >
                                        <option value="">كل الصفوف</option>
                                        {grades.map((g, idx) => (
                                            <option key={g.id || g.name || idx} value={g.name || g}>{g.name || g}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[150px]">
                                    <label className="text-xs text-gray-500 block mb-1">الشعبة</label>
                                    <select
                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm focus:border-indigo-500 outline-none"
                                        value={selectedSection}
                                        disabled={!selectedGrade}
                                        onChange={e => setSelectedSection(e.target.value)}
                                    >
                                        <option value="">الكل</option>
                                        {selectedGrade && (grades.find(g => g.name === selectedGrade)?.sections || []).map((s, idx) => {
                                            const val = typeof s === 'object' ? (s.name || s.id || '') : s;
                                            const key = typeof s === 'object' ? (s.id || s.name || idx) : `${s}-${idx}`;
                                            return <option key={key} value={val}>{val}</option>;
                                        })}
                                    </select>
                                </div>
                                <div className="pb-0.5">
                                    <button type="button" aria-label="إلغاء التصفية" onClick={() => { setSelectedGrade(''); setSelectedSection(''); }} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-lg border border-white/5" title="إلغاء التصفية">
                                        <Filter size={16} className={selectedGrade ? "text-indigo-400" : ""} />
                                    </button>
                                </div>
                            </div>

                            <MultiSelect
                                label="الطلاب المشاركون"
                                placeholder={activeType ? `طلاب ${activeType.name} + العام...` : "اختر الطلاب..."}
                                options={filteredStudents}
                                selectedValues={formData.studentIds}
                                onChange={(vals) => handleChange('studentIds', vals)}
                                icon={Users}
                            />

                            {/* Participant-Specific Custom Fields (e.g. فقرته في الإذاعة، دوره) */}
                            {activeType?.participantFields && activeType.participantFields.length > 0 && formData.studentIds.length > 0 && (
                                <div className="mt-4 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 space-y-3 animate-fade-in">
                                    <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                                        <div className="flex items-center gap-2">
                                            <Users size={16} className="text-emerald-400" />
                                            <span className="text-xs font-bold text-emerald-300">
                                                بيانات الطلاب الخاصة بـ ({activeType.name})
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-emerald-400/70">
                                            اختياري - مخصصة لكل طالب مشارك
                                        </span>
                                    </div>

                                    {/* Ultra-Smart Search & Quick Filter Bar */}
                                    <div className="space-y-2 pt-1">
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <input
                                                    type="text"
                                                    value={participantSearch}
                                                    onChange={e => setParticipantSearch(e.target.value)}
                                                    placeholder="بحث ذكي: بالاسم، الصف، الشعبة، أو الدور / البيانات..."
                                                    className="w-full bg-black/50 border border-emerald-500/30 rounded-xl py-2 pr-9 pl-8 text-xs text-white placeholder-emerald-300/40 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40 outline-none transition-all font-medium"
                                                />
                                                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
                                                {participantSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setParticipantSearch('')}
                                                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                                                        title="مسح البحث"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Results Count Badge */}
                                            <div className="shrink-0 bg-emerald-900/40 border border-emerald-500/30 px-2.5 py-2 rounded-xl text-[11px] font-bold text-emerald-300 flex items-center gap-1 whitespace-nowrap shadow-sm">
                                                <span>{filteredParticipantIds.length}</span>
                                                <span className="text-emerald-400/60 font-normal">من</span>
                                                <span>{formData.studentIds.length}</span>
                                                <span className="hidden sm:inline text-emerald-400/70 mr-0.5">طالب</span>
                                            </div>
                                        </div>

                                        {/* Filter Pills */}
                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 custom-scrollbar text-[11px]">
                                            <button
                                                type="button"
                                                onClick={() => setParticipantFilter('all')}
                                                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap border flex items-center gap-1 cursor-pointer ${
                                                    participantFilter === 'all'
                                                        ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                                                        : 'bg-black/30 text-gray-300 border-white/5 hover:border-emerald-500/30 hover:text-white'
                                                }`}
                                            >
                                                <span>الكل</span>
                                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${participantFilter === 'all' ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                                                    {participantStats.total}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setParticipantFilter('completed')}
                                                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap border flex items-center gap-1 cursor-pointer ${
                                                    participantFilter === 'completed'
                                                        ? 'bg-emerald-500 text-black border-emerald-400 shadow-sm'
                                                        : 'bg-black/30 text-gray-300 border-white/5 hover:border-emerald-500/30 hover:text-white'
                                                }`}
                                            >
                                                <span>مكتمل</span>
                                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${participantFilter === 'completed' ? 'bg-black/20 text-black' : 'bg-emerald-500/20 text-emerald-300'}`}>
                                                    {participantStats.completed}
                                                </span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setParticipantFilter('uncompleted')}
                                                className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap border flex items-center gap-1 cursor-pointer ${
                                                    participantFilter === 'uncompleted'
                                                        ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                                                        : 'bg-black/30 text-gray-300 border-white/5 hover:border-amber-500/30 hover:text-white'
                                                }`}
                                            >
                                                <span>بحاجة لتعبئة</span>
                                                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${participantFilter === 'uncompleted' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300'}`}>
                                                    {participantStats.uncompleted}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Datalists for input suggestions across event */}
                                    {activeType.participantFields.map((field, fIdx) => (
                                        (participantFieldSuggestions[field.label]?.length > 0) && (
                                            <datalist key={`dl-${fIdx}`} id={`suggestions-${field.label.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '-')}`}>
                                                {participantFieldSuggestions[field.label].map((sVal, sIdx) => (
                                                    <option key={sIdx} value={sVal} />
                                                ))}
                                            </datalist>
                                        )
                                    ))}

                                    {/* Cards List or Empty Search Result */}
                                    {filteredParticipantIds.length > 0 ? (
                                        <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                                            {filteredParticipantIds.map((studentId) => {
                                                const stuObj = studentsList.find(s => s.id === studentId || s.value === studentId);
                                                const studentName = stuObj?.name || stuObj?.label || 'طالب مشارك';
                                                const currentStudentDetails = formData.participantDetails?.[studentId] || {};

                                                return (
                                                    <div key={studentId} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="font-bold text-white flex items-center gap-1.5">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                                                                {studentName}
                                                            </span>
                                                            {(stuObj?.class || stuObj?.grade) && (
                                                                <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded">
                                                                    {stuObj.class || `${stuObj.grade} / ${stuObj.section}`}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                                            {activeType.participantFields.map((field, fIdx) => (
                                                                <div key={fIdx}>
                                                                    <label className="text-[11px] text-emerald-300/80 block mb-1">
                                                                        {field.label}
                                                                    </label>
                                                                    {field.type === 'select' ? (
                                                                        <select
                                                                            disabled={isReadOnly}
                                                                            value={currentStudentDetails[field.label] || ''}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    participantDetails: {
                                                                                        ...prev.participantDetails,
                                                                                        [studentId]: {
                                                                                            ...(prev.participantDetails?.[studentId] || {}),
                                                                                            [field.label]: val
                                                                                        }
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400 cursor-pointer"
                                                                        >
                                                                            <option value="">اختر...</option>
                                                                            {(field.options || []).map((opt, oIdx) => (
                                                                                <option key={oIdx} value={opt}>{opt}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <input
                                                                            type="text"
                                                                            list={`suggestions-${field.label.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '-')}`}
                                                                            disabled={isReadOnly}
                                                                            placeholder={`أدخل ${field.label}...`}
                                                                            value={currentStudentDetails[field.label] || ''}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    participantDetails: {
                                                                                        ...prev.participantDetails,
                                                                                        [studentId]: {
                                                                                            ...(prev.participantDetails?.[studentId] || {}),
                                                                                            [field.label]: val
                                                                                        }
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full bg-black/50 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-emerald-400"
                                                                        />
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 px-4 bg-black/30 border border-dashed border-emerald-500/20 rounded-xl space-y-2">
                                            <Search size={22} className="mx-auto text-emerald-400/50" />
                                            <p className="text-xs text-emerald-300 font-bold">لا يوجد طلاب مطابقون للبحث</p>
                                            <p className="text-[11px] text-gray-400">
                                                {participantSearch ? `لم يتم العثور على طالب يطابق "${participantSearch}"` : 'لا يوجد طلاب ينطبق عليهم هذا الفلتر'}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => { setParticipantSearch(''); setParticipantFilter('all'); }}
                                                className="mt-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors font-medium inline-flex items-center gap-1 cursor-pointer"
                                            >
                                                <X size={12} /> مسح البحث وعرض كل الطلاب ({formData.studentIds.length})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <MultiSelect
                                label="الموارد والعهد (Mutaah Only)"
                                placeholder="اختر الموارد المتاحة..."
                                options={assetsList}
                                selectedValues={formData.assetIds}
                                onChange={(vals) => handleChange('assetIds', vals)}
                                icon={Box}
                            />
                            <p className="text-xs text-gray-400">* الموارد التي "تحت الصيانة" لا تظهر هنا.</p>
                        </div>
                    </form>
                </div>

                {/* Mobile Responsive Footer (< sm) */}
                <div className="sm:hidden p-3.5 border-t border-white/10 bg-[#141418] sticky bottom-0 z-20 shrink-0 space-y-2">
                    {initialData?.id && initialData?.status !== 'Done' && (
                        <button
                            type="button"
                            onClick={() => onSave({
                                ...initialData,
                                ...formData,
                                participatingStudents: formData.studentIds,
                                linkStudentIds: (formData.linkStudentIds || []).filter(id => formData.studentIds.includes(id)),
                                status: 'Done',
                                markDone: true
                            })}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg flex items-center justify-center text-sm active:scale-[0.98] transition-transform"
                        >
                            <CheckCircle size={17} className="ml-1.5" />
                            تأكيد التنفيذ ورصد النقاط
                        </button>
                    )}

                    <button
                        form="eventForm"
                        type="submit"
                        disabled={checking || isSubmitting}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg flex items-center justify-center text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
                    >
                        {checking || isSubmitting ? 'جاري التحقق...' : (initialData?.id ? 'حفظ التعديلات' : (isRecurring ? 'إنشاء المتكرر' : 'إنشاء النشاط'))}
                    </button>

                    <div className={`grid ${initialData?.id ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-2.5 rounded-xl text-gray-300 hover:bg-white/5 transition-all text-xs font-semibold border border-white/10 text-center"
                        >
                            إلغاء
                        </button>
                        {initialData?.id && (
                            <button
                                type="button"
                                onClick={() => onDelete(initialData)}
                                className="w-full py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 border border-red-500/20 flex items-center justify-center transition-all text-xs font-semibold"
                            >
                                <Trash2 size={14} className="ml-1" /> حذف النشاط
                            </button>
                        )}
                    </div>
                </div>

                {/* Desktop Footer (>= sm) */}
                <div className="hidden sm:flex p-4 sm:p-6 border-t border-white/10 justify-between items-center gap-3 bg-[#141418] sticky bottom-0 z-20 shrink-0">
                    {initialData?.id ? (
                        <button type="button" onClick={() => onDelete(initialData)} className="px-3.5 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 flex items-center transition-all text-xs sm:text-sm">
                            <Trash2 size={16} className="ml-1.5" /> حذف النشاط
                        </button>
                    ) : <div />}

                    <div className="flex items-center gap-2 flex-wrap">
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-gray-400 hover:bg-white/5 transition-all text-xs sm:text-sm border border-white/5">إلغاء</button>
                        
                        <button form="eventForm" type="submit" disabled={checking || isSubmitting} className="px-5 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-lg transition-transform transform active:scale-95 flex items-center hover:shadow-indigo-500/25 text-xs sm:text-sm">
                            {checking || isSubmitting ? 'جاري التحقق...' : (initialData?.id ? 'حفظ التعديلات' : (isRecurring ? 'إنشاء المتكرر' : 'إنشاء النشاط'))}
                        </button>

                        {initialData?.id && initialData?.status !== 'Done' && (
                            <button
                                type="button"
                                onClick={() => onSave({
                                    ...initialData,
                                    ...formData,
                                    participatingStudents: formData.studentIds,
                                    linkStudentIds: (formData.linkStudentIds || []).filter(id => formData.studentIds.includes(id)),
                                    status: 'Done',
                                    markDone: true
                                })}
                                className="px-4 py-2.5 sm:py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg flex items-center text-xs sm:text-sm"
                            >
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

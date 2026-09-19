import { useState, useEffect, useMemo, useRef } from 'react';
import {
    X, Save, Shield, Calendar, Award, Users, AlertCircle,
    Link2, CheckCircle2, Plus, Trash2, Search, Check, ChevronDown
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function CreateLinkModal({ isOpen, onClose, linkToEdit = null, onSuccess }) {
    const { grades, eventTypes } = useSettings();
    const { currentUser } = useAuth();

    const [eventsList, setEventsList] = useState([]);
    const [studentsList, setStudentsList] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Delegate Search Dropdown State
    const [delegateSearchTerm, setDelegateSearchTerm] = useState('');
    const [isDelegateDropdownOpen, setIsDelegateDropdownOpen] = useState(false);
    const delegateDropdownRef = useRef(null);

    // Form State
    const [hasMaxCapacity, setHasMaxCapacity] = useState(true);
    const [formData, setFormData] = useState({
        title: '',
        delegateName: '',
        delegateStudentId: '',
        delegateRewardPoints: 10,
        specializations: ['عام / جوكر'],
        eventId: '',
        eventTitle: '',
        allowedGrades: ['all'],
        maxCapacity: 30,
        startAt: '',
        endAt: '',
        passcode: '',
        approvalMode: 'review', // 'immediate' | 'review'
        customFields: [
            { id: 'f_1', label: 'نوع الطبق / الصنف', required: false }
        ],
        instructions: '',
        pointsPerStudent: 5,
        allowWaitlist: true,
        status: 'active'
    });

    // Close delegate dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (delegateDropdownRef.current && !delegateDropdownRef.current.contains(e.target)) {
                setIsDelegateDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load available events and active students (alphabetically sorted)
    useEffect(() => {
        if (!isOpen) return;

        async function fetchPrerequisites() {
            try {
                // Fetch events
                const eventsSnap = await getDocs(query(collection(db, 'events')));
                const evs = eventsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => e.status !== 'archived');
                setEventsList(evs);

                // Fetch active students for delegate autocomplete
                const studentsSnap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
                const stus = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Sort alphabetically using Arabic collation
                stus.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
                setStudentsList(stus);
            } catch (err) {
                console.error("Error fetching modal prerequisites:", err);
            }
        }

        fetchPrerequisites();
    }, [isOpen]);

    // Initialize or reset form data
    useEffect(() => {
        if (linkToEdit) {
            const hasCap = linkToEdit.maxCapacity !== null && linkToEdit.maxCapacity !== undefined && linkToEdit.maxCapacity !== '' && Number(linkToEdit.maxCapacity) > 0;
            setHasMaxCapacity(hasCap);

            // Parse specializations
            const initialSpecs = Array.isArray(linkToEdit.specializations) && linkToEdit.specializations.length > 0
                ? linkToEdit.specializations
                : (linkToEdit.specialization ? [linkToEdit.specialization] : ['عام / جوكر']);

            // Parse custom fields
            let initialCustomFields = [];
            if (Array.isArray(linkToEdit.customFields)) {
                initialCustomFields = linkToEdit.customFields;
            } else if (linkToEdit.customFieldLabel) {
                initialCustomFields = [{
                    id: 'f_1',
                    label: linkToEdit.customFieldLabel,
                    required: !!linkToEdit.customFieldRequired
                }];
            }

            setFormData({
                title: linkToEdit.title || '',
                delegateName: linkToEdit.delegateName || '',
                delegateStudentId: linkToEdit.delegateStudentId || '',
                delegateRewardPoints: linkToEdit.delegateRewardPoints ?? 10,
                specializations: initialSpecs,
                eventId: linkToEdit.eventId || '',
                eventTitle: linkToEdit.eventTitle || '',
                allowedGrades: linkToEdit.allowedGrades || ['all'],
                maxCapacity: hasCap ? linkToEdit.maxCapacity : '',
                startAt: linkToEdit.startAt || '',
                endAt: linkToEdit.endAt || '',
                passcode: linkToEdit.passcode || '',
                approvalMode: linkToEdit.approvalMode || 'review',
                customFields: initialCustomFields,
                instructions: linkToEdit.instructions || '',
                pointsPerStudent: linkToEdit.pointsPerStudent ?? 5,
                allowWaitlist: linkToEdit.allowWaitlist ?? true,
                status: linkToEdit.status || 'active'
            });
            setDelegateSearchTerm('');
        } else {
            // Default dates: now until 7 days later
            const now = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(now.getDate() + 7);

            const formatForInput = (d) => {
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };

            setHasMaxCapacity(true);
            setFormData({
                title: '',
                delegateName: '',
                delegateStudentId: '',
                delegateRewardPoints: 10,
                specializations: ['عام / جوكر'],
                eventId: '',
                eventTitle: '',
                allowedGrades: ['all'],
                maxCapacity: 30,
                startAt: formatForInput(now),
                endAt: formatForInput(nextWeek),
                passcode: '',
                approvalMode: 'review',
                customFields: [
                    { id: 'f_1', label: 'نوع الطبق / الصنف', required: false }
                ],
                instructions: 'يرجى كتابة الاسم الثلاثي واختيار الصف والشعبة بدقة. التنسيق يتم عبر رائد النشاط.',
                pointsPerStudent: 5,
                allowWaitlist: true,
                status: 'active'
            });
            setDelegateSearchTerm('');
        }
    }, [linkToEdit, isOpen]);

    // Filter students for searchable dropdown
    const filteredStudents = useMemo(() => {
        if (!delegateSearchTerm.trim()) return studentsList;
        const term = delegateSearchTerm.toLowerCase().trim();
        return studentsList.filter(s =>
            (s.name || '').toLowerCase().includes(term) ||
            (s.class || '').toLowerCase().includes(term) ||
            (s.grade || '').toLowerCase().includes(term)
        );
    }, [studentsList, delegateSearchTerm]);

    if (!isOpen) return null;

    const handleGradeToggle = (gradeName) => {
        if (gradeName === 'all') {
            setFormData(prev => ({ ...prev, allowedGrades: ['all'] }));
            return;
        }

        setFormData(prev => {
            let current = prev.allowedGrades.filter(g => g !== 'all');
            if (current.includes(gradeName)) {
                current = current.filter(g => g !== gradeName);
            } else {
                current.push(gradeName);
            }
            if (current.length === 0) current = ['all'];
            return { ...prev, allowedGrades: current };
        });
    };

    const handleSpecializationToggle = (specName) => {
        setFormData(prev => {
            let current = [...(prev.specializations || [])];
            if (current.includes(specName)) {
                current = current.filter(s => s !== specName);
            } else {
                current.push(specName);
            }
            if (current.length === 0) current = ['عام / جوكر'];
            return { ...prev, specializations: current };
        });
    };

    const handleSelectDelegateStudent = (student) => {
        setFormData(prev => ({
            ...prev,
            delegateStudentId: student.id,
            delegateName: `${student.name} (${student.class || student.grade || 'بدون صف'})`
        }));
        setIsDelegateDropdownOpen(false);
        setDelegateSearchTerm('');
    };

    const handleClearDelegateStudent = () => {
        setFormData(prev => ({
            ...prev,
            delegateStudentId: '',
            delegateName: ''
        }));
    };

    const handleSelectEvent = (eventId) => {
        const ev = eventsList.find(e => e.id === eventId);
        if (ev) {
            setFormData(prev => {
                const newSpecs = ev.type && !prev.specializations.includes(ev.type)
                    ? [...prev.specializations.filter(s => s !== 'عام / جوكر'), ev.type]
                    : prev.specializations;
                return {
                    ...prev,
                    eventId: ev.id,
                    eventTitle: ev.title,
                    title: prev.title ? prev.title : ev.title,
                    specializations: newSpecs.length ? newSpecs : ['عام / جوكر']
                };
            });
        } else {
            setFormData(prev => ({ ...prev, eventId: '', eventTitle: '' }));
        }
    };

    // Custom Fields Management
    const handleAddCustomField = () => {
        setFormData(prev => ({
            ...prev,
            customFields: [
                ...prev.customFields,
                { id: `f_${Date.now()}`, label: '', required: false }
            ]
        }));
    };

    const handleRemoveCustomField = (id) => {
        setFormData(prev => ({
            ...prev,
            customFields: prev.customFields.filter(f => f.id !== id)
        }));
    };

    const handleClearAllCustomFields = () => {
        setFormData(prev => ({
            ...prev,
            customFields: []
        }));
    };

    const handleCustomFieldChange = (id, field, value) => {
        setFormData(prev => ({
            ...prev,
            customFields: prev.customFields.map(f =>
                f.id === id ? { ...f, [field]: value } : f
            )
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title.trim()) {
            toast.error("يرجى إدخال عنوان الرابط / الفعالية");
            return;
        }
        if (!formData.delegateName.trim()) {
            toast.error("يرجى إدخال اسم الطالب المفوض");
            return;
        }

        // Clean custom fields: omit empty labels
        const cleanedCustomFields = (formData.customFields || [])
            .filter(f => f.label && f.label.trim().length > 0)
            .map(f => ({
                id: f.id,
                label: f.label.trim(),
                required: !!f.required
            }));

        setIsSubmitting(true);
        try {
            const finalMaxCapacity = hasMaxCapacity && Number(formData.maxCapacity) > 0
                ? Number(formData.maxCapacity)
                : null;

            const finalSpecializations = formData.specializations && formData.specializations.length > 0
                ? formData.specializations
                : ['عام / جوكر'];

            const payload = {
                ...formData,
                maxCapacity: finalMaxCapacity,
                specializations: finalSpecializations,
                specialization: finalSpecializations.join('، '), // backward compatibility
                customFields: cleanedCustomFields,
                customFieldLabel: cleanedCustomFields[0]?.label || '', // backward compatibility
                customFieldRequired: !!cleanedCustomFields[0]?.required, // backward compatibility
                pointsPerStudent: Number(formData.pointsPerStudent) || 0,
                delegateRewardPoints: Number(formData.delegateRewardPoints) || 0,
                updatedAt: serverTimestamp()
            };

            if (linkToEdit) {
                await updateDoc(doc(db, 'registration_links', linkToEdit.id), payload);
                toast.success("تم تحديث رابط التسجيل بنجاح");
            } else {
                payload.currentCount = 0;
                payload.createdAt = serverTimestamp();
                payload.createdBy = currentUser?.email || 'admin';
                await addDoc(collection(db, 'registration_links'), payload);
                toast.success("تم إنشاء رابط التسجيل بنجاح");
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error("Error saving link:", err);
            toast.error("فشل في حفظ الرابط: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const specOptions = [
        'عام / جوكر',
        ...(eventTypes || []).map(t => t.name)
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/60">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                            <Link2 size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {linkToEdit ? "تعديل رابط التسجيل" : "إنشاء رابط تسجيل جديد ومفوض"}
                            </h2>
                            <p className="text-xs text-slate-400">
                                توليد رابط مؤقت وتفويض طالب لإدخال المشاركات للفعالية
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[75vh] custom-scrollbar text-right" dir="rtl">
                    {/* Section 1: Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2 border-b border-slate-800 pb-2">
                            <Users size={16} /> البيانات الأساسية والتفويض
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    عنوان الفعالية / الحملة <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="مثال: إفطار اليوم الوطني - مساهمات الأطباق"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    ربط بفعالية موجودة في الجدول (اختياري)
                                </label>
                                <select
                                    value={formData.eventId}
                                    onChange={(e) => handleSelectEvent(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                >
                                    <option value="">-- بدون ربط بفعالية معينة --</option>
                                    {eventsList.map((ev) => (
                                        <option key={ev.id} value={ev.id}>
                                            {ev.title} ({ev.date || 'بدون تاريخ'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Delegate Section with Searchable Combobox */}
                        <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Delegate Name (Manual or auto-filled) */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        اسم الطالب المفوض بالإشراف <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            required
                                            placeholder="مثال: أحمد عبد الله السالم (رائد فصل 2/1)"
                                            value={formData.delegateName}
                                            onChange={(e) => setFormData({ ...formData, delegateName: e.target.value, delegateStudentId: '' })}
                                            className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                        />
                                        {formData.delegateStudentId && (
                                            <button
                                                type="button"
                                                onClick={handleClearDelegateStudent}
                                                className="absolute left-2.5 top-2.5 text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-750 transition-colors"
                                                title="إلغاء ربط الطالب"
                                            >
                                                فك الربط
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Searchable Student Selector */}
                                <div className="relative" ref={delegateDropdownRef}>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        بحث واختيار من سجل الطلاب (مرتب أبجدياً)
                                    </label>
                                    <div
                                        onClick={() => setIsDelegateDropdownOpen(true)}
                                        className="relative flex items-center cursor-pointer"
                                    >
                                        <input
                                            type="text"
                                            placeholder="ابحث بالاسم أو الصف (مثال: أحمد، 2/1)..."
                                            value={delegateSearchTerm}
                                            onChange={(e) => {
                                                setDelegateSearchTerm(e.target.value);
                                                setIsDelegateDropdownOpen(true);
                                            }}
                                            onFocus={() => setIsDelegateDropdownOpen(true)}
                                            className="w-full pl-8 pr-9 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                        />
                                        <Search size={16} className="absolute right-3 text-slate-400 pointer-events-none" />
                                        <ChevronDown size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Dropdown Menu */}
                                    {isDelegateDropdownOpen && (
                                        <div className="absolute z-20 top-full inset-x-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar p-1 text-right">
                                            {filteredStudents.length === 0 ? (
                                                <div className="py-4 text-center text-xs text-slate-500">
                                                    لا يوجد طالب بهذا الاسم في السجل
                                                </div>
                                            ) : (
                                                filteredStudents.map((s) => {
                                                    const isSelected = formData.delegateStudentId === s.id;
                                                    return (
                                                        <div
                                                            key={s.id}
                                                            onClick={() => handleSelectDelegateStudent(s)}
                                                            className={`p-2 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                                                                isSelected
                                                                    ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40'
                                                                    : 'hover:bg-slate-800 text-slate-200'
                                                            }`}
                                                        >
                                                            <div className="font-semibold">{s.name}</div>
                                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                                                <span>{s.class || s.grade || 'بدون صف'}</span>
                                                                {isSelected && <Check size={14} className="text-indigo-400" />}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Delegate Points */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        نقاط مكافأة الطالب المفوض (عند إغلاق الرابط)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.delegateRewardPoints}
                                        onChange={(e) => setFormData({ ...formData, delegateRewardPoints: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                {/* Specializations (Multi-Select) */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        المجال / التخصص المسند للطلاب (يمكن اختيار أكثر من مجال)
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {specOptions.map((opt) => {
                                            const isSelected = formData.specializations?.includes(opt);
                                            return (
                                                <button
                                                    key={opt}
                                                    type="button"
                                                    onClick={() => handleSpecializationToggle(opt)}
                                                    className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                                        isSelected
                                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-600/30'
                                                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                                                    }`}
                                                >
                                                    {opt} {isSelected && '✓'}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Capacity & Restrictions */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2 border-b border-slate-800 pb-2">
                            <Shield size={16} /> شروط ومحددات التسجيل
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Max Capacity with Unlimited Option */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-300">
                                        الحد الأقصى للمقاعد
                                    </label>
                                    <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={!hasMaxCapacity}
                                            onChange={(e) => {
                                                const isUnlimited = e.target.checked;
                                                setHasMaxCapacity(!isUnlimited);
                                                if (isUnlimited) {
                                                    setFormData(prev => ({ ...prev, maxCapacity: '' }));
                                                } else {
                                                    setFormData(prev => ({ ...prev, maxCapacity: 30 }));
                                                }
                                            }}
                                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-0"
                                        />
                                        <span>بدون حد أقصى</span>
                                    </label>
                                </div>

                                {hasMaxCapacity ? (
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="مثال: 30 مقعد"
                                        value={formData.maxCapacity}
                                        onChange={(e) => setFormData({ ...formData, maxCapacity: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                ) : (
                                    <div className="w-full px-3.5 py-2.5 bg-slate-800/40 border border-slate-700/60 rounded-xl text-slate-400 text-xs font-semibold flex items-center justify-center">
                                        التسجيل مفتوح بدون سقف أعلى للمقاعد
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    نقاط التميز لكل طالب مسجل
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.pointsPerStudent}
                                    onChange={(e) => setFormData({ ...formData, pointsPerStudent: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    رمز المرور السري (اختياري للخصوصية)
                                </label>
                                <input
                                    type="text"
                                    placeholder="اتركه فارغاً للتسجيل المفتوح"
                                    value={formData.passcode}
                                    onChange={(e) => setFormData({ ...formData, passcode: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Allowed Grades */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-2">
                                المراحل الدراسية المسموح لها بالتسجيل
                            </label>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleGradeToggle('all')}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                        formData.allowedGrades.includes('all')
                                            ? 'bg-indigo-600 border-indigo-500 text-white'
                                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                                    }`}
                                >
                                    جميع مراحل المدرسة
                                </button>
                                {(grades || []).map((g) => {
                                    const isSelected = formData.allowedGrades.includes(g.name);
                                    return (
                                        <button
                                            key={g.name}
                                            type="button"
                                            onClick={() => handleGradeToggle(g.name)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                                isSelected
                                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                                            }`}
                                        >
                                            {g.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Calendar size={14} /> موعد بدء التسجيل
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.startAt}
                                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Calendar size={14} /> موعد انتهاء التسجيل
                                </label>
                                <input
                                    type="datetime-local"
                                    value={formData.endAt}
                                    onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Approval Mode & Waitlist */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
                                <label className="block text-xs font-semibold text-slate-300 mb-2">
                                    آلية الاعتماد والإدراج
                                </label>
                                <div className="flex gap-3">
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="approvalMode"
                                            value="review"
                                            checked={formData.approvalMode === 'review'}
                                            onChange={() => setFormData({ ...formData, approvalMode: 'review' })}
                                            className="text-indigo-600 focus:ring-0"
                                        />
                                        <span>مراجعة واعتماد يدوي</span>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="approvalMode"
                                            value="immediate"
                                            checked={formData.approvalMode === 'immediate'}
                                            onChange={() => setFormData({ ...formData, approvalMode: 'immediate' })}
                                            className="text-indigo-600 focus:ring-0"
                                        />
                                        <span>اعتماد فوري ومباشر</span>
                                    </label>
                                </div>
                            </div>

                            <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700 flex items-center justify-between">
                                <div>
                                    <span className="block text-xs font-semibold text-slate-200">
                                        السماح بقائمة الانتظار
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                        قبول إدخالات إضافية بعد اكتمال المقاعد ووضعها في الانتظار
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.allowWaitlist}
                                    onChange={(e) => setFormData({ ...formData, allowWaitlist: e.target.checked })}
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Multiple Custom Fields & Instructions */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                                <Award size={16} /> الحقول المخصصة الإضافية
                            </h3>
                            <div className="flex items-center gap-2">
                                {formData.customFields.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleClearAllCustomFields}
                                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                                    >
                                        <Trash2 size={12} />
                                        <span>حذف جميع الحقول</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleAddCustomField}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                                >
                                    <Plus size={14} />
                                    <span>إضافة حقل مخصص</span>
                                </button>
                            </div>
                        </div>

                        {/* Custom Fields List */}
                        {formData.customFields.length === 0 ? (
                            <div className="bg-slate-800/40 border border-dashed border-slate-700/80 rounded-xl p-4 text-center text-xs text-slate-400">
                                لا توجد حقول مخصصة إضافية. سيكتفي النموذج ببيانات الطالب الأساسية (الاسم، الصف، الشعبة، ورقم الجوال).
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {formData.customFields.map((field, index) => (
                                    <div
                                        key={field.id}
                                        className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                                    >
                                        <div className="flex-1">
                                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                                                تسمية الحقل #{index + 1}
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="مثال: نوع الطبق / الصنف، الدور المطلوب، الملاحظات..."
                                                value={field.label}
                                                onChange={(e) => handleCustomFieldChange(field.id, 'label', e.target.value)}
                                                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between sm:justify-start gap-4 pt-1 sm:pt-4">
                                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={field.required}
                                                    onChange={(e) => handleCustomFieldChange(field.id, 'required', e.target.checked)}
                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                                />
                                                <span>حقل إلزامي</span>
                                            </label>

                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCustomField(field.id)}
                                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                                                title="حذف هذا الحقل"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                تعليمات وشروط تظهر للطلاب في صفحة التسجيل
                            </label>
                            <textarea
                                rows="3"
                                placeholder="اكتب الشروط والتعليمات المنظمة للتسجيل هنا..."
                                value={formData.instructions}
                                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                                className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                            />
                        </div>
                    </div>

                    {/* Submit Bar */}
                    <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-semibold transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition-all"
                        >
                            <Save size={18} />
                            {isSubmitting ? "جاري الحفظ..." : linkToEdit ? "حفظ التعديلات" : "إنشاء وتفعيل الرابط"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

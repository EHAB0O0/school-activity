import { useState, useEffect } from 'react';
import { X, Save, Shield, Calendar, Award, Users, AlertCircle, Link2, CheckCircle2 } from 'lucide-react';
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

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        delegateName: '',
        delegateStudentId: '',
        delegateRewardPoints: 10,
        specialization: 'عام / جوكر',
        eventId: '',
        eventTitle: '',
        allowedGrades: ['all'],
        maxCapacity: 30,
        startAt: '',
        endAt: '',
        passcode: '',
        approvalMode: 'review', // 'immediate' | 'review'
        customFieldLabel: 'نوع الطبق / الصنف',
        customFieldRequired: false,
        instructions: '',
        pointsPerStudent: 5,
        allowWaitlist: true,
        status: 'active'
    });

    // Load available events and active students
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
            setFormData({
                title: linkToEdit.title || '',
                delegateName: linkToEdit.delegateName || '',
                delegateStudentId: linkToEdit.delegateStudentId || '',
                delegateRewardPoints: linkToEdit.delegateRewardPoints ?? 10,
                specialization: linkToEdit.specialization || 'عام / جوكر',
                eventId: linkToEdit.eventId || '',
                eventTitle: linkToEdit.eventTitle || '',
                allowedGrades: linkToEdit.allowedGrades || ['all'],
                maxCapacity: linkToEdit.maxCapacity || 30,
                startAt: linkToEdit.startAt || '',
                endAt: linkToEdit.endAt || '',
                passcode: linkToEdit.passcode || '',
                approvalMode: linkToEdit.approvalMode || 'review',
                customFieldLabel: linkToEdit.customFieldLabel || 'نوع الطبق / الصنف',
                customFieldRequired: !!linkToEdit.customFieldRequired,
                instructions: linkToEdit.instructions || '',
                pointsPerStudent: linkToEdit.pointsPerStudent ?? 5,
                allowWaitlist: linkToEdit.allowWaitlist ?? true,
                status: linkToEdit.status || 'active'
            });
        } else {
            // Default dates: now until 7 days later
            const now = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(now.getDate() + 7);

            const formatForInput = (d) => {
                const pad = (n) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };

            setFormData({
                title: '',
                delegateName: '',
                delegateStudentId: '',
                delegateRewardPoints: 10,
                specialization: 'عام / جوكر',
                eventId: '',
                eventTitle: '',
                allowedGrades: ['all'],
                maxCapacity: 30,
                startAt: formatForInput(now),
                endAt: formatForInput(nextWeek),
                passcode: '',
                approvalMode: 'review',
                customFieldLabel: 'نوع الطبق / الصنف',
                customFieldRequired: false,
                instructions: 'يرجى كتابة الاسم الثلاثي واختيار الصف والشعبة بدقة. التنسيق يتم عبر رائد النشاط.',
                pointsPerStudent: 5,
                allowWaitlist: true,
                status: 'active'
            });
        }
    }, [linkToEdit, isOpen]);

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

    const handleSelectDelegateStudent = (studentId) => {
        const student = studentsList.find(s => s.id === studentId);
        if (student) {
            setFormData(prev => ({
                ...prev,
                delegateStudentId: student.id,
                delegateName: `${student.name} (${student.class || student.grade || ''})`
            }));
        }
    };

    const handleSelectEvent = (eventId) => {
        const ev = eventsList.find(e => e.id === eventId);
        if (ev) {
            setFormData(prev => ({
                ...prev,
                eventId: ev.id,
                eventTitle: ev.title,
                title: prev.title ? prev.title : ev.title,
                specialization: ev.type || prev.specialization
            }));
        } else {
            setFormData(prev => ({ ...prev, eventId: '', eventTitle: '' }));
        }
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

        setIsSubmitting(true);
        try {
            const payload = {
                ...formData,
                maxCapacity: Number(formData.maxCapacity) || 30,
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

                        {/* Delegate Section */}
                        <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        اسم الطالب المفوض بالإشراف <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="مثال: أحمد عبد الله السالم (رائد فصل 2/1)"
                                        value={formData.delegateName}
                                        onChange={(e) => setFormData({ ...formData, delegateName: e.target.value, delegateStudentId: '' })}
                                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        اختر من سجل الطلاب المسجلين (اختياري للربط)
                                    </label>
                                    <select
                                        value={formData.delegateStudentId}
                                        onChange={(e) => handleSelectDelegateStudent(e.target.value)}
                                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    >
                                        <option value="">-- اختيار من الطلاب --</option>
                                        {studentsList.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name} ({s.class || s.grade || 'بدون صف'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        نقاط مكافأة الطالب المفوض (عند الإغلاق)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={formData.delegateRewardPoints}
                                        onChange={(e) => setFormData({ ...formData, delegateRewardPoints: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        المجال / التخصص المسند للطلاب المسجلين
                                    </label>
                                    <select
                                        value={formData.specialization}
                                        onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                                        className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    >
                                        {specOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
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
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    الحد الأقصى للمقاعد / الطلاب
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    value={formData.maxCapacity}
                                    onChange={(e) => setFormData({ ...formData, maxCapacity: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
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

                    {/* Section 3: Custom Field & Instructions */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-indigo-300 flex items-center gap-2 border-b border-slate-800 pb-2">
                            <Award size={16} /> الحقل المخصص والتعليمات
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                    تسمية الحقل الإضافي المطلوب
                                </label>
                                <input
                                    type="text"
                                    placeholder="مثال: نوع الطبق / الصنف أو الدور المطلوب"
                                    value={formData.customFieldLabel}
                                    onChange={(e) => setFormData({ ...formData, customFieldLabel: e.target.value })}
                                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            <div className="flex items-center justify-between bg-slate-800/60 p-3.5 rounded-xl border border-slate-700">
                                <div>
                                    <span className="block text-xs font-semibold text-slate-200">
                                        الحقل المخصص إلزامي
                                    </span>
                                    <span className="text-[11px] text-slate-400">
                                        لا يسمح بإرسال التسجيل بدون ملء هذا الحقل
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.customFieldRequired}
                                    onChange={(e) => setFormData({ ...formData, customFieldRequired: e.target.checked })}
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 cursor-pointer"
                                />
                            </div>
                        </div>

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

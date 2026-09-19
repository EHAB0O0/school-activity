import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import {
    doc, collection, addDoc, query, where,
    onSnapshot, updateDoc, deleteDoc, serverTimestamp, increment
} from 'firebase/firestore';
import {
    Lock, CheckCircle, AlertCircle, Users, Plus, Trash2,
    Edit2, Save, Sparkles, Clock, AlertTriangle, ArrowRight, X
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import AppLogo from '../components/ui/AppLogo';
import { useSettings } from '../contexts/SettingsContext';

export default function PublicRegistrationPage() {
    const { linkId } = useParams();
    const { schoolInfo, grades } = useSettings();

    const [linkData, setLinkData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Passcode State
    const [isPasscodeVerified, setIsPasscodeVerified] = useState(false);
    const [enteredPasscode, setEnteredPasscode] = useState('');
    const [passcodeError, setPasscodeError] = useState('');

    // Entry Mode: 'single' | 'rapid'
    const [entryMode, setEntryMode] = useState('single');

    // Single Form State
    const [singleForm, setSingleForm] = useState({
        studentName: '',
        grade: '',
        section: '',
        phone: '',
        customValues: {}
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Rapid Entry State (multi-row)
    const [rapidRows, setRapidRows] = useState([
        { studentName: '', grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', grade: '', section: '', customValues: {}, phone: '' }
    ]);

    // Submissions by this link listener
    const [submissions, setSubmissions] = useState([]);
    const [editingSub, setEditingSub] = useState(null);

    // 1. Fetch Link Data
    useEffect(() => {
        if (!linkId) return;

        const unsubscribe = onSnapshot(doc(db, 'registration_links', linkId), (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                setLinkData(data);
                if (!data.passcode) {
                    setIsPasscodeVerified(true);
                }
                setNotFound(false);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching link:", err);
            setNotFound(true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [linkId]);

    // 2. Real-time Submissions Listener (only attach if passcode is verified or not required)
    useEffect(() => {
        if (!linkId || !isPasscodeVerified) return;

        const q = query(
            collection(db, 'link_submissions'),
            where('linkId', '==', linkId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setSubmissions(list);
        }, (err) => {
            console.error("Error fetching submissions:", err);
        });

        return () => unsubscribe();
    }, [linkId, isPasscodeVerified]);

    // Set default grade when linkData loads
    useEffect(() => {
        if (linkData && (!linkData.allowedGrades || linkData.allowedGrades.includes('all'))) {
            if (grades && grades.length > 0) {
                setSingleForm(prev => ({ ...prev, grade: prev.grade || grades[0].name }));
            }
        } else if (linkData?.allowedGrades && linkData.allowedGrades.length > 0) {
            setSingleForm(prev => ({ ...prev, grade: prev.grade || linkData.allowedGrades[0] }));
        }
    }, [linkData, grades]);

    // Verify Passcode
    const handleVerifyPasscode = (e) => {
        e.preventDefault();
        if (enteredPasscode.trim() === linkData.passcode?.trim()) {
            setIsPasscodeVerified(true);
            setPasscodeError('');
            toast.success("تم الدخول بنجاح");
        } else {
            setPasscodeError("رمز المرور غير صحيح، يرجى التأكد من الرمز والمحاولة مجدداً.");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-slate-400">جاري تحميل صفحة التسجيل...</span>
                </div>
            </div>
        );
    }

    if (notFound || !linkData) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 font-cairo text-right" dir="rtl">
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-4">
                    <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-white">رابط التسجيل غير موجود</h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        عذراً، هذا الرابط غير متاح أو قد تم حذفه من قِبل إدارة النشاط المدرسي. يرجى التواصل مع رائد النشاط أو الطالب المفوض.
                    </p>
                </div>
            </div>
        );
    }

    // Arabic string normalization helper
    const normalizeArabic = (str) => {
        if (!str) return '';
        return str
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/\u0640/g, '')
            .replace(/\s+/g, ' ');
    };

    // Parse Custom Fields
    const customFields = Array.isArray(linkData.customFields)
        ? linkData.customFields
        : (linkData.customFieldLabel ? [{ id: 'f_legacy', label: linkData.customFieldLabel, required: !!linkData.customFieldRequired }] : []);

    // Status checks
    const now = new Date();
    const isExpired = linkData.endAt && new Date(linkData.endAt) < now;
    const isNotStarted = linkData.startAt && new Date(linkData.startAt) > now;
    const isPaused = linkData.status === 'paused';

    const hasMaxCap = linkData.maxCapacity !== null && linkData.maxCapacity !== undefined && linkData.maxCapacity !== '' && Number(linkData.maxCapacity) > 0;
    const maxCap = hasMaxCap ? Number(linkData.maxCapacity) : null;
    const approvedCount = submissions.filter(s => s.status === 'approved').length;
    const pendingCount = submissions.filter(s => s.status === 'pending').length;
    // In review mode, pending submissions occupy seats until reviewed; in immediate mode, approved count is used
    const activeCount = linkData.approvalMode === 'immediate' ? approvedCount : (approvedCount + pendingCount);
    const isFull = hasMaxCap ? activeCount >= maxCap : false;
    const canWaitlist = !!linkData.allowWaitlist;

    // Remaining Seats
    const remainingSeats = hasMaxCap ? Math.max(0, maxCap - activeCount) : null;
    const capacityPercent = hasMaxCap ? Math.min(100, Math.round((activeCount / maxCap) * 100)) : 100;

    // Allowed grade options
    const gradeOptions = linkData.allowedGrades?.includes('all') || !linkData.allowedGrades?.length
        ? (grades?.map(g => g.name) || ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'])
        : linkData.allowedGrades;

    // Section options helper
    const getSectionOptions = (gradeName) => {
        const found = grades?.find(g => g.name === gradeName);
        if (found && found.sections?.length > 0) return found.sections;
        return ['1', '2', '3', '4', '5', '6'];
    };

    // Passcode Screen
    if (!isPasscodeVerified && linkData.passcode) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 font-cairo text-right" dir="rtl">
                <Toaster position="top-center" />
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-6">
                    <AppLogo size="normal" className="justify-center" />
                    <div>
                        <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 mb-3">
                            <Lock size={28} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">{linkData.title}</h2>
                        <p className="text-xs text-indigo-300 font-semibold">
                            إشراف الطالب: {linkData.delegateName}
                        </p>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        هذا الرابط محمي برمز مرور سري. يرجى إدخال الرمز الممنوح لك من الطالب المفوض للدخول.
                    </div>

                    <form onSubmit={handleVerifyPasscode} className="space-y-4">
                        <div>
                            <input
                                type="text"
                                required
                                autoFocus
                                placeholder="أدخل رمز المرور..."
                                value={enteredPasscode}
                                onChange={(e) => setEnteredPasscode(e.target.value)}
                                className="w-full text-center tracking-widest text-lg font-mono px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                            />
                            {passcodeError && (
                                <p className="text-xs text-rose-400 mt-2">{passcodeError}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-sm"
                        >
                            تأكيد والدخول
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Submit Single Entry
    const handleSaveSingle = async (e, addAnother = false) => {
        if (e) e.preventDefault();

        if (!singleForm.studentName.trim()) {
            toast.error("يرجى إدخال اسم الطالب");
            return;
        }

        // Validate multiple custom fields
        for (const field of customFields) {
            if (field.required && !singleForm.customValues?.[field.id]?.trim()) {
                toast.error(`يرجى تحديد ${field.label}`);
                return;
            }
        }

        const normInput = normalizeArabic(singleForm.studentName);
        const isDupInLink = submissions.some(s => normalizeArabic(s.studentName) === normInput);
        if (isDupInLink) {
            if (!window.confirm(`تنبيه: الطالب "${singleForm.studentName.trim()}" مسجل مسبقاً في هذا الرابط. هل ترغب في المتابعة وتأكيد تسجيله مرة أخرى؟`)) {
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const submissionStatus = isFull
                ? (canWaitlist ? 'waitlist' : 'rejected')
                : (linkData.approvalMode === 'immediate' ? 'approved' : 'pending');

            const customValues = singleForm.customValues || {};
            const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

            const payload = {
                linkId: linkData.id,
                studentName: singleForm.studentName.trim(),
                grade: singleForm.grade || gradeOptions[0] || '',
                section: singleForm.section || '1',
                class: `${singleForm.grade || ''} / ${singleForm.section || '1'}`.trim(),
                phone: singleForm.phone || '',
                customValues,
                customFieldValue,
                status: submissionStatus,
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, 'link_submissions'), payload);

            if (submissionStatus === 'approved') {
                await updateDoc(doc(db, 'registration_links', linkData.id), {
                    currentCount: increment(1)
                }).catch(console.warn);
            }

            if (submissionStatus === 'waitlist') {
                toast.success("تم تسجيلك في قائمة الانتظار لاكتمال المقاعد");
            } else {
                toast.success("تم تسجيل بيانات الطالب بنجاح");
            }

            if (addAnother) {
                setSingleForm(prev => ({
                    ...prev,
                    studentName: '',
                    phone: '',
                    customValues: {}
                }));
            } else {
                setSingleForm({
                    studentName: '',
                    grade: gradeOptions[0] || '',
                    section: '1',
                    phone: '',
                    customValues: {}
                });
            }
        } catch (err) {
            console.error("Submission error:", err);
            toast.error("حدث خطأ أثناء الإرسال: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Submit Rapid Entries
    const handleSaveRapid = async () => {
        const validRows = rapidRows.filter(r => r.studentName.trim().length > 0);
        if (validRows.length === 0) {
            toast.error("يرجى إدخال اسم طالب واحد على الأقل");
            return;
        }

        // Validate multiple custom fields in rapid mode
        for (const field of customFields) {
            if (field.required) {
                const missingCustom = validRows.some(r => !r.customValues?.[field.id]?.trim());
                if (missingCustom) {
                    toast.error(`يرجى تحديد "${field.label}" لجميع الطلاب المدخلين`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        const toastId = toast.loading(`جاري حفظ ${validRows.length} طالب...`);

        try {
            let seatsLeft = hasMaxCap ? Math.max(0, maxCap - activeCount) : 999999;

            for (const row of validRows) {
                const rowIsFull = hasMaxCap && seatsLeft <= 0;
                const submissionStatus = rowIsFull
                    ? (canWaitlist ? 'waitlist' : 'rejected')
                    : (linkData.approvalMode === 'immediate' ? 'approved' : 'pending');

                if (hasMaxCap && !rowIsFull) {
                    seatsLeft--;
                }

                const customValues = row.customValues || {};
                const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

                await addDoc(collection(db, 'link_submissions'), {
                    linkId: linkData.id,
                    studentName: row.studentName.trim(),
                    grade: row.grade || gradeOptions[0] || '',
                    section: row.section || '1',
                    class: `${row.grade || ''} / ${row.section || '1'}`.trim(),
                    phone: row.phone || '',
                    customValues,
                    customFieldValue,
                    status: submissionStatus,
                    createdAt: serverTimestamp()
                });

                if (submissionStatus === 'approved') {
                    await updateDoc(doc(db, 'registration_links', linkData.id), {
                        currentCount: increment(1)
                    }).catch(console.warn);
                }
            }

            toast.success("تم تسجيل جميع الطلاب بنجاح", { id: toastId });
            setRapidRows([
                { studentName: '', grade: gradeOptions[0] || '', section: '1', customValues: {}, phone: '' },
                { studentName: '', grade: gradeOptions[0] || '', section: '1', customValues: {}, phone: '' },
                { studentName: '', grade: gradeOptions[0] || '', section: '1', customValues: {}, phone: '' }
            ]);
        } catch (err) {
            console.error("Rapid submit error:", err);
            toast.error("حدث خطأ أثناء الحفظ", { id: toastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete Submission (by delegate)
    const handleDeleteSubmission = async (sub) => {
        if (!window.confirm(`هل أنت متأكد من حذف اسم الطالب "${sub.studentName}"؟`)) return;
        try {
            await deleteDoc(doc(db, 'link_submissions', sub.id));
            if (sub.status === 'approved') {
                await updateDoc(doc(db, 'registration_links', linkData.id), {
                    currentCount: increment(-1)
                }).catch(console.warn);
            }
            toast.success("تم حذف الاسم بنجاح");
        } catch (err) {
            toast.error("فشل في الحذف: " + err.message);
        }
    };

    // Save Edited Submission
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editingSub) return;
        try {
            const customValues = editingSub.customValues || {};
            const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ') || editingSub.customFieldValue || '';

            await updateDoc(doc(db, 'link_submissions', editingSub.id), {
                studentName: editingSub.studentName,
                grade: editingSub.grade,
                section: editingSub.section,
                class: `${editingSub.grade || ''} / ${editingSub.section || ''}`.trim(),
                customValues,
                customFieldValue,
                phone: editingSub.phone || '',
                status: editingSub.status,
                linkId: linkData.id,
                updatedAt: serverTimestamp()
            });
            toast.success("تم تحديث البيانات");
            setEditingSub(null);
        } catch (err) {
            console.error("Save edit error:", err);
            toast.error("فشل في الحفظ: " + err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white font-cairo text-right py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center" dir="rtl">
            <Toaster position="top-center" />

            <div className="max-w-3xl w-full space-y-6">
                {/* School & Brand Header */}
                <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-4 rounded-3xl shadow-xl backdrop-blur-md">
                    <AppLogo size="normal" />
                    <div className="text-left">
                        <span className="text-xs text-slate-400 block font-semibold">المملكة العربية السعودية</span>
                        <span className="text-xs font-bold text-white">{schoolInfo?.name || "وزارة التعليم"}</span>
                    </div>
                </div>

                {/* Campaign Main Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500" />

                    {/* Title & Subtitle */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                استمارة تسجيل مشاركة
                            </span>
                            {(linkData.specializations?.length > 0 || linkData.specialization) && (
                                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                    المجال: {Array.isArray(linkData.specializations) && linkData.specializations.length > 0 ? linkData.specializations.join('، ') : linkData.specialization}
                                </span>
                            )}
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                            {linkData.title}
                        </h1>

                        {linkData.eventTitle && (
                            <p className="text-xs text-indigo-400 font-semibold">
                                الفعالية المرتبطة: {linkData.eventTitle}
                            </p>
                        )}
                    </div>

                    {/* Delegate Card */}
                    <div className="bg-gradient-to-r from-indigo-950/40 via-slate-800/60 to-slate-900 p-4 rounded-2xl border border-indigo-900/40 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                                <Users size={22} />
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 block font-semibold">إشراف وتنظيم الطالب المفوض</span>
                                <span className="text-sm font-bold text-white">{linkData.delegateName}</span>
                            </div>
                        </div>

                        {linkData.pointsPerStudent > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                                <Sparkles size={14} />
                                <span>+{linkData.pointsPerStudent} نقاط تميز لكل طالب</span>
                            </div>
                        )}
                    </div>

                    {/* Admin Instructions Box */}
                    {linkData.instructions && (
                        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-1">
                            <span className="font-bold text-indigo-300 block mb-1">تعليمات وشروط التسجيل:</span>
                            <p className="whitespace-pre-line">{linkData.instructions}</p>
                        </div>
                    )}

                    {/* Visual Capacity Bar */}
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                                <Users size={14} /> {hasMaxCap ? "الطاقة الاستيعابية للنشاط" : "المشاركون في النشاط"}
                            </span>
                            <span className="font-bold text-white">
                                {hasMaxCap ? (
                                    <span>{activeCount} من {maxCap} مقعد ({capacityPercent}%)</span>
                                ) : (
                                    <span>{activeCount} مسجل (مفتوح بدون حد أقصى)</span>
                                )}
                                {linkData.approvalMode === 'review' && pendingCount > 0 && (
                                    <span className="text-amber-400 font-normal mr-1 text-[11px]">
                                        ({approvedCount} معتمد، {pendingCount} قيد المراجعة)
                                    </span>
                                )}
                            </span>
                        </div>

                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    !hasMaxCap
                                        ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                                        : capacityPercent >= 100 ? 'bg-rose-500' : capacityPercent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                                }`}
                                style={{ width: hasMaxCap ? `${capacityPercent}%` : '100%' }}
                            />
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            {hasMaxCap ? (
                                <span>المقاعد المتبقية: <strong className="text-indigo-400">{remainingSeats}</strong></span>
                            ) : (
                                <span className="text-emerald-400 font-semibold">التسجيل متاح لجميع الطلاب بدون حد أقصى</span>
                            )}
                            {isFull && canWaitlist && (
                                <span className="text-blue-400 font-semibold">متاح التسجيل في قائمة الانتظار</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Status Banners (Paused / Expired / Full) */}
                {isPaused ? (
                    <div className="bg-amber-950/40 border border-amber-800/50 p-6 rounded-3xl text-center space-y-2">
                        <AlertTriangle size={32} className="mx-auto text-amber-400" />
                        <h3 className="text-base font-bold text-amber-200">التسجيل موقوف مؤقتاً</h3>
                        <p className="text-xs text-amber-300/80">
                            تم إيقاف التسجيل في هذا الرابط مؤقتاً بواسطة إدارة النشاط. يرجى المراجعة لاحقاً.
                        </p>
                    </div>
                ) : isNotStarted ? (
                    <div className="bg-blue-950/40 border border-blue-800/50 p-6 rounded-3xl text-center space-y-2">
                        <Clock size={32} className="mx-auto text-blue-400" />
                        <h3 className="text-base font-bold text-blue-200">لم يبدأ التسجيل بعد</h3>
                        <p className="text-xs text-blue-300/80">
                            موعد بدء التسجيل المحدد: {new Date(linkData.startAt).toLocaleString('ar-SA')}
                        </p>
                    </div>
                ) : isExpired ? (
                    <div className="bg-rose-950/40 border border-rose-800/50 p-6 rounded-3xl text-center space-y-2">
                        <Clock size={32} className="mx-auto text-rose-400" />
                        <h3 className="text-base font-bold text-rose-200">انتهت فترة التسجيل</h3>
                        <p className="text-xs text-rose-300/80">
                            انتهت المدة الزمنية المحددة لاستقبال المشاركات في هذه الفعالية.
                        </p>
                    </div>
                ) : isFull && !canWaitlist ? (
                    <div className="bg-rose-950/40 border border-rose-800/50 p-6 rounded-3xl text-center space-y-2">
                        <AlertCircle size={32} className="mx-auto text-rose-400" />
                        <h3 className="text-base font-bold text-rose-200">اكتملت المقاعد المتاحة</h3>
                        <p className="text-xs text-rose-300/80">
                            نعتذر، لقد تم حجز جميع المقاعد المحددة لهذا النشاط بالكامل.
                        </p>
                    </div>
                ) : (
                    /* Entry Section */
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                        {/* Waitlist Warning Banner */}
                        {isFull && canWaitlist && (
                            <div className="bg-blue-950/40 border border-blue-800/60 p-4 rounded-2xl flex items-center gap-3 text-blue-300 text-xs">
                                <Clock size={20} className="shrink-0 text-blue-400" />
                                <div>
                                    <strong className="block font-bold">تنبيه: المقاعد الأساسية مكتملة</strong>
                                    <span>سيتم إدراج تسجيلك في قائمة الانتظار، وسيتم قبولك في حال اعتذار أي مشارك.</span>
                                </div>
                            </div>
                        )}

                        {/* Mode Selector Tabs */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus size={18} className="text-indigo-400" />
                                <span>إدخال بيانات الطلاب</span>
                            </h2>

                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                                <button
                                    onClick={() => setEntryMode('single')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        entryMode === 'single'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    إدخال تفصيلي فردي
                                </button>
                                <button
                                    onClick={() => setEntryMode('rapid')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        entryMode === 'rapid'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    وضع الإدخال السريع المتعدد
                                </button>
                            </div>
                        </div>

                        {/* Mode 1: Single Entry Form */}
                        {entryMode === 'single' && (
                            <form onSubmit={(e) => handleSaveSingle(e, false)} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        اسم الطالب الثلاثي / الرباعي <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="مثال: خالد عبد العزيز الشمري"
                                        value={singleForm.studentName}
                                        onChange={(e) => setSingleForm({ ...singleForm, studentName: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                            الصف الدراسي <span className="text-rose-400">*</span>
                                        </label>
                                        <select
                                            value={singleForm.grade}
                                            onChange={(e) => setSingleForm({ ...singleForm, grade: e.target.value, section: '1' })}
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                        >
                                            {gradeOptions.map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                            الشعبة <span className="text-rose-400">*</span>
                                        </label>
                                        <select
                                            value={singleForm.section}
                                            onChange={(e) => setSingleForm({ ...singleForm, section: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                        >
                                            {getSectionOptions(singleForm.grade).map(sec => (
                                                <option key={sec} value={sec}>شعبة {sec}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Dynamic Custom Fields for Single Mode */}
                                {customFields.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {customFields.map((field) => (
                                            <div key={field.id}>
                                                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                                    {field.label} {field.required ? <span className="text-rose-400 mr-1">*</span> : <span className="text-slate-500 font-normal mr-1">(اختياري)</span>}
                                                </label>
                                                <input
                                                    type="text"
                                                    required={field.required}
                                                    placeholder={`أدخل ${field.label}...`}
                                                    value={singleForm.customValues?.[field.id] || ''}
                                                    onChange={(e) => setSingleForm({
                                                        ...singleForm,
                                                        customValues: { ...(singleForm.customValues || {}), [field.id]: e.target.value }
                                                    })}
                                                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        رقم الجوال للتواصل (اختياري)
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="05xxxxxxxx"
                                        value={singleForm.phone}
                                        onChange={(e) => setSingleForm({ ...singleForm, phone: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                                    />
                                </div>

                                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={(e) => handleSaveSingle(e, true)}
                                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                                    >
                                        <Plus size={16} />
                                        <span>حفظ وإضافة طالب آخر</span>
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-xs flex items-center justify-center gap-2"
                                    >
                                        <Save size={16} />
                                        <span>{isSubmitting ? "جاري الحفظ..." : "حفظ وإنهاء"}</span>
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Mode 2: Rapid Multi-row Entry */}
                        {entryMode === 'rapid' && (
                            <div className="space-y-4">
                                <div className="space-y-2.5">
                                    {rapidRows.map((row, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-800/50 p-2.5 rounded-2xl border border-slate-800 flex-wrap sm:flex-nowrap">
                                            <span className="text-xs text-slate-500 font-mono w-6 text-center shrink-0">
                                                {idx + 1}
                                            </span>

                                            <input
                                                type="text"
                                                placeholder="اسم الطالب..."
                                                value={row.studentName}
                                                onChange={(e) => {
                                                    const updated = [...rapidRows];
                                                    updated[idx].studentName = e.target.value;
                                                    setRapidRows(updated);
                                                }}
                                                className="flex-2 min-w-[150px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                            />

                                            <select
                                                value={row.grade || gradeOptions[0]}
                                                onChange={(e) => {
                                                    const updated = [...rapidRows];
                                                    updated[idx].grade = e.target.value;
                                                    setRapidRows(updated);
                                                }}
                                                className="w-28 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                            >
                                                {gradeOptions.map(g => (
                                                    <option key={g} value={g}>{g}</option>
                                                ))}
                                            </select>

                                            <input
                                                type="text"
                                                placeholder="شعبة"
                                                value={row.section}
                                                onChange={(e) => {
                                                    const updated = [...rapidRows];
                                                    updated[idx].section = e.target.value;
                                                    setRapidRows(updated);
                                                }}
                                                className="w-16 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white text-center"
                                            />

                                            {customFields.map((field) => (
                                                <input
                                                    key={field.id}
                                                    type="text"
                                                    placeholder={`${field.label}${field.required ? ' *' : ''}`}
                                                    value={row.customValues?.[field.id] || ''}
                                                    onChange={(e) => {
                                                        const updated = [...rapidRows];
                                                        updated[idx].customValues = {
                                                            ...(updated[idx].customValues || {}),
                                                            [field.id]: e.target.value
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="flex-1 min-w-[110px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                />
                                            ))}

                                            {rapidRows.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setRapidRows(rapidRows.filter((_, i) => i !== idx))}
                                                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setRapidRows([...rapidRows, { studentName: '', grade: gradeOptions[0] || '', section: '1', customValues: {}, phone: '' }])}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                                    >
                                        <Plus size={14} />
                                        <span>إضافة سطر جديد</span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={handleSaveRapid}
                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        <Save size={16} />
                                        <span>{isSubmitting ? "جاري الحفظ..." : "حفظ الكل دفعة واحدة"}</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom Section: Submissions by this delegate */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h3 className="font-bold text-white text-base flex items-center gap-2">
                            <Users size={18} className="text-indigo-400" />
                            <span>الأسماء المسجلة عبر هذا الرابط ({submissions.length})</span>
                        </h3>
                        <span className="text-xs text-slate-400">
                            يمكنك تعديل أو حذف أي اسم قمت بإدخاله طالما أن التسجيل نشط
                        </span>
                    </div>

                    {submissions.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 text-xs">
                            لم يتم تسجيل أي أسماء حتى الآن. استخدم النموذج أعلاه لبدء التسجيل.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {submissions.map((sub, idx) => (
                                <div
                                    key={sub.id}
                                    className="bg-slate-800/60 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-3 flex-wrap"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500 font-mono w-5 text-center">
                                            {idx + 1}
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-white text-sm">{sub.studentName}</h4>
                                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-300">
                                                    {sub.grade} - شعبة {sub.section || '1'}
                                                </span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                                    sub.status === 'approved'
                                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        : sub.status === 'waitlist'
                                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                }`}>
                                                    {sub.status === 'approved' ? 'معتمد' : sub.status === 'waitlist' ? 'قائمة انتظار' : 'بانتظار الاعتماد'}
                                                </span>
                                            </div>
                                            {/* Custom Fields Badges */}
                                            {customFields.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    {customFields.map((f) => {
                                                        const val = sub.customValues?.[f.id] || (f.id === 'f_legacy' ? sub.customFieldValue : '');
                                                        if (!val) return null;
                                                        return (
                                                            <span key={f.id} className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300">
                                                                <span className="text-slate-400">{f.label}: </span>
                                                                {val}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit / Delete (Allowed if link is active) */}
                                    {!isExpired && !isPaused && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setEditingSub(sub)}
                                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                                title="تعديل"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSubmission(sub)}
                                                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                title="حذف"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Edit Modal */}
                {editingSub && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-right space-y-4" dir="rtl">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h3 className="font-bold text-white text-base">تعديل بيانات الطالب</h3>
                                <button onClick={() => setEditingSub(null)} className="text-slate-400 hover:text-white">
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleSaveEdit} className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">اسم الطالب</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingSub.studentName}
                                        onChange={(e) => setEditingSub({ ...editingSub, studentName: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الصف</label>
                                        <select
                                            value={editingSub.grade}
                                            onChange={(e) => setEditingSub({ ...editingSub, grade: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        >
                                            {gradeOptions.map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الشعبة</label>
                                        <input
                                            type="text"
                                            value={editingSub.section}
                                            onChange={(e) => setEditingSub({ ...editingSub, section: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                </div>

                                {customFields.map((field) => (
                                    <div key={field.id}>
                                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                                        <input
                                            type="text"
                                            value={editingSub.customValues?.[field.id] || (field.id === 'f_legacy' ? editingSub.customFieldValue : '') || ''}
                                            onChange={(e) => setEditingSub({
                                                ...editingSub,
                                                customValues: {
                                                    ...(editingSub.customValues || {}),
                                                    [field.id]: e.target.value
                                                }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                ))}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
                                    <input
                                        type="text"
                                        value={editingSub.phone || ''}
                                        onChange={(e) => setEditingSub({ ...editingSub, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingSub(null)}
                                        className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                                    >
                                        حفظ التعديلات
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center text-xs text-slate-600 py-4 font-mono">
                    نظام إدارة النشاط المدرسي &bull; School Activity Management
                </div>
            </div>
        </div>
    );
}

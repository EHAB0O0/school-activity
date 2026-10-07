import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import {
    doc, collection, addDoc, query, where, getDocs,
    onSnapshot, updateDoc, deleteDoc, serverTimestamp, increment
} from 'firebase/firestore';
import {
    Lock, CheckCircle, AlertCircle, Users, Plus, Trash2,
    Edit2, Save, Sparkles, Clock, AlertTriangle, ArrowRight, X,
    HelpCircle, RotateCcw, Clipboard, CheckCircle2, Zap,
    ChevronDown, ChevronUp, Copy, Check
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
        isGradeUnknown: false,
        grade: '',
        section: '',
        phone: '',
        customValues: {}
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Rapid Entry State (multi-row)
    const [rapidRows, setRapidRows] = useState([
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' }
    ]);

    // Smart Bulk Paste state & students list from DB
    const [students, setStudents] = useState([]);
    const [smartPasteText, setSmartPasteText] = useState('');
    const [isSmartPasteExpanded, setIsSmartPasteExpanded] = useState(true);

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

    // Fetch active students for smart matching in rapid mode
    useEffect(() => {
        let isMounted = true;
        async function fetchStudents() {
            try {
                const snap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
                let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                if (list.length === 0) {
                    const fallbackSnap = await getDocs(collection(db, 'students'));
                    list = fallbackSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(s => s.active !== false);
                }
                if (isMounted) {
                    setStudents(list);
                }
            } catch (err) {
                console.error("Error fetching students for smart match:", err);
            }
        }
        fetchStudents();
        return () => { isMounted = false; };
    }, []);

    // Set default grade when linkData loads
    useEffect(() => {
        if (linkData && (!linkData.allowedGrades || linkData.allowedGrades.includes('all'))) {
            if (grades && grades.length > 0) {
                const firstGrade = typeof grades[0] === 'object' ? (grades[0].name || grades[0].id) : grades[0];
                setSingleForm(prev => ({ ...prev, grade: prev.grade || firstGrade || '' }));
            }
        } else if (linkData?.allowedGrades && linkData.allowedGrades.length > 0) {
            const firstAllowed = typeof linkData.allowedGrades[0] === 'object' ? (linkData.allowedGrades[0].name || linkData.allowedGrades[0].id) : linkData.allowedGrades[0];
            setSingleForm(prev => ({ ...prev, grade: prev.grade || firstAllowed || '' }));
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

    // Allowed grade options (always strings)
    const gradeOptions = (linkData.allowedGrades?.includes('all') || !linkData.allowedGrades?.length
        ? (grades?.map(g => typeof g === 'object' ? (g.name || g.id) : g) || ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'])
        : linkData.allowedGrades.map(g => typeof g === 'object' ? (g.name || g.id) : g)
    ).filter(Boolean);

    // Section options helper (always returns array of strings)
    const getSectionOptions = (gradeName) => {
        const found = grades?.find(g => (typeof g === 'object' ? (g.name || g.id) : g) === gradeName);
        if (found && Array.isArray(found.sections) && found.sections.length > 0) {
            return found.sections.map(sec => {
                if (typeof sec === 'object' && sec !== null) {
                    return String(sec.name || sec.id || '');
                }
                return String(sec);
            }).filter(Boolean);
        }
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

        // Validate multiple custom fields (skip required validation if field has fixed value)
        for (const field of customFields) {
            const hasFixed = field.isFixed && field.fixedValue;
            if (field.required && !hasFixed && !singleForm.customValues?.[field.id]?.trim()) {
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

            const customValues = { ...(singleForm.customValues || {}) };
            customFields.forEach(f => {
                if (f.isFixed && f.fixedValue) {
                    customValues[f.id] = f.fixedValue;
                }
            });
            const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

            const isUnknown = !!singleForm.isGradeUnknown;
            const finalGrade = isUnknown ? 'غير معروف' : (singleForm.grade || gradeOptions[0] || '');
            const finalSection = isUnknown ? '' : (singleForm.section || '1');
            const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

            const payload = {
                linkId: linkData.id,
                studentName: singleForm.studentName.trim(),
                grade: finalGrade,
                section: finalSection,
                class: finalClass,
                isGradeUnknown: isUnknown,
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
                    isGradeUnknown: false,
                    phone: '',
                    customValues: {}
                }));
            } else {
                setSingleForm({
                    studentName: '',
                    isGradeUnknown: false,
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

    // Bulk toggle unknown grades in Rapid Mode
    const handleSetAllRapidUnknown = () => {
        setRapidRows(prev => prev.map(row => ({
            ...row,
            isGradeUnknown: true,
            grade: 'غير معروف',
            section: ''
        })));
        toast.success('تم تعيين "الصف غير معروف" لجميع الطلاب في القائمة');
    };

    const handleClearAllRapidUnknown = () => {
        const defaultGrade = gradeOptions[0] || '';
        const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
        setRapidRows(prev => prev.map(row => {
            const targetGrade = (row.grade && row.grade !== 'غير معروف') ? row.grade : defaultGrade;
            const availableSecs = getSectionOptions(targetGrade);
            const targetSection = (row.section && row.grade !== 'غير معروف' && availableSecs.includes(row.section))
                ? row.section
                : (availableSecs[0] || defaultSection);
            return {
                ...row,
                isGradeUnknown: false,
                grade: targetGrade,
                section: targetSection
            };
        }));
        toast.success('تم إلغاء خيار "غير معروف" واستعادة الصفوف لجميع الطلاب');
    };

    // Rapid Entry row management helpers
    const handleAddRapidRow = (count = 1) => {
        const allCurrentlyUnknown = rapidRows.length > 0 && rapidRows.every(r => r.isGradeUnknown);
        const defaultGrade = gradeOptions[0] || '';
        const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
        const newRows = Array.from({ length: count }, () => ({
            studentName: '',
            isGradeUnknown: allCurrentlyUnknown,
            grade: allCurrentlyUnknown ? 'غير معروف' : defaultGrade,
            section: allCurrentlyUnknown ? '' : defaultSection,
            customValues: {},
            phone: ''
        }));
        setRapidRows(prev => [...prev, ...newRows]);
    };

    const handleRemoveEmptyRapidRows = () => {
        const filled = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0);
        if (filled.length === 0) {
            const defaultGrade = gradeOptions[0] || '';
            const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
            setRapidRows([{
                studentName: '',
                isGradeUnknown: false,
                grade: defaultGrade,
                section: defaultSection,
                customValues: {},
                phone: ''
            }]);
            toast('تمت إعادة تعيين القائمة إلى سطر فارغ واحد', { icon: 'ℹ️' });
            return;
        }
        const removedCount = rapidRows.length - filled.length;
        setRapidRows(filled);
        toast.success(`تم حذف ${removedCount} سطر فارغ`);
    };

    // --- Smart Bulk Paste & Student Recognition Algorithms ---

    // Enhanced Arabic text normalizer specifically tailored for names
    const normalizeArabicForMatch = (str) => {
        if (!str) return '';
        return String(str)
            .trim()
            .toLowerCase()
            .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel
            .replace(/[أإآٱ]/g, 'ا') // Alef forms
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/[ؤئ]/g, 'ي')
            .replace(/\u0640/g, '') // Tatweel
            .replace(/\bعبد\s+/g, 'عبد')
            .replace(/\bابو\s+/g, 'ابو')
            .replace(/\bال\s+/g, 'ال')
            .replace(/[\(\)\[\]{}.,،_+\-–—\\/|:;؛!?~*]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Filter out common connective prefixes in Arabic names (بن, ابن, بنت)
    const getComparableTokens = (normStr) => {
        return normStr
            .split(' ')
            .filter(t => t && t !== 'بن' && t !== 'ابن' && t !== 'ابنه' && t !== 'بنت');
    };

    // Pre-indexed students for fast and accurate matching
    const preparedStudents = useMemo(() => {
        return (students || []).map(s => {
            const sNorm = normalizeArabicForMatch(s.name);
            const sTokens = getComparableTokens(sNorm);
            return {
                ...s,
                sNorm,
                sTokens
            };
        });
    }, [students]);

    // Match a student name against pre-indexed school students
    const findBestStudentMatch = (rawName) => {
        if (!rawName || !preparedStudents.length) return null;
        const queryNorm = normalizeArabicForMatch(rawName);
        if (!queryNorm) return null;
        const queryTokens = getComparableTokens(queryNorm);

        // 1. Exact Normalized Name Match
        let matched = preparedStudents.find(s => s.sNorm === queryNorm);
        if (matched) return { student: matched, matchType: 'exact', confidence: 100 };

        // 2. Exact Comparable Tokens Match (ignoring "بن" / "ابن")
        if (queryTokens.length >= 2) {
            matched = preparedStudents.find(s => s.sTokens.join(' ') === queryTokens.join(' '));
            if (matched) return { student: matched, matchType: 'tokens_exact', confidence: 98 };
        }

        // 3. Substring / Prefix match
        if (queryTokens.length >= 2) {
            const queryTokensStr = queryTokens.join(' ');
            matched = preparedStudents.find(s => {
                const sTokensStr = s.sTokens.join(' ');
                return sTokensStr.startsWith(queryTokensStr) || queryTokensStr.startsWith(sTokensStr);
            });
            if (matched) return { student: matched, matchType: 'prefix', confidence: 90 };
        }

        // 4. First Name + Last Name match with high token overlap
        if (queryTokens.length >= 2) {
            let bestCandidate = null;
            let bestScore = 0;

            for (const s of preparedStudents) {
                if (s.sTokens.length < 2) continue;
                const firstMatch = s.sTokens[0] === queryTokens[0];
                const lastMatch = s.sTokens[s.sTokens.length - 1] === queryTokens[queryTokens.length - 1];
                const sharedTokens = queryTokens.filter(t => s.sTokens.includes(t));

                if (firstMatch && lastMatch && sharedTokens.length >= 2) {
                    const score = (sharedTokens.length * 2) / (queryTokens.length + s.sTokens.length);
                    if (score > bestScore && score >= 0.5) {
                        bestScore = score;
                        bestCandidate = s;
                    }
                } else if (firstMatch && sharedTokens.length >= 3) {
                    const score = (sharedTokens.length * 2) / (queryTokens.length + s.sTokens.length);
                    if (score > bestScore && score >= 0.6) {
                        bestScore = score;
                        bestCandidate = s;
                    }
                }
            }

            if (bestCandidate) {
                return {
                    student: bestCandidate,
                    matchType: 'fuzzy',
                    confidence: Math.round(bestScore * 100)
                };
            }
        }

        return null;
    };

    // Helper to resolve grade and section from matched student and/or hints
    const resolveGradeAndSection = (matchedStudent, inlineGradeHint, inlineSectionHint) => {
        const rawGrade = matchedStudent?.grade || inlineGradeHint || '';
        const rawClass = matchedStudent?.class || inlineGradeHint || '';
        const rawSection = matchedStudent?.section || inlineSectionHint || '';

        let resolvedGrade = '';
        let resolvedSection = '';

        // Match with gradeOptions
        if (rawGrade) {
            const matchedGradeOpt = gradeOptions.find(g =>
                normalizeArabicForMatch(g) === normalizeArabicForMatch(rawGrade) ||
                g.includes(rawGrade) ||
                rawGrade.includes(g)
            ) || gradeOptions.find(g => {
                if (/اول|أول|1/i.test(rawGrade) && /اول|أول|1/i.test(g)) return true;
                if (/ثاني|2/i.test(rawGrade) && /ثاني|2/i.test(g)) return true;
                if (/ثالث|3/i.test(rawGrade) && /ثالث|3/i.test(g)) return true;
                return false;
            });
            resolvedGrade = matchedGradeOpt || '';
        }

        if (!resolvedGrade && rawClass) {
            const matchedGradeOpt = gradeOptions.find(g => rawClass.includes(g)) ||
                gradeOptions.find(g => {
                    if (/اول|أول|1/i.test(rawClass) && /اول|أول|1/i.test(g)) return true;
                    if (/ثاني|2/i.test(rawClass) && /ثاني|2/i.test(g)) return true;
                    if (/ثالث|3/i.test(rawClass) && /ثالث|3/i.test(g)) return true;
                    return false;
                });
            resolvedGrade = matchedGradeOpt || '';
        }

        if (!resolvedGrade) {
            resolvedGrade = gradeOptions[0] || '';
        }

        // Resolve section
        const availableSections = getSectionOptions(resolvedGrade);
        let candidateSection = String(rawSection || '').trim();

        if (!candidateSection && rawClass) {
            const slashMatch = String(rawClass).match(/[\/\-]\s*(\d+)/);
            if (slashMatch) {
                candidateSection = slashMatch[1];
            } else {
                const anyDigit = String(rawClass).match(/(\d+)/);
                if (anyDigit) candidateSection = anyDigit[1];
            }
        }

        if (candidateSection && availableSections.includes(candidateSection)) {
            resolvedSection = candidateSection;
        } else if (availableSections.length > 0) {
            resolvedSection = candidateSection || availableSections[0] || '1';
        } else {
            resolvedSection = '1';
        }

        return {
            grade: resolvedGrade,
            section: resolvedSection
        };
    };

    // Clean raw pasted text into student name candidates & hints
    const parsePastedStudentsText = (rawText) => {
        if (!rawText || !rawText.trim()) return [];

        let rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        // If only 1 line but separated by commas:
        if (rawLines.length === 1 && (rawLines[0].includes('،') || rawLines[0].includes(','))) {
            const commaSplit = rawLines[0].split(/[،,]/).map(s => s.trim()).filter(Boolean);
            if (commaSplit.length > 1) {
                rawLines = commaSplit;
            }
        }

        const results = [];

        rawLines.forEach(line => {
            let clean = line;

            // 1. Remove leading numbering (Western 123 and Arabic-Indic ١٢٣)
            clean = clean.replace(/^[\(\[]?[\d\u0660-\u0669]+[\)\]]?[\.\-\:\/]?\s*/, '');

            // 2. Remove leading bullets or icons
            clean = clean.replace(/^[•●○■▪️▫️\-*~–—✦★✓✔👉👤]+\s*/, '');

            // 3. Remove labels like "الطالب:" or "الاسم:"
            clean = clean.replace(/^(اسم\s+الطالب|الطالب|الاسم)\s*[:：\-]\s*/i, '');

            // 4. Handle Excel tab separation
            let tabGrade = '';
            let tabSection = '';
            if (clean.includes('\t')) {
                const tabParts = clean.split('\t').map(p => p.trim()).filter(Boolean);
                if (tabParts.length > 0) {
                    clean = tabParts[0];
                    if (tabParts[1]) tabGrade = tabParts[1];
                    if (tabParts[2]) tabSection = tabParts[2];
                }
            }

            // 5. Handle inline class annotation
            let inlineGradeHint = tabGrade;
            let inlineSectionHint = tabSection;

            const classMatch = clean.match(/[\(\[\-–—]([^\)\]]+)[\)\]]?$/);
            if (classMatch && !inlineGradeHint) {
                const potentialClass = classMatch[1].trim();
                if (/(ثانوي|اول|أول|ثاني|ثالث|\d\s*[\/\-]\s*\d)/i.test(potentialClass)) {
                    inlineGradeHint = potentialClass;
                    clean = clean.replace(/[\(\[\-–—]([^\)\]]+)[\)\]]?$/, '').trim();
                }
            }

            // 6. Clean extra quotes or trailing punctuation
            clean = clean.replace(/^["'«]+|["'»]+$/g, '').trim();
            clean = clean.replace(/[\.\:\-–—]$/, '').trim();

            if (clean.length >= 2) {
                results.push({
                    rawName: clean,
                    inlineGradeHint,
                    inlineSectionHint
                });
            }
        });

        return results;
    };

    // Memoized live analysis stats of pasted text
    const smartAnalysisStats = useMemo(() => {
        if (!smartPasteText || !smartPasteText.trim()) {
            return { total: 0, matched: 0, unmatched: 0, candidates: [] };
        }

        const parsed = parsePastedStudentsText(smartPasteText);
        let matchedCount = 0;

        const candidates = parsed.map(item => {
            const matchRes = findBestStudentMatch(item.rawName);
            if (matchRes) matchedCount++;
            return {
                ...item,
                matchResult: matchRes
            };
        });

        return {
            total: candidates.length,
            matched: matchedCount,
            unmatched: candidates.length - matchedCount,
            candidates
        };
    }, [smartPasteText, preparedStudents, gradeOptions]);

    // Apply smart paste text to rapidRows
    const handleApplySmartPaste = (customText = null) => {
        const textToUse = customText !== null ? customText : smartPasteText;
        if (!textToUse || !textToUse.trim()) {
            toast.error("يرجى لصق أو إدخال أسماء الطلاب أولاً");
            return;
        }

        const parsed = parsePastedStudentsText(textToUse);
        if (parsed.length === 0) {
            toast.error("لم يتم العثور على أي أسماء في النص المدخل");
            return;
        }

        const initialCustomValues = {};
        customFields.forEach(field => {
            if (field.isFixed && field.fixedValue) {
                initialCustomValues[field.id] = field.fixedValue;
            }
        });

        let matchedCount = 0;
        const newRows = parsed.map(item => {
            const matchRes = findBestStudentMatch(item.rawName);
            const matched = matchRes?.student;
            if (matched) matchedCount++;

            const { grade, section } = resolveGradeAndSection(matched, item.inlineGradeHint, item.inlineSectionHint);

            return {
                studentName: matched ? matched.name : item.rawName,
                isGradeUnknown: false,
                grade,
                section,
                phone: matched?.phone || '',
                matchedStudentId: matched?.id || null,
                matchedStudentName: matched?.name || null,
                customValues: { ...initialCustomValues }
            };
        });

        // Replace blank rows or append
        const currentFilled = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0);
        if (currentFilled.length === 0) {
            setRapidRows(newRows);
        } else {
            setRapidRows([...currentFilled, ...newRows]);
        }

        toast.success(`تم التعرف على ${newRows.length} طالب بنجاح (${matchedCount} مطابق بالسجل المدرسي)`);
        setSmartPasteText('');
    };

    // Direct paste from clipboard
    const handlePasteFromClipboard = async () => {
        try {
            if (!navigator.clipboard?.readText) {
                toast.error("متصفحك لا يدعم القراءة المباشرة من الحافظة، يرجى اللصق يدوياً في المربع");
                return;
            }
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) {
                toast("الحافظة فارغة، يرجى نسخ الأسماء أولاً", { icon: '📋' });
                return;
            }
            setSmartPasteText(text);
            handleApplySmartPaste(text);
        } catch (err) {
            console.warn("Clipboard access denied or failed:", err);
            toast.error("تعذر الوصول للحافظة، يرجى لصق النص يدوياً داخل المربع");
        }
    };

    // Rapid Entry live metrics
    const totalRapidRows = rapidRows.length;
    const filledRapidRows = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0).length;
    const emptyRapidRows = totalRapidRows - filledRapidRows;

    // Submit Rapid Entries
    const handleSaveRapid = async () => {
        const validRows = rapidRows.filter(r => r.studentName.trim().length > 0);
        if (validRows.length === 0) {
            toast.error("يرجى إدخال اسم طالب واحد على الأقل");
            return;
        }

        // Validate multiple custom fields in rapid mode (skip if fixed)
        for (const field of customFields) {
            const hasFixed = field.isFixed && field.fixedValue;
            if (field.required && !hasFixed) {
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

                const customValues = { ...(row.customValues || {}) };
                customFields.forEach(f => {
                    if (f.isFixed && f.fixedValue) {
                        customValues[f.id] = f.fixedValue;
                    }
                });
                const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

                const isUnknown = !!row.isGradeUnknown || row.grade === 'غير معروف';
                const finalGrade = isUnknown ? 'غير معروف' : (row.grade || gradeOptions[0] || '');
                const finalSection = isUnknown ? '' : (row.section || '1');
                const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

                await addDoc(collection(db, 'link_submissions'), {
                    linkId: linkData.id,
                    studentName: row.studentName.trim(),
                    grade: finalGrade,
                    section: finalSection,
                    class: finalClass,
                    isGradeUnknown: isUnknown,
                    phone: row.phone || '',
                    customValues,
                    customFieldValue,
                    status: submissionStatus,
                    matchedStudentId: row.matchedStudentId || null,
                    createdAt: serverTimestamp()
                });

                if (submissionStatus === 'approved') {
                    await updateDoc(doc(db, 'registration_links', linkData.id), {
                        currentCount: increment(1)
                    }).catch(console.warn);
                }
            }

            toast.success("تم تسجيل جميع الطلاب بنجاح", { id: toastId });
            const defaultGrade = gradeOptions[0] || '';
            const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
            setRapidRows([
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' },
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' },
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' }
            ]);
            setSmartPasteText('');
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

            const isUnknown = editingSub.grade === 'غير معروف' || !!editingSub.isGradeUnknown;
            const finalGrade = isUnknown ? 'غير معروف' : (editingSub.grade || '');
            const finalSection = isUnknown ? '' : (editingSub.section || '');
            const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

            await updateDoc(doc(db, 'link_submissions', editingSub.id), {
                studentName: editingSub.studentName,
                grade: finalGrade,
                section: finalSection,
                class: finalClass,
                isGradeUnknown: isUnknown,
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
        <div className="min-h-screen w-full bg-slate-950 text-white font-cairo text-right py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center overflow-y-auto" dir="rtl">
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
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 rounded-t-3xl" />

                    {/* Title & Subtitle */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                استمارة تسجيل مشاركة
                            </span>
                            {(linkData.specializations?.length > 0 || linkData.specialization) && (
                                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                    المجال: {Array.isArray(linkData.specializations) && linkData.specializations.length > 0
                                        ? linkData.specializations.map(s => typeof s === 'object' ? (s.name || s.id) : String(s)).join('، ')
                                        : (typeof linkData.specialization === 'object' ? (linkData.specialization?.name || '') : String(linkData.specialization || ''))}
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

                                {/* Option: الصف غير معروف (بين خانة الاسم والصف) */}
                                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={!!singleForm.isGradeUnknown}
                                            onChange={(e) => {
                                                const isUnknown = e.target.checked;
                                                setSingleForm(prev => ({
                                                    ...prev,
                                                    isGradeUnknown: isUnknown,
                                                    grade: isUnknown ? 'غير معروف' : (prev.grade === 'غير معروف' ? (gradeOptions[0] || '') : prev.grade || gradeOptions[0] || ''),
                                                    section: isUnknown ? '' : (prev.section || getSectionOptions(gradeOptions[0] || '')[0] || '1')
                                                }));
                                            }}
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-slate-200 block">
                                                الصف غير معروف
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                                حدد هذا الخيار إذا لم تكن متأكداً من صف الطالب أو تعذر تحديده حالياً
                                            </span>
                                        </div>
                                    </label>
                                    {singleForm.isGradeUnknown && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full font-bold">
                                            صف غير معروف
                                        </span>
                                    )}
                                </div>

                                {singleForm.isGradeUnknown ? (
                                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                                        <span>⚠️ تم تعيين الصف كـ <strong>غير معروف</strong>. لا يلزم اختيار الصف أو الشعبة.</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                                الصف الدراسي <span className="text-rose-400">*</span>
                                            </label>
                                            <select
                                                value={singleForm.grade}
                                                onChange={(e) => {
                                                    const newGrade = e.target.value;
                                                    const firstSec = getSectionOptions(newGrade)[0] || '1';
                                                    setSingleForm({ ...singleForm, grade: newGrade, section: firstSec });
                                                }}
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
                                )}

                                {/* Dynamic Custom Fields for Single Mode */}
                                {customFields.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {customFields.map((field) => (
                                            field.isFixed && field.fixedValue ? (
                                                <div key={field.id} className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 flex flex-col justify-center">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-xs font-semibold text-amber-300">
                                                            {field.label}
                                                        </label>
                                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                                            قيمة موحدة مسبقاً
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-white">
                                                        {field.fixedValue}
                                                    </p>
                                                </div>
                                            ) : (
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
                                            )
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
                                {/* صندوق اللصق والادخال الذكي المجمع مع التعرف التلقائي على الفصول */}
                                <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/95 to-slate-950/95 border-2 border-indigo-500/30 rounded-3xl p-4 sm:p-5 shadow-2xl relative overflow-hidden space-y-3.5">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

                                    {/* رأس الصندوق */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                                                <Sparkles size={20} className="animate-pulse" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                                                        الادخال واللصق الذكي المجمع للأسماء
                                                    </h3>
                                                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                                                        ⚡ يتعرف على الفصول والشعب فورياً
                                                    </span>
                                                </div>
                                                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed">
                                                    الصق أسماء الطلاب دفعة واحدة (من الواتساب، إكسل، أو كشف مرقم) وسيتعرف النظام عليهم ويعبئ فصولهم وشعبهم تلقائياً.
                                                </p>
                                            </div>
                                        </div>

                                        {/* الأزرار العلوية */}
                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={handlePasteFromClipboard}
                                                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
                                                title="قراءة الأسماء مباشرة من الحافظة وتعبئة الجدول فورياً"
                                            >
                                                <Clipboard size={14} />
                                                <span>📋 لصق فوري من الحافظة</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsSmartPasteExpanded(!isSmartPasteExpanded)}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
                                                title={isSmartPasteExpanded ? "تصغير المربع" : "توسيع المربع"}
                                            >
                                                {isSmartPasteExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* مربع النص والتحليل الذكي */}
                                    {isSmartPasteExpanded && (
                                        <div className="space-y-3 relative z-10 pt-1">
                                            <div className="relative">
                                                <textarea
                                                    rows={4}
                                                    value={smartPasteText}
                                                    onChange={(e) => setSmartPasteText(e.target.value)}
                                                    placeholder={`الصق قائمة الطلاب هنا...\nمثال:\n1- محمد أحمد علي الزهراني\n2- خالد عبدالله القحطاني\n• سعد فهد العتيبي (ثاني ثانوي 1)\nعبدالعزيز صالح`}
                                                    className="w-full px-3.5 py-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans transition-all resize-y min-h-[90px]"
                                                    dir="rtl"
                                                />
                                            </div>

                                            {/* إحصائيات التعرف والإجراءات */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                                                <div className="flex items-center gap-2 flex-wrap text-xs">
                                                    {smartAnalysisStats.total > 0 ? (
                                                        <>
                                                            <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 font-medium">
                                                                تم رصد <strong className="text-white font-mono">{smartAnalysisStats.total}</strong> اسم
                                                            </span>
                                                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1">
                                                                <CheckCircle2 size={12} className="text-emerald-400" />
                                                                <strong className="font-mono">{smartAnalysisStats.matched}</strong> مطابق بالسجل
                                                            </span>
                                                            {smartAnalysisStats.unmatched > 0 && (
                                                                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                                                                    <AlertCircle size={12} className="text-amber-400" />
                                                                    <strong className="font-mono">{smartAnalysisStats.unmatched}</strong> غير مسجل
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400">
                                                            💡 يتعرف تلقائياً على الأرقام، الشرطات، النقاط، الإكسل، وتنسيقات الواتساب.
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {smartPasteText.trim().length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSmartPasteText('')}
                                                            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl bg-slate-800/60 hover:bg-slate-800 transition-colors"
                                                        >
                                                            مسح
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApplySmartPaste()}
                                                        disabled={!smartPasteText.trim()}
                                                        className="flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <Zap size={14} className="fill-current" />
                                                        <span>تعبئة وتحديث الجدول ({smartAnalysisStats.total || 0})</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* شريط التحكم الجماعي لتعيين / إلغاء الصف غير معروف */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/80 border border-slate-800 p-3 rounded-2xl">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-300">
                                            التحكم السريع بحالة الصفوف:
                                        </span>
                                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border transition-colors ${
                                            rapidRows.some(r => r.isGradeUnknown)
                                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>
                                            {rapidRows.filter(r => r.isGradeUnknown).length} من {rapidRows.length} غير معروف
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSetAllRapidUnknown}
                                            className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 text-amber-300 border border-amber-500/40 shadow-sm"
                                            title="جعل صف جميع الطلاب الحاليين غير معروف"
                                        >
                                            <HelpCircle size={14} className="shrink-0" />
                                            <span>تحديد الكل كصف غير معروف</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleClearAllRapidUnknown}
                                            className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 shadow-sm"
                                            title="إلغاء غير معروف واستعادة الصفوف لجميع الطلاب"
                                        >
                                            <RotateCcw size={14} className="shrink-0" />
                                            <span>إلغاء غير معروف للكل</span>
                                        </button>
                                    </div>
                                </div>

                                {/* الشريط الثابت العلوي: زر إضافة سطر ومؤشرات الأسطر المعبأة والفارغة */}
                                <div className="sticky top-2 sm:top-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2.5 sm:p-3 rounded-2xl shadow-xl shadow-black/40 flex flex-wrap items-center justify-between gap-2.5">
                                    {/* أزرار الإضافة السريعة */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(1)}
                                            className="px-3.5 py-1.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
                                            title="إضافة سطر طالب جديد"
                                        >
                                            <Plus size={15} className="stroke-[2.5]" />
                                            <span>إضافة سطر</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(5)}
                                            className="px-2.5 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all"
                                            title="إضافة 5 أسطر دفعة واحدة"
                                        >
                                            +5 أسطر
                                        </button>

                                        {emptyRapidRows > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveEmptyRapidRows}
                                                className="px-2.5 py-1.5 sm:py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                                                title="حذف جميع الأسطر الفارغة"
                                            >
                                                <Trash2 size={13} />
                                                <span>حذف الفاضي ({emptyRapidRows})</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* عدادات الأسطر: الإجمالي، المليانين، الفاضيين */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        {/* الإجمالي */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-300" title="إجمالي عدد الأسطر">
                                            <span className="text-slate-400 text-[11px]">الأسطر:</span>
                                            <span className="font-bold text-white font-mono text-xs">{totalRapidRows}</span>
                                        </div>

                                        {/* المليانين */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300" title="عدد الأسطر التي تم إدخال اسم الطالب بها">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                            <span className="text-[11px]">مليان:</span>
                                            <span className="font-bold font-mono text-xs text-emerald-200">{filledRapidRows}</span>
                                        </div>

                                        {/* الفاضيين */}
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 border rounded-xl transition-colors ${
                                            emptyRapidRows > 0
                                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                                : 'bg-slate-950/50 border-slate-800 text-slate-500'
                                        }`} title="عدد الأسطر الفارغة">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${emptyRapidRows > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`}></span>
                                            <span className="text-[11px]">فاضي:</span>
                                            <span className={`font-bold font-mono text-xs ${emptyRapidRows > 0 ? 'text-amber-200' : 'text-slate-500'}`}>{emptyRapidRows}</span>
                                        </div>

                                        {/* حفظ سريع مباشر من الشريط الثابت */}
                                        <button
                                            type="button"
                                            disabled={isSubmitting || filledRapidRows === 0}
                                            onClick={handleSaveRapid}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all disabled:opacity-40"
                                            title="حفظ الأسطر المكتملة الآن"
                                        >
                                            <Save size={14} />
                                            <span>حفظ ({filledRapidRows})</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    {rapidRows.map((row, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-800/50 p-2.5 rounded-2xl border border-slate-800 flex-wrap sm:flex-nowrap">
                                            <span className="text-xs text-slate-500 font-mono w-6 text-center shrink-0">
                                                {idx + 1}
                                            </span>

                                            <div className="flex-2 min-w-[150px] flex flex-col gap-1">
                                                <input
                                                    type="text"
                                                    placeholder="اسم الطالب..."
                                                    value={row.studentName}
                                                    onChange={(e) => {
                                                        const updated = [...rapidRows];
                                                        const newName = e.target.value;
                                                        updated[idx].studentName = newName;
                                                        const matchRes = findBestStudentMatch(newName);
                                                        if (matchRes?.student) {
                                                            updated[idx].matchedStudentId = matchRes.student.id;
                                                            updated[idx].matchedStudentName = matchRes.student.name;
                                                            const { grade, section } = resolveGradeAndSection(matchRes.student);
                                                            if (!updated[idx].isGradeUnknown) {
                                                                updated[idx].grade = grade;
                                                                updated[idx].section = section;
                                                            }
                                                        } else {
                                                            updated[idx].matchedStudentId = null;
                                                            updated[idx].matchedStudentName = null;
                                                        }
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                />
                                                {row.matchedStudentId ? (
                                                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-1">
                                                        <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
                                                        <span>مطابق بالسجل ({row.grade} / {row.section})</span>
                                                    </div>
                                                ) : (row.studentName && row.studentName.trim().length > 0) ? (
                                                    <div className="flex items-center gap-1 text-[10px] text-amber-400/80 font-medium px-1">
                                                        <AlertCircle size={11} className="shrink-0 text-amber-400" />
                                                        <span>اسم جديد</span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* خيار الصف غير معروف بين خانة الاسم والصف */}
                                            <label
                                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-semibold cursor-pointer shrink-0 select-none transition-all ${
                                                    row.isGradeUnknown
                                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                                        : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
                                                }`}
                                                title="الصف غير معروف لهذا الطالب"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!row.isGradeUnknown}
                                                    onChange={(e) => {
                                                        const isUnknown = e.target.checked;
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            isGradeUnknown: isUnknown,
                                                            grade: isUnknown ? 'غير معروف' : (gradeOptions[0] || ''),
                                                            section: isUnknown ? '' : (getSectionOptions(gradeOptions[0] || '')[0] || '1')
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                                />
                                                <span>الصف غير معروف</span>
                                            </label>

                                            {row.isGradeUnknown ? (
                                                <div className="w-28 px-2 py-2 bg-amber-950/30 border border-amber-600/30 rounded-xl text-[11px] text-amber-300 text-center font-bold">
                                                    غير معروف
                                                </div>
                                            ) : (
                                                <select
                                                    value={row.grade || gradeOptions[0]}
                                                    onChange={(e) => {
                                                        const newGrade = e.target.value;
                                                        const availableSections = getSectionOptions(newGrade);
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            grade: newGrade,
                                                            section: availableSections[0] || '1'
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-28 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                >
                                                    {gradeOptions.map(g => (
                                                        <option key={g} value={g}>{g}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {row.isGradeUnknown ? (
                                                <div className="w-24 px-2 py-2 bg-slate-900/40 border border-dashed border-slate-700 rounded-xl text-xs text-slate-500 text-center">
                                                    -
                                                </div>
                                            ) : (
                                                <select
                                                    value={row.section || getSectionOptions(row.grade || gradeOptions[0])[0] || '1'}
                                                    onChange={(e) => {
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            section: e.target.value
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-24 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white text-center"
                                                >
                                                    {getSectionOptions(row.grade || gradeOptions[0]).map(sec => (
                                                        <option key={sec} value={sec}>شعبة {sec}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {customFields.map((field) => (
                                                field.isFixed && field.fixedValue ? (
                                                    <div
                                                        key={field.id}
                                                        className="flex items-center px-3 py-2 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300 min-w-[110px]"
                                                        title={`${field.label}: ${field.fixedValue} (قيمة موحدة مسبقاً)`}
                                                    >
                                                        <span className="truncate font-semibold">{field.fixedValue}</span>
                                                    </div>
                                                ) : (
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
                                                )
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

                                <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(1)}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            <Plus size={14} />
                                            <span>إضافة سطر جديد</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(5)}
                                            className="px-3 py-2 bg-slate-800/60 hover:bg-slate-700 border border-slate-700/80 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                                            title="إضافة 5 أسطر جديدة دفعة واحدة"
                                        >
                                            +5 أسطر
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={handleSaveRapid}
                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        <Save size={16} />
                                        <span>{isSubmitting ? "جاري الحفظ..." : `حفظ الكل دفعة واحدة (${filledRapidRows})`}</span>
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
                                                <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                                                    sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                        ? 'bg-amber-950/60 text-amber-300 border border-amber-600/30'
                                                        : 'bg-slate-900 text-slate-300'
                                                }`}>
                                                    {sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                        ? 'الصف غير معروف'
                                                        : `${typeof sub.grade === 'object' ? (sub.grade?.name || '') : sub.grade} - شعبة ${typeof sub.section === 'object' ? (sub.section?.name || '') : (sub.section || '1')}`
                                                    }
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
                                                        const displayVal = typeof val === 'object' ? (val.name || val.label || JSON.stringify(val)) : String(val);
                                                        return (
                                                            <span key={f.id} className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300">
                                                                <span className="text-slate-400">{f.label}: </span>
                                                                {displayVal}
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

                                {/* Option: الصف غير معروف */}
                                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between">
                                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={editingSub.grade === 'غير معروف' || !!editingSub.isGradeUnknown}
                                            onChange={(e) => {
                                                const isUnknown = e.target.checked;
                                                setEditingSub({
                                                    ...editingSub,
                                                    isGradeUnknown: isUnknown,
                                                    grade: isUnknown ? 'غير معروف' : (editingSub.grade === 'غير معروف' ? (gradeOptions[0] || '') : editingSub.grade || gradeOptions[0] || ''),
                                                    section: isUnknown ? '' : (editingSub.section || '1')
                                                });
                                            }}
                                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                        />
                                        <span>الصف غير معروف</span>
                                    </label>
                                    {(editingSub.grade === 'غير معروف' || editingSub.isGradeUnknown) && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
                                            صف غير معروف
                                        </span>
                                    )}
                                </div>

                                {editingSub.grade === 'غير معروف' || editingSub.isGradeUnknown ? (
                                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300">
                                        ⚠️ تم تحديد الصف والشعبة كـ: <strong>غير معروف</strong>
                                    </div>
                                ) : (
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
                                )}

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

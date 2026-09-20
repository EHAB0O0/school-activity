import { useState, useEffect, useMemo } from 'react';
import {
    X, CheckCircle, XCircle, Search, Download, Printer,
    AlertTriangle, UserCheck, Trash2, Edit2, ShieldAlert,
    Clock, CheckSquare, Square, RefreshCw
} from 'lucide-react';
import { db } from '../../firebase';
import {
    collection, query, where, onSnapshot, doc, updateDoc,
    deleteDoc, addDoc, writeBatch, serverTimestamp, increment, arrayUnion, arrayRemove, getDocs
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { useSettings } from '../../contexts/SettingsContext';

export default function LinkSubmissionsDrawer({ isOpen, onClose, link, onLinkUpdated }) {
    const { schoolInfo } = useSettings();
    const [submissions, setSubmissions] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | pending | approved | rejected | waitlist
    const [selectedIds, setSelectedIds] = useState([]);
    const [editingSubmission, setEditingSubmission] = useState(null);
    const [showCreateStudentModal, setShowCreateStudentModal] = useState(null); // submission object to approve with modal

    // Real-time Submissions Listener
    useEffect(() => {
        if (!isOpen || !link?.id) return;

        const q = query(
            collection(db, 'link_submissions'),
            where('linkId', '==', link.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort by createdAt descending
            list.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setSubmissions(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching submissions:", err);
            toast.error("فشل في تحميل المسجلين");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen, link?.id]);

    // Fetch active students for duplicate matching
    useEffect(() => {
        if (!isOpen) return;
        async function fetchStudents() {
            try {
                const snap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
                setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        }
        fetchStudents();
    }, [isOpen]);

    // Sync link count with approved count
    useEffect(() => {
        if (!link?.id || loading) return;
        const approvedCount = submissions.filter(s => s.status === 'approved').length;
        if (link.currentCount !== approvedCount) {
            updateDoc(doc(db, 'registration_links', link.id), { currentCount: approvedCount }).catch(console.error);
            if (onLinkUpdated) onLinkUpdated();
        }
    }, [submissions, link?.id, link?.currentCount, loading, onLinkUpdated]);

    // Arabic normalization helper
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

    // Duplicate Detection Logic
    const duplicateMap = useMemo(() => {
        const map = {};
        const nameCountInLink = {};

        submissions.forEach(sub => {
            const normName = normalizeArabic(sub.studentName);
            nameCountInLink[normName] = (nameCountInLink[normName] || 0) + 1;
        });

        submissions.forEach(sub => {
            const normName = normalizeArabic(sub.studentName);
            const matchedExisting = students.find(s =>
                normalizeArabic(s.name) === normName
            );

            const isSameGrade = matchedExisting && (
                matchedExisting.grade === sub.grade ||
                matchedExisting.class?.includes(sub.grade)
            );

            map[sub.id] = {
                duplicateInLink: nameCountInLink[normName] > 1,
                matchedStudent: matchedExisting || null,
                isExistingInGrade: !!isSameGrade,
                isExistingOtherGrade: !!matchedExisting && !isSameGrade,
                existingGrade: matchedExisting?.grade || matchedExisting?.class || ''
            };
        });

        return map;
    }, [submissions, students]);

    // Parse custom fields (backward compatible)
    const customFields = Array.isArray(link?.customFields) && link.customFields.length > 0
        ? link.customFields
        : (link?.customFieldLabel ? [{ id: 'f_legacy', label: link.customFieldLabel, required: !!link.customFieldRequired }] : []);

    // Parse specializations display
    const specializationsDisplay = Array.isArray(link?.specializations) && link.specializations.length > 0
        ? link.specializations.join('، ')
        : (link?.specialization || 'عام');

    if (!isOpen || !link) return null;

    // Filtered Submissions
    const filteredSubmissions = submissions.filter(sub => {
        const matchesSearch =
            (sub.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.grade || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.section || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.customFieldValue || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (sub.customValues && Object.values(sub.customValues).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())));

        const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Counts
    const counts = {
        total: submissions.length,
        approved: submissions.filter(s => s.status === 'approved').length,
        pending: submissions.filter(s => s.status === 'pending').length,
        waitlist: submissions.filter(s => s.status === 'waitlist').length,
        rejected: submissions.filter(s => s.status === 'rejected').length,
    };

    // Selection helpers
    const allFilteredSelected = filteredSubmissions.length > 0 && filteredSubmissions.every(s => selectedIds.includes(s.id));
    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredSubmissions.map(s => s.id));
        }
    };

    // Approve a submission
    const handleApprove = async (sub, createProfile = false) => {
        if (sub.status === 'approved') return;
        try {
            const points = Number(link.pointsPerStudent) || 0;
            const dupInfo = duplicateMap[sub.id];

            let studentId = dupInfo?.matchedStudent?.id;

            // If user wants to create a new profile in students collection
            if (!studentId && createProfile) {
                const specializationsList = (Array.isArray(link.specializations) && link.specializations.length > 0)
                    ? link.specializations
                    : (link.specialization ? [link.specialization] : ['عام / جوكر']);

                const newStudentRef = await addDoc(collection(db, 'students'), {
                    name: sub.studentName,
                    grade: sub.grade || '',
                    section: sub.section || '',
                    class: `${sub.grade || ''} / ${sub.section || ''}`.trim(),
                    phone: sub.phone || '',
                    specializations: specializationsList,
                    totalPoints: points,
                    active: true,
                    joinedAt: serverTimestamp(),
                    notes: `مسجل عبر رابط: ${link.title}`
                });
                studentId = newStudentRef.id;
            } else if (studentId && points > 0) {
                // Add points to existing student
                await updateDoc(doc(db, 'students', studentId), {
                    totalPoints: increment(points)
                });
            }

            // If event is linked, attach student to event's participating list and mark as link student
            if (link.eventId && studentId) {
                await updateDoc(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayUnion(studentId),
                    linkStudentIds: arrayUnion(studentId)
                }).catch(console.warn);
            }

            // Update submission doc
            await updateDoc(doc(db, 'link_submissions', sub.id), {
                status: 'approved',
                matchedStudentId: studentId || null,
                approvedAt: serverTimestamp()
            });

            toast.success(`تم اعتماد الطالب: ${sub.studentName}`);
            setShowCreateStudentModal(null);
        } catch (err) {
            console.error("Approve error:", err);
            toast.error("فشل في اعتماد الطالب: " + err.message);
        }
    };

    // Reject a submission
    const handleReject = async (sub) => {
        try {
            await updateDoc(doc(db, 'link_submissions', sub.id), {
                status: 'rejected',
                rejectedAt: serverTimestamp()
            });

            // If previously linked to an event, remove from event
            if (link.eventId && sub.matchedStudentId) {
                await updateDoc(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayRemove(sub.matchedStudentId),
                    linkStudentIds: arrayRemove(sub.matchedStudentId)
                }).catch(console.warn);
            }

            toast.success(`تم رفض الطلب: ${sub.studentName}`);
        } catch (err) {
            toast.error("فشل في الرفض: " + err.message);
        }
    };

    // Delete submission
    const handleDelete = async (subId) => {
        if (!window.confirm("هل أنت متأكد من حذف هذا التسجيل؟")) return;
        try {
            const subToDelete = submissions.find(s => s.id === subId);
            await deleteDoc(doc(db, 'link_submissions', subId));
            setSelectedIds(prev => prev.filter(id => id !== subId));

            // If was participating in linked event, remove
            if (link.eventId && subToDelete?.matchedStudentId) {
                await updateDoc(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayRemove(subToDelete.matchedStudentId),
                    linkStudentIds: arrayRemove(subToDelete.matchedStudentId)
                }).catch(console.warn);
            }

            toast.success("تم الحذف بنجاح");
        } catch (err) {
            toast.error("فشل في الحذف: " + err.message);
        }
    };

    // Bulk Approve (fixed to prevent duplicate document writes in batch)
    const handleBulkApprove = async () => {
        if (selectedIds.length === 0) return;
        const confirmMsg = `هل أنت متأكد من اعتماد ${selectedIds.length} طالب دفعة واحدة؟`;
        if (!window.confirm(confirmMsg)) return;

        const toastId = toast.loading("جاري الاعتماد الجماعي...");
        try {
            const points = Number(link.pointsPerStudent) || 0;
            const pointsPerStudent = {};
            const studentIdsToAddToEvent = new Set();
            const subsToApprove = [];

            for (const id of selectedIds) {
                const sub = submissions.find(s => s.id === id);
                if (!sub || sub.status === 'approved') continue;

                const dupInfo = duplicateMap[sub.id];
                const studentId = dupInfo?.matchedStudent?.id;

                if (studentId && points > 0) {
                    pointsPerStudent[studentId] = (pointsPerStudent[studentId] || 0) + points;
                }

                if (link.eventId && studentId) {
                    studentIdsToAddToEvent.add(studentId);
                }

                subsToApprove.push({ subId: sub.id, studentId: studentId || null });
            }

            if (subsToApprove.length === 0) {
                toast.dismiss(toastId);
                toast.error("جميع الطلاب المحددين معتمدون مسبقاً");
                return;
            }

            const batch = writeBatch(db);

            // 1. Update submissions
            subsToApprove.forEach(({ subId, studentId }) => {
                batch.update(doc(db, 'link_submissions', subId), {
                    status: 'approved',
                    matchedStudentId: studentId,
                    approvedAt: serverTimestamp()
                });
            });

            // 2. Update points once per unique student
            Object.entries(pointsPerStudent).forEach(([stuId, pts]) => {
                if (pts > 0) {
                    batch.update(doc(db, 'students', stuId), {
                        totalPoints: increment(pts)
                    });
                }
            });

            // 3. Update event participants once if eventId exists
            if (link.eventId && studentIdsToAddToEvent.size > 0) {
                const idsToAdd = Array.from(studentIdsToAddToEvent);
                batch.update(doc(db, 'events', link.eventId), {
                    participatingStudents: arrayUnion(...idsToAdd),
                    linkStudentIds: arrayUnion(...idsToAdd)
                });
            }

            await batch.commit();
            setSelectedIds([]);
            toast.success("تم الاعتماد الجماعي بنجاح", { id: toastId });
        } catch (err) {
            console.error("Bulk approve error:", err);
            toast.error("حدث خطأ أثناء الاعتماد الجماعي: " + err.message, { id: toastId });
        }
    };

    // Bulk Reject
    const handleBulkReject = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`هل أنت متأكد من رفض ${selectedIds.length} طلب؟`)) return;

        try {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.update(doc(db, 'link_submissions', id), {
                    status: 'rejected',
                    rejectedAt: serverTimestamp()
                });
            });
            await batch.commit();
            setSelectedIds([]);
            toast.success("تم رفض الطلبات المحددة");
        } catch {
            toast.error("فشل في الرفض الجماعي");
        }
    };

    // Save Edited Submission
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editingSubmission) return;
        try {
            await updateDoc(doc(db, 'link_submissions', editingSubmission.id), {
                studentName: editingSubmission.studentName,
                grade: editingSubmission.grade,
                section: editingSubmission.section,
                class: `${editingSubmission.grade || ''} / ${editingSubmission.section || ''}`.trim(),
                phone: editingSubmission.phone || '',
                customValues: editingSubmission.customValues || {},
                customFieldValue: editingSubmission.customFieldValue || '',
                updatedAt: serverTimestamp()
            });
            toast.success("تم حفظ تعديل البيانات");
            setEditingSubmission(null);
        } catch (err) {
            toast.error("فشل في حفظ التعديلات: " + err.message);
        }
    };

    // Excel Export
    const handleExportExcel = () => {
        if (submissions.length === 0) {
            toast.error("لا توجد بيانات للتصدير");
            return;
        }

        const customHeaders = customFields.length > 0
            ? customFields.map(f => f.label)
            : [link.customFieldLabel || "الملاحظة/الصنف"];

        const data = [
            ["م", "اسم الطالب", "المرحلة", "الشعبة", ...customHeaders, "رقم الجوال", "الحالة", "تاريخ الإدخال"],
            ...submissions.map((s, idx) => {
                const customVals = customFields.length > 0
                    ? customFields.map(f => s.customValues?.[f.id] || (f.id === 'f_legacy' ? s.customFieldValue : '') || (customFields.length === 1 ? s.customFieldValue : '') || '-')
                    : [s.customFieldValue || '-'];

                return [
                    idx + 1,
                    s.studentName || '',
                    s.grade || '',
                    s.section || '',
                    ...customVals,
                    s.phone || '',
                    s.status === 'approved' ? 'معتمد' : s.status === 'pending' ? 'بانتظار المراجعة' : s.status === 'waitlist' ? 'قائمة انتظار' : 'مرفوض',
                    s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('ar-SA') : ''
                ];
            })
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "المسجلون");
        XLSX.writeFile(wb, `سجل_تسجيل_${link.title.replace(/\s+/g, '_')}.xlsx`);
        toast.success("تم تصدير ملف Excel بنجاح");
    };

    // Official Print Sheet
    const handlePrintSheet = () => {
        if (submissions.length === 0) {
            toast.error("لا توجد بيانات للطباعة");
            return;
        }

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const docIframe = iframe.contentWindow.document;
        docIframe.open();

        const customThs = customFields.length > 0
            ? customFields.map(f => `<th>${f.label}</th>`).join('')
            : `<th>${link.customFieldLabel || "البيان / المساهمة"}</th>`;

        const rowsHtml = submissions.map((s, idx) => {
            const customTds = customFields.length > 0
                ? customFields.map(f => `<td>${s.customValues?.[f.id] || (f.id === 'f_legacy' ? s.customFieldValue : '') || (customFields.length === 1 ? s.customFieldValue : '') || '-'}</td>`).join('')
                : `<td>${s.customFieldValue || '-'}</td>`;

            return `
                <tr>
                    <td style="text-align:center;">${idx + 1}</td>
                    <td style="font-weight:bold;">${s.studentName || ''}</td>
                    <td style="text-align:center;">${s.grade || ''} / ${s.section || ''}</td>
                    ${customTds}
                    <td style="text-align:center;">${s.status === 'approved' ? 'معتمد' : s.status === 'pending' ? 'بانتظار الاعتماد' : s.status === 'waitlist' ? 'انتظار' : 'مرفوض'}</td>
                    <td style="width:120px; border-bottom: 1px dotted #94a3b8;"></td>
                </tr>
            `;
        }).join('');

        docIframe.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="utf-8">
                <title>كشف حصر المشاركات - ${link.title}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
                    body { font-family: 'Cairo', sans-serif; margin: 20px; color: #0f172a; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
                    .header-title { text-align: center; }
                    .header-title h2 { margin: 0; font-size: 20px; font-weight: 900; }
                    .header-title p { margin: 4px 0 0; font-size: 13px; color: #475569; }
                    .meta-bar { display: flex; justify-content: space-between; background: #f1f5f9; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; font-weight: 600; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; }
                    th { background-color: #f8fafc; font-weight: bold; }
                    .footer-signatures { display: flex; justify-content: space-around; margin-top: 40px; text-align: center; font-size: 13px; font-weight: 700; }
                    .sig-box { min-width: 180px; }
                    .sig-line { margin-top: 45px; border-top: 1px dashed #64748b; }
                    @media print { body { margin: 10mm; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div>المملكة العربية السعودية</div>
                        <div>وزارة التعليم</div>
                        <div>${schoolInfo?.name || "مدرسة النشاط"}</div>
                    </div>
                    <div class="header-title">
                        <h2>كشف حصر المشاركات والتسليم</h2>
                        <p>${link.title}</p>
                    </div>
                    <div style="text-align:left;">
                        <div>التاريخ: ${new Date().toLocaleDateString('ar-SA')}</div>
                        <div>إجمالي المسجلين: ${submissions.length}</div>
                    </div>
                </div>

                <div class="meta-bar">
                    <div>إشراف الطالب المفوض: <strong>${link.delegateName}</strong></div>
                    <div>المجال: <strong>${specializationsDisplay}</strong></div>
                    <div>الحد الأقصى: <strong>${link.maxCapacity ? `${link.maxCapacity} مقعد` : 'غير محدود (مفتوح)'}</strong></div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width:40px;">#</th>
                            <th>اسم الطالب</th>
                            <th style="width:110px;">الصف والشعبة</th>
                            ${customThs}
                            <th style="width:90px;">الحالة</th>
                            <th style="width:130px;">توقيع الاستلام / الحضور</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer-signatures">
                    <div class="sig-box">
                        <div>الطالب المفوض</div>
                        <div>${link.delegateName}</div>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-box">
                        <div>رائد النشاط الطلابي</div>
                        <div>أ. ________________</div>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-box">
                        <div>مدير المدرسة</div>
                        <div>أ. ________________</div>
                        <div class="sig-line"></div>
                    </div>
                </div>
            </body>
            </html>
        `);
        docIframe.close();

        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 2000);
        }, 600);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border-r border-slate-800 w-full max-w-4xl h-full flex flex-col text-right shadow-2xl overflow-hidden" dir="rtl">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-800/80 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                                <UserCheck size={22} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white flex items-center gap-2">
                                    <span>سجل المسجلين: {link.title}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 font-normal">
                                        المفوض: {link.delegateName}
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    متابعة واعتماد الطلاب المسجلين عبر الرابط مع الكشف الذكي عن التكرار
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                        <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60 text-center">
                            <span className="text-[11px] text-slate-400 block">الإجمالي / المقاعد</span>
                            <span className="text-sm font-black text-white">
                                {counts.total} {link.maxCapacity ? `/ ${link.maxCapacity}` : '(مفتوح)'}
                            </span>
                        </div>
                        <div className="bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/40 text-center">
                            <span className="text-[11px] text-amber-300 block">بانتظار المراجعة</span>
                            <span className="text-sm font-black text-amber-400">{counts.pending}</span>
                        </div>
                        <div className="bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-800/40 text-center">
                            <span className="text-[11px] text-emerald-300 block">المعتمدون</span>
                            <span className="text-sm font-black text-emerald-400">{counts.approved}</span>
                        </div>
                        <div className="bg-blue-950/30 p-2.5 rounded-xl border border-blue-800/40 text-center">
                            <span className="text-[11px] text-blue-300 block">قائمة الانتظار</span>
                            <span className="text-sm font-black text-blue-400">{counts.waitlist}</span>
                        </div>
                        <div className="bg-rose-950/30 p-2.5 rounded-xl border border-rose-800/40 text-center">
                            <span className="text-[11px] text-rose-300 block">المرفوضون</span>
                            <span className="text-sm font-black text-rose-400">{counts.rejected}</span>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute right-3 top-2.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="بحث بالاسم، الصف، أو المساهمة..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-3 pr-9 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                            <option value="all">كل الحالات ({counts.total})</option>
                            <option value="pending">بانتظار الاعتماد ({counts.pending})</option>
                            <option value="approved">معتمد ({counts.approved})</option>
                            <option value="waitlist">قائمة انتظار ({counts.waitlist})</option>
                            <option value="rejected">مرفوض ({counts.rejected})</option>
                        </select>
                    </div>

                    {/* Export & Print */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportExcel}
                            className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                            <Download size={14} />
                            <span>تصدير Excel</span>
                        </button>
                        <button
                            onClick={handlePrintSheet}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                            <Printer size={14} />
                            <span>طباعة الكشف</span>
                        </button>
                    </div>
                </div>

                {/* Bulk Actions Banner */}
                {selectedIds.length > 0 && (
                    <div className="px-5 py-2.5 bg-indigo-950/60 border-b border-indigo-800/40 flex items-center justify-between animate-in fade-in">
                        <span className="text-xs text-indigo-200 font-bold">
                            تم تحديد {selectedIds.length} طالب
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleBulkApprove}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1"
                            >
                                <CheckCircle size={14} /> اعتماد المحدد
                            </button>
                            <button
                                onClick={handleBulkReject}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1"
                            >
                                <XCircle size={14} /> رفض المحدد
                            </button>
                            <button
                                onClick={() => setSelectedIds([])}
                                className="px-2 py-1 text-xs text-slate-400 hover:text-white"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                )}

                {/* Submissions Table / List */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                            <RefreshCw size={24} className="animate-spin text-indigo-400" />
                            <span className="text-xs">جاري تحميل المسجلين...</span>
                        </div>
                    ) : filteredSubmissions.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm">
                            لا توجد تسجيلات تطابق معايير البحث
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {/* Select All Bar */}
                            <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 mb-1">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                                >
                                    {allFilteredSelected ? (
                                        <CheckSquare size={16} className="text-indigo-400" />
                                    ) : (
                                        <Square size={16} className="text-slate-400" />
                                    )}
                                    <span>تحديد جميع المعروض ({filteredSubmissions.length})</span>
                                </button>
                                <span className="text-[11px] text-slate-400">
                                    {selectedIds.length > 0 ? `المحدد: ${selectedIds.length}` : `إجمالي المعروض: ${filteredSubmissions.length}`}
                                </span>
                            </div>

                            {filteredSubmissions.map((sub) => {
                                const isSelected = selectedIds.includes(sub.id);
                                const dupInfo = duplicateMap[sub.id] || {};

                                return (
                                    <div
                                        key={sub.id}
                                        className={`p-3.5 rounded-xl border transition-all ${
                                            isSelected
                                                ? 'bg-indigo-950/40 border-indigo-500/60'
                                                : sub.status === 'approved'
                                                ? 'bg-slate-800/40 border-slate-700/60'
                                                : sub.status === 'rejected'
                                                ? 'bg-rose-950/20 border-rose-800/30'
                                                : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            {/* Checkbox & Student Details */}
                                            <div className="flex items-start gap-3 flex-1">
                                                <button
                                                    onClick={() => {
                                                        setSelectedIds(prev =>
                                                            prev.includes(sub.id)
                                                                ? prev.filter(i => i !== sub.id)
                                                                : [...prev, sub.id]
                                                        );
                                                    }}
                                                    className="mt-1 text-slate-400 hover:text-indigo-400"
                                                >
                                                    {isSelected ? <CheckSquare size={18} className="text-indigo-400" /> : <Square size={18} />}
                                                </button>

                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-bold text-white text-sm">
                                                            {sub.studentName}
                                                        </h4>
                                                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 font-semibold">
                                                            {sub.grade} - شعبة {sub.section || '1'}
                                                        </span>

                                                        {/* Duplicate Badges */}
                                                        {dupInfo.isExistingInGrade && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-950/70 border border-blue-700/50 text-blue-300 font-semibold flex items-center gap-1">
                                                                <UserCheck size={11} /> مسجل مسبقاً بنفس الصف
                                                            </span>
                                                        )}
                                                        {dupInfo.isExistingOtherGrade && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-700/50 text-cyan-300 font-semibold flex items-center gap-1">
                                                                <UserCheck size={11} /> مقيد بصف ({dupInfo.existingGrade})
                                                            </span>
                                                        )}
                                                        {dupInfo.duplicateInLink && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-700/50 text-amber-300 font-semibold flex items-center gap-1">
                                                                <AlertTriangle size={11} /> مكرر بنفس الرابط
                                                            </span>
                                                        )}
                                                        {!dupInfo.matchedStudent && (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-700/50 text-purple-300 font-semibold">
                                                                ✨ طالب غير مقيد
                                                            </span>
                                                        )}

                                                        {/* Status Badge */}
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-bold ${
                                                            sub.status === 'approved'
                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                : sub.status === 'pending'
                                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                                : sub.status === 'waitlist'
                                                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                        }`}>
                                                            {sub.status === 'approved' ? 'معتمد' : sub.status === 'pending' ? 'بانتظار الاعتماد' : sub.status === 'waitlist' ? 'قائمة انتظار' : 'مرفوض'}
                                                        </span>
                                                    </div>

                                                    {/* Custom Fields and Phone */}
                                                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 flex-wrap">
                                                        {customFields.length > 0 ? (
                                                            customFields.map(f => {
                                                                const val = sub.customValues?.[f.id] || (f.id === 'f_legacy' ? sub.customFieldValue : '') || (customFields.length === 1 ? sub.customFieldValue : null);
                                                                if (!val) return null;
                                                                return (
                                                                    <div key={f.id}>
                                                                        <span className="text-slate-500">{f.label}: </span>
                                                                        <span className="text-indigo-300 font-semibold">{val}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            sub.customFieldValue && (
                                                                <div>
                                                                    <span className="text-slate-500">المساهمة: </span>
                                                                    <span className="text-indigo-300 font-semibold">{sub.customFieldValue}</span>
                                                                </div>
                                                            )
                                                        )}
                                                        {sub.phone && (
                                                            <div>
                                                                <span className="text-slate-500">الجوال: </span>
                                                                <span className="font-mono text-slate-300">{sub.phone}</span>
                                                            </div>
                                                        )}
                                                        {sub.createdAt?.toDate && (
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                                                                <Clock size={11} />
                                                                <span>{sub.createdAt.toDate().toLocaleString('ar-SA')}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Row Action Buttons */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {sub.status !== 'approved' && (
                                                    <button
                                                        onClick={() => {
                                                            if (!dupInfo.matchedStudent) {
                                                                setShowCreateStudentModal(sub);
                                                            } else {
                                                                handleApprove(sub, false);
                                                            }
                                                        }}
                                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1 transition-colors"
                                                        title="اعتماد المشاركة"
                                                    >
                                                        <CheckCircle size={14} />
                                                        <span>اعتماد</span>
                                                    </button>
                                                )}

                                                {sub.status !== 'rejected' && (
                                                    <button
                                                        onClick={() => handleReject(sub)}
                                                        className="px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 transition-colors"
                                                        title="رفض الطلب"
                                                    >
                                                        <XCircle size={14} />
                                                        <span>رفض</span>
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setEditingSubmission({
                                                        ...sub,
                                                        customValues: { ...(sub.customValues || {}) }
                                                    })}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                                                    title="تعديل البيانات"
                                                >
                                                    <Edit2 size={15} />
                                                </button>

                                                <button
                                                    onClick={() => handleDelete(sub.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition-colors"
                                                    title="حذف"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Edit Modal */}
                {editingSubmission && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-right space-y-4" dir="rtl">
                            <h3 className="font-bold text-white text-base">تعديل بيانات التسجيل</h3>
                            <form onSubmit={handleSaveEdit} className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">اسم الطالب</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingSubmission.studentName}
                                        onChange={(e) => setEditingSubmission({ ...editingSubmission, studentName: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الصف</label>
                                        <input
                                            type="text"
                                            value={editingSubmission.grade}
                                            onChange={(e) => setEditingSubmission({ ...editingSubmission, grade: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">الشعبة</label>
                                        <input
                                            type="text"
                                            value={editingSubmission.section}
                                            onChange={(e) => setEditingSubmission({ ...editingSubmission, section: e.target.value })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                </div>
                                {customFields.length > 0 ? (
                                    customFields.map(field => (
                                        <div key={field.id}>
                                            <label className="block text-xs text-slate-400 mb-1">
                                                {field.label} {field.required && <span className="text-rose-400">*</span>}
                                            </label>
                                            <input
                                                type="text"
                                                required={field.required}
                                                value={editingSubmission.customValues?.[field.id] ?? (field.id === 'f_legacy' ? editingSubmission.customFieldValue : '') ?? ''}
                                                onChange={(e) => {
                                                    const newValues = {
                                                        ...(editingSubmission.customValues || {}),
                                                        [field.id]: e.target.value
                                                    };
                                                    setEditingSubmission({
                                                        ...editingSubmission,
                                                        customValues: newValues,
                                                        customFieldValue: Object.values(newValues).filter(Boolean).join(' | ')
                                                    });
                                                }}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                            />
                                        </div>
                                    ))
                                ) : (
                                    editingSubmission.customFieldValue && (
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">المساهمة / البيان</label>
                                            <input
                                                type="text"
                                                value={editingSubmission.customFieldValue || ''}
                                                onChange={(e) => setEditingSubmission({ ...editingSubmission, customFieldValue: e.target.value })}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                            />
                                        </div>
                                    )
                                )}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
                                    <input
                                        type="text"
                                        value={editingSubmission.phone || ''}
                                        onChange={(e) => setEditingSubmission({ ...editingSubmission, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingSubmission(null)}
                                        className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                                    >
                                        حفظ
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Student Profile Creation Choice Modal */}
                {showCreateStudentModal && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 text-right space-y-4" dir="rtl">
                            <div className="flex items-center gap-3 text-indigo-400">
                                <ShieldAlert size={24} />
                                <h3 className="font-bold text-white text-base">طالب جديد غير مقيد بالنظام</h3>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                الطالب <strong className="text-white">{showCreateStudentModal.studentName}</strong> غير مسجل حالياً في قاعدة بيانات طلاب المدرسة. كيف ترغب في اعتماد مشاركته؟
                            </p>
                            <div className="space-y-2 pt-2">
                                <button
                                    onClick={() => handleApprove(showCreateStudentModal, true)}
                                    className="w-full p-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-right text-xs text-white flex flex-col gap-1 transition-colors"
                                >
                                    <span className="font-bold text-indigo-300">١. اعتماد وإنشاء ملف طالب جديد في المدرسة</span>
                                    <span className="text-[11px] text-slate-400">سيتم إضافة الطالب رسمياً لقائمة الطلاب ومنحه النقاط المقررة.</span>
                                </button>
                                <button
                                    onClick={() => handleApprove(showCreateStudentModal, false)}
                                    className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-right text-xs text-white flex flex-col gap-1 transition-colors"
                                >
                                    <span className="font-bold text-slate-200">٢. اعتماد للمناسبة الحالية فقط</span>
                                    <span className="text-[11px] text-slate-400">اعتماد المشاركة في هذا الكشف دون إنشاء ملف طالب جديد في سجلات المدرسة.</span>
                                </button>
                            </div>
                            <div className="flex justify-end pt-2">
                                <button
                                    onClick={() => setShowCreateStudentModal(null)}
                                    className="text-xs text-slate-400 hover:text-white"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

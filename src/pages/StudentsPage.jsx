import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, doc, updateDoc, orderBy, onSnapshot, writeBatch, getDocs, limit } from 'firebase/firestore';
import { Search, Plus, Trash2, Award, User, FileText, Clock, Edit3, X, Save, ArrowUpDown, Tag, Filter, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';
import MultiSelect from '../components/ui/MultiSelect';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ConfirmModal from '../components/ui/ConfirmModal';
import BulkActionsBar from '../components/students/BulkActionsBar';
import BulkOperationsModal from '../components/students/BulkOperationsModal';
import BulkPrintCertificatesModal from '../components/students/BulkPrintCertificatesModal';

export default function StudentsPage() {
    const [students, setStudents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name'); // name | points
    const [gradeFilter, setGradeFilter] = useState('');
    const [sectionFilter, setSectionFilter] = useState('');
    const [specFilter, setSpecFilter] = useState('All');

    // Selection & Bulk Actions State
    const [selectedIds, setSelectedIds] = useState([]);
    const [isOperationsModalOpen, setIsOperationsModalOpen] = useState(false);
    const [operationsInitialTab, setOperationsInitialTab] = useState('transfer');
    const [isCertificatesModalOpen, setIsCertificatesModalOpen] = useState(false);
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

    const { eventTypes, grades, settings } = useSettings();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', class: '', grade: '', section: '', specializations: [] });

    // Spec Options Construction
    const specOptions = [
        { value: 'General', label: 'عام / جوكر' },
        ...(eventTypes || []).map(t => ({ value: t.name, label: t.name }))
    ];

    // Profile Modal State
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [profileTab, setProfileTab] = useState('info'); // info | notes | history

    const [studentHistory, setStudentHistory] = useState([]);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // --- Real-time Students Listener ---
    useEffect(() => {
        const q = query(collection(db, 'students'), where('active', '==', true));
        const unsubscribe = onSnapshot(q, (snap) => {
            setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.warn("Students sync error:", err.message);
        });
        return () => unsubscribe();
    }, []);

    // --- Add Student ---
    async function handleAdd(e) {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'students'), {
                ...newStudent,
                active: true,
                totalPoints: 0,
                joinedAt: new Date()
            });
            setNewStudent({ name: '', class: '', grade: '', section: '', specializations: [] });
            setIsAddModalOpen(false);
            toast.success('تمت إضافة الطالب');
        } catch { toast.error('حدث خطأ'); }
    }

    // --- Delete Student ---
    async function handleDelete(id) {
        setConfirmModal({
            isOpen: true,
            title: "نقل للأرشيف",
            message: "هل أنت متأكد من نقل هذا الطالب للأرشيف؟",
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await updateDoc(doc(db, 'students', id), { active: false });
                    setStudents(students.filter(s => s.id !== id));
                    toast.success('تم الأرشفة');
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch { toast.error('فشل'); }
            }
        });
    }

    // --- Profile Logic ---
    const openProfile = (student) => {
        setStudentHistory([]);
        setSelectedStudent(student);
        setProfileTab('info');
    };

    // Live History Listener
    useEffect(() => {
        if (!selectedStudent) return;

        const q = query(
            collection(db, 'events'),
            where('participatingStudents', 'array-contains', selectedStudent.id),
            orderBy('startTime', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            setStudentHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error("History sync error:", error);
        });

        return () => unsubscribe();
    }, [selectedStudent]);

    const saveProfileChanges = async () => {
        if (!selectedStudent) return;
        try {
            await updateDoc(doc(db, 'students', selectedStudent.id), {
                name: selectedStudent.name,
                class: selectedStudent.class,
                grade: selectedStudent.grade || '',
                section: selectedStudent.section || '',
                totalPoints: Number(selectedStudent.totalPoints),
                notes: selectedStudent.notes || '',
                specializations: selectedStudent.specializations || []
            });
            toast.success("تم تحديث الملف الشخصي");
        } catch {
            toast.error("فشل التحديث");
        }
    };

    // --- Student Profile PDF ---
    const generateStudentProfilePDF = async (student, history) => {
        const toastId = toast.loading('جاري طباعة الملف...');
        try {
            // 1. Iframe Isolation
            const iframe = document.createElement('iframe');
            Object.assign(iframe.style, {
                position: 'fixed', top: '-9999px', left: '0', border: 'none',
                width: '1000px', height: 'auto' // Auto height for dynamic content
            });
            document.body.appendChild(iframe);
            const doc = iframe.contentWindow.document;
            doc.open();

            // 2. HTML Content
            const specsHtml = (student.specializations || []).map(s =>
                `<span class="badge">${s === 'General' ? 'عام' : s}</span>`
            ).join(' ');

            const historyHtml = history.length > 0
                ? history.map((evt, i) => `
                    <div class="row">
                        <div class="cell w-5">${i + 1}</div>
                        <div class="cell w-40 bold">${evt.title}</div>
                        <div class="cell w-20">${evt.typeName || '-'}</div>
                        <div class="cell w-20 dim">${evt.date || ''}</div>
                        <div class="cell w-15 center">
                             ${evt.status === 'Done' ? '<span class="status success">مكتمل</span>' : '<span class="status">مسجّل</span>'}
                        </div>
                    </div>
                `).join('')
                : '<div class="empty">لا يوجد سجل نشاط</div>';

            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <style>
                        body { font-family: 'Arial', sans-serif; background: #fff; color: #1f2937; padding: 40px; margin: 0; }
                        .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
                        .avatar { width: 80px; height: 80px; background: #4f46e5; color: white; border-radius: 50%; font-size: 32px; font-weight: bold; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
                        h1 { margin: 0; color: #111827; }
                        p { margin: 5px 0 0; color: #6b7280; }
                        
                        .grid { display: flex; gap: 20px; margin-bottom: 30px; }
                        .card { flex: 1; background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center; }
                        .card label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 5px; }
                        .card .val { font-size: 16px; font-weight: bold; color: #111827; }
                        .points { color: #059669; }

                        h3 { border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 15px; font-size: 16px; }
                        .badge { background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px; }
                        
                        .table { border: 1px solid #e5e7eb; border-radius: 8px; }
                        .row { display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px; font-size: 13px; break-inside: avoid; }
                        .row.head { background: #f9fafb; font-weight: bold; color: #374151; }
                        .cell { padding: 0 5px; }
                        .w-5 { width: 5%; } .w-40 { width: 40%; } .w-20 { width: 20%; } .w-15 { width: 15%; }
                        
                        .bold { font-weight: bold; } .dim { color: #6b7280; } .center { text-align: center; }
                        .status { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f3f4f6; color: #4b5563; }
                        .status.success { background: #ecfdf5; color: #059669; }
                        .empty { padding: 20px; text-align: center; color: #9ca3af; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="avatar">${student.name.charAt(0)}</div>
                        <h1>${student.name}</h1>
                        <p>تقرير الملف الشخصي للطالب</p>
                    </div>

                    <div class="grid">
                        <div class="card">
                            <label>الفصل</label>
                            <div class="val">${student.class}</div>
                        </div>
                        <div class="card">
                            <label>نقاط التميز</label>
                            <div class="val points">${student.totalPoints}</div>
                        </div>
                         <div class="card">
                            <label>تاريخ الانضمام</label>
                            <div class="val">${student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('en-GB') : '-'}</div>
                        </div>
                    </div>

                    <div style="margin-bottom: 30px;">
                        <h3>التخصصات والفرق</h3>
                        <div>${specsHtml || '<span style="color:#9ca3af">لا يوجد تخصيص</span>'}</div>
                    </div>

                    <h3>سجل النشاط الأخير</h3>
                    <div class="table">
                        <div class="row head">
                            <div class="cell w-5">#</div>
                            <div class="cell w-40">النشاط</div>
                            <div class="cell w-20">النوع</div>
                            <div class="cell w-20">التاريخ</div>
                            <div class="cell w-15 center">الحالة</div>
                        </div>
                        ${historyHtml}
                    </div>
                </body>
                </html>
            `);
            doc.close();
            await new Promise(r => setTimeout(r, 200)); // Increased wait for rendering

            // 3. Dynamic Height Capture
            const bodyHeight = doc.body.scrollHeight + 40; // Add padding
            iframe.style.height = `${bodyHeight}px`;

            const canvas = await html2canvas(doc.body, {
                scale: 1.5, // Slightly lower scale for huge lists to safe memory
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                height: bodyHeight,
                windowHeight: bodyHeight
            });
            document.body.removeChild(iframe);

            // PDF Logic (Smart Scaling with Alignment)
            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const imgWidth = pageWidth; // Full width

            // Calculate height proportional to width
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            // First Page
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
            heightLeft -= pageHeight;

            // Loop for subsequent pages
            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                heightLeft -= pageHeight;
            }

            pdf.save(`Profile_${student.name}.pdf`);
            toast.success("تم طباعة الملف", { id: toastId });

        } catch (e) {
            console.error(e);
            toast.error("فشل الطباعة", { id: toastId });
        }
    };

    // --- Filtering & Sorting ---
    // --- Filtering & Sorting ---
    const displayedStudents = students
        .filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesSpec = specFilter === 'All'
                ? true
                : (s.specializations && s.specializations.includes(specFilter));

            const matchesGrade = !gradeFilter || s.grade === gradeFilter;
            const matchesSection = !sectionFilter || s.section === sectionFilter;

            // Optional fallback for old data if needed, but strict filtering is safer
            // Add legacy check if user wants to search old "class" string? No, let's migrate forward.

            return matchesSearch && matchesSpec && matchesGrade && matchesSection;
        })
        .sort((a, b) => {
            if (sortBy === 'points') return b.totalPoints - a.totalPoints;
            return a.name.localeCompare(b.name);
        });

    // Selection Computed Properties
    const isAllDisplayedSelected = displayedStudents.length > 0 && displayedStudents.every(s => selectedIds.includes(s.id));
    const isPartiallySelected = selectedIds.length > 0 && !isAllDisplayedSelected;
    const selectedStudentsList = students.filter(s => selectedIds.includes(s.id));

    // Selection Handlers
    const toggleSelectStudent = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAllHeader = () => {
        if (isAllDisplayedSelected) {
            setSelectedIds(prev => prev.filter(id => !displayedStudents.some(s => s.id === id)));
        } else {
            setSelectedIds(Array.from(new Set([...selectedIds, ...displayedStudents.map(s => s.id)])));
        }
    };

    const handleSelectAllDisplayed = () => {
        setSelectedIds(Array.from(new Set([...selectedIds, ...displayedStudents.map(s => s.id)])));
    };

    const handleSelectAllSchool = () => {
        setSelectedIds(students.map(s => s.id));
    };

    const handleClearSelection = () => {
        setSelectedIds([]);
    };

    const handleOpenOperationsModal = (tab = 'transfer') => {
        setOperationsInitialTab(tab);
        setIsOperationsModalOpen(true);
    };

    // --- Bulk Action Handlers ---
    // 1. Bulk Transfer Grade & Section
    const handleBulkTransfer = async ({ targetGrade, targetSection }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري نقل ${selectedIds.length} طالب إلى ${targetGrade} - ${targetSection}...`);
        try {
            const classString = `${targetGrade} - ${targetSection}`;
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    batch.update(doc(db, 'students', id), {
                        grade: targetGrade,
                        section: targetSection,
                        class: classString
                    });
                });
                await batch.commit();
            }
            toast.success(`تم نقل ${selectedIds.length} طالب بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk transfer error:", err);
            toast.error('حدث خطأ أثناء نقل الطلاب', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 2. Bulk Specializations
    const handleBulkSpecialization = async ({ specializations, mode }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تحديث تخصصات ${selectedIds.length} طالب...`);
        try {
            const selectedMap = new Map(students.filter(s => selectedIds.includes(s.id)).map(s => [s.id, s]));
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    const currentStudent = selectedMap.get(id);
                    let newSpecs = [];
                    if (mode === 'append') {
                        const existing = currentStudent?.specializations || [];
                        newSpecs = Array.from(new Set([...existing, ...specializations]));
                    } else {
                        newSpecs = [...specializations];
                    }
                    batch.update(doc(db, 'students', id), {
                        specializations: newSpecs
                    });
                });
                await batch.commit();
            }
            toast.success(`تم تحديث التخصصات بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk specialization error:", err);
            toast.error('حدث خطأ أثناء تحديث التخصصات', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 3. Bulk Points
    const handleBulkPoints = async ({ points, reason }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تحديث نقاط ${selectedIds.length} طالب...`);
        try {
            const selectedMap = new Map(students.filter(s => selectedIds.includes(s.id)).map(s => [s.id, s]));
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    const currentStudent = selectedMap.get(id);
                    const oldPoints = Number(currentStudent?.totalPoints) || 0;
                    const updatedPoints = Math.max(0, oldPoints + points);
                    const payload = { totalPoints: updatedPoints };
                    if (reason) {
                        payload.lastPointsNote = reason;
                    }
                    batch.update(doc(db, 'students', id), payload);
                });
                await batch.commit();
            }
            toast.success(`تم تحديث نقاط التميز بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk points error:", err);
            toast.error('حدث خطأ أثناء تحديث النقاط', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 4. Bulk Status
    const handleBulkStatus = async ({ status }) => {
        setIsProcessingBulk(true);
        const toastId = toast.loading(`جاري تعديل حالة ${selectedIds.length} طالب...`);
        try {
            const chunks = [];
            for (let i = 0; i < selectedIds.length; i += 400) {
                chunks.push(selectedIds.slice(i, i + 400));
            }
            for (const chunk of chunks) {
                const batch = writeBatch(db);
                chunk.forEach(id => {
                    batch.update(doc(db, 'students', id), {
                        status: status,
                        active: status === 'active'
                    });
                });
                await batch.commit();
            }
            toast.success(`تم تعديل الحالة بنجاح!`, { id: toastId });
            setIsOperationsModalOpen(false);
            setSelectedIds([]);
        } catch (err) {
            console.error("Bulk status error:", err);
            toast.error('حدث خطأ أثناء تعديل الحالة', { id: toastId });
        } finally {
            setIsProcessingBulk(false);
        }
    };

    // 5. Bulk Archive
    const handleBulkArchive = () => {
        setConfirmModal({
            isOpen: true,
            title: "أرشفة الطلاب المحددين",
            message: `هل أنت متأكد من نقل ${selectedIds.length} طالب إلى الأرشيف؟ يمكنك استعادتهم لاحقاً.`,
            isDestructive: true,
            onConfirm: async () => {
                setIsProcessingBulk(true);
                const toastId = toast.loading(`جاري أرشفة ${selectedIds.length} طالب...`);
                try {
                    const chunks = [];
                    for (let i = 0; i < selectedIds.length; i += 400) {
                        chunks.push(selectedIds.slice(i, i + 400));
                    }
                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach(id => {
                            batch.update(doc(db, 'students', id), { active: false });
                        });
                        await batch.commit();
                    }
                    toast.success(`تم أرشفة ${selectedIds.length} طالب بنجاح!`, { id: toastId });
                    setSelectedIds([]);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                } catch (err) {
                    console.error("Bulk archive error:", err);
                    toast.error('فشل نقل الطلاب للأرشيف', { id: toastId });
                } finally {
                    setIsProcessingBulk(false);
                }
            }
        });
    };

    // 6. Bulk Export to Excel / CSV
    const handleExportCSV = () => {
        const selectedList = students.filter(s => selectedIds.includes(s.id));
        if (selectedList.length === 0) return;

        const headers = ["اسم الطالب", "الصف", "الشعبة", "الفصل الكامل", "نقاط التميز", "التخصصات", "تاريخ الانضمام"];
        const rows = selectedList.map(s => [
            `"${(s.name || '').replace(/"/g, '""')}"`,
            `"${(s.grade || '').replace(/"/g, '""')}"`,
            `"${(s.section || '').replace(/"/g, '""')}"`,
            `"${(s.class || '').replace(/"/g, '""')}"`,
            s.totalPoints || 0,
            `"${(s.specializations || []).join('، ').replace(/"/g, '""')}"`,
            s.joinedAt?.toDate ? s.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'
        ]);

        const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `قائمة_الطلاب_المحددين_${new Date().toLocaleDateString('en-CA')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(`تم تصدير كشف ${selectedList.length} طالب إلى Excel بنجاح!`);
    };

    // 7. Bulk Consolidated Sheet Print
    const handlePrintConsolidated = () => {
        const selectedList = students.filter(s => selectedIds.includes(s.id));
        if (selectedList.length === 0) return;

        const schoolName = settings?.schoolName || 'ثانوية الملك عبدالله';
        const currentDate = new Date().toLocaleDateString('ar-SA');

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();

        const rowsHtml = selectedList.map((st, idx) => `
            <tr>
                <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
                <td style="font-weight: bold;">${st.name}</td>
                <td style="text-align: center;">${st.class || '-'}</td>
                <td>${(st.specializations || []).join('، ') || 'عام'}</td>
                <td style="text-align: center; font-weight: bold; color: #047857;">${st.totalPoints || 0}</td>
                <td style="min-width: 120px;"></td>
            </tr>
        `).join('');

        doc.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>كشف مجمّع لبيانات الطلاب</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #111827; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e1b4b; padding-bottom: 12px; margin-bottom: 20px; }
                    .header-side { font-size: 13px; line-height: 1.6; }
                    .header-title { text-align: center; }
                    .header-title h1 { margin: 0; font-size: 22px; color: #1e1b4b; }
                    .header-title p { margin: 4px 0 0 0; font-size: 13px; color: #4b5563; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
                    th, td { border: 1px solid #d1d5db; padding: 8px 10px; }
                    th { background-color: #f3f4f6; color: #1f2937; font-weight: bold; }
                    tr:nth-child(even) { background-color: #f9fafb; }
                    .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding: 0 30px; font-size: 14px; }
                    .sig-box { text-align: center; width: 200px; }
                    .sig-role { font-weight: bold; margin-bottom: 40px; color: #1f2937; }
                    .sig-line { border-top: 1px dashed #9ca3af; padding-top: 5px; font-size: 12px; color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="header-side">
                        <div>المملكة العربية السعودية</div>
                        <div>وزارة التعليم</div>
                        <div>${schoolName}</div>
                    </div>
                    <div class="header-title">
                        <h1>كشف بيانات الطلاب المشاركين</h1>
                        <p>العدد الإجمالي: ${selectedList.length} طالب</p>
                    </div>
                    <div class="header-side" style="text-align: left;">
                        <div>التاريخ: ${currentDate}</div>
                        <div>قسم النشاط المدرسي</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">#</th>
                            <th style="width: 30%;">اسم الطالب</th>
                            <th style="width: 20%;">الصف / الشعبة</th>
                            <th style="width: 25%;">التخصصات والأنشطة</th>
                            <th style="width: 10%;">نقاط التميز</th>
                            <th style="width: 10%;">ملاحظات والتوقيع</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="signatures">
                    <div class="sig-box">
                        <div class="sig-role">مشرف النشاط الطلابي</div>
                        <div class="sig-line">التوقيع: .....................</div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-role">مدير المدرسة</div>
                        <div class="sig-line">الختم والتوقيع: .....................</div>
                    </div>
                </div>
            </body>
            </html>
        `);
        doc.close();

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

    // 8. Bulk Detailed Records Print
    const handlePrintDetailed = async () => {
        const selectedList = students.filter(s => selectedIds.includes(s.id));
        if (selectedList.length === 0) return;

        const toastId = toast.loading(`جاري تجهيز سجلات ${selectedList.length} طالب للطباعة...`);
        try {
            const schoolName = settings?.schoolName || 'ثانوية الملك عبدالله';
            const currentDate = new Date().toLocaleDateString('ar-SA');

            const eventsSnap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'desc'), limit(150)));
            const allEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            iframe.style.zIndex = '-9999';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();

            const pagesHtml = selectedList.map(st => {
                const studentEvents = allEvents.filter(e => e.participatingStudents && e.participatingStudents.includes(st.id));
                const eventsRows = studentEvents.length > 0 ? studentEvents.map((evt, idx) => `
                    <div class="row">
                        <div class="cell w-5">${idx + 1}</div>
                        <div class="cell w-45 bold">${evt.title}</div>
                        <div class="cell w-20 dim">${evt.typeName || '-'}</div>
                        <div class="cell w-15">${evt.date || (evt.startTime?.toDate ? evt.startTime.toDate().toLocaleDateString('en-GB') : '-')}</div>
                        <div class="cell w-15 center"><span class="status ${evt.status === 'Done' ? 'success' : ''}">${evt.status === 'Done' ? 'مكتمل' : (evt.status || 'مجدول')}</span></div>
                    </div>
                `).join('') : '<div class="empty">لا توجد مشاركات مسجلة لهذا الطالب حتى الآن</div>';

                const specsHtml = (st.specializations || []).map(sp => `<span class="badge">${sp === 'General' ? 'عام' : sp}</span>`).join(' ') || '<span style="color:#9ca3af">لا يوجد تخصيص</span>';

                return `
                    <div class="student-page">
                        <div class="header">
                            <div class="school-info">
                                <div>المملكة العربية السعودية - وزارة التعليم</div>
                                <div style="font-weight: bold; color: #4338ca;">${schoolName}</div>
                            </div>
                            <div class="report-title">
                                <h2>الملف الفردي للطالب</h2>
                                <p>تاريخ الاستخراج: ${currentDate}</p>
                            </div>
                        </div>

                        <div class="profile-card">
                            <div class="avatar">${st.name.charAt(0)}</div>
                            <div class="student-meta">
                                <h1>${st.name}</h1>
                                <div class="meta-row">
                                    <span>الفصل: <strong>${st.class || '-'}</strong></span>
                                    <span>نقاط التميز: <strong class="points">${st.totalPoints || 0}</strong></span>
                                    <span>تاريخ الانضمام: <strong>${st.joinedAt?.toDate ? st.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'}</strong></span>
                                </div>
                            </div>
                        </div>

                        <div class="section-box">
                            <h3>التخصصات والفرق المسجل بها</h3>
                            <div>${specsHtml}</div>
                        </div>

                        <div class="section-box">
                            <h3>سجل الأنشطة والمشاركات (${studentEvents.length})</h3>
                            <div class="table">
                                <div class="row head">
                                    <div class="cell w-5">#</div>
                                    <div class="cell w-45">النشاط</div>
                                    <div class="cell w-20">النوع</div>
                                    <div class="cell w-15">التاريخ</div>
                                    <div class="cell w-15 center">الحالة</div>
                                </div>
                                ${eventsRows}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <meta charset="UTF-8">
                    <title>سجلات تفصيلية للطلاب</title>
                    <style>
                        @page { size: A4 portrait; margin: 12mm; }
                        * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; color: #111827; }
                        .student-page { page-break-after: always; min-height: 250mm; display: flex; flex-direction: column; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
                        .school-info { font-size: 12px; line-height: 1.5; }
                        .report-title { text-align: left; }
                        .report-title h2 { margin: 0; font-size: 18px; color: #1e1b4b; }
                        .report-title p { margin: 2px 0 0 0; font-size: 11px; color: #6b7280; }
                        .profile-card { display: flex; align-items: center; gap: 15px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 15px; margin-bottom: 20px; }
                        .avatar { width: 50px; height: 50px; border-radius: 50%; background: #4f46e5; color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; }
                        .student-meta h1 { margin: 0 0 6px 0; font-size: 20px; color: #111827; }
                        .meta-row { display: flex; gap: 20px; font-size: 13px; color: #4b5563; }
                        .points { color: #059669; }
                        .section-box { margin-bottom: 20px; }
                        .section-box h3 { font-size: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 10px; color: #374151; }
                        .badge { background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px; }
                        .table { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
                        .row { display: flex; border-bottom: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; }
                        .row.head { background: #f9fafb; font-weight: bold; color: #374151; }
                        .row:last-child { border-bottom: none; }
                        .cell { padding: 0 5px; }
                        .w-5 { width: 5%; } .w-45 { width: 45%; } .w-20 { width: 20%; } .w-15 { width: 15%; }
                        .bold { font-weight: bold; } .dim { color: #6b7280; } .center { text-align: center; }
                        .status { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f3f4f6; color: #4b5563; }
                        .status.success { background: #ecfdf5; color: #059669; }
                        .empty { padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
                    </style>
                </head>
                <body>
                    ${pagesHtml}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                toast.dismiss(toastId);
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 2000);
            }, 600);
        } catch (err) {
            console.error("Print detailed error:", err);
            toast.error("فشل تجهيز السجلات للطباعة", { id: toastId });
        }
    };


    return (
        <div className="space-y-6 font-cairo h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">إدارة الطلاب</h1>
                    <p className="text-indigo-200">سجلات، نقاط التميز، والملفات الشخصية</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="mt-4 md:mt-0 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white px-6 py-3 rounded-xl shadow-lg transition-all flex items-center shadow-emerald-500/20 font-bold"
                >
                    <Plus className="ml-2" size={20} />
                    تسجيل طالب
                </button>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-3 relative">
                    <input
                        type="text"
                        placeholder="ابحث بالاسم..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-12 pl-4 text-white focus:outline-none focus:border-indigo-500 transition-all font-bold"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                    <Search className="absolute right-4 top-3.5 text-gray-400" size={20} />
                </div>
                <button
                    onClick={() => setSortBy(sortBy === 'name' ? 'points' : 'name')}
                    className={`flex items-center justify-center p-3 rounded-xl border transition-all font-bold ${sortBy === 'points' ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-white/5 border-white/10 text-gray-400'}`}
                >
                    <ArrowUpDown size={18} className="ml-2" />
                    {sortBy === 'points' ? 'الأعلى نقاطاً' : 'ترتيب أبجدي'}
                </button>

                <div className="md:col-span-4 flex flex-col md:flex-row items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Filter size={18} className="text-indigo-400 shrink-0" />
                        <span className="text-gray-400 text-sm font-bold shrink-0">تصفية:</span>
                    </div>

                    <select
                        className="bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 w-full md:w-48"
                        value={gradeFilter}
                        onChange={e => { setGradeFilter(e.target.value); setSectionFilter(''); }}
                    >
                        <option value="">جميع الصفوف</option>
                        {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                    </select>

                    <select
                        className="bg-black/30 border border-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500 w-full md:w-48 disabled:opacity-50"
                        value={sectionFilter}
                        onChange={e => setSectionFilter(e.target.value)}
                        disabled={!gradeFilter}
                    >
                        <option value="">جميع الشعب</option>
                        {grades?.find(g => g.name === gradeFilter)?.sections?.map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                    </select>

                    <div className="h-6 w-px bg-white/10 hidden md:block mx-2"></div>

                    <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                        <button
                            onClick={() => setSpecFilter('All')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === 'All' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                            الكل
                        </button>
                        {specOptions.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setSpecFilter(opt.value)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === opt.value ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar min-h-0 bg-white/5 border border-white/10 rounded-2xl">
                <table className="w-full min-w-[700px] text-right bg-transparent">
                    <thead className="bg-black/20 text-gray-300 sticky top-0 backdrop-blur-md z-10">
                        <tr>
                            <th className="p-4 w-12 text-center">
                                <input
                                    type="checkbox"
                                    ref={el => {
                                        if (el) {
                                            el.indeterminate = isPartiallySelected && !isAllDisplayedSelected;
                                        }
                                    }}
                                    checked={isAllDisplayedSelected && displayedStudents.length > 0}
                                    onChange={toggleSelectAllHeader}
                                    aria-label="تحديد جميع الطلاب الظاهرين"
                                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                />
                            </th>
                            <th className="p-4 font-medium">اسم الطالب</th>
                            <th className="p-4 font-medium hidden md:table-cell">التخصصات</th>
                            <th className="p-4 font-medium hidden md:table-cell">الفصل</th>
                            <th className="p-4 font-medium">النقاط</th>
                            <th className="p-4 font-medium hidden md:table-cell">تاريخ الانضمام</th>
                            <th className="p-4 font-medium text-left">خيارات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {displayedStudents.map((student) => (
                            <tr
                                key={student.id}
                                onClick={() => openProfile(student)}
                                className={`hover:bg-white/5 transition-colors group cursor-pointer ${selectedIds.includes(student.id) ? 'bg-indigo-600/10' : ''}`}
                            >
                                <td className="p-4 w-12 text-center" onClick={e => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(student.id)}
                                        onChange={() => toggleSelectStudent(student.id)}
                                        aria-label={`تحديد الطالب ${student.name}`}
                                        className="w-4 h-4 rounded bg-white/10 border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                    />
                                </td>
                                <td className="p-4 text-white font-bold flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-sm font-bold ml-3 border border-white/10 shadow-lg">
                                        {student.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div>{student.name}</div>
                                        <div className="md:hidden text-xs text-gray-400 mt-1">{student.class}</div>
                                    </div>
                                </td>
                                <td className="p-4 hidden md:table-cell">
                                    <div className="flex flex-wrap gap-1">
                                        {student.specializations && student.specializations.length > 0 ? (
                                            student.specializations.map((spec, i) => (
                                                <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${spec === 'General' ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-indigo-900/50 text-indigo-300 border-indigo-500/30'}`}>
                                                    {spec === 'General' ? 'عام' : spec}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-gray-400 text-xs">-</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 text-gray-300 hidden md:table-cell">{student.class}</td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${student.totalPoints > 50 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-gray-700/30 text-gray-400 border-gray-600/30'}`}>
                                        <Award size={14} className="ml-1" />
                                        {student.totalPoints}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-400 text-sm hidden md:table-cell">
                                    {student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'}
                                </td>
                                <td className="p-4 text-left">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
                                        aria-label="أرشفة الطالب"
                                        className="text-red-400 hover:text-white hover:bg-red-500 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* --- ADD MODAL --- */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-6">تسجيل طالب جديد</h3>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الاسم الرباعي</label>
                                <input required className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                    value={newStudent.name} onChange={e => setNewStudent({ ...newStudent, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الصف / المرحلة</label>
                                    <select
                                        required
                                        className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        value={newStudent.grade || ''}
                                        onChange={e => {
                                            setNewStudent({ ...newStudent, grade: e.target.value, section: '', class: `${e.target.value} - ` });
                                        }}
                                    >
                                        <option value="">اختر الصف...</option>
                                        {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الشعبة</label>
                                    <select
                                        required
                                        className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        value={newStudent.section || ''}
                                        onChange={e => setNewStudent({
                                            ...newStudent,
                                            section: e.target.value,
                                            class: `${newStudent.grade} - ${e.target.value}`
                                        })}
                                        disabled={!newStudent.grade}
                                    >
                                        <option value="">اختر الشعبة...</option>
                                        {grades?.find(g => g.name === newStudent.grade)?.sections?.map(s => (
                                            <option key={s.id} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <input type="hidden" value={newStudent.class} /> {/* Legacy Support */}
                            <div>
                                <MultiSelect
                                    label="التخصصات / الفرق"
                                    placeholder="اختر التخصصات..."
                                    options={specOptions}
                                    selectedValues={newStudent.specializations}
                                    onChange={vals => setNewStudent({ ...newStudent, specializations: vals })}
                                    icon={Tag}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 space-x-reverse pt-4">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">إلغاء</button>
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold">تسجيل</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* --- PROFILE MODAL --- */}
            {selectedStudent && (

                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedStudent(null)}
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl overflow-hidden pointer-events-auto relative">
                            {/* Removed animate-scale-in to be safe unless defined */}
                            {/* Modal Header */}
                            <div className="p-6 bg-gradient-to-l from-indigo-900/50 to-transparent border-b border-white/10 flex justify-between items-start">
                                <div className="flex items-center">
                                    <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                                        {selectedStudent.name.charAt(0)}
                                    </div>
                                    <div className="mr-4">
                                        <h2 className="text-2xl font-bold text-white mb-1">{selectedStudent.name}</h2>
                                        <div className="flex items-center space-x-3 space-x-reverse text-sm">
                                            <span className="text-gray-400 bg-white/5 px-2 py-0.5 rounded">{selectedStudent.class}</span>
                                            <span className="text-amber-400 flex items-center font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                                <Award size={14} className="ml-1" /> {selectedStudent.totalPoints} نقطة
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => generateStudentProfilePDF(selectedStudent, studentHistory)}
                                        aria-label="طباعة الملف"
                                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg flex items-center transition-all border border-white/5 shadow-sm"
                                        title="طباعة الملف"
                                    >
                                        <Printer size={20} />
                                    </button>
                                    <button onClick={() => setSelectedStudent(null)} aria-label="إغلاق الملف الشخصي" className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10"><X size={24} /></button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-white/10 px-6 bg-black/20">
                                {[
                                    { id: 'info', label: 'البيانات الأساسية', icon: User },
                                    { id: 'notes', label: 'ملاحظات المعلم', icon: FileText },
                                    { id: 'history', label: 'سجل النشاط', icon: Clock },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setProfileTab(tab.id)}
                                        className={`px-4 py-4 flex items-center space-x-2 space-x-reverse border-b-2 transition-all ${profileTab === tab.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-white'}`}
                                    >
                                        <tab.icon size={18} /> <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 bg-black/10">
                                {profileTab === 'info' && (
                                    <div className="space-y-6 max-w-lg mx-auto pt-4">
                                        <div>
                                            <label className="block text-gray-400 text-sm mb-1">الاسم الكامل</label>
                                            <input className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                                value={selectedStudent.name} onChange={e => setSelectedStudent({ ...selectedStudent, name: e.target.value })} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-gray-400 text-sm mb-1">الصف</label>
                                                <select
                                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                                    value={selectedStudent.grade || ''}
                                                    onChange={e => {
                                                        setSelectedStudent({
                                                            ...selectedStudent,
                                                            grade: e.target.value,
                                                            section: '',
                                                            class: `${e.target.value} - `
                                                        });
                                                    }}
                                                >
                                                    <option value="">اختر الصف...</option>
                                                    {grades?.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-gray-400 text-sm mb-1">الشعبة</label>
                                                <select
                                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                                    value={selectedStudent.section || ''}
                                                    onChange={e => setSelectedStudent({
                                                        ...selectedStudent,
                                                        section: e.target.value,
                                                        class: `${selectedStudent.grade} - ${e.target.value}`
                                                    })}
                                                    disabled={!selectedStudent.grade}
                                                >
                                                    <option value="">اختر الشعبة...</option>
                                                    {grades?.find(g => g.name === selectedStudent.grade)?.sections?.map(s => (
                                                        <option key={s.id} value={s.name}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-gray-400 text-sm mb-1">رصيد النقاط (تعديل يدوي)</label>
                                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none font-mono"
                                                value={selectedStudent.totalPoints} onChange={e => setSelectedStudent({ ...selectedStudent, totalPoints: e.target.value })} />
                                        </div>

                                        <div>
                                            <MultiSelect
                                                label="التخصصات / الفرق المسجلة"
                                                placeholder="تعديل التخصصات..."
                                                options={specOptions}
                                                selectedValues={selectedStudent.specializations || []}
                                                onChange={vals => setSelectedStudent({ ...selectedStudent, specializations: vals })}
                                                icon={Tag}
                                            />
                                        </div>
                                        <button onClick={saveProfileChanges} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold flex items-center justify-center shadow-lg">
                                            <Save size={18} className="ml-2" /> حفظ التعديلات
                                        </button>
                                    </div>
                                )}

                                {profileTab === 'notes' && (
                                    <div className="h-full flex flex-col">
                                        <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl mb-4 text-amber-200 text-sm flex items-center">
                                            <FileText size={16} className="ml-2" /> هذه الملاحظات خاصة فقط بالإدارة ولا تظهر للطالب.
                                        </div>
                                        <textarea
                                            className="flex-1 w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white focus:border-indigo-500 outline-none resize-none"
                                            placeholder="اكتب ملاحظاتك ومتابعاتك عن الطالب هنا..."
                                            value={selectedStudent.notes || ''}
                                            onChange={e => setSelectedStudent({ ...selectedStudent, notes: e.target.value })}
                                        ></textarea>
                                        <div className="mt-4 flex justify-end">
                                            <button onClick={saveProfileChanges} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold">حفظ الملاحظة</button>
                                        </div>
                                    </div>
                                )}

                                {profileTab === 'history' && (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                                            <h3 className="text-white font-bold m-0 border-none">سجل الأنشطة الكامل ({studentHistory.length})</h3>
                                            <button
                                                onClick={() => generateStudentProfilePDF(selectedStudent, studentHistory)}
                                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg flex items-center transition-all"
                                            >
                                                <Printer size={14} className="ml-1" /> طباعة السجل
                                            </button>
                                        </div>
                                        {studentHistory.length > 0 ? studentHistory.map(evt => (
                                            <div key={evt.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                                                <div className="flex items-center">
                                                    <div className={`w-2 h-12 rounded-full mr-4 ${evt.status === 'Done' ? 'bg-emerald-500' : 'bg-gray-600'}`}></div>
                                                    <div>
                                                        <div className="font-bold text-white text-lg">{evt.title}</div>
                                                        <div className="text-gray-400 text-sm">{evt.typeName} | {evt.venueId}</div>
                                                    </div>
                                                </div>
                                                <div className="text-left">
                                                    <div className="text-emerald-400 font-bold font-mono">{evt.date || evt.startTime?.toDate().toLocaleDateString('en-GB')}</div>
                                                    <div className="text-xs text-gray-400 mt-1">{evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-20 opacity-50">
                                                <Clock size={48} className="mx-auto mb-4" />
                                                <p>لا يوجد سجل أنشطة لهذا الطالب حتى الآن</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            {/* --- BULK ACTIONS FLOATING BAR & MODALS --- */}
            <BulkActionsBar
                selectedCount={selectedIds.length}
                totalDisplayed={displayedStudents.length}
                totalAll={students.length}
                isAllDisplayedSelected={isAllDisplayedSelected}
                onSelectAllDisplayed={handleSelectAllDisplayed}
                onSelectAllSchool={handleSelectAllSchool}
                onClearSelection={handleClearSelection}
                onOpenOperationsModal={handleOpenOperationsModal}
                onOpenCertificatesModal={() => setIsCertificatesModalOpen(true)}
                onPrintConsolidated={handlePrintConsolidated}
                onPrintDetailed={handlePrintDetailed}
                onExportCSV={handleExportCSV}
                onBulkArchive={handleBulkArchive}
                isProcessing={isProcessingBulk}
            />

            <BulkOperationsModal
                key={operationsInitialTab + (isOperationsModalOpen ? '_open' : '_closed')}
                isOpen={isOperationsModalOpen}
                onClose={() => setIsOperationsModalOpen(false)}
                initialTab={operationsInitialTab}
                selectedStudents={selectedStudentsList}
                grades={grades}
                eventTypes={eventTypes}
                onApplyTransfer={handleBulkTransfer}
                onApplySpecialization={handleBulkSpecialization}
                onApplyPoints={handleBulkPoints}
                onApplyStatus={handleBulkStatus}
                isProcessing={isProcessingBulk}
            />

            <BulkPrintCertificatesModal
                isOpen={isCertificatesModalOpen}
                onClose={() => setIsCertificatesModalOpen(false)}
                selectedStudents={selectedStudentsList}
            />
        </div>
    );
}

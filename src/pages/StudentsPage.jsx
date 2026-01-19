import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { Search, Plus, Trash2, Award, User, FileText, Clock, Edit3, X, Save, ArrowUpDown, Tag, Filter, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';
import MultiSelect from '../components/ui/MultiSelect';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function StudentsPage() {
    const [students, setStudents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name'); // name | points
    const [specFilter, setSpecFilter] = useState('All'); // 'All' | 'General' | 'Radio' ...

    const { eventTypes, classes } = useSettings();
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

    useEffect(() => {
        fetchStudents();
    }, []);

    // --- Fetch Logic ---
    async function fetchStudents() {
        const q = query(collection(db, 'students'), where('active', '==', true));
        const snap = await getDocs(q);
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

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
            fetchStudents();
            toast.success('تمت إضافة الطالب');
        } catch (error) { toast.error('حدث خطأ'); }
    }

    // --- Delete Student ---
    async function handleDelete(id) {
        if (!confirm("نقل للأرشيف؟")) return;
        try {
            await updateDoc(doc(db, 'students', id), { active: false });
            setStudents(students.filter(s => s.id !== id));
            toast.success('تم الأرشفة');
        } catch (error) { toast.error('فشل'); }
    }

    // --- Profile Logic ---
    const openProfile = (student) => {
        setSelectedStudent(student);
        setProfileTab('info');
    };

    // Live History Listener
    useEffect(() => {
        if (!selectedStudent) {
            setStudentHistory([]);
            return;
        }

        const q = query(
            collection(db, 'events'),
            where('participatingStudents', 'array-contains', selectedStudent.id),
            orderBy('startTime', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snap) => {
            setStudentHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error("History sync error:", error);
            // Fallback or toast?
        });

        return () => unsubscribe();
    }, [selectedStudent]);

    const saveProfileChanges = async () => {
        if (!selectedStudent) return;
        try {
            await updateDoc(doc(db, 'students', selectedStudent.id), {
                name: selectedStudent.name,
                class: selectedStudent.class,
                totalPoints: Number(selectedStudent.totalPoints),
                notes: selectedStudent.notes || '',
                specializations: selectedStudent.specializations || []
            });
            toast.success("تم تحديث الملف الشخصي");
            fetchStudents(); // Refresh main list
        } catch (e) {
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

            // PDF Logic (Smart Scaling)
            const imgData = canvas.toDataURL('image/jpeg', 0.8);
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            // Simple Multi-page Strategy (Image Slicing is complex in client-js without libraries, 
            // so we stick to one long page OR fitting. 
            // User requested "Full History". One long PDF page is often preferred for digital, 
            // but for print, scaling down is bad.
            // Best compromise for now: Standard Auto-Page logic from jsPDF adds pages? No, addImage is one block.
            // We'll create a single page PDF with custom height if it exceeds A4, to ensure it's not squashed.

            if (imgHeight > pageHeight) {
                // Create PDF with custom height to fit the whole image
                const longPdf = new jsPDF({
                    orientation: 'p',
                    unit: 'pt',
                    format: [pageWidth, imgHeight + 20]
                });
                longPdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
                longPdf.save(`Profile_Runsheet_${student.name}.pdf`);
            } else {
                pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
                pdf.save(`Profile_${student.name}.pdf`);
            }
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
            return matchesSearch && matchesSpec;
        })
        .sort((a, b) => {
            if (sortBy === 'points') return b.totalPoints - a.totalPoints;
            return a.name.localeCompare(b.name);
        });

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

                <div className="md:col-span-4 flex items-center gap-2 overflow-x-auto pb-2">
                    <Filter size={16} className="text-indigo-400 shrink-0" />
                    <span className="text-gray-400 text-sm font-bold shrink-0">تصفية حسب التخصص:</span>
                    <button
                        onClick={() => setSpecFilter('All')}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === 'All' ? 'bg-white text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                    >
                        الكل
                    </button>
                    {specOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setSpecFilter(opt.value)}
                            className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${specFilter === opt.value ? 'bg-indigo-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-auto custom-scrollbar min-h-0 bg-white/5 border border-white/10 rounded-2xl">
                <table className="w-full min-w-[700px] text-right bg-transparent">
                    <thead className="bg-black/20 text-gray-300 sticky top-0 backdrop-blur-md z-10">
                        <tr>
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
                                className="hover:bg-white/5 transition-colors group cursor-pointer"
                            >
                                <td className="p-4 text-white font-bold flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-sm font-bold ml-3 border border-white/10 shadow-lg">
                                        {student.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div>{student.name}</div>
                                        <div className="md:hidden text-xs text-gray-500 mt-1">{student.class}</div>
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
                                            <span className="text-gray-600 text-xs">-</span>
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
                                <td className="p-4 text-gray-500 text-sm hidden md:table-cell">
                                    {student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('ar-SA') : '-'}
                                </td>
                                <td className="p-4 text-left">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
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
                                            const g = classes?.find(c => c.name === e.target.value);
                                            setNewStudent({ ...newStudent, grade: e.target.value, section: '', class: `${e.target.value} - ` });
                                        }}
                                    >
                                        <option value="">اختر الصف...</option>
                                        {classes?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
                                        {classes?.find(c => c.name === newStudent.grade)?.sections?.map(s => (
                                            <option key={s} value={s}>{s}</option>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl animate-scale-in overflow-hidden">
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
                                    className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg flex items-center transition-all border border-white/5 shadow-sm"
                                    title="طباعة الملف"
                                >
                                    <Printer size={20} />
                                </button>
                                <button onClick={() => setSelectedStudent(null)} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10"><X size={24} /></button>
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
                                        <label className="block text-gray-500 text-sm mb-1">الاسم الكامل</label>
                                        <input className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                            value={selectedStudent.name} onChange={e => setSelectedStudent({ ...selectedStudent, name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-gray-500 text-sm mb-1">الفصل</label>
                                            <input className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none"
                                                value={selectedStudent.class} onChange={e => setSelectedStudent({ ...selectedStudent, class: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-gray-500 text-sm mb-1">رصيد النقاط (تعديل يدوي)</label>
                                            <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white focus:border-indigo-500 outline-none font-mono"
                                                value={selectedStudent.totalPoints} onChange={e => setSelectedStudent({ ...selectedStudent, totalPoints: e.target.value })} />
                                        </div>
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
                                                <div className="text-xs text-gray-500 mt-1">{evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
            )}
        </div>
    );
}

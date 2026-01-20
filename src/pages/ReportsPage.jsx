import { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc, runTransaction, increment } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { FileText, Download, Calendar, Users, Box, Filter, Printer, Search, X, Eye, Trash2, RefreshCw, Pen, Hash } from 'lucide-react';
import EventModal from '../components/EventModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import { updateEventWithSmartSync } from '../utils/EventLogic';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import MultiSelect from '../components/ui/MultiSelect'; // Imported MultiSelect
import { Tag, CheckSquare, Square } from 'lucide-react';

// --- Helper: Arabic Status ---
const getStatusLabel = (status) => {
    const map = {
        'Done': 'مكتمل',
        'Draft': 'مسودة',
        'In Progress': 'قيد التنفيذ',
        'Cancelled': 'ملغي',
        'archived': 'مؤرشف'
    };
    return map[status] || status;
};

// --- Helper: Arabic Venue ---
const getVenueLabel = (venueId) => {
    const map = {
        'Auditorium': 'المسرح المدرسي',
        'Gym': 'الصالة الرياضية',
        'Playground': 'الملعب الخارجي',
        'Lab': 'معمل الحاسب',
        'Library': 'المكتبة'
    };
    return map[venueId] || venueId;
};

// Sub-component for Print Controls
const PrintControls = ({ event, onPrint }) => {
    const [theme, setTheme] = useState('light'); // Default to Ink Saver (Light)

    return (
        <div className="flex items-center gap-3">
            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                <button
                    onClick={() => setTheme('light')}
                    className={`p-1.5 rounded-md transition-all ${theme === 'light' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="وضع الطباعة (توفير الحبر)"
                >
                    <FileText size={16} /> {/* Using FileText as proxy for 'Document/White' look */}
                </button>
                <button
                    onClick={() => setTheme('dark')}
                    className={`p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                    title="الوضع الليلي (كما في الشاشة)"
                >
                    <Box size={16} /> {/* Using Box as proxy for 'Dark/Screen' look */}
                </button>
            </div>

            <button
                onClick={() => onPrint(event, theme)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Printer size={16} className="ml-2" /> طباعة ({theme === 'light' ? 'عادي' : 'ليلي'})
            </button>
        </div>
    );
};

import { useSettings } from '../contexts/SettingsContext';

export default function ReportsPage() {
    const { classes, eventTypes, activeProfile } = useSettings(); // Use Global Classes
    const [activeTab, setActiveTab] = useState('activities'); // activities | students | assets
    const [loading, setLoading] = useState(false);

    // Data States
    const [rawData, setRawData] = useState([]);
    const [previewData, setPreviewData] = useState([]);
    const [studentMap, setStudentMap] = useState({}); // id -> name

    // --- Advanced Filters State ---
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [selectedTypes, setSelectedTypes] = useState([]); // MultiSelect array

    // Student Filters
    const [gradeFilter, setGradeFilter] = useState('');
    const [sectionFilter, setSectionFilter] = useState('');
    const [specFilter, setSpecFilter] = useState('All');
    const [pointsRange, setPointsRange] = useState({ min: 0, max: 2000 });
    // Legacy support to prevent crash if referenced
    const [minPoints, setMinPoints] = useState(0);
    const [maxPoints, setMaxPoints] = useState(2000);

    // Asset Filters
    const [assetStatusFilter, setAssetStatusFilter] = useState('All');

    // Venue Filter
    const [venueFilter, setVenueFilter] = useState('All');

    // --- Report Options (Toggles) ---
    const [reportOptions, setReportOptions] = useState({
        showStudents: false,
        showAssets: false,
        showCustomFields: false
    });

    // Detail Modal State
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const [editEventData, setEditEventData] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // Filter Options (computed from Settings)
    const gradeOptions = Object.keys(classes || {});
    const sectionOptions = (gradeFilter && classes[gradeFilter]?.sections) ? classes[gradeFilter].sections : [];

    // --- 1. Fetch Data Logic ---
    useEffect(() => {
        const loadInitialData = async () => {
            // Load Students Map First for lookups
            const sSnap = await getDocs(collection(db, 'students'));
            const sMap = {};
            sSnap.docs.forEach(d => { sMap[d.id] = d.data().name; });
            setStudentMap(sMap);
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (Object.keys(studentMap).length > 0 || activeTab !== 'activities') {
            fetchData();
        }
    }, [activeTab, studentMap]); // Refetch when tab changes or map is ready

    // --- 2. Filter Logic ---
    useEffect(() => {
        applyFilters();
    }, [rawData, dateRange, minPoints, maxPoints, assetFilter, gradeFilter, sectionFilter, venueFilter, activeTab]);

    // --- 3. Handlers ---
    const handleEditClick = async (event) => {
        try {
            const docRef = doc(db, 'events', event.id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setEditEventData({ id: event.id, ...docSnap.data() });
                setIsEditModalOpen(true);
            } else {
                toast.error("هذا النشاط غير موجود");
            }
        } catch (e) {
            console.error(e);
            toast.error("فشل تحميل بيانات النشاط");
        }
    };

    const handleSaveEditedEvent = async (updatedData) => {
        try {
            // Use Smart Sync Logic
            await updateEventWithSmartSync(updatedData.id, updatedData, editEventData);
            toast.success("تم تحديث النشاط ورصد النقاط بنجاح");
            setIsEditModalOpen(false);
            setEditEventData(null);
            fetchData(); // Refresh list
        } catch (e) {
            console.error(e);
            toast.error("حدث خطأ أثناء حفظ التعديلات");
        }
    };

    const handleDeleteEvent = async (event) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف النشاط",
            message: "هل أنت متأكد من حذف هذا النشاط؟ سيتم حذفه نهائياً.",
            isDestructive: true,
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'events', event.id));
                    toast.success("تم حذف النشاط");
                    setIsEditModalOpen(false); // If open
                    setSelectedEvent(null);
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    fetchData();
                } catch (e) {
                    console.error(e);
                    toast.error("فشل الحذف");
                }
            }
        });
    };

    async function fetchData() {
        setLoading(true);
        try {
            let data = [];
            if (activeTab === 'activities') {
                const snap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'desc')));
                data = snap.docs.map(d => {
                    const pd = d.data();
                    const studentNames = pd.participatingStudents?.map(id => studentMap[id] || 'طالب غير معروف') || [];
                    return {
                        id: d.id,
                        title: pd.title,
                        rawDate: pd.startTime?.toDate ? pd.startTime.toDate() : new Date(pd.date),
                        date: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'yyyy-MM-dd') : pd.date,
                        formattedDate: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'EEEE d MMMM yyyy', { locale: ar }) : pd.date,
                        time: pd.startTime?.toDate ? format(pd.startTime.toDate(), 'hh:mm a') : pd.startTime,
                        venueId: pd.venueId, // Store ID for filtering
                        venue: getVenueLabel(pd.venueId),
                        status: getStatusLabel(pd.status || 'Draft'),
                        rawStatus: pd.status || 'Draft',
                        rawParticipatingStudents: pd.participatingStudents || [],
                        studentsCount: studentNames.length,
                        studentNames: studentNames,
                        type: pd.typeName || 'عام',
                        points: pd.points || 10 // Sortable
                    };
                });
            } else if (activeTab === 'students') {
                const snap = await getDocs(query(collection(db, 'students'), orderBy('totalPoints', 'desc')));
                data = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name,
                    class: d.data().class, // Legacy
                    grade: d.data().grade || '', // New
                    section: d.data().section || '', // New
                    specializations: d.data().specializations || [],
                    points: d.data().totalPoints || 0
                }));
            } else if (activeTab === 'assets') {
                const snap = await getDocs(collection(db, 'assets'));
                data = snap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name,
                    type: d.data().type,
                    status: d.data().status
                }));
            }
            setRawData(data);
        } catch (error) {
            console.error(error);
            toast.error("فشل تحميل البيانات");
        } finally {
            setLoading(false);
        }
    }

    function applyFilters() {
        let filtered = [...rawData];

        if (activeTab === 'activities') {
            if (dateRange.start) filtered = filtered.filter(item => item.date >= dateRange.start);
            if (dateRange.end) filtered = filtered.filter(item => item.date <= dateRange.end);
            if (venueFilter !== 'All') filtered = filtered.filter(item => item.venueId === venueFilter);
            if (selectedTypes.length > 0) filtered = filtered.filter(item => selectedTypes.includes(item.type));

        } else if (activeTab === 'students') {
            if (pointsRange.min > 0) filtered = filtered.filter(item => item.points >= pointsRange.min);
            if (pointsRange.max < 2000) filtered = filtered.filter(item => item.points <= pointsRange.max);


            if (gradeFilter) filtered = filtered.filter(item => item.grade === gradeFilter);
            if (sectionFilter) filtered = filtered.filter(item => item.section === sectionFilter);
            if (specFilter !== 'All') {
                filtered = filtered.filter(item => {
                    if (specFilter === 'General') return item.specializations.includes('General');
                    return item.specializations.includes(specFilter);
                });
            }

        } else if (activeTab === 'assets') {
            if (assetStatusFilter !== 'All') {
                const statuses = Array.isArray(assetStatusFilter) ? assetStatusFilter : [assetStatusFilter];
                // If it's single select acting as multi, simpler check:
                if (assetStatusFilter !== 'All') filtered = filtered.filter(item => item.status === assetStatusFilter);
            }
        }

        setPreviewData(filtered);
    }

    // --- Bulk PDF (Refactored for Arabic Support via Iframe Isolation) ---
    const generateBulkPDF = async () => {
        const toastId = toast.loading('جاري تحضير التقرير الشامل...');
        try {
            // 1. Create a hidden Iframe
            const iframe = document.createElement('iframe');
            iframe.style.left = '0';
            iframe.style.width = '1200px'; // Wider for table
            iframe.style.height = 'auto'; // Allow full height
            iframe.style.position = 'absolute'; // Use absolute to allow expansion
            iframe.style.visibility = 'hidden'; // Hide visual but keep render
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();

            // 2. Prepare Table Content Validation
            const titleMap = {
                'activities': 'سجل الأنشطة المدرسي',
                'students': 'قائمة الطلاب المتميزين',
                'assets': 'جرد الموارد والمعدات'
            };
            let pageTitle = titleMap[activeTab] || 'تقرير شامل';

            // Dynamic Title overrides
            if (activeTab === 'students' && gradeFilter) {
                pageTitle = `تقرير طلاب ${gradeFilter}`;
                if (sectionFilter) pageTitle += ` - ${sectionFilter}`;
            }
            if (activeTab === 'activities' && venueFilter !== 'All') {
                const vLabel = getVenueLabel(venueFilter);
                pageTitle = `تقرير أنشطة (مخصص): ${vLabel}`;
            }

            const dateStr = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

            let tableHeader = '';
            let tableRowsHtml = '';

            if (activeTab === 'activities') {
                tableHeader = `
                    <tr>
                        <th style="width: 30%">النشاط</th>
                        <th style="width: 20%">التاريخ</th>
                        <th style="width: 15%">المكان</th>
                        <th style="width: 15%">الحالة</th>
                        <th style="width: 10%">الطلاب</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map(item => {
                    const mainRow = `
                        <tr>
                            <td class="bold">${item.title}</td>
                            <td class="dim">${item.formattedDate || item.date}</td>
                            <td>${item.venue}</td>
                            <td>
                                <span class="badge ${item.status === 'مكتمل' ? 'success' : 'neutral'}">
                                    ${item.status}
                                </span>
                            </td>
                            <td class="center">${item.studentsCount}</td>
                        </tr>
                    `;

                    let detailsRow = '';
                    // Check if we should show details
                    if (reportOptions.showStudents && item.studentNames && item.studentNames.length > 0) {
                        const studentTags = item.studentNames.map(s => `<span class="student-tag">${s}</span>`).join('');
                        detailsRow = `
                            <tr class="details-row">
                                <td colspan="5">
                                    <div class="details-box">
                                        <div class="details-title">الطلاب المشاركون (${item.studentNames.length}):</div>
                                        <div class="tags-container">${studentTags}</div>
                                    </div>
                                </td>
                            </tr>
                         `;
                    }
                    return mainRow + detailsRow;
                }).join('');

            } else if (activeTab === 'students') {
                tableHeader = `
                    <tr>
                        <th style="width: 5%">#</th>
                        <th style="width: 35%">اسم الطالب</th>
                        <th style="width: 30%">التخصصات</th>
                        <th style="width: 15%">الفصل</th>
                        <th style="width: 15%">النقاط</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map((item, i) => {
                    const specs = item.specializations && item.specializations.length > 0
                        ? item.specializations.map(s => s === 'General' ? 'عام' : s).join(', ')
                        : '-';
                    return `
                    <tr>
                         <td class="center dim">${i + 1}</td>
                        <td class="bold">${item.name}</td>
                        <td>${specs}</td>
                        <td class="center">${item.class}</td>
                        <td class="center bold success-text">${item.points}</td>
                    </tr>
                `}).join('');
            } else if (activeTab === 'assets') {
                tableHeader = `
                    <tr>
                        <th style="width: 40%">اسم المورد</th>
                        <th style="width: 30%">النوع</th>
                        <th style="width: 30%">الحالة</th>
                    </tr>
                `;
                tableRowsHtml = previewData.map(item => `
                    <tr>
                        <td class="bold">${item.name}</td>
                        <td>${item.type}</td>
                        <td>
                           <span class="badge ${item.status === 'Available' ? 'success' : 'danger'}">
                                ${item.status}
                            </span>
                        </td>
                    </tr>
                `).join('');
            }

            // 3. Write Full HTML Document
            // Using "Light Mode" styles by default for printing friendly bulk reports
            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background-color: #ffffff;
                            color: #1f2937;
                            margin: 0;
                            padding: 40px;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 40px;
                            border-bottom: 2px solid #e5e7eb;
                            padding-bottom: 20px;
                        }
                        h1 { margin: 0; font-size: 24px; color: #111827; }
                        p.subtitle { margin: 5px 0 0; color: #6b7280; font-size: 14px; }
                        
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                            font-size: 14px; /* Increased from 12px */
                        }
                        th {
                            background-color: #f3f4f6;
                            color: #374151;
                            text-align: right;
                            padding: 14px; /* Increased padding */
                            border-bottom: 2px solid #e5e7eb;
                            font-weight: bold;
                        }
                        td {
                            padding: 12px 14px; /* Increased padding */
                            border-bottom: 1px solid #e5e7eb;
                            vertical-align: middle;
                        }
                        tr:nth-child(even) { background-color: #f9fafb; }
                        
                        .bold { font-weight: bold; }
                        .dim { color: #6b7280; }
                        .center { text-align: center; }
                        .success-text { color: #059669; }
                        
                        .badge {
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            font-weight: bold;
                            display: inline-block;
                        }
                        .badge.success { background-color: #ecfdf5; color: #059669; }
                        .badge.neutral { background-color: #f3f4f6; color: #4b5563; }
                        .badge.danger { background-color: #fef2f2; color: #dc2626; }

                        /* DETAILS ROW STYLES */
                        .details-row { background-color: #ffffff !important; }
                        .details-box {
                            background-color: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 8px;
                            padding: 10px;
                            margin: 5px 0 15px 0;
                        }
                        .details-title {
                            font-weight: bold;
                            font-size: 12px;
                            color: #64748b;
                            margin-bottom: 5px;
                        }
                        .tags-container {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 5px;
                        }
                        .student-tag {
                            background-color: #fff;
                            border: 1px solid #cbd5e1;
                            padding: 2px 8px;
                            border-radius: 4px;
                            font-size: 11px;
                            color: #334155;
                        }

                        .footer {
                            margin-top: 40px;
                            text-align: left;
                            font-size: 10px;
                            color: #9ca3af;
                            border-top: 1px solid #e5e7eb;
                            padding-top: 10px;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${pageTitle}</h1>
                        <p class="subtitle">تاريخ التقرير: ${dateStr}</p>
                    </div>

                    <table>
                        <thead>
                            ${tableHeader}
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>

                    <div class="footer">
                        Generated by School Management System
                    </div>
                </body>
                </html>
            `);
            doc.close();

            await new Promise(r => setTimeout(r, 100)); // Render wait

            // 4. Capture & PDF
            const canvas = await html2canvas(doc.body, {
                scale: 2,
                useCORS: true,
                logging: false,
                windowWidth: 1200,
                // height: doc.body.scrollHeight + 100, // Ensure full height capture
                backgroundColor: '#ffffff'
            });

            document.body.removeChild(iframe);

            const imgData = canvas.toDataURL('image/jpeg', 0.85); // Slightly higher quality
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = 595.28;
            const pageHeight = 841.89;

            // Calculate dimensions
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            // First Page
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
            heightLeft -= pageHeight;

            // Subsequent Pages (Slicing)
            while (heightLeft > 0) {
                position -= pageHeight; // Slice by moving image up
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                heightLeft -= pageHeight;
            }

            pdf.save(`Report_${activeTab}_${Date.now()}.pdf`);

            toast.success("تم تحميل التقرير الشامل", { id: toastId });

        } catch (error) {
            console.error(error);
            toast.error("فشل في إنشاء التقرير الشامل", { id: toastId });
        }
    };

    // --- 4. Single Event PDF (NUCLEAR OPTION: Iframe Isolation with Themes) ---
    const generateSingleEventPDF = async (event, theme = 'light') => {
        const toastId = toast.loading('جاري تحضير الملف...');

        try {
            // Theme Configuration
            const themes = {
                dark: {
                    bg: '#1a1a20',
                    text: '#ffffff',
                    textSec: '#9ca3af',
                    cardBg: 'rgba(255,255,255,0.05)',
                    cardBorder: 'rgba(255,255,255,0.05)',
                    listBg: 'rgba(0,0,0,0.2)',
                    listBorder: 'rgba(255,255,255,0.05)',
                    itemBorder: 'rgba(255,255,255,0.1)',
                    footerBorder: 'rgba(255,255,255,0.1)'
                },
                light: {
                    bg: '#ffffff',
                    text: '#000000',
                    textSec: '#4b5563', // gray-600
                    cardBg: '#f3f4f6', // gray-100
                    cardBorder: '#e5e7eb', // gray-200
                    listBg: '#ffffff',
                    listBorder: '#e5e7eb',
                    itemBorder: '#f3f4f6',
                    footerBorder: '#e5e7eb'
                }
            };

            const t = themes[theme];

            // 1. Create a hidden Iframe (Clean Slate Environment)
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '0';
            iframe.style.width = '800px';
            iframe.style.height = '1200px';
            iframe.style.border = 'none';

            document.body.appendChild(iframe);

            // 2. Write RAW HTML into the iframe document
            const doc = iframe.contentWindow.document;
            doc.open();

            const studentsListHtml = event.studentNames.length > 0
                ? event.studentNames.map((name, i) =>
                    `<div class="item">
                        <span class="idx">${i + 1}</span>
                        ${name}
                     </div>`).join('')
                : '<div class="empty">لا يوجد طلاب</div>';

            const statusColor = event.status === 'مكتمل' ? '#34d399' : '#9ca3af';
            const statusBg = event.status === 'مكتمل'
                ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.2)' : '#ecfdf5') // green-900/20 vs green-50
                : (theme === 'dark' ? 'rgba(107, 114, 128, 0.2)' : '#f3f4f6'); // gray-800/20 vs gray-100

            // Adjust status text color for light mode readability if needed
            const statusTextColor = event.status === 'مكتمل'
                ? (theme === 'dark' ? '#34d399' : '#059669') // emerald-400 vs emerald-600
                : (theme === 'dark' ? '#9ca3af' : '#4b5563'); // gray-400 vs gray-600


            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl" lang="ar">
                <head>
                    <style>
                        body {
                            margin: 0;
                            padding: 40px;
                            background-color: ${t.bg};
                            color: ${t.text};
                            font-family: 'Arial', sans-serif;
                        }
                        h1 { margin: 0 0 5px 0; font-size: 28px; }
                        p.type { color: #6366f1; font-size: 14px; margin-bottom: 30px; }
                        .cards { display: flex; gap: 15px; margin-bottom: 30px; }
                        .card { 
                            flex: 1; 
                            background: ${t.cardBg}; 
                            border: 1px solid ${t.cardBorder}; 
                            border-radius: 12px; 
                            padding: 15px; 
                            text-align: center; 
                        }
                        .card .label { color: ${t.textSec}; font-size: 12px; margin-bottom: 5px; }
                        .card .value { font-weight: bold; font-size: 16px; }
                        .status-badge { 
                            padding: 4px 8px; 
                            border-radius: 4px; 
                            font-weight: bold; 
                            font-size: 14px; 
                            display: inline-block; 
                            margin-top: 2px;
                        }
                        h3 { 
                            font-size: 18px; 
                            margin-bottom: 15px; 
                            border-bottom: 1px solid ${t.footerBorder}; 
                            padding-bottom: 10px; 
                        }
                        .list { 
                            background: ${t.listBg}; 
                            border: 1px solid ${t.listBorder}; 
                            border-radius: 12px; 
                            overflow: hidden; 
                        }
                        .item { 
                            padding: 10px; 
                            border-bottom: 1px solid ${t.itemBorder}; 
                            color: ${theme === 'light' ? '#374151' : '#d1d5db'}; 
                            display: flex; 
                            align-items: center; 
                        }
                        .idx { 
                            width: 30px; 
                            color: ${t.textSec}; 
                            text-align: center;
                        }
                        .footer { 
                            margin-top: 40px; 
                            border-top: 1px solid ${t.footerBorder}; 
                            padding-top: 20px; 
                            color: ${t.textSec}; 
                            font-size: 12px; 
                            display: flex; 
                            justify-content: space-between; 
                        }
                    </style>
                </head>
                <body>
                    <div style="text-align: right;">
                        <h1>${event.title}</h1>
                        <p class="type">${event.type}</p>
                        
                        <div class="cards">
                            <div class="card">
                                <div class="label">التاريخ</div>
                                <div class="value">${event.formattedDate}</div>
                            </div>
                            <div class="card">
                                <div class="label">الوقت</div>
                                <div class="value">${event.time}</div>
                            </div>
                            <div class="card">
                                <div class="label">المكان</div>
                                <div class="value">${event.venue}</div>
                            </div>
                            <div class="card">
                                <div class="label">الحالة</div>
                                <span class="status-badge" style="background: ${statusBg}; color: ${statusTextColor};">
                                    ${event.status}
                                </span>
                            </div>
                        </div>

                        <h3>الطلاب المشاركون (${event.studentsCount})</h3>
                        <div class="list">
                            ${studentsListHtml}
                        </div>

                        <div class="footer">
                             <span>تم استخراج التقرير آلياً</span>
                             <span style="font-family: monospace;">ID: ${event.id}</span>
                        </div>
                    </div>
                </body>
                </html>
            `);
            doc.close();

            await new Promise(r => setTimeout(r, 100));

            // 3. Capture Iframe Body
            const canvas = await html2canvas(doc.body, {
                scale: 2,
                useCORS: true,
                backgroundColor: t.bg,
                logging: false,
                windowWidth: 800,
                windowHeight: 1200
            });

            // 4. Clean up
            document.body.removeChild(iframe);

            // OPTIMIZATION: JPEG 0.75 quality reduction
            const imgData = canvas.toDataURL('image/jpeg', 0.70);
            const imgWidth = 595.28;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            const pdf = new jsPDF('p', 'pt', 'a4');
            // 'FAST' compression
            pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
            pdf.save(`Activity_${event.title}_${theme}.pdf`);

            toast.success("تم تحميل تقرير النشاط", { id: toastId });
        } catch (error) {
            console.error("PDF Fail:", error);
            toast.error("فشل في إنشاء ملف PDF", { id: toastId });
        }
    };

    // --- Archive Handling ---
    const handleRestore = async () => {
        if (!selectedEvent) return;
        const confirm = window.confirm("هل أنت متأكد من استعادة هذا النشاط؟ سيتم تغيير حالته إلى 'مكتمل'.");
        if (!confirm) return;

        const toastId = toast.loading("جاري الاستعادة...");
        try {
            await updateDoc(doc(db, 'events', selectedEvent.id), { status: 'Done' });
            toast.success("تم استعادة النشاط بنجاح", { id: toastId });
            setSelectedEvent(null);
            fetchData(); // Refresh list
        } catch (e) {
            console.error(e);
            toast.error("فشل في الاستعادة", { id: toastId });
        }
    };

    const handleForceDelete = async () => {
        if (!selectedEvent) return;
        const confirm = window.confirm("تحذير: هذا إجراء نهائي!\n\nسيتم حذف النشاط تماماً من السجلات وسحب النقاط (10 نقاط) من جميع الطلاب المشاركين.\n\nهل أنت متأكد؟");
        if (!confirm) return;

        const toastId = toast.loading("جاري الحذف وسحب النقاط...");
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', selectedEvent.id);

                // 1. Deduct Points
                if (selectedEvent.rawParticipatingStudents && selectedEvent.rawParticipatingStudents.length > 0) {
                    for (const studentId of selectedEvent.rawParticipatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, { totalPoints: increment(-10) });
                    }
                }

                // 2. Delete Event
                transaction.delete(eventRef);
            });

            toast.success("تم الحذف وسحب النقاط بنجاح", { id: toastId });
            setSelectedEvent(null);
            fetchData();
        } catch (e) {
            console.error(e);
            toast.error("فشل في الحذف", { id: toastId });
        }
    };

    return (
        <div className="font-cairo space-y-6 h-full flex flex-col pb-20">
            {/* ... (Header & Sidebar remain same) ... */}

            {/* Header */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">منشئ التقارير المتقدم</h1>
                    <p className="text-gray-400 text-sm">تصدير، طباعة، وتحليل البيانات</p>
                </div>
                <button
                    onClick={generateBulkPDF}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center transition-all transform hover:scale-105"
                >
                    <Download className="ml-2" size={20} /> تقرير شامل (PDF)
                </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6 min-h-0 overflow-hidden">

                {/* Sidebar Controls */}
                <div className="md:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto custom-scrollbar">
                    <h3 className="font-bold text-white mb-4 flex items-center"><Filter size={18} className="ml-2 text-indigo-400" /> لوحة التحكم</h3>

                    {/* Tab Switcher */}
                    <div className="space-y-2 mb-8">
                        <button onClick={() => activeTab !== 'activities' && setActiveTab('activities')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'activities' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Calendar size={18} className="ml-2" /> سجل الأنشطة
                        </button>
                        <button onClick={() => activeTab !== 'students' && setActiveTab('students')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'students' ? 'bg-emerald-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Users size={18} className="ml-2" /> قائمة الطلاب
                        </button>
                        <button onClick={() => activeTab !== 'assets' && setActiveTab('assets')} className={`w-full p-3 rounded-xl flex items-center transition-all ${activeTab === 'assets' ? 'bg-amber-600 text-white shadow-lg' : 'hover:bg-white/5 text-gray-400'}`}>
                            <Box size={18} className="ml-2" /> جرد الموارد
                        </button>
                    </div>

                    {/* --- ACTIVITIES FILTERS --- */}
                    {activeTab === 'activities' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الفترة الزمنية</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="date" className="bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs"
                                        value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                                    <input type="date" className="bg-black/40 border border-white/10 rounded-xl px-2 py-2 text-white text-xs"
                                        value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                                </div>
                            </div>

                            <MultiSelect
                                label="أنواع الأنشطة"
                                placeholder="اختر الأنواع..."
                                options={eventTypes.map(t => ({ label: t.name, value: t.name }))}
                                selectedValues={selectedTypes}
                                onChange={setSelectedTypes}
                                icon={Filter}
                            />

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">المكان / Venue</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={venueFilter} onChange={e => setVenueFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="Auditorium">المسرح</option>
                                    <option value="Gym">الصالة الرياضية</option>
                                    <option value="Playground">الملعب</option>
                                    <option value="Lab">المعمل</option>
                                </select>
                            </div>

                            <div className="pt-4 border-t border-white/10">
                                <label className="block text-indigo-300 text-sm font-bold mb-2">خيارات التقرير</label>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${reportOptions.showStudents ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500 bg-white/5'}`}>
                                            {reportOptions.showStudents && <CheckSquare size={14} className="text-white" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={reportOptions.showStudents} onChange={e => setReportOptions({ ...reportOptions, showStudents: e.target.checked })} />
                                        <span className="text-gray-400 text-sm group-hover:text-white">إظهار قائمة الطلاب</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- STUDENTS FILTERS --- */}
                    {activeTab === 'students' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الصف</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSectionFilter(''); }}>
                                    <option value="">الكل</option>
                                    {Object.keys(classes || {}).map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>

                            {gradeFilter && (
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">الشعبة</label>
                                    <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                        value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                                        <option value="">الكل</option>
                                        {classes[gradeFilter]?.sections?.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">التخصص</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={specFilter} onChange={e => setSpecFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="General">عام</option>
                                    {eventTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-1">نطاق النقاط</label>
                                <div className="flex items-center gap-2">
                                    <input type="number" placeholder="min" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-xs"
                                        value={pointsRange.min} onChange={e => setPointsRange({ ...pointsRange, min: Number(e.target.value) })} />
                                    <span className="text-gray-500">-</span>
                                    <input type="number" placeholder="max" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-white text-xs"
                                        value={pointsRange.max} onChange={e => setPointsRange({ ...pointsRange, max: Number(e.target.value) })} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- ASSETS FILTERS --- */}
                    {activeTab === 'assets' && (
                        <div className="space-y-4 animate-fade-in mb-8">
                            <div>
                                <label className="block text-gray-400 text-sm mb-1">الحالة</label>
                                <select className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none"
                                    value={assetStatusFilter} onChange={e => setAssetStatusFilter(e.target.value)}>
                                    <option value="All">الكل</option>
                                    <option value="Available">متاح (Available)</option>
                                    <option value="Maintenance">صيانة (Maintenance)</option>
                                    <option value="In Use">قيد الاستخدام (In Use)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Actions Section */}
                    <div className="border-t border-white/10 pt-4 space-y-3">
                        <h4 className="text-gray-400 text-sm mb-2 font-bold">إجراءات سريعة</h4>

                        {activeTab === 'students' && (
                            <button
                                onClick={() => {
                                    if (!gradeFilter || !sectionFilter) {
                                        toast.error("الرجاء اختيار الصف والشعبة أولاً من شريط التصفية بالأعلى");
                                        return;
                                    }
                                    const titleStr = `تقرير فصل ${gradeFilter} - ${sectionFilter}`;
                                    // Generate PDF for just these students
                                    // We can reuse generateBulkPDF but we need to ensure it uses the filtered data
                                    if (previewData.length === 0) {
                                        toast.error("لا يوجد طلاب في القائمة الحالية");
                                        return;
                                    }
                                    generateBulkPDF();
                                }}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow transition-all flex items-center justify-center gap-2"
                            >
                                <Printer size={18} />
                                طباعة تقرير الفصل المحدد
                            </button>
                        )}

                        <button onClick={generateBulkPDF} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg transition-all flex items-center justify-center group">
                            <Download size={18} className="ml-2 group-hover:scale-110 transition-transform" />
                            تحميل التقرير المعروض (PDF)
                        </button>

                        <div className="bg-white/5 p-3 rounded-xl text-xs text-gray-400 leading-relaxed mt-4">
                            <span className="text-indigo-400 font-bold block mb-1">تلميح:</span>
                            استخدم خيارات "تصفية النتائج" في الأعلى لتخصيص محتوى التقرير قبل الطباعة.
                        </div>
                    </div>
                </div>

                {/* Live Preview */}
                <div className="md:col-span-3 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col overflow-hidden shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white flex items-center"><Printer size={18} className="ml-2 text-indigo-400" /> معاينة البيانات ({previewData.length} سجل)</h3>
                        {loading && <span className="text-indigo-400 text-sm animate-pulse flex items-center gap-2">جاري التحميل...</span>}
                    </div>

                    <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5">
                        <table className="w-full min-w-[700px] text-right text-sm">
                            <thead className="bg-[#1a1a20] text-gray-400 sticky top-0 backdrop-blur-md shadow-md z-10">
                                <tr>
                                    {activeTab === 'activities' && (
                                        <>
                                            <th className="p-4">النشاط</th>
                                            <th className="p-4">التاريخ</th>
                                            <th className="p-4">المكان</th>
                                            <th className="p-4">الحالة</th>
                                            <th className="p-4 text-center">عدد الطلاب</th>
                                            <th className="p-4 text-center">إجراءات</th>
                                            <th className="p-4"></th>
                                        </>
                                    )}
                                    {activeTab === 'students' && (
                                        <>
                                            <th className="p-4">#</th>
                                            <th className="p-4">الطالب</th>
                                            <th className="p-4">التخصصات</th>
                                            <th className="p-4">الفصل</th>
                                            <th className="p-4">النقاط</th>
                                        </>
                                    )}
                                    {activeTab === 'assets' && (
                                        <>
                                            <th className="p-4">المورد</th>
                                            <th className="p-4">النوع</th>
                                            <th className="p-4">الحالة الحالية</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="text-gray-300 divide-y divide-white/5">
                                {previewData.length === 0 ? (
                                    <tr><td colSpan="6" className="p-12 text-center text-gray-500">لا توجد بيانات للعرض حالياً</td></tr>
                                ) : (
                                    previewData.map((row, idx) => (
                                        <tr key={row.id || idx}
                                            onClick={() => activeTab === 'activities' && setSelectedEvent(row)}
                                            className={`hover:bg-white/5 transition-colors ${activeTab === 'activities' ? 'cursor-pointer' : ''}`}
                                        >
                                            {activeTab === 'activities' && (
                                                <>
                                                    <td className="p-4 font-bold text-white max-w-[150px] truncate flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                        {row.title}
                                                    </td>
                                                    <td className="p-4 text-gray-400">
                                                        <div className="text-white">{row.formattedDate}</div>
                                                        <div className="text-xs opacity-60">{row.time}</div>
                                                    </td>
                                                    <td className="p-4">{row.venue}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${row.status === 'مكتمل' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        <span className="bg-white/10 px-2 py-1 rounded-md text-white font-mono">{row.studentsCount}</span>
                                                    </td>
                                                    <td className="p-4 flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditClick(row); }}
                                                            className="p-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-lg transition-all"
                                                            title="تعديل النشاط"
                                                        >
                                                            <Pen size={16} />
                                                        </button>
                                                    </td>

                                                    <td className="p-4 text-center">
                                                        <button className="text-indigo-400 hover:text-white p-1"><Eye size={16} /></button>
                                                    </td>
                                                </>
                                            )}
                                            {activeTab === 'students' && (
                                                <>
                                                    <td className="p-4 text-gray-500">{idx + 1}</td>
                                                    <td className="p-4 font-bold text-white">{row.name}</td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {row.specializations && row.specializations.length > 0 ? (
                                                                row.specializations.map((spec, i) => (
                                                                    <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-bold border ${spec === 'General' ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-indigo-900/50 text-indigo-300 border-indigo-500/30'}`}>
                                                                        {spec === 'General' ? 'عام' : spec}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-gray-600 text-xs">-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4">{row.class}</td>
                                                    <td className="p-4 font-bold text-emerald-400">{row.points}</td>
                                                </>
                                            )}
                                            {activeTab === 'assets' && (
                                                <>
                                                    <td className="p-4 font-bold text-white">{row.name}</td>
                                                    <td className="p-4">{row.type}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs ${row.status === 'Available' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                            {row.status}
                                                        </span>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* --- Event Details Modal --- */}
            {
                selectedEvent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                        <div className="bg-[#1a1a20] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
                            {/* Modal Header */}
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">{selectedEvent.title}</h2>
                                    <p className="text-indigo-300 text-xs mt-1">{selectedEvent.type}</p>
                                </div>
                                <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-full hover:bg-white/10 transition-all"><X size={20} /></button>
                            </div>

                            {/* VISIBLE MODAL CONTENT */}
                            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 bg-[#1a1a20] rounded-b-2xl">
                                {/* Key Details Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">التاريخ</div>
                                        <div className="text-white font-bold text-sm">{selectedEvent.formattedDate}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">الوقت</div>
                                        <div className="text-white font-bold text-sm">{selectedEvent.time}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">المكان</div>
                                        <div className="text-white font-bold text-sm truncate">{selectedEvent.venue}</div>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-center">
                                        <div className="text-gray-400 text-xs mb-1">الحالة</div>
                                        <div className={`text-xs font-bold px-2 py-1 rounded inline-block mt-1 ${selectedEvent.status === 'مكتمل' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                            {selectedEvent.status}
                                        </div>
                                    </div>
                                </div>
                                {/* Students List */}
                                <div>
                                    <h3 className="text-white font-bold mb-3 flex items-center justify-between">
                                        <span className="flex items-center"><Users size={16} className="ml-2 text-emerald-400" /> الطلاب المشاركون ({selectedEvent.studentsCount})</span>
                                    </h3>
                                    <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                                        {selectedEvent.studentNames.length > 0 ? (
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-white/5">
                                                {selectedEvent.studentNames.map((name, idx) => (
                                                    <div key={idx} className="p-3 text-sm text-gray-300 flex items-center hover:bg-white/5">
                                                        <span className="w-8 text-center text-gray-500 text-xs">{idx + 1}</span>
                                                        {name}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center text-gray-500 text-sm">لم يتم تسجيل أي طلاب في هذا النشاط</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="p-6 border-t border-white/10 bg-black/20 flex flex-col md:flex-row justify-between items-center gap-4">
                                <span className="text-gray-500 text-xs hidden md:block">رقم المعرف: <span className="font-mono select-all">{selectedEvent.id}</span></span>

                                <div className="flex flex-wrap justify-end gap-3 w-full md:w-auto">

                                    {/* ARCHIVE CONTROLS */}
                                    {selectedEvent.rawStatus === 'archived' && (
                                        <>
                                            <button
                                                onClick={handleForceDelete}
                                                className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 rounded-xl font-bold flex items-center transition-all text-sm"
                                            >
                                                <Trash2 size={16} className="ml-2" /> حذف
                                            </button>
                                            <button
                                                onClick={handleRestore}
                                                className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 rounded-xl font-bold flex items-center transition-all text-sm"
                                            >
                                                <RefreshCw size={16} className="ml-2" /> استعادة
                                            </button>
                                            <div className="hidden md:block w-px h-8 bg-gray-700 mx-1"></div>
                                        </>
                                    )}

                                    <PrintControls event={selectedEvent} onPrint={generateSingleEventPDF} />

                                    <button
                                        onClick={() => setSelectedEvent(null)}
                                        className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-colors"
                                    >
                                        إغلاق
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            <EventModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                initialData={editEventData}
                onSave={handleSaveEditedEvent}
                onDelete={handleDeleteEvent}
                eventTypes={eventTypes}
                activeProfile={activeProfile}
            />
        </div>
    );
}

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { Plus, Trash2, Box, Tag, MapPin, Edit3, Save, Clock, FileText, X, AlertTriangle, Power, CheckCircle, PenTool, Loader2, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from '../components/ui/ConfirmModal';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function AssetsPage() {
    const [activeTab, setActiveTab] = useState('equipment'); // equipment | venues

    // --- Equipment State ---
    const [assets, setAssets] = useState([]);
    const [newAsset, setNewAsset] = useState({ name: '', type: 'إلكترونيات', status: 'Available' });
    const [editingAssetId, setEditingAssetId] = useState(null); // For Add/Edit Modal
    const [editingAsset, setEditingAsset] = useState(null); // For Details Modal
    const [assetHistory, setAssetHistory] = useState([]);

    // --- Venues State ---
    const [venues, setVenues] = useState([]);
    const [newVenue, setNewVenue] = useState({ name: '', capacity: 30, type: 'فصل دراسي', status: 'Available' });
    const [editingVenue, setEditingVenue] = useState(null); // For Add/Edit Form
    const [viewingVenue, setViewingVenue] = useState(null); // For Details Modal
    const [venueHistory, setVenueHistory] = useState([]);

    // --- Modals State ---
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- Localization Maps ---
    const ASSET_TYPES = [
        { val: 'إلكترونيات', label: 'إلكترونيات' },
        { val: 'أثاث', label: 'أثاث' },
        { val: 'رياضة', label: 'أدوات رياضية' },
        { val: 'أخرى', label: 'أخرى' }
    ];

    const VENUE_TYPES = [
        { val: 'فصل دراسي', label: 'فصل دراسي' },
        { val: 'قاعة', label: 'قاعة / مسرح' },
        { val: 'معمل', label: 'معمل' },
        { val: 'ساحة خارجية', label: 'ساحة خارجية' }
    ];

    const VENUE_STATUS_OPTIONS = [
        { val: 'Available', label: 'متاح', color: 'emerald' },
        { val: 'Maintenance', label: 'تحت الصيانة', color: 'amber' },
        { val: 'Closed', label: 'مغلق', color: 'red' }
    ];

    useEffect(() => {
        fetchAssets();
        fetchVenues();
    }, []);

    // --- Fetch Logic ---
    async function fetchAssets() {
        const snap = await getDocs(collection(db, 'assets'));
        setAssets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    async function fetchVenues() {
        const snap = await getDocs(collection(db, 'venues'));
        setVenues(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // --- Equipment Handlers ---
    const openAddAsset = () => {
        setEditingAssetId(null);
        setNewAsset({ name: '', type: 'إلكترونيات', status: 'Available' });
        setIsAddModalOpen(true);
    };

    const openEditAsset = (asset) => {
        setEditingAssetId(asset.id);
        setNewAsset({ name: asset.name, type: asset.type, status: asset.status });
        setIsAddModalOpen(true);
    };

    async function handleAddAsset(e) {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editingAssetId) {
                await updateDoc(doc(db, 'assets', editingAssetId), newAsset);
                toast.success('تم تحديث الأصل بنجاح');
            } else {
                await addDoc(collection(db, 'assets'), newAsset);
                toast.success('تمت إضافة الأصل بنجاح');
            }
            setNewAsset({ name: '', type: 'إلكترونيات', status: 'Available' });
            setEditingAssetId(null);
            setIsAddModalOpen(false);
            fetchAssets();
        } catch (error) { toast.error('حدث خطأ'); }
        setIsSubmitting(false);
    }

    const confirmDeleteAsset = (id) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف الأصل",
            message: "هل أنت متأكد من حذف هذا المورد نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
            isDestructive: true,
            onConfirm: () => handleDeleteAsset(id)
        });
    };

    async function handleDeleteAsset(id) {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
            await deleteDoc(doc(db, 'assets', id));
            setAssets(assets.filter(a => a.id !== id));
            toast.success('تم الحذف');
        } catch (error) { toast.error('فشل الحذف'); }
    }

    const toggleAssetStatus = async (asset, e) => {
        e.stopPropagation();
        const newStatus = asset.status === 'Available' ? 'Maintenance' : 'Available';
        // Optimistic update
        const updatedList = assets.map(a => a.id === asset.id ? { ...a, status: newStatus } : a);
        setAssets(updatedList);

        try {
            await updateDoc(doc(db, 'assets', asset.id), { status: newStatus });
            toast.success(newStatus === 'Available' ? 'تم تفعيل المورد' : 'تم وضع المورد في الصيانة');
        } catch (err) {
            toast.error("فشل تحديث الحالة");
            fetchAssets(); // Revert
        }
    };

    // Asset Details Modal Logic
    const openAssetDetails = async (asset) => {
        setEditingAsset(asset);
        try {
            const q = query(
                collection(db, 'events'),
                where('assets', 'array-contains', asset.id),
                orderBy('startTime', 'desc')
            );
            const snap = await getDocs(q);
            setAssetHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            setAssetHistory([]);
        }
    };

    const saveAssetNotes = async () => {
        if (!editingAsset) return;
        try {
            await updateDoc(doc(db, 'assets', editingAsset.id), { notes: editingAsset.notes || '' });
            toast.success("تم حفظ الملاحظات");
            fetchAssets();
        } catch (e) { toast.error("فشل الحفظ"); }
    };

    // --- PDF Generation Logic ---
    const generateAssetPDF = async () => {
        if (!editingAsset) return;
        const toastId = toast.loading("جاري تحضير التقرير...");

        // Create Iframe sandbox
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.width = '210mm'; // A4 width
        iframe.style.minHeight = '297mm'; // A4 height
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow.document;

        // Content
        const htmlContent = `
            <html dir="rtl" lang="ar">
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
                    .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #4f46e5; font-size: 24px; }
                    .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
                    
                    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
                    .label { color: #64748b; font-size: 12px; margin-bottom: 4px; display: block; }
                    .value { font-size: 16px; font-weight: bold; color: #0f172a; }
                    
                    .status-available { color: #10b981; }
                    .status-maintenance { color: #ef4444; }

                    .section-title { font-size: 18px; font-weight: bold; margin: 30px 0 15px; border-right: 4px solid #4f46e5; padding-right: 10px; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
                    th { background: #f1f5f9; padding: 12px; text-align: right; color: #475569; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
                    tr:last-child td { border-bottom: none; }
                    
                    .notes-box { background: #fffbeb; border: 1px solid #fcd34d; padding: 15px; border-radius: 8px; color: #92400e; line-height: 1.6; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>تقرير تفصيلي عن الأصل</h1>
                    <p>نظام إدارة الأنشطة المدرسية</p>
                </div>

                <div class="card">
                    <table style="border: none;">
                        <tr style="border: none;">
                            <td style="border: none; padding: 0 0 15px 20px;">
                                <span class="label">اسم المورد</span>
                                <div class="value">${editingAsset.name}</div>
                            </td>
                            <td style="border: none; padding: 0;">
                                <span class="label">النوع</span>
                                <div class="value">${editingAsset.type}</div>
                            </td>
                        </tr>
                        <tr style="border: none;">
                            <td style="border: none; padding: 0;">
                                <span class="label">الحالة الحالية</span>
                                <div class="value ${editingAsset.status === 'Available' ? 'status-available' : 'status-maintenance'}">
                                    ${editingAsset.status === 'Available' ? 'متاح للاستخدام' : 'تحت الصيانة'}
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                ${editingAsset.notes ? `
                    <div class="section-title">الملاحظات والمشكلات المسجلة</div>
                    <div class="notes-box">
                        ${editingAsset.notes}
                    </div>
                ` : ''}

                <div class="section-title">سجل الاستخدام والأنشطة</div>
                <table>
                    <thead>
                        <tr>
                            <th>اسم النشاط</th>
                            <th>المكان</th>
                            <th>التاريخ</th>
                            <th>الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${assetHistory.length > 0 ? assetHistory.map(evt => `
                            <tr>
                                <td>${evt.title}</td>
                                <td>${evt.venueId}</td>
                                <td style="direction: ltr; text-align: right;">${evt.startTime?.toDate().toLocaleDateString('en-GB')}</td>
                                <td>${evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>
                        `).join('') : `
                            <tr>
                                <td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">لا يوجد سجل استخدام لهذا الأصل حتى الآن</td>
                            </tr>
                        `}
                    </tbody>
                </table>
                
                <div style="margin-top: 50px; text-align: left; opacity: 0.5; font-size: 10px;">
                    تم إصدار التقرير بتاريخ: ${new Date().toLocaleDateString('ar-SA')}
                </div>
            </body>
            </html>
        `;

        doc.open();
        doc.write(htmlContent);
        doc.close();

        // Wait for render (fonts etc)
        setTimeout(async () => {
            try {
                const canvas = await html2canvas(doc.body, { scale: 2 });
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                pdf.save(`Asset_Report_${editingAsset.name.replace(/\s+/g, '_')}.pdf`);

                toast.success("تم تحميل التقرير", { id: toastId });
            } catch (err) {
                console.error(err);
                toast.error("فشل إنشاء PDF", { id: toastId });
            } finally {
                document.body.removeChild(iframe);
            }
        }, 1000);
    };

    // --- Venues Handlers ---
    // --- Venue Handlers ---
    async function handleSaveVenue(e) {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editingVenue?.id) {
                await updateDoc(doc(db, 'venues', editingVenue.id), newVenue);
                toast.success('تم تحديث بيانات القاعة');
            } else {
                await addDoc(collection(db, 'venues'), { ...newVenue, status: newVenue.status || 'Available' });
                toast.success('تمت إضافة القاعة بنجاح');
            }
            setNewVenue({ name: '', capacity: 30, type: 'فصل دراسي', status: 'Available' });
            setEditingVenue(null);
            setIsAddModalOpen(false);
            fetchVenues();
        } catch (error) { toast.error('حدث خطأ'); }
        setIsSubmitting(false);
    }

    const openEditVenue = (venue) => {
        setEditingVenue(venue);
        setNewVenue({ name: venue.name, capacity: venue.capacity, type: venue.type, status: venue.status || 'Available' });
        setIsAddModalOpen(true);
    };

    const openAddVenue = () => {
        setEditingVenue(null);
        setNewVenue({ name: '', capacity: 30, type: 'فصل دراسي', status: 'Available' });
        setIsAddModalOpen(true);
    }

    const toggleVenueStatus = async (venue, e) => {
        e.stopPropagation();
        // Cycle: Available -> Maintenance -> Closed -> Available
        let newStatus = 'Available';
        if (venue.status === 'Available' || !venue.status) newStatus = 'Maintenance';
        else if (venue.status === 'Maintenance') newStatus = 'Closed';
        else newStatus = 'Available';

        // Optimistic update
        const updatedList = venues.map(v => v.id === venue.id ? { ...v, status: newStatus } : v);
        setVenues(updatedList);

        try {
            await updateDoc(doc(db, 'venues', venue.id), { status: newStatus });
            const msg = newStatus === 'Available' ? 'متاح' : (newStatus === 'Maintenance' ? 'تحت الصيانة' : 'مغلق');
            toast.success(`تم تغيير الحالة إلى: ${msg}`);
        } catch (err) {
            toast.error("فشل تحديث الحالة");
            fetchVenues();
        }
    };

    // Venue Details & Notes
    const openVenueDetails = async (venue) => {
        setViewingVenue(venue);
        try {
            const q = query(
                collection(db, 'events'),
                where('venueId', '==', venue.id), // Assuming venueId stores ID, check scheme
                // Wait, existing system stores venue Name typically in 'venueId' field for historical reasons?
                // Actually the planner stores 'venueId' as the VALUE from SELECT, which is name currently.
                // Let's check Scheduler.jsx. Yes, value is name. 
                // BUT we should support ID migration later. For now let's query by name OR ID if possible.
                // Actually in Scheduler it sets venueId to name. So we query by 'venueId' == venue.name
                where('venueId', '==', venue.name),
                orderBy('startTime', 'desc')
            );
            // Also need to check if we store ID now?

            const snap = await getDocs(q);
            setVenueHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
            setVenueHistory([]);
        }
    };

    const saveVenueNotes = async () => {
        if (!viewingVenue) return;
        try {
            await updateDoc(doc(db, 'venues', viewingVenue.id), { notes: viewingVenue.notes || '' });
            toast.success("تم حفظ الملاحظات");
            fetchVenues();
        } catch (e) { toast.error("فشل الحفظ"); }
    };

    const generateVenuePDF = async () => {
        if (!viewingVenue) return;
        const toastId = toast.loading("جاري تحضير التقرير...");

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed'; iframe.style.left = '-9999px';
        iframe.style.width = '210mm'; iframe.style.minHeight = '297mm';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const statusLabel = VENUE_STATUS_OPTIONS.find(o => o.val === (viewingVenue.status || 'Available'))?.label;
        const statusColor = VENUE_STATUS_OPTIONS.find(o => o.val === (viewingVenue.status || 'Available'))?.color;

        const htmlContent = `
            <html dir="rtl" lang="ar">
            <head>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body { font-family: 'Cairo', sans-serif; padding: 40px; color: #1a1a1a; background: #fff; }
                    .header { text-align: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #4f46e5; font-size: 24px; }
                    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
                    .label { color: #64748b; font-size: 12px; }
                    .value { font-size: 16px; font-weight: bold; color: #0f172a; }
                    .status-emerald { color: #10b981; } .status-amber { color: #d97706; } .status-red { color: #ef4444; }
                    .section-title { font-size: 18px; font-weight: bold; margin: 30px 0 15px; border-right: 4px solid #4f46e5; padding-right: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
                    th { background: #f1f5f9; padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; }
                    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
                    .notes-box { background: #fffbeb; border: 1px solid #fcd34d; padding: 15px; border-radius: 8px; color: #92400e; }
                </style>
            </head>
            <body>
                <div class="header"><h1>تقرير عن القاعة / المكان</h1><p>نظام إدارة الأنشطة</p></div>
                <div class="card">
                    <table style="border: none;">
                        <tr style="border: none;">
                            <td style="border: none;">
                                <span class="label">اسم المكان</span><div class="value">${viewingVenue.name}</div>
                            </td>
                            <td style="border: none;">
                                <span class="label">السعة</span><div class="value">${viewingVenue.capacity} مقعد</div>
                            </td>
                            <td style="border: none;">
                                <span class="label">الحالة</span>
                                <div class="value status-${statusColor}">${statusLabel}</div>
                            </td>
                        </tr>
                    </table>
                </div>
                ${viewingVenue.notes ? `<div class="section-title">ملاحظات</div><div class="notes-box">${viewingVenue.notes}</div>` : ''}
                <div class="section-title">سجل الأنشطة في هذا المكان</div>
                <table>
                    <thead><tr><th>النشاط</th><th>التاريخ</th><th>الوقت</th></tr></thead>
                    <tbody>
                        ${venueHistory.length > 0 ? venueHistory.map(evt => `
                            <tr>
                                <td>${evt.title}</td>
                                <td style="direction: ltr; text-align: right;">${evt.startTime?.toDate().toLocaleDateString('en-GB')}</td>
                                <td>${evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>`).join('') : '<tr><td colspan="3" style="text-align: center; padding: 20px;">لا يوجد سجل نشاط</td></tr>'}
                    </tbody>
                </table>
                <div style="margin-top: 50px; opacity: 0.5; font-size: 10px;">${new Date().toLocaleDateString('ar-SA')}</div>
            </body>
            </html>
        `;

        doc.open(); doc.write(htmlContent); doc.close();
        setTimeout(async () => {
            try {
                const canvas = await html2canvas(doc.body, { scale: 2 });
                const imgData = canvas.toDataURL('image/jpeg', 0.9);
                const pdf = new jsPDF('p', 'mm', 'a4');
                const imgProps = pdf.getImageProperties(imgData);
                const pdfHeight = (imgProps.height * pdf.internal.pageSize.getWidth()) / imgProps.width;
                pdf.addImage(imgData, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdfHeight);
                pdf.save(`Venue_Report_${viewingVenue.name}.pdf`);
                toast.success("تم");
            } catch (e) { toast.error("بفشل"); }
            finally { document.body.removeChild(iframe); }
        }, 1000);
    };

    const confirmDeleteVenue = (id) => {
        setConfirmModal({
            isOpen: true,
            title: "حذف القاعة",
            message: "حذف القاعة قد يؤثر على الأنشطة المجدولة فيها حالياً. هل ترغب بالاستمرار؟",
            isDestructive: true,
            onConfirm: () => handleDeleteVenue(id)
        });
    };

    async function handleDeleteVenue(id) {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
            await deleteDoc(doc(db, 'venues', id));
            setVenues(venues.filter(v => v.id !== id));
            toast.success('تم الحذف');
        } catch (error) { toast.error('فشل الحذف'); }
    }


    return (
        <div className="space-y-6 font-cairo h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">إدارة الموارد والأماكن</h1>
                    <p className="text-indigo-200">تتبع الأجهزة، القاعات، وسجلات الاستخدام</p>
                </div>
                <div className="flex space-x-2 space-x-reverse bg-black/20 p-1 rounded-xl mt-4 md:mt-0">
                    <button onClick={() => setActiveTab('equipment')} className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'equipment' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>العهد والأدوات</button>
                    <button onClick={() => setActiveTab('venues')} className={`px-4 py-2 rounded-lg transition-all ${activeTab === 'venues' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>إدارة الأماكن</button>
                </div>
            </div>

            {/* Sub-Header Actions */}
            <div className="flex justify-end">
                <button
                    onClick={activeTab === 'venues' ? openAddVenue : openAddAsset}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl shadow-lg transition-all flex items-center shadow-indigo-500/20 font-bold"
                >
                    <Plus className="ml-2" size={20} />
                    {activeTab === 'equipment' ? 'إضافة أصل جديد' : 'إضافة مكان جديد'}
                </button>
            </div>

            {/* TAB CONTENT: EQUIPMENT */}
            {activeTab === 'equipment' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in pb-10">
                    {assets.map(asset => (
                        <div
                            key={asset.id}
                            onClick={() => openAssetDetails(asset)}
                            className={`bg-white/5 backdrop-blur-md border rounded-2xl p-6 transition-all group relative cursor-pointer hover:bg-white/10 ${asset.status === 'Maintenance' ? 'border-red-500/30 bg-red-900/10' : 'border-white/10 hover:border-indigo-500/50'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl ${asset.status === 'Maintenance' ? 'bg-red-500/20 text-red-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                                    {asset.status === 'Maintenance' ? <AlertTriangle size={24} /> : <Box size={24} />}
                                </div>

                                {/* Status Toggle */}
                                <button
                                    onClick={(e) => toggleAssetStatus(asset, e)}
                                    className={`flex items-center space-x-2 space-x-reverse px-3 py-1 rounded-full text-xs font-bold border transition-colors ${asset.status === 'Available'
                                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                                        : 'bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20'
                                        }`}
                                    title="تبديل الحالة"
                                >
                                    {asset.status === 'Available' ? <CheckCircle size={12} className="ml-1" /> : <Power size={12} className="ml-1" />}
                                    {asset.status === 'Available' ? 'متاح' : 'صيانة'}
                                </button>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{asset.name}</h3>
                            <div className="flex items-center text-gray-400 text-sm mb-6">
                                <Tag size={16} className="ml-2" />
                                {asset.type}
                            </div>
                            <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs text-gray-500">
                                <span>انقر للتفاصيل</span>
                                <div className="flex space-x-2 space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openEditAsset(asset); }}
                                        className="text-indigo-400 hover:text-indigo-300 p-2 rounded-lg hover:bg-indigo-500/10"
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); confirmDeleteAsset(asset.id); }}
                                        className="text-red-400 hover:text-red-300 p-2 rounded-lg hover:bg-red-500/10"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {assets.length === 0 && <div className="col-span-full text-center py-20 text-gray-500">لا يوجد أصول مسجلة</div>}
                </div>
            )}

            {/* TAB CONTENT: VENUES */}
            {activeTab === 'venues' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in pb-10">
                    {venues.map(venue => (
                        <div
                            key={venue.id}
                            onClick={() => openVenueDetails(venue)}
                            className={`bg-white/5 backdrop-blur-md border rounded-2xl p-6 transition-all group relative cursor-pointer hover:bg-white/10 ${venue.status === 'Maintenance' || venue.status === 'Closed' ? 'border-red-500/30 bg-red-900/10' : 'border-white/10 hover:border-purple-500/50'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl ${venue.status === 'Available' || !venue.status ? 'bg-purple-500/20 text-purple-300' : 'bg-red-500/20 text-red-300'}`}>
                                    <MapPin size={24} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`bg-purple-500/10 text-purple-300 border border-purple-500/20 px-3 py-1 rounded-full text-xs font-bold`}>
                                        {venue.capacity} مقعد
                                    </span>
                                    {/* Status Toggle */}
                                    <button
                                        onClick={(e) => toggleVenueStatus(venue, e)}
                                        className={`flex items-center space-x-2 space-x-reverse px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${!venue.status || venue.status === 'Available'
                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                                            : (venue.status === 'Maintenance'
                                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20 hover:bg-amber-500/20'
                                                : 'bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20')
                                            }`}
                                        title="تغيير الحالة (متاح -> صيانة -> مغلق)"
                                    >
                                        {(!venue.status || venue.status === 'Available') && <CheckCircle size={14} />}
                                        {venue.status === 'Maintenance' && <PenTool size={14} />}
                                        {venue.status === 'Closed' && <X size={14} />}
                                    </button>
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{venue.name}</h3>
                            <div className="text-gray-400 text-sm mb-6">
                                {venue.type}
                            </div>
                            <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs text-gray-500">
                                <span>انقر للتفاصيل</span>
                                <div className="flex space-x-2 space-x-reverse opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openEditVenue(venue); }}
                                        className="text-indigo-400 hover:text-indigo-300 p-2 hover:bg-indigo-500/10 rounded-lg"
                                    >
                                        <Edit3 size={20} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); confirmDeleteVenue(venue.id); }}
                                        className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-lg"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {venues.length === 0 && <div className="col-span-full text-center py-20 text-gray-500">لا يوجد قاعات مسجلة</div>}
                </div>
            )}

            {/* --- ADD MODAL --- */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-in">
                        <h3 className="text-xl font-bold text-white mb-6 underline decoration-indigo-500">
                            {activeTab === 'equipment'
                                ? (editingAssetId ? 'تعديل بيانات الأصل' : 'إضافة أصل جديد')
                                : (editingVenue ? 'تعديل القاعة' : 'إضافة قاعة جديدة')
                            }
                        </h3>

                        {activeTab === 'equipment' ? (
                            <form onSubmit={handleAddAsset} className="space-y-4">
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">اسم المورد</label>
                                    <input required className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        placeholder="مثال: لابتوب المعمل 1" value={newAsset.name} onChange={e => setNewAsset({ ...newAsset, name: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">النوع</label>
                                        <select className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none text-right"
                                            value={newAsset.type} onChange={e => setNewAsset({ ...newAsset, type: e.target.value })}>
                                            {ASSET_TYPES.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">الحالة</label>
                                        <select className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none text-right"
                                            value={newAsset.status} onChange={e => setNewAsset({ ...newAsset, status: e.target.value })}>
                                            <option value="Available">متاح</option>
                                            <option value="Maintenance">تحت الصيانة</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-3 space-x-reverse pt-4">
                                    <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">إلغاء</button>
                                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold flex items-center">
                                        {isSubmitting && <Loader2 size={16} className="animate-spin ml-2" />} {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleSaveVenue} className="space-y-4">
                                <div>
                                    <label className="block text-gray-400 text-sm mb-1">اسم المكان</label>
                                    <input required className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                        placeholder="مثال: المسرح المدرسي" value={newVenue.name} onChange={e => setNewVenue({ ...newVenue, name: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">النوع</label>
                                        <select className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none text-right"
                                            value={newVenue.type} onChange={e => setNewVenue({ ...newVenue, type: e.target.value })}>
                                            {VENUE_TYPES.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">السعة</label>
                                        <input type="number" required className="w-full bg-black/30 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                                            value={newVenue.capacity} onChange={e => setNewVenue({ ...newVenue, capacity: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div className="flex justify-end space-x-3 space-x-reverse pt-4">
                                    <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-gray-400 hover:text-white">إلغاء</button>
                                    <button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-xl font-bold flex items-center">
                                        {isSubmitting && <Loader2 size={16} className="animate-spin ml-2" />} {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* --- ASSET DETAILS MODAL --- */}
            {editingAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl animate-scale-in">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <div>
                                <h3 className="text-2xl font-bold text-white">{editingAsset.name}</h3>
                                <div className="flex items-center space-x-2 space-x-reverse mt-1">
                                    <span className="text-gray-400 text-sm bg-white/5 px-2 py-0.5 rounded">{editingAsset.type}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${editingAsset.status === 'Available' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                                        {editingAsset.status === 'Available' ? 'متاح' : 'في الصيانة'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 space-x-reverse">
                                <button
                                    onClick={generateAssetPDF}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold flex items-center text-sm shadow-lg shadow-indigo-500/20 transition-all"
                                >
                                    <Printer size={16} className="ml-2" />
                                    طباعة التقرير
                                </button>
                                <button onClick={() => setEditingAsset(null)} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-lg"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {/* Notes Section */}
                            <div>
                                <h4 className="flex items-center text-white font-bold mb-3"><FileText size={18} className="ml-2 text-indigo-400" /> ملاحظات ومشكلات</h4>
                                <textarea
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white min-h-[120px] focus:border-indigo-500 outline-none resize-none"
                                    placeholder="سجل أي أعطال أو ملاحظات هنا..."
                                    value={editingAsset.notes || ''}
                                    onChange={e => setEditingAsset({ ...editingAsset, notes: e.target.value })}
                                />
                                <div className="text-left mt-2">
                                    <button onClick={saveAssetNotes} className="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center ml-auto">
                                        <Save size={16} className="mr-1" /> حفظ الملاحظة
                                    </button>
                                </div>
                            </div>

                            {/* History Section */}
                            <div>
                                <h4 className="flex items-center text-white font-bold mb-3"><Clock size={18} className="ml-2 text-indigo-400" /> سجل الاستخدام</h4>
                                <div className="space-y-3">
                                    {assetHistory.length > 0 ? assetHistory.map(evt => (
                                        <div key={evt.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-white">{evt.title}</div>
                                                <div className="text-xs text-gray-500 mt-1">{evt.venueId} | {evt.typeName}</div>
                                            </div>
                                            <div className="text-left">
                                                <div className="text-emerald-400 font-mono text-sm">{evt.startTime?.toDate().toLocaleDateString('en-GB')}</div>
                                                <div className="text-gray-500 text-xs">{evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center text-gray-500 py-4 border border-dashed border-white/10 rounded-xl">لم يتم استخدام هذا الأصل في أي نشاط مسجل بعد</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- VENUE DETAILS MODAL --- */}
            {viewingVenue && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-white/20 rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl animate-scale-in">
                        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <div>
                                <h3 className="text-2xl font-bold text-white">{viewingVenue.name}</h3>
                                <div className="flex items-center space-x-2 space-x-reverse mt-1">
                                    <span className="text-gray-400 text-sm bg-white/5 px-2 py-0.5 rounded">{viewingVenue.type}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${VENUE_STATUS_OPTIONS.find(o => o.val === (viewingVenue.status || 'Available'))?.color === 'emerald' ? 'text-emerald-400 bg-emerald-500/10' : (viewingVenue.status === 'Maintenance' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10')}`}>
                                        {VENUE_STATUS_OPTIONS.find(o => o.val === (viewingVenue.status || 'Available'))?.label}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center space-x-3 space-x-reverse">
                                <button
                                    onClick={generateVenuePDF}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold flex items-center text-sm shadow-lg shadow-indigo-500/20 transition-all"
                                >
                                    <Printer size={16} className="ml-2" />
                                    طباعة التقرير
                                </button>
                                <button onClick={() => setViewingVenue(null)} className="text-gray-400 hover:text-white bg-white/5 p-2 rounded-lg"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            <div>
                                <h4 className="flex items-center text-white font-bold mb-3"><FileText size={18} className="ml-2 text-indigo-400" /> ملاحظات ومشكلات</h4>
                                <textarea
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-white min-h-[120px] focus:border-indigo-500 outline-none resize-none"
                                    placeholder="سجل أي أعطال أو ملاحظات هنا..."
                                    value={viewingVenue.notes || ''}
                                    onChange={e => setViewingVenue({ ...viewingVenue, notes: e.target.value })}
                                />
                                <div className="text-left mt-2">
                                    <button onClick={saveVenueNotes} className="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center ml-auto">
                                        <Save size={16} className="mr-1" /> حفظ الملاحظة
                                    </button>
                                </div>
                            </div>

                            <div>
                                <h4 className="flex items-center text-white font-bold mb-3"><Clock size={18} className="ml-2 text-indigo-400" /> سجل الاستخدام</h4>
                                <div className="space-y-3">
                                    {venueHistory.length > 0 ? venueHistory.map(evt => (
                                        <div key={evt.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-white">{evt.title}</div>
                                                <div className="text-xs text-gray-500 mt-1">{evt.typeId}</div>
                                            </div>
                                            <div className="text-left">
                                                <div className="text-emerald-400 font-mono text-sm">{evt.startTime?.toDate().toLocaleDateString('en-GB')}</div>
                                                <div className="text-gray-500 text-xs">{evt.startTime?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="text-center text-gray-500 py-4 border border-dashed border-white/10 rounded-xl">لم يتم استخدام هذا المكان في أي نشاط مسجل بعد</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

        </div>
    );
}

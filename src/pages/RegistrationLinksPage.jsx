import { useState, useEffect } from 'react';
import {
    Link2, Plus, Search, QrCode, Copy, Check, Pause, Play,
    Edit3, Trash2, Users, Calendar, Award, ExternalLink,
    ChevronLeft, Clock, Shield, Filter, AlertCircle
} from 'lucide-react';
import { db } from '../firebase';
import {
    collection, query, onSnapshot, doc, updateDoc,
    increment, where, getDocs, writeBatch
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import CreateLinkModal from '../components/registration/CreateLinkModal';
import LinkQRCodeModal from '../components/registration/LinkQRCodeModal';
import LinkSubmissionsDrawer from '../components/registration/LinkSubmissionsDrawer';

export default function RegistrationLinksPage() {
    const [links, setLinks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | active | paused | expired

    // Pending counts map per linkId
    const [pendingCounts, setPendingCounts] = useState({});

    // Modals
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [linkToEdit, setLinkToEdit] = useState(null);
    const [qrModalLink, setQrModalLink] = useState(null);
    const [drawerLink, setDrawerLink] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    // Real-time listener for registration links
    useEffect(() => {
        const q = query(collection(db, 'registration_links'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort by createdAt descending
            list.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setLinks(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching registration links:", err);
            toast.error("فشل في تحميل روابط التسجيل");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Real-time listener for all pending submissions to show badges on cards
    useEffect(() => {
        const q = query(
            collection(db, 'link_submissions'),
            where('status', '==', 'pending')
        );
        const unsubscribe = onSnapshot(q, (snap) => {
            const counts = {};
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.linkId) {
                    counts[data.linkId] = (counts[data.linkId] || 0) + 1;
                }
            });
            setPendingCounts(counts);
        }, (err) => {
            console.warn("Pending submissions sync error:", err);
        });

        return () => unsubscribe();
    }, []);

    // Helper: Determine dynamic link status
    const getLinkStatus = (link) => {
        if (link.status === 'paused') return 'paused';
        const now = new Date();
        if (link.endAt && new Date(link.endAt) < now) return 'expired';
        return 'active';
    };

    // Filtered links
    const filteredLinks = links.filter(link => {
        const matchesSearch =
            (link.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (link.delegateName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (link.eventTitle || '').toLowerCase().includes(searchTerm.toLowerCase());

        const currentStatus = getLinkStatus(link);
        const matchesStatus = statusFilter === 'all' || currentStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    // Stats
    const totalLinks = links.length;
    const activeLinksCount = links.filter(l => getLinkStatus(l) === 'active').length;
    const totalSubmissions = links.reduce((sum, l) => sum + (Number(l.currentCount) || 0), 0);
    const totalPending = Object.values(pendingCounts).reduce((sum, c) => sum + c, 0);

    // Copy Link
    const handleCopyLink = (linkId, e) => {
        e.stopPropagation();
        const url = `${window.location.origin}/register/${linkId}`;
        navigator.clipboard.writeText(url);
        setCopiedId(linkId);
        toast.success("تم نسخ الرابط بنجاح");
        setTimeout(() => setCopiedId(null), 2500);
    };

    // Toggle Pause/Resume
    const handleTogglePause = async (link, e) => {
        e.stopPropagation();
        const newStatus = link.status === 'paused' ? 'active' : 'paused';
        try {
            await updateDoc(doc(db, 'registration_links', link.id), { status: newStatus });
            toast.success(newStatus === 'paused' ? "تم إيقاف الرابط مؤقتاً" : "تم تفعيل الرابط بنجاح");
        } catch (err) {
            toast.error("فشل في تحديث حالة الرابط: " + err.message);
        }
    };

    // Delete Link and all associated submissions (clean up orphaned submissions)
    const handleDeleteLink = async (linkId, e) => {
        e.stopPropagation();
        if (!window.confirm("هل أنت متأكد من حذف رابط التسجيل؟ سيتم حذف الرابط وجميع المشاركات المرتبطة به نهائياً.")) return;

        try {
            const subsSnap = await getDocs(query(collection(db, 'link_submissions'), where('linkId', '==', linkId)));
            const batch = writeBatch(db);
            subsSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, 'registration_links', linkId));
            await batch.commit();

            toast.success("تم حذف الرابط وجميع سجلاته بنجاح");
        } catch (err) {
            console.error("Delete link error:", err);
            toast.error("فشل في حذف الرابط: " + err.message);
        }
    };

    // Award delegate points
    const handleAwardDelegatePoints = async (link, e) => {
        e.stopPropagation();
        if (!link.delegateStudentId) {
            toast.error("هذا الرابط غير مرتبط بطالب محدد من سجل المدرسة");
            return;
        }
        if (link.delegatePointsAwarded) {
            toast.error("تم منح النقاط لهذا الطالب المفوض مسبقاً");
            return;
        }

        const pts = Number(link.delegateRewardPoints) || 0;
        if (pts <= 0) {
            toast.error("لا توجد نقاط مكافأة محددة لهذا الرابط");
            return;
        }

        try {
            await updateDoc(doc(db, 'students', link.delegateStudentId), {
                totalPoints: increment(pts)
            });
            await updateDoc(doc(db, 'registration_links', link.id), {
                delegatePointsAwarded: true
            });
            toast.success(`تم منح ${pts} نقطة للطالب المفوض (${link.delegateName})`);
        } catch (err) {
            toast.error("فشل في منح النقاط: " + err.message);
        }
    };

    return (
        <div className="space-y-6 pb-12 text-right font-cairo" dir="rtl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <span className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                            <Link2 size={24} />
                        </span>
                        <span>روابط التسجيل المؤقتة والمفوضة</span>
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        إصدار روابط سريعة وتفويض الطلاب لتسجيل المشاركات في الفعاليات والمناسبات المدرسية
                    </p>
                </div>

                <button
                    onClick={() => { setLinkToEdit(null); setIsCreateModalOpen(true); }}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 self-start md:self-auto transition-all"
                >
                    <Plus size={18} />
                    <span>إنشاء رابط تسجيل جديد</span>
                </button>
            </div>

            {/* Overview Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 block mb-1">إجمالي الروابط</span>
                        <span className="text-2xl font-black text-white">{totalLinks}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
                        <Link2 size={22} />
                    </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 block mb-1">الروابط النشطة</span>
                        <span className="text-2xl font-black text-emerald-400">{activeLinksCount}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
                        <Play size={22} />
                    </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 block mb-1">المشاركات المسجلة</span>
                        <span className="text-2xl font-black text-white">{totalSubmissions}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-800/40 text-blue-400">
                        <Users size={22} />
                    </div>
                </div>

                <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                        <span className="text-xs text-slate-400 block mb-1">بانتظار الاعتماد</span>
                        <span className="text-2xl font-black text-amber-400">{totalPending}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/40 text-amber-400">
                        <Clock size={22} />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                    <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
                    <input
                        type="text"
                        placeholder="بحث بالعنوان، المفوض، أو الفعالية..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
                    {[
                        { id: 'all', label: 'الكل' },
                        { id: 'active', label: 'النشطة' },
                        { id: 'paused', label: 'الموقوفة' },
                        { id: 'expired', label: 'المنتهية' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setStatusFilter(tab.id)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                                statusFilter === tab.id
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                    : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-700/60'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Links Grid */}
            {loading ? (
                <div className="text-center py-20 text-slate-400 text-sm">
                    جاري تحميل روابط التسجيل...
                </div>
            ) : filteredLinks.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/20 border border-dashed border-slate-700 rounded-2xl p-8">
                    <Link2 size={40} className="mx-auto text-slate-600 mb-3" />
                    <h3 className="text-base font-bold text-white mb-1">لا توجد روابط تسجيل</h3>
                    <p className="text-xs text-slate-400 mb-4">
                        قم بإنشاء أول رابط تسجيل وتفويض طالب لإدخال الأسماء والمشاركات
                    </p>
                    <button
                        onClick={() => { setLinkToEdit(null); setIsCreateModalOpen(true); }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                    >
                        <Plus size={16} /> إنشاء رابط جديد
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredLinks.map((link) => {
                        const status = getLinkStatus(link);
                        const pendingCount = pendingCounts[link.id] || 0;
                        const capacity = Number(link.maxCapacity) || 1;
                        const current = Number(link.currentCount) || 0;
                        const percent = Math.min(100, Math.round((current / capacity) * 100));

                        return (
                            <div
                                key={link.id}
                                onClick={() => setDrawerLink(link)}
                                className="bg-slate-800/90 border border-slate-700/80 hover:border-indigo-500/60 rounded-2xl p-5 shadow-lg flex flex-col justify-between cursor-pointer transition-all group hover:shadow-xl hover:shadow-indigo-950/20 relative overflow-hidden"
                            >
                                {/* Top Accent Bar */}
                                <div className={`absolute top-0 inset-x-0 h-1.5 ${
                                    status === 'active' ? 'bg-emerald-500' : status === 'paused' ? 'bg-amber-500' : 'bg-slate-600'
                                }`} />

                                <div className="space-y-3.5">
                                    {/* Header: Title & Badges */}
                                    <div>
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <h3 className="font-bold text-white text-base leading-snug group-hover:text-indigo-300 transition-colors line-clamp-1">
                                                {link.title}
                                            </h3>
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                                                status === 'active'
                                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                    : status === 'paused'
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                    : 'bg-slate-700 text-slate-400'
                                            }`}>
                                                {status === 'active' ? 'نشط' : status === 'paused' ? 'موقوف' : 'منتهي'}
                                            </span>
                                        </div>

                                        {link.eventTitle && (
                                            <span className="text-[11px] text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded-md inline-block">
                                                مرتبط بفعالية: {link.eventTitle}
                                            </span>
                                        )}
                                    </div>

                                    {/* Delegate Card */}
                                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] text-slate-400 block">إشراف الطالب المفوض</span>
                                            <span className="text-xs font-bold text-slate-200">{link.delegateName}</span>
                                        </div>
                                        {link.delegateRewardPoints > 0 && (
                                            <div className="text-left">
                                                <span className="text-[10px] text-slate-400 block">مكافأة المفوض</span>
                                                <button
                                                    onClick={(e) => handleAwardDelegatePoints(link, e)}
                                                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors ${
                                                        link.delegatePointsAwarded
                                                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                                                            : 'bg-amber-950/60 text-amber-400 border border-amber-800/50 hover:bg-amber-900/60'
                                                    }`}
                                                    title={link.delegatePointsAwarded ? "تم منح النقاط" : "انقر لمنح النقاط للمفوض"}
                                                >
                                                    <Award size={12} />
                                                    <span>{link.delegatePointsAwarded ? "ممنوحة" : `+${link.delegateRewardPoints} نقطة`}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Capacity Progress Bar */}
                                    <div>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="text-slate-400 font-semibold">المقاعد المشغولة</span>
                                            <span className="font-bold text-white">
                                                {current} / {capacity} مقعد ({percent}%)
                                                {pendingCount > 0 && (
                                                    <span className="text-amber-400 text-[11px] font-normal mr-1">
                                                        (+{pendingCount} بانتظار الاعتماد)
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                            <div
                                                className={`h-full transition-all duration-300 rounded-full ${
                                                    percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                                                }`}
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Meta tags */}
                                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                                        <span className="bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                                            المجال: {link.specialization || 'عام'}
                                        </span>
                                        {link.passcode && (
                                            <span className="bg-amber-950/40 text-amber-300 px-2 py-0.5 rounded-md border border-amber-800/40 flex items-center gap-1">
                                                <Shield size={10} /> محمي برمز
                                            </span>
                                        )}
                                        {link.pointsPerStudent > 0 && (
                                            <span className="bg-indigo-950/40 text-indigo-300 px-2 py-0.5 rounded-md border border-indigo-800/40">
                                                +{link.pointsPerStudent} نقاط/طالب
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Card Footer & Action Buttons */}
                                <div className="pt-4 mt-4 border-t border-slate-700/60 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        {/* Copy Link */}
                                        <button
                                            onClick={(e) => handleCopyLink(link.id, e)}
                                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                                            title="نسخ رابط التسجيل"
                                        >
                                            {copiedId === link.id ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                                        </button>

                                        {/* QR Code */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setQrModalLink(link); }}
                                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                                            title="عرض رمز QR"
                                        >
                                            <QrCode size={15} />
                                        </button>

                                        {/* Pause / Resume */}
                                        <button
                                            onClick={(e) => handleTogglePause(link, e)}
                                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                                            title={link.status === 'paused' ? "استئناف الرابط" : "إيقاف مؤقت"}
                                        >
                                            {link.status === 'paused' ? <Play size={15} className="text-emerald-400" /> : <Pause size={15} className="text-amber-400" />}
                                        </button>

                                        {/* Edit */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setLinkToEdit(link); setIsCreateModalOpen(true); }}
                                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                                            title="تعديل الرابط"
                                        >
                                            <Edit3 size={15} />
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={(e) => handleDeleteLink(link.id, e)}
                                            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-700 transition-colors"
                                            title="حذف الرابط"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>

                                    {/* Submissions Badge / Open Drawer Button */}
                                    <div className="flex items-center gap-1.5">
                                        {pendingCount > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 animate-pulse">
                                                {pendingCount} جديد
                                            </span>
                                        )}
                                        <span className="text-xs font-bold text-indigo-400 flex items-center gap-0.5 group-hover:translate-x-[-3px] transition-transform">
                                            <span>الكشف</span>
                                            <ChevronLeft size={14} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create / Edit Modal */}
            <CreateLinkModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); setLinkToEdit(null); }}
                linkToEdit={linkToEdit}
                onSuccess={() => {}}
            />

            {/* QR Code Modal */}
            <LinkQRCodeModal
                isOpen={!!qrModalLink}
                onClose={() => setQrModalLink(null)}
                link={qrModalLink}
            />

            {/* Submissions Drawer */}
            <LinkSubmissionsDrawer
                isOpen={!!drawerLink}
                onClose={() => setDrawerLink(null)}
                link={drawerLink}
                onLinkUpdated={() => {}}
            />
        </div>
    );
}

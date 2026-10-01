import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
    Calendar, Users, Box, Award, TrendingUp, Plus, FileText,
    Activity, Clock, RefreshCw, Link as LinkIcon, Archive,
    CheckCircle2, MapPin, ChevronLeft, ShieldCheck, Sparkles, ArrowUpRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSyncTime, setLastSyncTime] = useState(null);
    const [stats, setStats] = useState({
        todayEvents: 0,
        todayDone: 0,
        todayPending: 0,
        totalEvents: 0,
        completedEvents: 0,
        scheduledEvents: 0,
        activeStudents: 0,
        studentsWithPoints: 0,
        participationRate: 0,
        totalPoints: 0,
        avgPoints: 0,
        totalParticipations: 0,
        maintenanceAssets: 0,
        availableAssets: 0,
        venuesCount: 0,
        typeDist: {}
    });
    const [agenda, setAgenda] = useState([]);
    const [topStudents, setTopStudents] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async (forceRefresh = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            // 0. Cache Check (2-minute cache to avoid spamming Firestore on rapid navigation)
            if (!forceRefresh) {
                const cached = sessionStorage.getItem('school_dashboard_cache');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed.timestamp < 2 * 60 * 1000) {
                            setStats(parsed.stats);
                            setAgenda(parsed.agenda);
                            setTopStudents(parsed.topStudents);
                            setLastSyncTime(parsed.timestamp);
                            setLoading(false);
                            return;
                        }
                    } catch {
                        sessionStorage.removeItem('school_dashboard_cache');
                    }
                }
            }

            const today = new Date();
            const todayStr = format(today, 'yyyy-MM-dd');

            // 1. Fetch Students (Accurate points & counts across all active students)
            let activeStudents = [];
            let totalPoints = 0;
            let studentsWithPoints = 0;
            let sortedTopStudents = [];
            let studentsFetchSuccess = false;

            try {
                const studentsSnap = await getDocs(collection(db, 'students'));
                const allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                activeStudents = allStudents.filter(s => s.active !== false && !s.archived);

                activeStudents.forEach(s => {
                    const pts = Number(s.totalPoints) || 0;
                    totalPoints += pts;
                    if (pts > 0) studentsWithPoints++;
                });

                sortedTopStudents = [...activeStudents]
                    .sort((a, b) => (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0))
                    .slice(0, 5);
                studentsFetchSuccess = true;
            } catch (err) {
                console.warn("Dashboard students fetch warning:", err);
            }

            const activeStudentsCount = activeStudents.length;
            const avgPoints = activeStudentsCount > 0 ? Math.round(totalPoints / activeStudentsCount) : 0;
            const participationRate = activeStudentsCount > 0 ? Math.round((studentsWithPoints / activeStudentsCount) * 100) : 0;

            // 2. Fetch Events (Accurate counts, today's agenda, and type distribution)
            let todayEventsList = [];
            let activeEvents = [];
            let todayDone = 0;
            let todayPending = 0;
            let completedEvents = 0;
            let scheduledEvents = 0;
            const typeDist = {};
            let totalParticipations = 0;
            let eventsFetchSuccess = false;

            try {
                const eventsSnap = await getDocs(collection(db, 'events'));
                const allEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                activeEvents = allEvents.filter(e => e.status !== 'archived' && !e.archived);

                const isTodayEvent = (e) => {
                    if (e.date === todayStr) return true;
                    if (e.startTime?.toDate) {
                        try {
                            return format(e.startTime.toDate(), 'yyyy-MM-dd') === todayStr;
                        } catch {
                            return false;
                        }
                    }
                    return false;
                };

                todayEventsList = activeEvents.filter(isTodayEvent);
                todayDone = todayEventsList.filter(e => e.status === 'Done').length;
                todayPending = todayEventsList.length - todayDone;
                completedEvents = activeEvents.filter(e => e.status === 'Done').length;
                scheduledEvents = activeEvents.filter(e => e.status !== 'Done').length;

                activeEvents.forEach(e => {
                    const t = e.typeName || 'نشاط عام';
                    typeDist[t] = (typeDist[t] || 0) + 1;

                    const participants = e.participatingStudents || e.participants || [];
                    if (Array.isArray(participants)) {
                        totalParticipations += participants.length;
                    }
                });
                eventsFetchSuccess = true;
            } catch (err) {
                console.warn("Dashboard events fetch warning:", err);
            }

            // 3. Fetch Assets & Venues
            let maintenanceCount = 0;
            let availableAssetsCount = 0;
            let venuesCount = 0;

            try {
                const [assetsSnap, venuesSnap] = await Promise.all([
                    getDocs(collection(db, 'assets')),
                    getDocs(collection(db, 'venues'))
                ]);

                assetsSnap.docs.forEach(d => {
                    const st = d.data().status;
                    if (st === 'Maintenance' || st === 'تحت الصيانة' || st === 'صيانة') {
                        maintenanceCount++;
                    } else {
                        availableAssetsCount++;
                    }
                });

                venuesCount = venuesSnap.docs.length;
            } catch (err) {
                console.warn("Assets/Venues aggregation warning:", err);
            }

            if (!studentsFetchSuccess && !eventsFetchSuccess && forceRefresh) {
                toast.error("تعذر جلب بعض البيانات من الخادم");
            }

            const now = Date.now();
            const newStats = {
                todayEvents: todayEventsList.length,
                todayDone,
                todayPending,
                totalEvents: activeEvents.length,
                completedEvents,
                scheduledEvents,
                activeStudents: activeStudentsCount,
                studentsWithPoints,
                participationRate,
                totalPoints,
                avgPoints,
                totalParticipations,
                maintenanceAssets: maintenanceCount,
                availableAssets: availableAssetsCount,
                venuesCount,
                typeDist
            };

            setStats(newStats);
            setAgenda(todayEventsList);
            setTopStudents(sortedTopStudents);
            setLastSyncTime(now);

            // Save to Session Storage
            sessionStorage.setItem('school_dashboard_cache', JSON.stringify({
                timestamp: now,
                stats: newStats,
                agenda: todayEventsList,
                topStudents: sortedTopStudents
            }));

            if (forceRefresh) toast.success("تم تحديث كافة الإحصائيات بنجاح");
        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
            toast.error("حدث خطأ أثناء تحميل بعض البيانات");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const currentDateAr = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-white font-cairo">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                    <Sparkles className="w-6 h-6 text-indigo-400 absolute inset-0 m-auto animate-pulse" />
                </div>
                <p className="mt-4 text-indigo-200 text-sm font-semibold">جاري تحليل وتحديث مؤشرات المنظومة...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-8 font-cairo pb-20 max-w-7xl mx-auto">
            {/* 1. Header & Quick Sync */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 border border-white/10 p-5 sm:p-7 rounded-3xl shadow-2xl backdrop-blur-xl">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20"></div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                النظام متصل ومتزامن
                            </span>
                            {lastSyncTime && (
                                <span className="text-[11px] text-gray-400">
                                    آخر تحديث: {format(new Date(lastSyncTime), 'hh:mm a', { locale: ar })}
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                            مركز التحكم والأنشطة المدرسية 👋
                        </h1>
                        <p className="text-indigo-200/80 text-sm mt-1">{currentDateAr}</p>
                    </div>

                    {/* Action & Refresh Button */}
                    <div className="flex items-center gap-2 self-stretch sm:self-auto">
                        <button
                            onClick={() => fetchDashboardData(true)}
                            disabled={refreshing}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 hover:border-indigo-400/40 text-indigo-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                            title="تحديث الأرقام والإحصائيات من الخادم"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
                            <span>{refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Primary Metrics Grid (2x2 on Mobile, 4x1 on PC) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                <StatCard
                    label="فعاليات اليوم"
                    value={stats.todayEvents}
                    subLabel={
                        stats.todayEvents > 0
                            ? `${stats.todayDone} مكتملة • ${stats.todayPending} قادمة`
                            : 'لا توجد فعاليات اليوم'
                    }
                    icon={Calendar}
                    gradient="from-indigo-500/20 to-blue-500/10"
                    iconBg="from-indigo-600 to-blue-600"
                    accentColor="text-indigo-400"
                />
                <StatCard
                    label="الطلاب النشطون"
                    value={stats.activeStudents}
                    subLabel={`${stats.studentsWithPoints} طالب مشارك (${stats.participationRate}%)`}
                    icon={Users}
                    gradient="from-emerald-500/20 to-teal-500/10"
                    iconBg="from-emerald-600 to-teal-600"
                    accentColor="text-emerald-400"
                />
                <StatCard
                    label="إجمالي الأنشطة"
                    value={stats.totalEvents}
                    subLabel={`${stats.completedEvents} منجز • ${stats.totalParticipations} مشاركة`}
                    icon={Activity}
                    gradient="from-purple-500/20 to-pink-500/10"
                    iconBg="from-purple-600 to-pink-600"
                    accentColor="text-purple-400"
                />
                <StatCard
                    label="مجموع نقاط التميز"
                    value={stats.totalPoints.toLocaleString('ar-SA')}
                    subLabel={`متوسط ${stats.avgPoints} نقطة لكل طالب`}
                    icon={Award}
                    gradient="from-amber-500/20 to-orange-500/10"
                    iconBg="from-amber-600 to-orange-600"
                    accentColor="text-amber-400"
                />
            </div>

            {/* 3. Quick Services Hub (خدمات المنظومة والوصول السريع) */}
            <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                        <Sparkles size={18} className="text-amber-400" />
                        خدمات المنظومة والوصول السريع
                    </h2>
                    <span className="text-xs text-gray-400 hidden sm:inline">روابط سريعة لأهم الأقسام والوظائف</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <ServiceCard
                        title="إضافة نشاط"
                        desc="جدولة فعالية جديدة"
                        to="/scheduler"
                        icon={Plus}
                        badge="جدول"
                        color="indigo"
                    />
                    <ServiceCard
                        title="الطلاب والنقاط"
                        desc="السجلات والتكرارات"
                        to="/students"
                        icon={Users}
                        badge={`${stats.activeStudents}`}
                        color="emerald"
                    />
                    <ServiceCard
                        title="روابط المشاركة"
                        desc="استمارات التسجيل الذاتي"
                        to="/registration-links"
                        icon={LinkIcon}
                        badge="بوابات"
                        color="sky"
                    />
                    <ServiceCard
                        title="الكشوفات والتقارير"
                        desc="تصدير وطباعة PDF"
                        to="/reports"
                        icon={FileText}
                        badge="طباعة"
                        color="purple"
                    />
                    <ServiceCard
                        title="الموارد والقاعات"
                        desc="المعدات وجاهزية المقرات"
                        to="/assets"
                        icon={Box}
                        badge={stats.maintenanceAssets > 0 ? `${stats.maintenanceAssets} صيانة` : 'جاهز'}
                        color="amber"
                    />
                    <ServiceCard
                        title="الأرشيف العام"
                        desc="الطلاب والأنشطة المؤرشفة"
                        to="/reports?tab=archive"
                        linkState={{ tab: 'archive' }}
                        icon={Archive}
                        badge="استعادة"
                        color="rose"
                    />
                </div>
            </div>

            {/* 4. Agenda & Leaderboard Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left/Main Column: Today's Agenda (2/3 width on PC) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-md h-full flex flex-col">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Clock className="text-indigo-400" size={20} />
                                    جدول أعمال اليوم
                                </h2>
                                <p className="text-xs text-gray-400 mt-0.5">الفعاليات المجدولة والمنفذة خلال تاريخ اليوم</p>
                            </div>
                            <Link
                                to="/scheduler"
                                className="text-xs text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 font-semibold"
                            >
                                <span>عرض الجدول الزمني</span>
                                <ChevronLeft size={14} />
                            </Link>
                        </div>

                        <div className="flex-1">
                            {agenda.length === 0 ? (
                                <div className="text-center py-12 px-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
                                    <div className="w-16 h-16 bg-indigo-600/10 text-indigo-400 rounded-2xl flex items-center justify-center mb-3 text-2xl border border-indigo-500/20 shadow-inner">
                                        📅
                                    </div>
                                    <h3 className="text-white font-bold text-base mb-1">لا توجد فعاليات مجدولة لهذا اليوم</h3>
                                    <p className="text-gray-400 text-xs max-w-sm mb-4">
                                        يمكنك التخطيط لليوم وجدولة نشاط أو ورشة عمل جديدة وتوزيع المشاركين بكل سهولة.
                                    </p>
                                    <Link
                                        to="/scheduler"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95"
                                    >
                                        <Plus size={16} />
                                        <span>جدولة نشاط لليوم</span>
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {agenda.map((evt) => {
                                        let eventTimeStr = 'طوال اليوم';
                                        if (evt.startTime?.toDate) {
                                            eventTimeStr = format(evt.startTime.toDate(), 'hh:mm a', { locale: ar });
                                        } else if (evt.startTime) {
                                            eventTimeStr = `الساعة ${evt.startTime}`;
                                        }

                                        const participantCount =
                                            (evt.participatingStudents?.length || 0) +
                                            (evt.participants?.length || 0);

                                        return (
                                            <div
                                                key={evt.id}
                                                className="group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/30 p-4 rounded-2xl transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 p-2 rounded-xl border ${evt.status === 'Done' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'}`}>
                                                        {evt.status === 'Done' ? <CheckCircle2 size={18} /> : <Calendar size={18} />}
                                                    </div>
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <span className="text-xs font-mono font-bold text-indigo-300 flex items-center gap-1">
                                                                <Clock size={12} />
                                                                {eventTimeStr}
                                                            </span>
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-medium">
                                                                {evt.typeName || 'نشاط عام'}
                                                            </span>
                                                            {evt.venueId && (
                                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 flex items-center gap-1">
                                                                    <MapPin size={10} />
                                                                    {evt.venueId}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h3 className="font-bold text-white text-base group-hover:text-indigo-200 transition-colors">
                                                            {evt.title}
                                                        </h3>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                                                    {participantCount > 0 && (
                                                        <span className="text-xs text-gray-300 font-semibold bg-white/5 px-2.5 py-1 rounded-lg">
                                                            {participantCount} مشارك
                                                        </span>
                                                    )}
                                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${evt.status === 'Done' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'}`}>
                                                        {evt.status === 'Done' ? 'مكتمل' : 'مجدول'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Leaderboard / Top Students (1/3 width on PC) */}
                <div className="space-y-4">
                    <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-md h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Award className="text-amber-400" size={20} />
                                    لوحة الشرف والمتميزين
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">أعلى الطلاب نقاطاً ومشاركة</p>
                            </div>
                            <Link
                                to="/students"
                                className="text-xs text-amber-300 hover:text-white bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-all font-semibold"
                            >
                                عرض الكل
                            </Link>
                        </div>

                        <div className="flex-1 space-y-2.5">
                            {topStudents.length === 0 ? (
                                <p className="text-gray-400 text-xs text-center py-8">لا توجد بيانات طلاب حالياً</p>
                            ) : (
                                topStudents.map((student, idx) => {
                                    const rankMedals = ['🥇', '🥈', '🥉'];
                                    const isTopThree = idx < 3;
                                    const rankBadge = rankMedals[idx] || (idx + 1);

                                    return (
                                        <div
                                            key={student.id}
                                            className={`flex items-center justify-between p-3 rounded-2xl transition-all border ${
                                                idx === 0
                                                    ? 'bg-amber-500/10 border-amber-500/30 shadow-md'
                                                    : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/5'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold ${
                                                        idx === 0
                                                            ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                                                            : idx === 1
                                                            ? 'bg-slate-300 text-black'
                                                            : idx === 2
                                                            ? 'bg-amber-700 text-white'
                                                            : 'bg-slate-800 text-gray-400 border border-white/10'
                                                    }`}
                                                >
                                                    {isTopThree ? rankBadge : idx + 1}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-gray-100 line-clamp-1">
                                                        {student.name}
                                                    </div>
                                                    <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                                        <span>
                                                            {student.grade && student.section
                                                                ? `${student.grade} - ${student.section}`
                                                                : (student.grade || student.class || 'طالب')}
                                                        </span>
                                                        {student.specializations?.length > 0 && (
                                                            <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-1.5 py-0.2 rounded">
                                                                {student.specializations[0]}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 text-amber-400 font-mono font-extrabold text-sm bg-amber-400/10 px-2 py-1 rounded-xl border border-amber-400/20">
                                                <span>{student.totalPoints || 0}</span>
                                                <span className="text-[10px] font-sans text-amber-300">نقطة</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                            <span>إجمالي المكرمين بالنقاط</span>
                            <span className="font-bold text-white font-mono">{stats.studentsWithPoints} طالب</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. Analytics & Distribution Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Activity Distribution */}
                <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                <TrendingUp className="text-emerald-400" size={18} />
                                توزيع الأنشطة المنفذة والمجدولة
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">حسب المجالات والتصنيفات المعتمدة</p>
                        </div>
                        <span className="text-xs font-mono font-bold px-2 py-1 bg-white/5 rounded-lg text-emerald-300">
                            {stats.totalEvents} نشاط
                        </span>
                    </div>

                    <div className="space-y-3 pt-2">
                        {Object.entries(stats.typeDist || {}).length === 0 ? (
                            <p className="text-gray-500 text-xs text-center py-6">لا توجد بيانات كافية للأنشطة</p>
                        ) : (
                            Object.entries(stats.typeDist).map(([type, count]) => {
                                const percentage = stats.totalEvents > 0 ? Math.round((count / stats.totalEvents) * 100) : 0;
                                return (
                                    <div key={type} className="space-y-1">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-200 font-semibold">{type}</span>
                                            <div className="flex items-center gap-2 font-mono text-gray-400">
                                                <span className="text-white font-bold">{count} نشاط</span>
                                                <span className="text-[10px] text-emerald-400">({percentage}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* System Readiness & Infrastructure Overview */}
                <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-md flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                    <ShieldCheck className="text-indigo-400" size={18} />
                                    مؤشرات الجاهزية والتشغيل
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">جاهزية المقرات، العهد، والمشاركة الميدانية</p>
                            </div>
                            <Link
                                to="/assets"
                                className="text-xs text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 px-2.5 py-1 rounded-lg transition-all font-semibold flex items-center gap-1"
                            >
                                <span>فحص الموارد</span>
                                <ArrowUpRight size={12} />
                            </Link>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl">
                                <span className="text-[11px] text-gray-400 block mb-1">الموارد الجاهزة</span>
                                <span className="text-xl font-extrabold font-mono text-emerald-400">
                                    {stats.availableAssets}
                                </span>
                                <span className="text-[10px] text-gray-400 block mt-0.5">جاهزة للاستخدام الفوري</span>
                            </div>
                            <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl">
                                <span className="text-[11px] text-gray-400 block mb-1">الموارد قيد الصيانة</span>
                                <span className={`text-xl font-extrabold font-mono ${stats.maintenanceAssets > 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                                    {stats.maintenanceAssets}
                                </span>
                                <span className="text-[10px] text-gray-400 block mt-0.5">بحاجة متابعة دورية</span>
                            </div>
                        </div>

                        <div className="space-y-2 text-xs text-gray-300 bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                                <span>القاعات والمقرات المسجلة</span>
                                <span className="font-bold font-mono text-white">{stats.venuesCount} قاعات</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                                <span>نسبة تفاعل الطلاب بالأنشطة</span>
                                <span className="font-bold font-mono text-emerald-400">{stats.participationRate}%</span>
                            </div>
                            <div className="flex justify-between items-center py-1">
                                <span>إجمالي مشاركات الطلاب المعتمدة</span>
                                <span className="font-bold font-mono text-indigo-300">{stats.totalParticipations} مشاركة</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400">
                        <span>منظومة إدارة النشاط المدرسي الحديثة</span>
                        <span className="text-indigo-400 font-mono">v2.5</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// -------------------------------------------------------------
// UI Helper Components
// -------------------------------------------------------------

function StatCard({ label, value, subLabel, gradient, iconBg, accentColor, ...props }) {
    const CardIcon = props.icon;
    return (
        <div className="bg-slate-900/60 hover:bg-slate-900/80 transition-all border border-white/10 hover:border-white/20 p-4 sm:p-5 rounded-2xl sm:rounded-3xl relative overflow-hidden group shadow-lg">
            {/* Subtle Gradient Backlight */}
            <div className={`absolute -right-6 -top-6 w-28 h-28 bg-gradient-to-br ${gradient} rounded-full blur-2xl group-hover:scale-110 transition-transform opacity-70`}></div>

            <div className="relative z-10 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-300 text-xs sm:text-sm font-semibold truncate">{label}</span>
                    <div className={`p-2 sm:p-2.5 rounded-xl bg-gradient-to-br ${iconBg} shadow-md shadow-black/40`}>
                        {CardIcon && <CardIcon size={18} className="text-white sm:w-5 sm:h-5" />}
                    </div>
                </div>

                <div className="mt-1">
                    <h3 className={`text-2xl sm:text-3xl font-black font-mono tracking-tight text-white mb-1`}>
                        {value}
                    </h3>
                    <p className={`text-[11px] sm:text-xs font-medium ${accentColor} truncate`}>
                        {subLabel}
                    </p>
                </div>
            </div>
        </div>
    );
}

function ServiceCard({ title, desc, to, linkState, icon: Icon, badge, color }) {
    const colorClasses = {
        indigo: {
            bg: 'hover:bg-indigo-600/15 border-indigo-500/20 hover:border-indigo-500/50',
            iconBg: 'bg-indigo-600/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white',
            badgeBg: 'bg-indigo-500/15 text-indigo-300'
        },
        emerald: {
            bg: 'hover:bg-emerald-600/15 border-emerald-500/20 hover:border-emerald-500/50',
            iconBg: 'bg-emerald-600/20 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white',
            badgeBg: 'bg-emerald-500/15 text-emerald-300'
        },
        sky: {
            bg: 'hover:bg-sky-600/15 border-sky-500/20 hover:border-sky-500/50',
            iconBg: 'bg-sky-600/20 text-sky-400 group-hover:bg-sky-600 group-hover:text-white',
            badgeBg: 'bg-sky-500/15 text-sky-300'
        },
        purple: {
            bg: 'hover:bg-purple-600/15 border-purple-500/20 hover:border-purple-500/50',
            iconBg: 'bg-purple-600/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white',
            badgeBg: 'bg-purple-500/15 text-purple-300'
        },
        amber: {
            bg: 'hover:bg-amber-600/15 border-amber-500/20 hover:border-amber-500/50',
            iconBg: 'bg-amber-600/20 text-amber-400 group-hover:bg-amber-600 group-hover:text-white',
            badgeBg: 'bg-amber-500/15 text-amber-300'
        },
        rose: {
            bg: 'hover:bg-rose-600/15 border-rose-500/20 hover:border-rose-500/50',
            iconBg: 'bg-rose-600/20 text-rose-400 group-hover:bg-rose-600 group-hover:text-white',
            badgeBg: 'bg-rose-500/15 text-rose-300'
        }
    }[color] || {
        bg: 'hover:bg-white/10 border-white/10',
        iconBg: 'bg-white/10 text-white',
        badgeBg: 'bg-white/10 text-white'
    };

    return (
        <Link
            to={to}
            state={linkState}
            className={`group bg-white/[0.03] border p-3.5 sm:p-4 rounded-2xl transition-all duration-200 flex flex-col justify-between active:scale-95 shadow-md ${colorClasses.bg}`}
        >
            <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-xl transition-all duration-200 ${colorClasses.iconBg}`}>
                    <Icon size={18} />
                </div>
                {badge && (
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${colorClasses.badgeBg}`}>
                        {badge}
                    </span>
                )}
            </div>

            <div>
                <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-200 transition-colors">
                    {title}
                </h4>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                    {desc}
                </p>
            </div>
        </Link>
    );
}

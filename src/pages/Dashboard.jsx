import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, getCountFromServer } from 'firebase/firestore';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Calendar, Users, Box, Award, TrendingUp, Plus, FileText, Activity, Clock, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({
        todayEvents: 0,
        totalEvents: 0,
        activeStudents: 0,
        maintenanceAssets: 0,
        totalPoints: 0,
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
            // 0. Cache Check (2-minute cache to avoid hammering Firestore on tab navigation)
            if (!forceRefresh) {
                const cached = sessionStorage.getItem('school_dashboard_cache');
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        if (Date.now() - parsed.timestamp < 2 * 60 * 1000) {
                            setStats(parsed.stats);
                            setAgenda(parsed.agenda);
                            setTopStudents(parsed.topStudents);
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

            // 1. Fetch ONLY Today's Events (targeted date query)
            let todayEventsList = [];
            try {
                const todayQuery = query(
                    collection(db, 'events'),
                    where('date', '==', todayStr)
                );
                const todaySnap = await getDocs(todayQuery);
                todayEventsList = todaySnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => e.status !== 'archived');
            } catch (err) {
                console.warn("Date index notice, fetching recent events:", err);
                const fallbackSnap = await getDocs(query(collection(db, 'events'), limit(25)));
                todayEventsList = fallbackSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => e.date === todayStr && e.status !== 'archived');
            }

            // 2. Efficient Aggregations with getCountFromServer (1 read per count instead of thousands)
            let totalEventsCount = 0;
            let activeStudentsCount = 0;
            let maintenanceCount = 0;

            try {
                const [eventsCountSnap, studentsCountSnap, maintenanceCountSnap] = await Promise.all([
                    getCountFromServer(collection(db, 'events')),
                    getCountFromServer(query(collection(db, 'students'), where('active', '==', true))),
                    getCountFromServer(query(collection(db, 'assets'), where('status', '==', 'Maintenance')))
                ]);

                totalEventsCount = eventsCountSnap.data().count;
                activeStudentsCount = studentsCountSnap.data().count;
                maintenanceCount = maintenanceCountSnap.data().count;
            } catch (countErr) {
                console.warn("Count aggregation fallback notice:", countErr);
            }

            // 3. Fetch ONLY Top 5 Students (limit 5 instead of all school students)
            let sortedTopStudents = [];
            try {
                const topStudentsQuery = query(
                    collection(db, 'students'),
                    where('active', '==', true),
                    orderBy('totalPoints', 'desc'),
                    limit(5)
                );
                const topSnap = await getDocs(topStudentsQuery);
                sortedTopStudents = topSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch {
                // If compound index for active + totalPoints is missing, fetch modest batch of 20
                const modestSnap = await getDocs(query(collection(db, 'students'), limit(20)));
                sortedTopStudents = modestSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => s.active !== false)
                    .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
                    .slice(0, 5);
                if (activeStudentsCount === 0) activeStudentsCount = sortedTopStudents.length;
            }

            // 4. Fetch a sample of recent events for type distribution (limit 20)
            const typeDist = {};
            try {
                const recentSnap = await getDocs(query(collection(db, 'events'), limit(20)));
                recentSnap.docs.forEach(d => {
                    const t = d.data().typeName || 'عام';
                    typeDist[t] = (typeDist[t] || 0) + 1;
                });
                if (totalEventsCount === 0) totalEventsCount = recentSnap.docs.length;
            } catch (e) {
                console.warn(e);
            }

            const totalPointsSample = sortedTopStudents.reduce((sum, s) => sum + (Number(s.totalPoints) || 0), 0);

            const newStats = {
                todayEvents: todayEventsList.length,
                totalEvents: totalEventsCount,
                activeStudents: activeStudentsCount,
                maintenanceAssets: maintenanceCount,
                totalPoints: totalPointsSample,
                typeDist
            };

            setStats(newStats);
            setAgenda(todayEventsList);
            setTopStudents(sortedTopStudents);

            // Save to Session Storage
            sessionStorage.setItem('school_dashboard_cache', JSON.stringify({
                timestamp: Date.now(),
                stats: newStats,
                agenda: todayEventsList,
                topStudents: sortedTopStudents
            }));

            if (forceRefresh) toast.success("تم تحديث بيانات لوحة التحكم بنجاح");
        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
            toast.error("حدث خطأ أثناء تحميل بعض البيانات");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const currentDateAr = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar });

    if (loading) return <div className="flex items-center justify-center h-full text-white">جاري تحميل لوحة التحكم...</div>;

    return (
        <div className="space-y-8 font-cairo pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">مرحباً بك في مركز التحكم 👋</h1>
                    <p className="text-indigo-200 opacity-80">{currentDateAr}</p>
                </div>

                {/* Quick Refresh Button */}
                <button
                    onClick={() => fetchDashboardData(true)}
                    disabled={refreshing}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-indigo-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    <span>{refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="فعاليات اليوم"
                    value={stats.todayEvents}
                    icon={Calendar}
                    color="from-indigo-500 to-blue-500"
                    textColor="text-indigo-100"
                />
                <StatCard
                    label="الطلاب النشطون"
                    value={stats.activeStudents}
                    icon={Users}
                    color="from-emerald-500 to-teal-500"
                    textColor="text-emerald-100"
                />
                <StatCard
                    label="تحت الصيانة"
                    value={stats.maintenanceAssets}
                    icon={Box}
                    color="from-rose-500 to-pink-500"
                    textColor="text-rose-100"
                />
                <StatCard
                    label="مجموع النقاط"
                    value={stats.totalPoints}
                    icon={TrendingUp}
                    color="from-amber-500 to-orange-500"
                    textColor="text-amber-100"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Charts Section */}
                <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Activity Type Distribution */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-white font-bold mb-4 flex items-center">
                            <TrendingUp className="ml-2 text-emerald-400" /> توزيع الأنشطة
                        </h3>
                        <div className="h-40 flex items-end justify-around gap-2 pt-4">
                            {/* Simple CSS Bar Chart */}
                            {Object.entries(stats.typeDist || {}).map(([type, count]) => {
                                const height = Math.max(10, Math.min(100, (count / (stats.totalEvents || 1)) * 100));
                                return (
                                    <div key={type} className="flex flex-col items-center gap-2 group w-full">
                                        <div className="w-full max-w-[40px] bg-gradient-to-t from-indigo-600 to-purple-500 rounded-t-lg transition-all group-hover:from-indigo-500 group-hover:to-purple-400 relative" style={{ height: `${height}%` }}>
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 rounded">
                                                {count}
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-400 text-center truncate w-16">{type}</span>
                                    </div>
                                )
                            })}
                            {(!stats.typeDist || Object.keys(stats.typeDist).length === 0) && (
                                <p className="text-gray-500 text-sm w-full text-center self-center">لا توجد بيانات كافية</p>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats / Mini Leaderboard */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-white font-bold mb-4 flex items-center">
                            <Award className="ml-2 text-amber-400" /> الطلاب المميزين
                        </h3>
                        <div className="space-y-3">
                            {topStudents.map((student, idx) => (
                                <div key={student.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ml-3 ${idx === 0 ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300'}`}>
                                            {idx + 1}
                                        </div>
                                         <div>
                                             <div className="text-sm font-bold text-gray-200">{student.name}</div>
                                             <div className="text-[10px] text-gray-500">
                                                 {(student.grade && student.section) ? `${student.grade} - ${student.section}` : (student.grade || student.class || '-')}
                                             </div>
                                         </div>
                                     </div>
                                     <div className="text-amber-400 font-mono font-bold text-sm">{student.totalPoints || 0}</div>
                                 </div>
                             ))}
                         </div>
                     </div>
                 </div>

                 {/* Left Column: Agenda (2/3 width) */}
                 <div className="lg:col-span-2 space-y-6">
                     <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[400px]">
                         <h2 className="text-xl font-bold text-white mb-6 flex items-center">
                             <Activity className="ml-2 text-indigo-400" /> جدول أعمال اليوم
                         </h2>

                         <div className="space-y-4">
                             {agenda.length === 0 ? (
                                 <div className="text-center py-12 flex flex-col items-center">
                                     <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-3xl">☕</div>
                                     <p className="text-gray-400 text-lg">لا يوجد فعاليات اليوم، استمتع بوقتك!</p>
                                 </div>
                             ) : (
                                 agenda.map((evt) => {
                                     const eventTimeStr = evt.startTime?.toDate
                                         ? format(evt.startTime.toDate(), 'hh:mm a', { locale: ar })
                                         : (evt.startTime ? `الساعة ${evt.startTime}` : 'طوال اليوم');

                                     return (
                                         <div key={evt.id} className="relative pl-6 border-r-2 border-white/10 mr-2 pr-6 py-2">
                                             {/* Timeline Dot */}
                                             <div className={`absolute -right-[9px] top-6 w-4 h-4 rounded-full border-2 border-gray-900 ${evt.status === 'Done' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

                                             <div className="bg-white/5 hover:bg-white/10 transition-colors p-4 rounded-xl border border-white/5 flex justify-between items-center group">
                                                 <div>
                                                     <div className="text-sm text-indigo-300 font-mono mb-1 flex items-center">
                                                         <Clock size={12} className="ml-1" />
                                                         {eventTimeStr}
                                                     </div>
                                                     <h3 className="font-bold text-white text-lg">{evt.title}</h3>
                                                     <p className="text-gray-400 text-xs mt-1">{evt.typeName || 'نشاط عام'} • {evt.venueId || 'المدرسة'}</p>
                                                 </div>
                                                 <div className="text-left">
                                                     <span className={`px-2 py-1 rounded text-xs font-bold ${evt.status === 'Done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-gray-400'}`}>
                                                         {evt.status === 'Done' ? 'مكتمل' : 'مجدول'}
                                                     </span>
                                                 </div>
                                             </div>
                                         </div>
                                     );
                                 })
                             )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Sidebar (1/3 width) */}
                <div className="space-y-6">

                    {/* Quick Actions */}
                    <div className="bg-white/10 border border-white/10 rounded-2xl p-6">
                        <h3 className="font-bold text-gray-300 mb-4 text-sm">وصول سريع</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <Link to="/scheduler" className="bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 p-4 rounded-xl flex flex-col items-center justify-center text-center transition-all group">
                                <Plus size={24} className="text-indigo-400 group-hover:text-white mb-2" />
                                <span className="text-sm font-bold text-indigo-200 group-hover:text-white">إضافة نشاط</span>
                            </Link>
                            <Link to="/students" className="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 p-4 rounded-xl flex flex-col items-center justify-center text-center transition-all group">
                                <Users size={24} className="text-emerald-400 group-hover:text-white mb-2" />
                                <span className="text-sm font-bold text-emerald-200 group-hover:text-white">تسجيل طالب</span>
                            </Link>
                            <Link to="/reports" className="col-span-2 bg-gray-700/30 hover:bg-gray-700/50 border border-white/10 p-3 rounded-xl flex items-center justify-center transition-all group">
                                <FileText size={18} className="text-gray-400 group-hover:text-white ml-2" />
                                <span className="text-sm font-bold text-gray-300 group-hover:text-white">التقارير الشاملة</span>
                            </Link>
                        </div>
                    </div>

                    {/* Leaderboard Removed (Moved to top chart section) */}

                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, color, textColor, ...props }) {
    const CardIcon = props.icon;
    return (
        <div className="bg-white/5 hover:bg-white/10 transition-all border border-white/10 p-5 rounded-2xl relative overflow-hidden group">
            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}></div>
            <div className="relative z-10 flex items-center justify-between">
                <div>
                    <p className="text-gray-400 text-sm font-medium mb-1">{label}</p>
                    <h3 className={`text-3xl font-bold ${textColor}`}>{value}</h3>
                </div>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
                    {CardIcon && <CardIcon size={24} className="text-white" />}
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { format, isSameDay, startOfDay } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Calendar, Users, Box, Award, TrendingUp, Plus, FileText, Activity, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        todayEvents: 0,
        activeStudents: 0,
        maintenanceAssets: 0,
        totalPoints: 0
    });
    const [agenda, setAgenda] = useState([]);
    const [topStudents, setTopStudents] = useState([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const today = new Date();

            // 1. Fetch All Events (for Agenda & Stats)
            // Ideally we'd query by date range, but for now fetch all and filter client-side for "Today" 
            // to ensure timezone accuracy with "isSameDay" helper.
            const eventsSnap = await getDocs(query(collection(db, 'events'), orderBy('startTime', 'asc')));
            const allEvents = eventsSnap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    ...data,
                    startDate: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.date)
                };
            });

            const todayEventsList = allEvents.filter(e => isSameDay(e.startDate, today));

            // 2. Fetch Active Students
            const studentsSnap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
            const allStudents = studentsSnap.docs.map(d => d.data());

            // 3. Fetch Assets
            const assetsSnap = await getDocs(collection(db, 'assets'));
            const maintenanceCount = assetsSnap.docs.filter(d => d.data().status === 'Maintenance').length;

            // 4. Calculations
            const totalPoints = allStudents.reduce((sum, s) => sum + (Number(s.totalPoints) || 0), 0);
            const sortedStudents = [...studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }))]
                .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
                .slice(0, 5);

            setStats({
                todayEvents: todayEventsList.length,
                activeStudents: allStudents.length,
                maintenanceAssets: maintenanceCount,
                totalPoints
            });
            setAgenda(todayEventsList);
            setTopStudents(sortedStudents);

        } catch (error) {
            console.error("Dashboard Fetch Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const currentDateAr = format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar });

    if (loading) return <div className="flex items-center justify-center h-full text-white">جاري تحميل لوحة التحكم...</div>;

    return (
        <div className="space-y-8 font-cairo pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center bg-white/10 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-xl">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">مرحباً بك في مركز التحكم 👋</h1>
                    <p className="text-indigo-200 opacity-80">{currentDateAr}</p>
                </div>
                {/* Optional: Add a subtle weather or time widget here later */}
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
                                agenda.map((evt, idx) => (
                                    <div key={evt.id} className="relative pl-6 border-r-2 border-white/10 mr-2 pr-6 py-2">
                                        {/* Timeline Dot */}
                                        <div className={`absolute -right-[9px] top-6 w-4 h-4 rounded-full border-2 border-gray-900 ${evt.status === 'Done' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>

                                        <div className="bg-white/5 hover:bg-white/10 transition-colors p-4 rounded-xl border border-white/5 flex justify-between items-center group">
                                            <div>
                                                <div className="text-sm text-indigo-300 font-mono mb-1 flex items-center">
                                                    <Clock size={12} className="ml-1" />
                                                    {format(evt.startDate, 'hh:mm a')}
                                                </div>
                                                <h3 className="font-bold text-white text-lg">{evt.title}</h3>
                                                <p className="text-gray-400 text-xs mt-1">{evt.typeName} • {evt.venueId}</p>
                                            </div>
                                            <div className="text-left">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${evt.status === 'Done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-gray-400'}`}>
                                                    {evt.status === 'Done' ? 'مكتمل' : 'مجدول'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
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

                    {/* Leaderboard */}
                    <div className="bg-gradient-to-b from-white/10 to-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"></div>
                        <h3 className="font-bold text-white mb-4 flex items-center">
                            <Award className="ml-2 text-amber-400" /> المتصدرين
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
                                            <div className="text-[10px] text-gray-500">{student.class}</div>
                                        </div>
                                    </div>
                                    <div className="text-amber-400 font-mono font-bold text-sm">{student.totalPoints}</div>
                                </div>
                            ))}
                            {topStudents.length === 0 && <p className="text-center text-gray-500 text-xs">لا يوجد بيانات</p>}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function StatCard({ label, value, icon: Icon, color, textColor }) {
    return (
        <div className="bg-white/5 hover:bg-white/10 transition-all border border-white/10 p-5 rounded-2xl relative overflow-hidden group">
            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}></div>
            <div className="relative z-10 flex items-center justify-between">
                <div>
                    <p className="text-gray-400 text-sm font-medium mb-1">{label}</p>
                    <h3 className={`text-3xl font-bold ${textColor}`}>{value}</h3>
                </div>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${color} shadow-lg`}>
                    <Icon size={24} className="text-white" />
                </div>
            </div>
        </div>
    );
}

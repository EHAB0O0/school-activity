import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, isSameDay, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, Calendar, Clock, MapPin } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';

export default function PublicView() {
    // --- Scheduler State ---
    const [events, setEvents] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('week'); // week | month
    const [loading, setLoading] = useState(false);

    const { activeProfile, weekends, holidays } = useSettings();

    // --- Real-time Fetch ---
    useEffect(() => {
        setLoading(true);
        let start, end;
        if (view === 'week') {
            start = startOfWeek(currentDate, { weekStartsOn: 0 });
            end = endOfWeek(currentDate, { weekStartsOn: 0 });
        } else {
            start = startOfMonth(currentDate);
            end = endOfMonth(currentDate);
        }

        const q = query(
            collection(db, 'events'),
            where('startTime', '>=', Timestamp.fromDate(start)),
            where('startTime', '<=', Timestamp.fromDate(end))
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const evs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(ev => ev.status !== 'archived');
            setEvents(evs);
            setLoading(false);
        }, (error) => {
            console.error("Snapshot error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentDate, view]);

    // --- Helpers ---
    const getMonthTitle = (date) => format(date, 'MMMM yyyy', { locale: ar });

    // --- Navigation ---
    const next = () => setCurrentDate(view === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));
    const prev = () => setCurrentDate(view === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));

    // --- Render Helpers ---
    const getEventStyle = (event) => {
        if (!event.startTime || !event.endTime || !activeProfile?.slots) return { top: 0, height: 'auto', left: 0, width: '100%' };

        const eStart = event.startTime.toDate ? format(event.startTime.toDate(), 'HH:mm') : event.startTime;
        const eEnd = event.endTime.toDate ? format(event.endTime.toDate(), 'HH:mm') : event.endTime;

        const allSlots = activeProfile.slots;
        if (allSlots.length === 0) return {};

        const firstStart = allSlots[0].start;
        const lastEnd = allSlots[allSlots.length - 1].end;

        // Calculate total minutes in school day
        const getMinutes = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const totalMinutes = getMinutes(lastEnd) - getMinutes(firstStart);

        const startMin = getMinutes(eStart) - getMinutes(firstStart);
        const durationMin = getMinutes(eEnd) - getMinutes(eStart);

        const startPercent = (startMin / totalMinutes) * 100;
        const widthPercent = (durationMin / totalMinutes) * 100;

        return {
            left: startPercent,
            width: widthPercent
        };
    };

    // --- PUBLIC CALENDAR ---
    return (
        <div className="min-h-screen bg-[#09090b] font-cairo text-right text-white flex flex-col">
            <Toaster position="bottom-center" />

            {/* Header */}
            <div className="p-4 md:p-6 bg-white/5 border-b border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-50 backdrop-blur-md">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg">
                        <Calendar className="text-white" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">جدول الأنشطة المدرسي</h1>
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock size={10} /> تحديث مباشر
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4 bg-black/20 p-1.5 rounded-xl border border-white/5">
                    <button onClick={prev} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronRight size={20} /></button>
                    <div className="text-center min-w-[140px] font-bold">
                        {getMonthTitle(currentDate)}
                    </div>
                    <button onClick={next} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
                </div>

                <div className="flex bg-black/30 p-1 rounded-xl border border-white/5">
                    <button onClick={() => setView('week')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>أسبوعي</button>
                    <button onClick={() => setView('month')} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>شهري</button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col">
                {loading && <div className="text-center text-sm text-indigo-400 mb-2 animate-pulse">جاري تحديث البيانات...</div>}

                {/* WEEK VIEW */}
                {view === 'week' && (
                    <div className="flex-1 overflow-hidden flex flex-col bg-white/5 border border-white/10 rounded-2xl shadow-2xl">
                        {/* Header Row (Slots) */}
                        <div className="h-12 border-b border-white/10 flex sticky top-0 bg-[#1a1a20] z-30">
                            <div className="w-32 border-l border-white/10 flex items-center justify-center font-bold text-gray-400 bg-white/5">
                                اليوم
                            </div>
                            <div className="flex-1 relative">
                                {activeProfile?.slots?.map((slot, idx) => {
                                    // Calculate Width % based on total minutes
                                    // Re-using logic from getEventStyle but for headers
                                    const allSlots = activeProfile.slots;
                                    const first = allSlots[0].start;
                                    const last = allSlots[allSlots.length - 1].end;
                                    const getMin = t => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
                                    const total = getMin(last) - getMin(first);
                                    const startP = ((getMin(slot.start) - getMin(first)) / total) * 100;
                                    const widthP = ((getMin(slot.end) - getMin(slot.start)) / total) * 100;

                                    return (
                                        <div key={idx} className="absolute top-0 bottom-0 border-l border-white/5 flex items-center justify-center text-xs text-gray-400 hover:bg-white/5 transition-colors"
                                            style={{ right: `${startP}%`, width: `${widthP}%` }}>
                                            {slot.label}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Days Rows */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                                const dayDate = addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), dayOffset);
                                const isToday = isSameDay(dayDate, new Date());
                                const dayName = format(dayDate, 'EEEE', { locale: ar });
                                const dayStr = format(dayDate, 'yyyy-MM-dd');

                                // Blocked?
                                const isWeekend = weekends?.includes(dayDate.getDay());
                                const isHoliday = holidays?.find(h => h.date >= dayStr && h.date <= dayStr);

                                const dayEvents = events.filter(e => e.date === dayStr);

                                return (
                                    <div key={dayStr} className={`min-h-[100px] border-b border-white/5 flex group ${isToday ? 'bg-indigo-900/10' : ''}`}>
                                        {/* Date Label */}
                                        <div className={`w-32 border-l border-white/10 flex flex-col items-center justify-center p-2 ${isWeekend || isHoliday ? 'bg-red-900/10 text-red-300' : 'text-gray-300'}`}>
                                            <span className="font-bold text-lg">{dayName}</span>
                                            <span className="text-xs opacity-60 font-mono">{dayStr}</span>
                                            {isHoliday && <span className="text-[10px] bg-red-500/20 px-2 rounded mt-1">عطلة</span>}
                                        </div>

                                        {/* Timeline */}
                                        <div className="flex-1 relative bg-black/20">
                                            {/* Grid Lines */}
                                            {activeProfile?.slots?.map((slot, idx) => {
                                                const allSlots = activeProfile.slots;
                                                const first = allSlots[0].start;
                                                const last = allSlots[allSlots.length - 1].end;
                                                const getMin = t => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
                                                const total = getMin(last) - getMin(first);
                                                const startP = ((getMin(slot.start) - getMin(first)) / total) * 100;
                                                const widthP = ((getMin(slot.end) - getMin(slot.start)) / total) * 100;
                                                return (
                                                    <div key={idx} className="absolute inset-y-0 border-l border-white/5" style={{ right: `${startP}%`, width: `${widthP}%` }}></div>
                                                )
                                            })}

                                            {/* Events */}
                                            {dayEvents.map(ev => {
                                                const style = getEventStyle(ev);
                                                return (
                                                    <div key={ev.id}
                                                        className={`absolute top-2 bottom-2 rounded-xl p-2 md:px-3 text-xs flex flex-col justify-center overflow-hidden shadow-lg border text-white
                                                            ${ev.status === 'Done'
                                                                ? 'bg-emerald-900/80 border-emerald-500/30'
                                                                : 'bg-indigo-900/80 border-indigo-500/30'}
                                                        `}
                                                        style={{ right: `${style.left}%`, width: `${style.width}%` }}
                                                    >
                                                        <div className="font-bold truncate">{ev.title}</div>
                                                        <div className="flex items-center gap-1 opacity-70 truncate text-[10px] mt-1">
                                                            <MapPin size={10} /> {ev.venueId}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* MONTH VIEW */}
                {view === 'month' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white/5 border border-white/10 rounded-2xl p-4">
                        <div className="grid grid-cols-7 gap-px bg-white/10 rounded-lg overflow-hidden border border-white/10">
                            {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(d => (
                                <div key={d} className="bg-[#1e1e24] p-3 text-center font-bold text-gray-400 text-sm">
                                    {d}
                                </div>
                            ))}

                            {(() => {
                                const mStart = startOfMonth(currentDate);
                                const mEnd = endOfMonth(mStart);
                                const sDate = startOfWeek(mStart, { weekStartsOn: 0 });
                                const eDate = endOfWeek(mEnd, { weekStartsOn: 0 });
                                const days = [];
                                let d = sDate;
                                while (d <= eDate) { days.push(d); d = addDays(d, 1); }

                                return days.map((day, idx) => {
                                    const dStr = format(day, 'yyyy-MM-dd');
                                    const isMonth = isSameDay(day, mStart) || (day >= mStart && day <= mEnd);
                                    const isToday = isSameDay(day, new Date());
                                    const evs = events.filter(e => e.date === dStr);

                                    return (
                                        <div key={idx} className={`bg-[#18181b] min-h-[120px] p-2 flex flex-col ${!isMonth ? 'opacity-30' : ''}`}>
                                            <div className={`text-sm font-bold mb-2 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                                                {format(day, 'd')}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                {evs.slice(0, 3).map(ev => (
                                                    <div key={ev.id} className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-1 truncate text-gray-300">
                                                        {ev.title}
                                                    </div>
                                                ))}
                                                {evs.length > 3 && <div className="text-[10px] text-center text-gray-500">+{evs.length - 3} المزيد</div>}
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                )}

                <div className="mt-4 text-center text-xs text-gray-500 font-mono">
                    Public Read-Only View • School Activity Manager
                </div>
            </div>
        </div>
    );
}

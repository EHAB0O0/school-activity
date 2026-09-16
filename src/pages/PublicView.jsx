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

    const [calendarSystem, setCalendarSystem] = useState('gregory'); // gregory | hijri

    const { activeProfile, weekends, holidays } = useSettings();

    // --- Helpers ---
    const getHijriDate = (date) => {
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    };
    const getHijriDay = (date) => {
        return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric' }).format(date);
    };

    const getMonthTitle = (date) => {
        if (calendarSystem === 'hijri') {
            return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(date);
        }
        return format(date, 'MMMM yyyy', { locale: ar });
    };

    // --- Real-time Fetch ---
    useEffect(() => {
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


    // --- Navigation ---
    const next = () => setCurrentDate(view === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));
    const prev = () => setCurrentDate(view === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));

    // --- Render Helpers ---
    const getEventStyle = (event) => {
        if (!event.startTime || !event.endTime || !activeProfile?.slots) return { top: 0, height: 'auto', left: 0, width: '100%' };

        let eStart = event.startTime.toDate ? format(event.startTime.toDate(), 'HH:mm') : event.startTime;
        let eEnd = event.endTime.toDate ? format(event.endTime.toDate(), 'HH:mm') : event.endTime;

        // Fallback for full day or missing times
        if (!eStart) eStart = "08:00";
        if (!eEnd) eEnd = "09:00";

        const allSlots = activeProfile.slots;
        if (allSlots.length === 0) return {};

        const firstStart = allSlots[0].start;
        const lastEnd = allSlots[allSlots.length - 1].end;

        // Calculate total minutes in school day
        const getMinutes = (t) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const totalMinutes = getMinutes(lastEnd) - getMinutes(firstStart);

        const startMin = getMinutes(eStart) - getMinutes(firstStart);
        const durationMin = getMinutes(eEnd) - getMinutes(eStart);

        const startPercent = (startMin / totalMinutes) * 100;
        const widthPercent = (durationMin / totalMinutes) * 100;

        return {
            left: `${Math.max(0, startPercent)}%`,
            width: `${Math.min(100, widthPercent)}%`
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
                    <button onClick={prev} aria-label="الفترة السابقة" className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronRight size={20} /></button>
                    <div className="text-center min-w-[140px] font-bold">
                        {getMonthTitle(currentDate)}
                    </div>
                    <button onClick={next} aria-label="الفترة التالية" className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
                </div>

                <div className="flex items-center gap-2">
                    {/* Calendar Toggle */}
                    <div className="flex bg-black/30 p-1 rounded-xl border border-white/5 ml-2">
                        <button onClick={() => setCalendarSystem('gregory')} aria-label="التقويم الميلادي" className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarSystem === 'gregory' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>ميلادي</button>
                        <button onClick={() => setCalendarSystem('hijri')} aria-label="التقويم الهجري" className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${calendarSystem === 'hijri' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'}`}>هجري</button>
                    </div>

                    <div className="flex bg-black/30 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setView('week')} aria-label="عرض أسبوعي" className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>أسبوعي</button>
                        <button onClick={() => setView('month')} aria-label="عرض شهري" className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>شهري</button>
                    </div>
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
                                return { dayDate, dayOffset };
                            }).filter(({ dayDate }) => {
                                const dayOfWeek = dayDate.getDay();
                                const isWeekendDay = (weekends && weekends.length > 0) 
                                    ? weekends.includes(dayOfWeek) 
                                    : (dayOfWeek === 5 || dayOfWeek === 6);
                                return !isWeekendDay; // Exclude weekends: show only actual school week (Sunday-Thursday)
                            }).map(({ dayDate }) => {
                                const isToday = isSameDay(dayDate, new Date());
                                const dayName = format(dayDate, 'EEEE', { locale: ar });
                                const dayStr = format(dayDate, 'yyyy-MM-dd');

                                // Check for Official Holiday
                                const holiday = holidays?.find(h => {
                                    if (h.date === dayStr) return true;
                                    if (h.start && h.end && dayStr >= h.start && dayStr <= h.end) return true;
                                    return false;
                                });

                                const dayEvents = events.filter(e => {
                                    const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                    return eDate === dayStr;
                                });

                                return (
                                    <div key={dayStr} className={`min-h-[115px] border-b border-white/5 flex group ${isToday ? 'bg-indigo-950/20' : ''}`}>
                                        {/* Date Label Column */}
                                        <div className={`w-36 shrink-0 border-l border-white/10 flex flex-col items-center justify-center p-3 ${holiday ? 'bg-amber-950/20 text-amber-200' : 'text-gray-300'}`}>
                                            <span className="font-bold text-lg">{dayName}</span>
                                            <span className="text-xs opacity-70 font-mono mt-0.5">
                                                {calendarSystem === 'hijri' ? getHijriDate(dayDate) : dayStr}
                                            </span>
                                            {holiday && (
                                                <span className="text-xs font-bold bg-amber-500/20 border border-amber-500/40 px-2 py-1 rounded-lg mt-2 text-amber-300 text-center shadow-sm">
                                                    🌴 {holiday.reason}
                                                </span>
                                            )}
                                        </div>

                                        {/* Timeline / Events Column */}
                                        <div className="flex-1 relative bg-black/20">
                                            {holiday ? (
                                                /* Prominent Official Holiday Showcase */
                                                <div className="absolute inset-0 flex items-center justify-center p-4 bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-amber-500/10">
                                                    <div className="flex items-center gap-4 bg-black/50 px-6 py-3 rounded-2xl border border-amber-500/30 shadow-xl backdrop-blur-sm">
                                                        <div className="p-2.5 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl text-black font-bold shadow-md">
                                                            <Calendar size={22} />
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                                                                    إجازة رسمية معتمدة
                                                                </span>
                                                                <h3 className="text-base font-bold text-white">
                                                                    {holiday.reason}
                                                                </h3>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mt-1">
                                                                عطلة مدرسية رسمية &bull; لا توجد فعاليات مجدولة في هذا اليوم
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
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
                                                        );
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
                                                                style={style}
                                                            >
                                                                <div className="font-bold truncate">{ev.title}</div>
                                                                <div className="flex items-center gap-1 opacity-70 truncate text-[10px] mt-1">
                                                                    <MapPin size={10} /> {ev.venueId}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {dayEvents.length === 0 && (
                                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600 pointer-events-none">
                                                            لا توجد أنشطة مجدولة
                                                        </div>
                                                    )}
                                                </>
                                            )}
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

                                    // Blocking Logic
                                    const isWeekend = (weekends && weekends.length > 0)
                                        ? weekends.includes(day.getDay())
                                        : (day.getDay() === 5 || day.getDay() === 6);
                                    const holiday = holidays?.find(h => {
                                        if (h.date === dStr) return true;
                                        if (h.start && h.end && dStr >= h.start && dStr <= h.end) return true;
                                        return false;
                                    });
                                    const isBlocked = isWeekend || !!holiday;
                                    const blockReason = holiday ? `🌴 ${holiday.reason}` : (isWeekend ? 'عطلة نهاية الأسبوع' : '');

                                    const evs = events.filter(e => {
                                        const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                        return eDate === dStr;
                                    });

                                    return (
                                        <div key={idx} className={`bg-[#18181b] min-h-[120px] p-2 flex flex-col ${!isMonth ? 'opacity-30' : ''} ${holiday ? 'bg-amber-950/20 border-amber-500/20' : (isWeekend ? 'bg-rose-950/10' : '')}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : (holiday ? 'bg-amber-500/30 text-amber-200' : (isBlocked ? 'text-rose-400' : 'text-gray-400'))}`}>
                                                    {format(day, 'd')}
                                                </div>
                                                {calendarSystem === 'hijri' && (
                                                    <span className={`text-[10px] font-bold ${holiday ? 'text-amber-300' : (isBlocked ? 'text-rose-400' : 'text-emerald-400')}`}>
                                                        {getHijriDay(day)}
                                                    </span>
                                                )}
                                            </div>

                                            {isBlocked && (
                                                <div className={`text-[10px] font-bold px-1.5 py-1 rounded text-center mb-1 truncate ${holiday ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-rose-900/20 border border-rose-500/20 text-rose-300'}`}>
                                                    {blockReason}
                                                </div>
                                            )}

                                            <div className="flex-1 space-y-1">
                                                {!isBlocked && evs.slice(0, 3).map(ev => (
                                                    <div key={ev.id} className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-1 truncate text-gray-300">
                                                        {ev.title}
                                                    </div>
                                                ))}
                                                {!isBlocked && evs.length > 3 && <div className="text-[10px] text-center text-gray-400">+{evs.length - 3} المزيد</div>}
                                            </div>
                                        </div>
                                    )
                                })
                            })()}
                        </div>
                    </div>
                )}

                <div className="mt-4 text-center text-xs text-gray-400 font-mono">
                    Public Read-Only View • School Activity Manager
                </div>
            </div>
        </div>
    );
}

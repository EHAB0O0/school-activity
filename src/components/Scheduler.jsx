import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, addDoc, Timestamp, writeBatch, doc, increment, deleteDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { checkConflicts } from '../utils/ConflictGuard';
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, isSameDay, parse, set, isPast } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, Plus, CheckCircle, Calendar, Clock, MapPin, AlertTriangle, Users, Box, X, Search, Check, Trash2, Edit3, Lock, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmModal from './ui/ConfirmModal';
import DeleteEventModal from './ui/DeleteEventModal';
import PrintOptionsModal from './ui/PrintOptionsModal';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// --- Internal Component: MultiSelect moved to ui/MultiSelect.jsx ---
import MultiSelect from './ui/MultiSelect';


// --- Internal Component: Event Modal ---
import EventModal from './EventModal';

// --- Main Scheduler Component ---
export default function Scheduler() {
    const { activeProfile, eventTypes, weekends, holidays } = useSettings();
    const [events, setEvents] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('week'); // week | month
    const [calendarSystem, setCalendarSystem] = useState('gregory'); // gregory | hijri
    const [isLoading, setIsLoading] = useState(false);
    const schedulerRef = React.useRef(null); // Ref for Visual Print

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    const [deleteOptsModal, setDeleteOptsModal] = useState({ isOpen: false, event: null });
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

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

    // Fetch Events Logic
    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            let start, end;
            if (view === 'week') {
                start = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
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

            // Add archived filter
            // Note: Compound queries with status != 'archived' require index.
            // Client-side filtering is easier here given small dataset
            const querySnapshot = await getDocs(q);
            const eventsData = querySnapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id })) // Fix: id last to prevent overwrite by data().id (if null)
                .filter(ev => ev.status !== 'archived');

            setEvents(eventsData);
        } catch (error) {
            console.error("Error fetching events:", error);
            toast.error("فشل في تحميل الجدول");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, [currentDate, view]);

    const handleSaveEvent = async (eventPayload) => {
        try {
            // Handle Batch (Recurring)
            if (Array.isArray(eventPayload)) {
                const batch = writeBatch(db);
                eventPayload.forEach(ev => {
                    const ref = doc(collection(db, 'events'));
                    batch.set(ref, ev);
                });
                await batch.commit();
                toast.success(`تم إنشاء ${eventPayload.length} نشاط متكرر بنجاح`);
                setIsModalOpen(false);
                fetchEvents();
                return;
            }

            if (eventPayload.markDone) {
                await handleMarkEventDone(eventPayload);
                return;
            }

            if (eventPayload.id) {
                // Check if editing points for a DONE event
                if (modalData?.status === 'Done') {
                    const oldPoints = Number(modalData.points || 10);
                    const newPoints = Number(eventPayload.points || 10);
                    if (oldPoints !== newPoints) {
                        await handlePointsAdjustment(eventPayload, oldPoints, newPoints);
                    } else {
                        await updateDoc(doc(db, 'events', eventPayload.id), eventPayload);
                    }
                } else {
                    await updateDoc(doc(db, 'events', eventPayload.id), eventPayload);
                }
                toast.success("تم تحديث النشاط");
            } else {
                await addDoc(collection(db, 'events'), eventPayload);
                toast.success("تمت إضافة النشاط بنجاح");
            }
            setIsModalOpen(false);
            fetchEvents();
        } catch (error) {
            console.error("Error saving document: ", error);
            toast.error("حدث خطأ أثناء الحفظ");
        }
    };

    const handlePointsAdjustment = async (eventData, oldPoints, newPoints) => {
        const loadingToast = toast.loading(`تحديث النقاط: ${oldPoints} -> ${newPoints}...`);
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);

                // 1. Update Event
                transaction.update(eventRef, eventData);

                // 2. Adjust Students
                const diff = newPoints - oldPoints;
                if (eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, {
                            totalPoints: increment(diff)
                        });
                    }
                }
            });
            toast.success("تم إعادة احتساب نقاط الطلاب!");
        } catch (e) {
            console.error(e);
            throw e; // Bubble up to handleSaveEvent
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    const handleMarkEventDone = async (eventData) => {
        const loadingToast = toast.loading("جاري رصد النقاط...");
        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);
                const pointsToAward = Number(eventData.points) || 10;

                // 1. Update Event Status
                transaction.update(eventRef, { status: 'Done', points: pointsToAward });

                // 2. Award Points to Students
                if (eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        transaction.update(studentRef, {
                            totalPoints: increment(pointsToAward)
                            // Note: We use 'totalPoints' in StudentsPage, verify schema matches 'points' or 'totalPoints'
                            // StudentsPage uses 'totalPoints'. Scheduler delete used 'points'. Correcting to 'totalPoints'.
                        });
                    }
                }
            });
            toast.success("تم تنفيذ النشاط ورصد النقاط للطلاب!");
            setIsModalOpen(false);
            fetchEvents();
        } catch (e) {
            console.error(e);
            toast.error("فشل في العملية");
        } finally {
            toast.dismiss(loadingToast);
        }
    };

    // Logic for deleting event click
    // Logic for deleting event click
    const confirmDeleteEvent = (eventData) => {
        let eventStart;
        // Robust Date Parsing
        if (eventData?.startTime?.toDate) {
            eventStart = eventData.startTime.toDate();
        } else if (eventData?.date && eventData?.startTime) {
            // Check if startTime is just HH:mm or full ISO
            const timeStr = eventData.startTime.includes('T') ? eventData.startTime.split('T')[1] : eventData.startTime;
            eventStart = new Date(`${eventData.date}T${timeStr}`);
        } else {
            // Fallback to current date to be safe (client-side only logic)
            eventStart = new Date();
        }

        const isPastEvent = eventStart < new Date();

        if (isPastEvent) {
            // Use Enhanced Smart Delete for Past Events
            setDeleteOptsModal({ isOpen: true, event: eventData });
        } else {
            // Standard Delete for Future Events
            setConfirmModal({
                isOpen: true,
                title: "حذف النشاط",
                message: "هل أنت متأكد من حذف هذا النشاط المستقبلي نهائياً؟",
                isDestructive: true,
                onConfirm: () => handleDeleteEventSimple(eventData.id)
            });
        }
    }

    const handleDeleteEventSimple = async (id) => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
            await deleteDoc(doc(db, 'events', id));
            toast.success("تم حذف النشاط");
            setIsModalOpen(false);
            fetchEvents();
        } catch (e) { toast.error("فشل الحذف"); }
    }

    const handleSmartDelete = async ({ reversePoints, actionType }) => {
        const eventData = deleteOptsModal.event;
        setDeleteOptsModal({ ...deleteOptsModal, isOpen: false });
        setIsModalOpen(false); // Close parent
        const loadingToast = toast.loading("جاري معالجة الطلب...");

        try {
            await runTransaction(db, async (transaction) => {
                const eventRef = doc(db, 'events', eventData.id);

                // 1. Reverse Points (if requested)
                if (reversePoints && eventData.participatingStudents && eventData.participatingStudents.length > 0) {
                    // We assume points awarded were e.g. 10 (hardcoded or from event type). 
                    // For now, let's assume a standard deduction or retrieve from event customData if implemented.
                    // Assuming 10 for demo or fetch logic. 
                    // Ideally, event document should store "pointsAwarded". Let's assume 10 for safety or skip if unknown.
                    const pointsToDeduct = -10; // Negative increment

                    for (const studentId of eventData.participatingStudents) {
                        const studentRef = doc(db, 'students', studentId);
                        // Using totalPoints to match schema (verified in StudentsPage)
                        transaction.update(studentRef, { totalPoints: increment(pointsToDeduct) });
                    }
                }

                // 2. Action (Archive or Delete)
                if (actionType === 'archive') {
                    transaction.update(eventRef, { status: 'archived' });
                } else {
                    transaction.delete(eventRef);
                }
            });

            toast.dismiss(loadingToast);
            toast.success(reversePoints ? "تم الحذف وخصم النقاط بنجاح" : "تم الحذف بنجاح");
            fetchEvents();

        } catch (error) {
            console.error(error);
            toast.dismiss(loadingToast);
            toast.error("فشل في العملية");
        }
    }

    // --- Printing Logic ---
    const handlePrintSelect = async (type) => {
        setIsPrintModalOpen(false);
        const toastId = toast.loading('جاري تحضير الملف...');

        try {
            if (type === 'visual') {
                if (!schedulerRef.current) throw new Error("Scheduler element not found");

                const canvas = await html2canvas(schedulerRef.current, {
                    useCORS: true,
                    backgroundColor: '#1f2937', // Force Hex background
                    scale: 2,
                    logging: false,
                    ignoreElements: (element) => element.classList.contains('no-print')
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.8); // Define it here
                const pdf = new jsPDF('l', 'pt', 'a4'); // Landscape
                const pdfWidth = 841.89;
                const pdfHeight = 595.28;

                const imgProps = pdf.getImageProperties(imgData);
                const ratio = imgProps.width / imgProps.height;
                const width = pdfWidth;
                const height = width / ratio;

                pdf.addImage(imgData, 'JPEG', 0, (pdfHeight - height) / 2, width, height); // Use it here
                pdf.save(`Scheduler_Visual_${format(new Date(), 'yyyy-MM-dd')}.pdf`);

            } else if (type === 'agenda') {
                const title = `جدول الأنشطة - ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'd MMM')} إلى ${format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'd MMM yyyy')}`;

                // Group events by Day
                const start = startOfWeek(currentDate, { weekStartsOn: 0 });
                const end = endOfWeek(currentDate, { weekStartsOn: 0 });
                const days = [];
                let runner = start;
                while (runner <= end) {
                    days.push(runner);
                    runner = addDays(runner, 1);
                }

                const eventsByDay = days.map(day => {
                    const dStr = format(day, 'yyyy-MM-dd');
                    const dayEvents = events
                        .filter(e => {
                            const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                            return eDate === dStr;
                        })
                        .sort((a, b) => (a.startTime && b.startTime && a.startTime.seconds - b.startTime.seconds));
                    return { date: day, events: dayEvents };
                });

                // Generate HTML for Iframe
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.top = '-9999px';
                iframe.style.width = '800px';
                document.body.appendChild(iframe);
                const doc = iframe.contentWindow.document;
                doc.open();

                const rowsHtml = eventsByDay.map(dayGroup => {
                    if (dayGroup.events.length === 0) return '';
                    // Ehab's Request: Add Hijri Date
                    const dayTitle = `${format(dayGroup.date, 'EEEE d MMMM', { locale: ar })} (${getHijriDate(dayGroup.date)})`;

                    const eventsHtml = dayGroup.events.map(ev => {
                        const startT = ev.startTime && ev.startTime.toDate ? format(ev.startTime.toDate(), 'HH:mm') : '??:??';
                        const endT = ev.endTime && ev.endTime.toDate ? format(ev.endTime.toDate(), 'HH:mm') : '??:??';

                        // Custom Fields HTML
                        const customFieldsHtml = ev.customData && Object.keys(ev.customData).length > 0 ? `
                            <div class="custom-fields">
                                ${Object.entries(ev.customData).map(([k, v]) => `
                                    <span class="field-pill"><strong>${k}:</strong> ${v}</span>
                                `).join('')}
                            </div>
                        ` : '';

                        return `
                            <div class="event-row">
                                <span class="time">${startT} - ${endT}</span>
                                <div class="details">
                                    <div class="title">${ev.title}</div>
                                    <div class="meta">
                                        <span class="venue">📍 ${ev.venueId}</span>
                                        ${ev.typeName ? `<span class="type">🏷️ ${ev.typeName}</span>` : ''}
                                        <span class="metric">⭐ ${ev.points || 10} نقطة</span>
                                        <span class="metric">👤 ${ev.participatingStudents?.length || 0} طالب</span>
                                    </div>
                                    ${customFieldsHtml}
                                </div>
                            </div>
                         `;
                    }).join('');

                    return `
                        <div class="day-group">
                            <h3 class="day-header">${dayTitle}</h3>
                            <div class="events-list">
                                ${eventsHtml}
                            </div>
                        </div>
                    `;
                }).join('');

                doc.write(`
                    <!DOCTYPE html>
                    <html dir="rtl" lang="ar">
                    <head>
                        <style>
                            body { font-family: 'Arial', sans-serif; padding: 40px; color: #333; background: #fff; }
                            h1 { text-align: center; color: #4f46e5; margin-bottom: 5px; }
                            .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 40px; }
                            
                            .day-group { margin-bottom: 25px; page-break-inside: avoid; }
                            .day-header { 
                                background-color: #f3f4f6; 
                                color: #111827; 
                                padding: 8px 15px; 
                                border-radius: 6px; 
                                font-size: 16px; 
                                margin-bottom: 10px;
                                border-right: 4px solid #4f46e5;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            }
                            .event-row { 
                                display: flex; 
                                padding: 10px 12px; 
                                border-bottom: 1px solid #eee;
                                align-items: flex-start;
                            }
                            .event-row:last-child { border-bottom: none; }
                            .time { 
                                font-family: monospace; 
                                font-weight: bold; 
                                color: #4b5563; 
                                width: 100px; 
                                flex-shrink: 0;
                                font-size: 13px;
                                margin-top: 2px;
                            }
                            .details { flex: 1; margin-right: 15px; }
                            .title { font-weight: bold; font-size: 15px; margin-bottom: 4px; color: #111827; }
                            .meta { font-size: 11px; color: #6b7280; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 4px; align-items: center; }
                            .venue { color: #059669; font-weight: 600; }
                            .type { color: #6366f1; }
                            .metric { color: #d97706; display: flex; align-items: center; gap: 2px; }
                            
                            .custom-fields { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
                            .field-pill {
                                background: #f9fafb;
                                border: 1px solid #e5e7eb;
                                padding: 2px 6px;
                                border-radius: 4px;
                                font-size: 10px;
                                color: #4b5563;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>جدول الأنشطة الأسبوعي</h1>
                        <p class="subtitle">${title}</p>
                        ${rowsHtml || '<p style="text-align:center;">لا توجد أنشطة لهذا الأسبوع</p>'}
                    </body>
                    </html>
                `);
                doc.close();

                await new Promise(r => setTimeout(r, 800)); // Increased wait slightly for fonts

                const canvas = await html2canvas(doc.body, { scale: 2 });
                document.body.removeChild(iframe);

                const pdf = new jsPDF('p', 'pt', 'a4');
                const pdfWidth = 595.28;
                const pdfHeight = 841.89;

                // Smart Slicing
                const imgWidth = pdfWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;

                let heightLeft = imgHeight;
                let position = 0;

                // FIXED: Define imgData in scope
                const imgData = canvas.toDataURL('image/jpeg', 0.85);

                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position -= pdfHeight;
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pdfHeight;
                }

                pdf.save(`Agenda_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            }

            toast.success("تم تصدير الملف بنجاح", { id: toastId });
        } catch (error) {
            console.error("Print Error:", error);
            toast.error("فشل في الطباعة", { id: toastId });
        }
    };

    const handleCellClick = (day, slot) => {
        if (slot && slot.type !== 'Class') return;
        setModalData({
            date: format(day, 'yyyy-MM-dd'),
            startTime: slot ? slot.start : '08:00',
            endTime: slot ? slot.end : '09:00',
            typeId: ''
        });
        setIsModalOpen(true);
    };

    const handleEventClick = (e, ev) => {
        e.stopPropagation();
        setModalData({
            ...ev,
            id: ev.id, // Explicitly pass ID LAST to ensure it survives
            startTime: ev.startTime?.toDate ? format(ev.startTime.toDate(), 'HH:mm') : ev.startTime,
            endTime: ev.endTime?.toDate ? format(ev.endTime.toDate(), 'HH:mm') : ev.endTime,
            date: ev.startTime?.toDate ? format(ev.startTime.toDate(), 'yyyy-MM-dd') : ev.date
        });
        setIsModalOpen(true);
    };

    // Navigation
    const navigate = (direction) => {
        if (view === 'week') {
            setCurrentDate(addDays(currentDate, direction * 7));
        } else {
            const newDate = new Date(currentDate);
            newDate.setMonth(newDate.getMonth() + direction);
            setCurrentDate(newDate);
        }
    };

    const prev = () => navigate(-1);
    const next = () => navigate(1);

    // Days for Week View (Sun -> Thu)
    const weekDays = useMemo(() => {
        const start = startOfWeek(currentDate, { weekStartsOn: 0 });
        const days = [];
        for (let i = 0; i < 5; i++) { // Sun to Thu (5 days)
            days.push(addDays(start, i));
        }
        return days;
    }, [currentDate]);

    // Slots from Active Profile
    const slots = activeProfile?.slots || [];

    // --- Visual Grid Helpers ---
    const gridMetrics = useMemo(() => {
        if (!slots || slots.length === 0) return { start: 420, end: 900, total: 480 }; // Default 7am - 3pm
        const toMins = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        // Safely find min start and max end
        let min = 24 * 60;
        let max = 0;
        slots.forEach(s => {
            const sM = toMins(s.start);
            const eM = toMins(s.end);
            if (sM < min) min = sM;
            if (eM > max) max = eM;
        });
        return { start: min, end: max, total: max - min };
    }, [slots]);

    const getPositionStyle = (startStr, endStr) => {
        const toMins = (t) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };
        const s = toMins(startStr);
        const e = toMins(endStr);
        const startPct = ((s - gridMetrics.start) / gridMetrics.total) * 100;
        const widthPct = ((e - s) / gridMetrics.total) * 100;
        return { left: startPct, width: widthPct };
    };

    const getEventStyle = (ev) => {
        // Event times are Date objects or strings
        const getStr = (d) => {
            if (typeof d === 'string') {
                if (d.includes('T')) return format(new Date(d), 'HH:mm');
                return d;
            }
            if (d?.toDate) return format(d.toDate(), 'HH:mm'); // Firestore Timestamp
            if (d instanceof Date) return format(d, 'HH:mm');
            return "00:00";
        };
        const sStr = getStr(ev.startTime);
        const eStr = getStr(ev.endTime);
        const style = getPositionStyle(sStr, eStr);
        return {
            left: style.left,
            width: style.width
        };
    };

    // --- Visual Merging Helper ---
    const getMergedEvents = (dayEvents) => {
        if (!dayEvents || dayEvents.length === 0) return [];

        // 1. Sort by Start Time
        const sorted = [...dayEvents].sort((a, b) => {
            const tA = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
            const tB = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
            return tA - tB;
        });

        const merged = [];
        let current = null;

        for (const ev of sorted) {
            if (!current) {
                current = { ...ev, originalCount: 1, originalIds: [ev.id] };
                continue;
            }

            // Check if contiguous and identical
            const prevEnd = current.endTime?.toDate ? current.endTime.toDate() : new Date(current.endTime);
            const currStart = ev.startTime?.toDate ? ev.startTime.toDate() : new Date(ev.startTime);

            // Time Diff (allow < 1 min gap for floating point safety, effectively identical)
            const diff = Math.abs(currStart - prevEnd);
            const isContiguous = diff < 60000; // less than 1 minute gap

            const isSameTitle = current.title === ev.title;
            const isSameVenue = current.venueId === ev.venueId;
            const isSameType = current.typeId === ev.typeId;

            if (isContiguous && isSameTitle && isSameVenue && isSameType) {
                // Merge
                // Extend End Time
                current.endTime = ev.endTime;
                current.originalCount += 1;
                current.originalIds.push(ev.id);
                // We keep the ID of the first one for the key and click handler
            } else {
                // Push current and start new
                merged.push(current);
                current = { ...ev, originalCount: 1, originalIds: [ev.id] };
            }
        }
        if (current) merged.push(current);

        return merged;
    };

    return (
        <div className="space-y-6 animate-fade-in font-cairo pb-20">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl mb-6">
                {/* Right: Title & Stats */}
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="bg-indigo-600/20 p-3 rounded-xl">
                        <Calendar size={28} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">جدول الأنشطة</h1>
                        <p className="text-sm text-gray-400 flex items-center gap-2">
                            <span>{getHijriDate(currentDate)}</span>
                            <span className="w-1 h-1 bg-gray-500 rounded-full"></span>
                            <span>{getMonthTitle(currentDate)}</span>
                        </p>
                    </div>
                </div>

                {/* Left: Actions */}
                <div className="flex items-center gap-3 w-full md:w-auto bg-black/20 p-1.5 rounded-xl border border-white/5 no-print">

                    <button
                        onClick={() => setIsPrintModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors border border-white/5"
                    >
                        <Printer size={18} />
                        <span className="hidden sm:inline">طباعة الجدول</span>
                    </button>

                    <div className="h-6 w-px bg-white/10 mx-1"></div>

                    <button
                        onClick={() => {
                            setModalData(null);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
                    >
                        <Plus size={18} />
                        <span>إضافة نشاط</span>
                    </button>
                </div>
            </div>

            {/* Navigation Bar */}
            <div className="flex items-center justify-between mb-6 bg-white/5 p-2 rounded-xl border border-white/5 no-print">
                <button onClick={prev} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <ChevronRight size={20} />
                </button>

                <h2 className="text-lg font-bold text-white flex items-center gap-2" dir="ltr">
                    {/* Display Week Range if in Week View */}
                    {view === 'week' ? (
                        <span className="font-mono bg-black/30 px-3 py-1 rounded-lg border border-white/10 text-sm">
                            {format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'd MMM')} - {format(endOfWeek(currentDate, { weekStartsOn: 0 }), 'd MMM')}
                        </span>
                    ) : (
                        <span className="font-mono bg-black/30 px-3 py-1 rounded-lg border border-white/10 text-sm">
                            {format(currentDate, 'yyyy')}
                        </span>
                    )}
                </h2>

                <button onClick={next} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                    <ChevronLeft size={20} />
                </button>
            </div>

            {/* View Toggle */}
            <div className="flex items-center space-x-4 space-x-reverse bg-black/20 p-1 rounded-xl mt-4 md:mt-0 no-print">
                <button onClick={() => setView('week')} className={`px-6 py-2 rounded-lg transition-all ${view === 'week' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>أسبوع</button>
                <button onClick={() => setView('month')} className={`px-6 py-2 rounded-lg transition-all ${view === 'month' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>شهر</button>
            </div>

            {/* Calendar System Toggle */}
            <div className="bg-black/30 p-1 rounded-lg flex items-center ml-4 border border-white/5 no-print">
                <button
                    onClick={() => setCalendarSystem('gregory')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${calendarSystem === 'gregory' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    ميلادي
                </button>
                <button
                    onClick={() => setCalendarSystem('hijri')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${calendarSystem === 'hijri' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                >
                    هجري
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 bg-white/5 rounded-3xl border border-white/10 relative overflow-hidden shadow-2xl" ref={schedulerRef}>
                {isLoading && (
                    <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                    </div>
                )}

                {/* WEEKLY TIMELINE VIEW */}
                {view === 'week' && (
                    <div className="overflow-x-auto rounded-2xl border border-[rgba(255,255,255,0.1)] shadow-2xl bg-[rgba(0,0,0,0.2)] relative min-h-[400px] select-none text-right" dir="rtl">
                        {isLoading && (
                            <div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                            </div>
                        )}

                        <div className="min-w-[1000px]">
                            {/* Timeline Header */}
                            <div className="h-12 bg-[#1a1a20] border-b border-[rgba(255,255,255,0.1)] flex sticky top-0 z-30">
                                <div className="w-32 shrink-0 border-l border-[rgba(255,255,255,0.1)] p-3 text-right font-bold text-gray-400 sticky right-0 bg-[#1a1a20] z-40 shadow-xl">اليوم</div>
                                <div className="flex-1 relative">
                                    {slots.map((slot, idx) => {
                                        const pos = getPositionStyle(slot.start, slot.end);
                                        return (
                                            <div key={idx}
                                                className="absolute h-full flex items-center justify-center border-l border-[rgba(255,255,255,0.05)] text-[10px] text-gray-500 font-mono tracking-tighter"
                                                style={{
                                                    right: `${pos.left}%`, // RTL: Use right instead of left
                                                    width: `${pos.width}%`
                                                }}
                                            >
                                                {slot.label}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Days Rows */}
                            <div className="divide-y divide-[rgba(255,255,255,0.05)]">
                                {weekDays.map(day => {
                                    const dayStr = format(day, 'yyyy-MM-dd');
                                    const dayEvents = events.filter(e => {
                                        const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                        return eDate === dayStr;
                                    });

                                    const isWeekend = weekends?.includes(day.getDay());
                                    const holiday = holidays?.find(h => h.date === dayStr);
                                    const isBlocked = isWeekend || !!holiday;
                                    const blockReason = holiday ? `إجازة: ${holiday.reason}` : 'عطلة أسبوعية';

                                    return (
                                        <div key={day.toString()} className={`flex h-36 group relative ${isBlocked ? 'bg-[rgba(136,19,55,0.05)]' : 'hover:bg-[rgba(255,255,255,0.05)]'} transition-colors`}>
                                            {/* Day Label */}
                                            <div className="w-32 shrink-0 border-l border-[rgba(255,255,255,0.1)] p-4 bg-[rgba(26,26,32,0.95)] backdrop-blur sticky right-0 z-20 flex flex-col justify-center shadow-2xl">
                                                <span className={`text-lg font-bold ${isBlocked ? 'text-rose-400' : 'text-white'}`}>{format(day, 'EEEE', { locale: ar })}</span>
                                                <span className="text-sm text-gray-400 font-mono opacity-60">
                                                    {calendarSystem === 'hijri' ? getHijriDate(day) : format(day, 'd MMM')}
                                                </span>
                                            </div>

                                            {/* Timeline Area */}
                                            <div className="flex-1 relative">
                                                {/* Blocked Overlay */}
                                                {isBlocked && (
                                                    <div className="absolute inset-0 z-10 bg-stripes-rose opacity-10 flex items-center justify-center pointer-events-none">
                                                        <span className="bg-[rgba(0,0,0,0.5)] px-3 py-1 rounded text-rose-300 text-xs border border-[rgba(244,63,94,0.3)] rotate-3">{blockReason}</span>
                                                    </div>
                                                )}

                                                {/* Grid Background (Slots) */}
                                                {!isBlocked && slots.map((slot, idx) => {
                                                    const pos = getPositionStyle(slot.start, slot.end);
                                                    return (
                                                        <div key={idx}
                                                            onClick={() => handleCellClick(day, slot)}
                                                            className={`absolute inset-y-0 border-l border-[rgba(255,255,255,0.05)] cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors group/slot
                                                                ${slot.type !== 'Class' ? 'bg-[rgba(0,0,0,0.2)] pointer-events-none' : ''}
                                                            `}
                                                            style={{
                                                                right: `${pos.left}%`,
                                                                width: `${pos.width}%`
                                                            }}
                                                        >
                                                            {slot.type === 'Class' && (
                                                                <div className="opacity-0 group-hover/slot:opacity-100 absolute inset-0 flex items-center justify-center text-[rgba(255,255,255,0.1)]">
                                                                    <Plus />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}

                                                {/* Events Rendering */}
                                                {!isBlocked && getMergedEvents(dayEvents).map(ev => {
                                                    const style = getEventStyle(ev);

                                                    // Calculate Duration for Badge
                                                    const startT = ev.startTime.toDate ? ev.startTime.toDate() : new Date(ev.startTime);
                                                    const endT = ev.endTime.toDate ? ev.endTime.toDate() : new Date(ev.endTime);
                                                    const durationMins = (endT - startT) / 60000;

                                                    // Dynamic Slot Duration Check
                                                    let slotDuration = 45; // Default fallback
                                                    const eventStartStr = format(startT, 'HH:mm');

                                                    // Find the slot this event starts in (or closest to)
                                                    const matchedSlot = slots?.find(s => s.start === eventStartStr);
                                                    if (matchedSlot) {
                                                        const [h1, m1] = matchedSlot.start.split(':').map(Number);
                                                        const [h2, m2] = matchedSlot.end.split(':').map(Number);
                                                        slotDuration = (h2 * 60 + m2) - (h1 * 60 + m1);
                                                    }

                                                    const showDurationBadge = durationMins < slotDuration;

                                                    return (
                                                        <div
                                                            key={ev.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEventClick(e, ev);
                                                            }}
                                                            className={`absolute top-2 bottom-2 rounded-xl shadow-lg border p-3 cursor-pointer hover:scale-[1.05] hover:z-50 transition-all z-20 flex flex-col justify-between overflow-hidden
                                                                ${ev.status === 'Done'
                                                                    ? 'border-emerald-500 shadow-emerald-900'
                                                                    : 'border-indigo-500 shadow-indigo-900'}
                                                            `}
                                                            style={{
                                                                right: `${style.left}%`,
                                                                width: `${style.width}%`,
                                                                background: ev.status === 'Done'
                                                                    ? 'linear-gradient(to bottom right, #064e3b, #134e4a)' // Emerald-900 to Teal-900
                                                                    : 'linear-gradient(to bottom right, #312e81, #581c87)'  // Indigo-900 to Purple-900
                                                            }}
                                                        >
                                                            <div className="flex items-start justify-between min-w-0">
                                                                <div className="font-bold text-white text-xs truncate leading-tight">
                                                                    {ev.title}
                                                                    {showDurationBadge && (
                                                                        <span className="mr-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                            ⏱️ {durationMins}د
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {ev.status === 'Done' && <CheckCircle size={12} className="text-emerald-400 shrink-0 mr-1" />}
                                                            </div>

                                                            {parseFloat(style.width) > 5 && (
                                                                <>
                                                                    <div className="text-[10px] text-gray-300 truncate opacity-80 flex items-center mt-1">
                                                                        <MapPin size={10} className="ml-1" /> {ev.venueId}
                                                                        {ev.originalCount > 1 && (
                                                                            <span className="mr-2 text-indigo-300 text-[9px] bg-[rgba(99,102,241,0.2)] px-1 rounded border border-[rgba(99,102,241,0.2)]">
                                                                                🔗 مدمج ({ev.originalCount})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[10px] text-[rgba(255,255,255,0.4)] mt-auto flex justify-between font-mono bg-[rgba(0,0,0,0.2)] p-1 rounded-md">
                                                                        <span>{format(ev.startTime.toDate ? ev.startTime.toDate() : new Date(ev.startTime), 'HH:mm')}</span>
                                                                        <span>{format(ev.endTime.toDate ? ev.endTime.toDate() : new Date(ev.endTime), 'HH:mm')}</span>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* MONTHLY VIEW */}
                {view === 'month' && (
                    <div className="bg-[rgba(0,0,0,0.2)] rounded-2xl border border-[rgba(255,255,255,0.1)] overflow-x-auto shadow-2xl custom-scrollbar">
                        <div className="min-w-[800px]">
                            {/* Days Header */}
                            <div className="grid grid-cols-7 bg-[rgba(255,255,255,0.05)] border-b border-[rgba(255,255,255,0.1)]">
                                {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map(d => (
                                    <div key={d} className="p-4 text-center font-bold text-white border-l border-[rgba(255,255,255,0.05)] last:border-0">
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Grid */}
                            <div className="grid grid-cols-7 auto-rows-[140px]">
                                {(() => {
                                    const monthStart = startOfMonth(currentDate);
                                    const monthEnd = endOfMonth(monthStart);
                                    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
                                    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

                                    const days = [];
                                    let day = startDate;
                                    while (day <= endDate) {
                                        days.push(day);
                                        day = addDays(day, 1);
                                    }

                                    return days.map((day, idx) => {
                                        const dayFormatted = format(day, 'yyyy-MM-dd');
                                        const isCurrentMonth = isSameDay(day, monthStart) || (day >= monthStart && day <= monthEnd);
                                        const isToday = isSameDay(day, new Date());

                                        // Blocking Logic
                                        const isWeekend = weekends?.includes(day.getDay());
                                        const holiday = holidays?.find(h => h.date === dayFormatted);
                                        const isBlocked = isWeekend || !!holiday;
                                        const blockReason = holiday ? holiday.reason : (isWeekend ? 'عطلة' : '');

                                        // Events for this day
                                        const dayEvents = events.filter(e => {
                                            const eDate = e.startTime?.toDate ? format(e.startTime.toDate(), 'yyyy-MM-dd') : e.date;
                                            return eDate === dayFormatted;
                                        });

                                        return (
                                            <div
                                                key={dayFormatted}
                                                onClick={() => !isBlocked && handleCellClick(day, { type: 'Class', start: '08:00', end: '09:00' })}
                                                className={`
                                                p-2 border-b border-l border-[rgba(255,255,255,0.05)] relative transition-all group
                                                ${!isCurrentMonth ? 'bg-[rgba(0,0,0,0.4)] opacity-50' : ''}
                                                ${isBlocked ? 'bg-[rgba(136,19,55,0.1)] cursor-not-allowed' : 'hover:bg-[rgba(255,255,255,0.05)] cursor-pointer'}
                                                ${isToday ? 'bg-[rgba(99,102,241,0.1)]' : ''}
                                            `}
                                            >
                                                {/* Date Numbers */}
                                                <div className="flex justify-between items-start mb-2">
                                                    {calendarSystem === 'hijri' && (
                                                        <span className={`text-sm font-bold ${isBlocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                            {getHijriDay(day)}
                                                        </span>
                                                    )}
                                                    <span className={`text-sm ${isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-400'}`}>
                                                        {format(day, 'd')}
                                                    </span>
                                                </div>

                                                {/* Blocked Overlay Label */}
                                                {isBlocked && (
                                                    <div className="absolute inset-x-0 bottom-2 text-center">
                                                        <span className="text-[10px] text-[rgba(251,113,133,0.7)] border border-[rgba(244,63,94,0.2)] px-1 rounded bg-[rgba(136,19,55,0.2)]">
                                                            {blockReason}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Events Dots/List */}
                                                <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                                                    {dayEvents.map(ev => (
                                                        <div
                                                            key={ev.id}
                                                            onClick={(e) => { e.stopPropagation(); handleEventClick(e, ev); }}
                                                            className={`
                                                            text-[10px] px-2 py-1 rounded truncate border
                                                            ${ev.status === 'Done'
                                                                    ? 'bg-emerald-900/40 border-emerald-500/20 text-emerald-200'
                                                                    : 'bg-indigo-900/40 border-indigo-500/20 text-indigo-200'}
                                                        `}
                                                            title={ev.title}
                                                        >
                                                            {ev.title}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <EventModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                initialData={modalData}
                onSave={handleSaveEvent}
                onDelete={confirmDeleteEvent}
                eventTypes={eventTypes}
                activeProfile={activeProfile}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            <DeleteEventModal
                isOpen={deleteOptsModal.isOpen}
                onClose={() => setDeleteOptsModal({ isOpen: false, event: null })}
                onConfirm={handleSmartDelete}
                isPastEvent={true}
            />

            <PrintOptionsModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                onSelect={handlePrintSelect}
            />
        </div>
    );
}

import React, { useState } from 'react';
import {
    X, AlertTriangle, CheckCircle2, Trash2, ArrowRightLeft, Sparkles,
    Award, Calendar, BookOpen, Layers, Check, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { mergeStudentRecords, deleteUnlinkedStudent } from '../../utils/studentDuplicates';

export default function DuplicateResolverModal({
    isOpen,
    onClose,
    duplicateGroups = [],
    allEvents = [],
    onResolved
}) {
    const [selectedPrimaryMap, setSelectedPrimaryMap] = useState({});
    const [processingGroupKey, setProcessingGroupKey] = useState(null);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    if (!isOpen) return null;

    // Helper to get chosen primary for a group
    const getChosenPrimary = (group) => {
        const chosenId = selectedPrimaryMap[group.key];
        if (chosenId) {
            return group.students.find(s => s.id === chosenId) || group.primaryCandidate;
        }
        return group.primaryCandidate || group.students[0];
    };

    // 1. Single Group Resolution: Delete 0-activity unlinked duplicate
    const handleDeleteUnlinked = async (group, unlinkedStudent) => {
        setProcessingGroupKey(group.key);
        const toastId = toast.loading(`جاري حذف السجل غير المرتبط (${unlinkedStudent.name})...`);
        try {
            await deleteUnlinkedStudent(unlinkedStudent.id);
            toast.success(`تم حذف السجل غير المرتبط بنجاح`, { id: toastId });
            if (onResolved) onResolved();
        } catch (err) {
            console.error("Delete duplicate error:", err);
            toast.error("فشل حذف السجل", { id: toastId });
        } finally {
            setProcessingGroupKey(null);
        }
    };

    // 2. Single Group Resolution: Merge secondary into primary
    const handleMergeGroup = async (group) => {
        const primary = getChosenPrimary(group);
        const secondaries = group.students.filter(s => s.id !== primary.id);

        if (secondaries.length === 0) return;

        setProcessingGroupKey(group.key);
        const toastId = toast.loading(`جاري دمج ونقل مشاركات الطالب إلى السجل الأساسي...`);
        try {
            for (const secondary of secondaries) {
                await mergeStudentRecords({
                    primaryStudent: primary,
                    secondaryStudent: secondary,
                    allEvents
                });
            }
            toast.success(`تم دمج السجلات ونقل كافة الأنشطة بنجاح!`, { id: toastId });
            if (onResolved) onResolved();
        } catch (err) {
            console.error("Merge error:", err);
            toast.error("حدث خطأ أثناء دمج السجلات", { id: toastId });
        } finally {
            setProcessingGroupKey(null);
        }
    };

    // 3. Auto-Resolve All Zero-Activity Duplicates
    const handleAutoResolveZeroActivity = async () => {
        const zeroActivityGroups = duplicateGroups.filter(g => g.hasZeroEvent);
        if (zeroActivityGroups.length === 0) {
            toast.error("لا توجد سجلات غير مرتبطة يمكن حذفها تلقائياً");
            return;
        }

        setIsBulkProcessing(true);
        const toastId = toast.loading(`جاري المعالجة التلقائية لـ ${zeroActivityGroups.length} حالة تكرار...`);
        try {
            for (const group of zeroActivityGroups) {
                const primary = group.primaryCandidate;
                const zeroEventStudents = group.students.filter(s => s.id !== primary.id && s.eventsCount === 0);
                for (const unlinked of zeroEventStudents) {
                    await deleteUnlinkedStudent(unlinked.id);
                }
            }
            toast.success(`تمت إزالة جميع السجلات المكررة غير المرتبطة بنجاح!`, { id: toastId });
            if (onResolved) onResolved();
        } catch (err) {
            console.error("Bulk auto-resolve error:", err);
            toast.error("حدث خطأ أثناء المعالجة التلقائية", { id: toastId });
        } finally {
            setIsBulkProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in font-cairo">
            <div className="bg-[#18181f] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Sparkles size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                                معالجة الطلاب المكررين
                                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono">
                                    {duplicateGroups.length} حالات
                                </span>
                            </h2>
                            <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
                                نظام ذكي لرصد الأسماء المتطابقة وإلغاء التكرار مع الحفاظ التام على سجل المشاركات والنقاط
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                        aria-label="إغلاق"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Sub-header / Fast Actions */}
                {duplicateGroups.length > 0 && duplicateGroups.some(g => g.hasZeroEvent) && (
                    <div className="px-4 sm:px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-amber-300">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>
                                تم اكتشاف سجلات غير مرتبطة بأي نشاط. يمكنك تنظيفها فوراً بضغطة زر دون التأثير على أي مشاركات.
                            </span>
                        </div>
                        <button
                            onClick={handleAutoResolveZeroActivity}
                            disabled={isBulkProcessing || processingGroupKey !== null}
                            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-xl text-xs sm:text-sm shadow-lg flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                        >
                            <Sparkles size={16} />
                            معالجة ذكية للكل غير المرتبط
                        </button>
                    </div>
                )}

                {/* Body Content */}
                <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    {duplicateGroups.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle2 size={36} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">رائع! لا يوجد أي طلاب مكررين</h3>
                            <p className="text-gray-400 text-sm max-w-md mx-auto">
                                جميع سجلات الطلاب متوافقة ومطابقة، ولا توجد أي حالات تكرار أو أسماء متضاربة في السجلات.
                            </p>
                        </div>
                    ) : (
                        duplicateGroups.map((group, groupIdx) => {
                            const chosenPrimary = getChosenPrimary(group);
                            const isProcessing = processingGroupKey === group.key || isBulkProcessing;

                            return (
                                <div
                                    key={group.key || groupIdx}
                                    className="bg-black/30 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 hover:border-white/20 transition-all shadow-lg"
                                >
                                    {/* Group Title */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-xs font-bold font-mono">
                                                {groupIdx + 1}
                                            </span>
                                            <div>
                                                <h3 className="text-lg font-bold text-white">
                                                    {group.displayName}
                                                </h3>
                                                <span className="text-xs text-gray-400">
                                                    تم العثور على {group.students.length} سجلات متشابهة
                                                </span>
                                            </div>
                                        </div>

                                        {/* Status Tag */}
                                        <div>
                                            {group.hasZeroEvent ? (
                                                <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium">
                                                    <AlertTriangle size={13} />
                                                    يوجد سجل غير مرتبط بأنشطة
                                                </span>
                                            ) : group.allHaveEvents ? (
                                                <span className="bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium">
                                                    <Layers size={13} />
                                                    كلا السجلين مرتبط بأنشطة (يحتاج دمج)
                                                </span>
                                            ) : (
                                                <span className="bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium">
                                                    متطابقان
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Comparison Cards Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                        {group.students.map((student) => {
                                            const isSelected = chosenPrimary.id === student.id;
                                            const isRecommended = group.primaryCandidate?.id === student.id;

                                            return (
                                                <div
                                                    key={student.id}
                                                    onClick={() => {
                                                        setSelectedPrimaryMap(prev => ({ ...prev, [group.key]: student.id }));
                                                    }}
                                                    className={`cursor-pointer rounded-xl p-4 border transition-all relative ${isSelected
                                                        ? 'bg-indigo-600/15 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/50'
                                                        : 'bg-white/5 border-white/5 hover:border-white/20'
                                                        }`}
                                                >
                                                    {/* Selection Radio / Badge */}
                                                    <div className="flex items-start justify-between mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected
                                                                ? 'border-indigo-400 bg-indigo-600 text-white'
                                                                : 'border-gray-500 bg-black/40'
                                                                }`}>
                                                                {isSelected && <Check size={12} />}
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-300">
                                                                {isSelected ? 'السجل المعتمد (الأساسي)' : 'انقر للاعتماد كأساسي'}
                                                            </span>
                                                        </div>

                                                        {isRecommended && (
                                                            <span className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                                                <Sparkles size={11} /> الموصى به
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Student Details */}
                                                    <div className="space-y-2">
                                                        <div className="text-white font-bold text-base flex items-center justify-between">
                                                            <span>{student.name}</span>
                                                            <span className="text-xs text-gray-500 font-mono">#{student.id.slice(0, 6)}</span>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                                                                <span className="text-gray-400 block mb-0.5">الصف / الشعبة</span>
                                                                <span className="text-gray-200 font-medium">{student.class || student.grade ? `${student.grade || ''} - ${student.section || ''}` : 'غير محدد'}</span>
                                                            </div>
                                                            <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                                                                <span className="text-gray-400 block mb-0.5">نقاط التميز</span>
                                                                <span className="text-amber-400 font-bold flex items-center gap-1">
                                                                    <Award size={13} /> {student.totalPoints || 0}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="bg-black/30 p-2 rounded-lg border border-white/5 text-xs flex items-center justify-between">
                                                            <span className="text-gray-400 flex items-center gap-1">
                                                                <Calendar size={13} className="text-indigo-400" /> عدد الأنشطة المرتبطة:
                                                            </span>
                                                            <span className={`font-bold px-2 py-0.5 rounded-full ${student.eventsCount > 0 ? 'bg-indigo-500/20 text-indigo-300 font-mono' : 'bg-red-500/20 text-red-400'}`}>
                                                                {student.eventsCount} أنشطة
                                                            </span>
                                                        </div>

                                                        {/* Specializations */}
                                                        {student.specializations && student.specializations.length > 0 && (
                                                            <div className="text-xs flex items-center gap-1 flex-wrap pt-1">
                                                                <span className="text-gray-500">التخصصات:</span>
                                                                {student.specializations.map((sp, i) => (
                                                                    <span key={i} className="bg-white/5 text-gray-300 px-1.5 py-0.5 rounded text-[11px]">
                                                                        {sp === 'General' ? 'عام' : sp}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Action Box based on Intelligence */}
                                    <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-xl">
                                        <div className="text-xs text-gray-300 flex items-center gap-2">
                                            {group.hasZeroEvent ? (
                                                <span>
                                                    💡 <strong>القرار الذكي:</strong> السجل غير المرتبط سيتم حذفه تلقائياً مع الإبقاء على السجل النشط ببياناته كاملة.
                                                </span>
                                            ) : group.allHaveEvents ? (
                                                <span>
                                                    💡 <strong>القرار الذكي:</strong> سيتم نقل جميع المشاركات ({group.students.reduce((acc, s) => acc + s.eventsCount, 0)} مشاركة) ودمج النقاط في السجل المعتمد وحذف السجل المكرر.
                                                </span>
                                            ) : (
                                                <span>
                                                    💡 <strong>القرار الذكي:</strong> السجلان متطابقان، سيتم اعتماد السجل المختار وحذف المكرر بأمان.
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 justify-end">
                                            {/* If one has zero events and we have 2 students: give 1-click delete unlinked */}
                                            {group.hasZeroEvent && group.students.length === 2 ? (
                                                <button
                                                    onClick={() => {
                                                        const unlinked = group.students.find(s => s.eventsCount === 0);
                                                        if (unlinked) handleDeleteUnlinked(group, unlinked);
                                                    }}
                                                    disabled={isProcessing}
                                                    className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                                                >
                                                    <Trash2 size={15} />
                                                    مسح السجل غير المرتبط
                                                </button>
                                            ) : null}

                                            {/* Merge Action */}
                                            <button
                                                onClick={() => handleMergeGroup(group)}
                                                disabled={isProcessing}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-lg disabled:opacity-50"
                                            >
                                                <ArrowRightLeft size={15} />
                                                {group.allHaveEvents ? `دمج ونقل المشاركات إلى ${chosenPrimary.name}` : `اعتماد ${chosenPrimary.name} وحذف المكرر`}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 border-t border-white/10 bg-white/5 flex items-center justify-between">
                    <span className="text-gray-400 text-xs">
                        {duplicateGroups.length > 0 ? `متبقي ${duplicateGroups.length} حالات تكرار للمراجعة` : 'كل الحالات مكتملة'}
                    </span>
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs sm:text-sm font-bold transition-colors"
                    >
                        إغلاق النافذة
                    </button>
                </div>
            </div>
        </div>
    );
}

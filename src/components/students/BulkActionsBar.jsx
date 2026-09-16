import { useState, useRef, useEffect } from 'react';
import { 
    Users, 
    ArrowRightLeft, 
    Tag, 
    Award, 
    Printer, 
    FileText, 
    FileSpreadsheet, 
    Trash2, 
    X, 
    ChevronUp,
    CheckSquare,
    SlidersHorizontal,
    Award as CertificateIcon
} from 'lucide-react';

export default function BulkActionsBar({
    selectedCount,
    totalDisplayed,
    totalAll,
    isAllDisplayedSelected,
    onSelectAllDisplayed,
    onSelectAllSchool,
    onClearSelection,
    onOpenOperationsModal,
    onOpenCertificatesModal,
    onPrintConsolidated,
    onPrintDetailed,
    onExportCSV,
    onBulkArchive,
    isProcessing = false
}) {
    const [isPrintMenuOpen, setIsPrintMenuOpen] = useState(false);
    const printMenuRef = useRef(null);

    // Close print menu on click outside
    useEffect(() => {
        function handleClickOutside(e) {
            if (printMenuRef.current && !printMenuRef.current.contains(e.target)) {
                setIsPrintMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (selectedCount === 0) return null;

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-4xl animate-in fade-in slide-in-from-bottom-5 duration-200">
            <div className="bg-zinc-900/95 backdrop-blur-xl border border-indigo-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.6)] rounded-2xl p-3 md:p-3.5 flex flex-col md:flex-row items-center justify-between gap-3 text-white">
                
                {/* Right Side: Selected Count & Selection Range */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start border-b md:border-b-0 border-white/10 pb-2 md:pb-0">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={onClearSelection}
                            aria-label="إلغاء التحديد"
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            title="إلغاء التحديد"
                        >
                            <X size={16} />
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                            <span className="font-bold text-sm text-white">
                                تم تحديد <span className="text-indigo-400 font-extrabold text-base mx-0.5">{selectedCount}</span> {selectedCount === 1 ? 'طالب' : 'طلاب'}
                            </span>
                        </div>
                    </div>

                    {/* Quick Select All Helpers */}
                    <div className="flex items-center gap-1.5 text-xs">
                        {!isAllDisplayedSelected ? (
                            <button
                                onClick={onSelectAllDisplayed}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 font-medium border border-indigo-500/30 transition-all flex items-center gap-1"
                            >
                                <CheckSquare size={13} />
                                <span>تحديد الظاهرين ({totalDisplayed})</span>
                            </button>
                        ) : totalAll > totalDisplayed ? (
                            <button
                                onClick={onSelectAllSchool}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium border border-amber-500/30 transition-all"
                            >
                                <span>تحديد كل طلاب المدرسة ({totalAll})</span>
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Left Side: Actions Toolbar */}
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-center md:justify-end w-full md:w-auto">
                    
                    {/* Action 1: Transfer Grade/Section */}
                    <button
                        onClick={() => onOpenOperationsModal('transfer')}
                        disabled={isProcessing}
                        aria-label="نقل الصف والشعبة"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-indigo-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-indigo-500 transition-all shadow-sm disabled:opacity-50"
                        title="نقل الطلاب المحددين إلى صف أو شعبة أخرى"
                    >
                        <ArrowRightLeft size={15} className="text-indigo-400 group-hover:text-white" />
                        <span className="hidden sm:inline">نقل الصف</span>
                    </button>

                    {/* Action 2: Specialization */}
                    <button
                        onClick={() => onOpenOperationsModal('specialization')}
                        disabled={isProcessing}
                        aria-label="تعديل التخصصات"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-indigo-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-indigo-500 transition-all shadow-sm disabled:opacity-50"
                        title="إضافة أو تعديل تصنيفات وتخصصات الطلاب المحددين"
                    >
                        <Tag size={15} className="text-indigo-400" />
                        <span className="hidden sm:inline">التخصصات</span>
                    </button>

                    {/* Action 3: Points */}
                    <button
                        onClick={() => onOpenOperationsModal('points')}
                        disabled={isProcessing}
                        aria-label="نقاط التميز"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-amber-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-amber-500 transition-all shadow-sm disabled:opacity-50"
                        title="إضافة أو خصم نقاط تميز للطلاب المحددين"
                    >
                        <Award size={15} className="text-amber-400" />
                        <span className="hidden sm:inline">النقاط</span>
                    </button>

                    {/* Action 4: Certificates */}
                    <button
                        onClick={onOpenCertificatesModal}
                        disabled={isProcessing}
                        aria-label="شهادات شكر"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-emerald-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-emerald-500 transition-all shadow-sm disabled:opacity-50"
                        title="توليد شهادات شكر وتقدير للطلاب المحددين"
                    >
                        <CertificateIcon size={15} className="text-emerald-400" />
                        <span className="hidden sm:inline">الشهادات</span>
                    </button>

                    {/* Action 5: Print Menu Dropdown */}
                    <div className="relative" ref={printMenuRef}>
                        <button
                            onClick={() => setIsPrintMenuOpen(!isPrintMenuOpen)}
                            disabled={isProcessing}
                            aria-label="خيارات الطباعة"
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-blue-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-blue-500 transition-all shadow-sm disabled:opacity-50"
                            title="طباعة كشف مجمّع أو ملفات الطلاب"
                        >
                            <Printer size={15} className="text-blue-400" />
                            <span className="hidden sm:inline">طباعة</span>
                            <ChevronUp size={13} className={`transition-transform duration-200 ${isPrintMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isPrintMenuOpen && (
                            <div className="absolute bottom-full mb-2 left-0 w-48 bg-zinc-900 border border-white/10 shadow-2xl rounded-xl p-1.5 z-50 text-right animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    onClick={() => { setIsPrintMenuOpen(false); onPrintConsolidated(); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <FileSpreadsheet size={15} className="text-blue-400" />
                                    <span>طباعة كشف مجمّع رسمي</span>
                                </button>
                                <button
                                    onClick={() => { setIsPrintMenuOpen(false); onPrintDetailed(); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <FileText size={15} className="text-indigo-400" />
                                    <span>سجلات تفصيلية للطلاب</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Action 6: Export CSV / Excel */}
                    <button
                        onClick={onExportCSV}
                        disabled={isProcessing}
                        aria-label="تصدير إلى Excel"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-teal-600 text-gray-200 hover:text-white text-xs font-bold border border-white/10 hover:border-teal-500 transition-all shadow-sm disabled:opacity-50"
                        title="تصدير بيانات الطلاب المحددين إلى ملف Excel / CSV"
                    >
                        <FileSpreadsheet size={15} className="text-teal-400" />
                        <span className="hidden md:inline">Excel</span>
                    </button>

                    {/* Action 7: All Operations Modal Trigger */}
                    <button
                        onClick={() => onOpenOperationsModal('transfer')}
                        disabled={isProcessing}
                        aria-label="جميع الإجراءات"
                        className="p-2 rounded-xl bg-white/5 hover:bg-indigo-600/40 text-gray-300 hover:text-white border border-white/10 hover:border-indigo-500 transition-all"
                        title="فتح لوحة الإجراءات الشاملة"
                    >
                        <SlidersHorizontal size={16} />
                    </button>

                    {/* Action 8: Archive / Delete */}
                    <button
                        onClick={onBulkArchive}
                        disabled={isProcessing}
                        aria-label="أرشفة المحددين"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white text-xs font-bold border border-red-500/30 hover:border-red-500 transition-all shadow-sm disabled:opacity-50"
                        title="أرشفة أو حذف الطلاب المحددين"
                    >
                        <Trash2 size={15} />
                        <span className="hidden sm:inline">أرشفة</span>
                    </button>

                </div>

            </div>
        </div>
    );
}

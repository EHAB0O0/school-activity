import { Printer, List, Layout } from 'lucide-react';

export default function PrintOptionsModal({ isOpen, onClose, onSelect }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e1e24] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transform transition-all scale-100">
                <div className="bg-[#2a2a35] p-6 text-center border-b border-white/5">
                    <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Printer size={32} className="text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1">طباعة الجدول</h3>
                    <p className="text-gray-400 text-sm">اختر تنسيق الطباعة المناسب لك</p>
                </div>

                <div className="p-6 space-y-3">
                    <button
                        onClick={() => onSelect('visual')}
                        className="w-full flex items-center p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/50 rounded-xl transition-all group"
                    >
                        <div className="bg-indigo-600/20 p-3 rounded-lg text-indigo-400 group-hover:text-indigo-300 transition-colors">
                            <Layout size={24} />
                        </div>
                        <div className="mr-4 text-right flex-1">
                            <span className="block font-bold text-white group-hover:text-indigo-300 transition-colors">صورة الجدول (Visual Grid)</span>
                            <span className="text-xs text-gray-400">طباعة العرض الحالي كما هو ظاهر في الشاشة (Landscape).</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onSelect('agenda')}
                        className="w-full flex items-center p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/50 rounded-xl transition-all group"
                    >
                        <div className="bg-emerald-600/20 p-3 rounded-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">
                            <List size={24} />
                        </div>
                        <div className="mr-4 text-right flex-1">
                            <span className="block font-bold text-white group-hover:text-emerald-300 transition-colors">قائمة تفصيلية (Agenda List)</span>
                            <span className="text-xs text-gray-400">تقرير رسمي مفصل مرتب حسب الأيام (A4 Portrait).</span>
                        </div>
                    </button>
                </div>

                <div className="p-4 bg-[#18181b] border-t border-white/5 flex justify-center">
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-sm font-bold transition-colors"
                    >
                        إلغاء الأمر
                    </button>
                </div>
            </div>
        </div>
    );
}

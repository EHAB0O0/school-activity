import { useState } from 'react';
import { AlertTriangle, Trash2, Archive, CheckCircle } from 'lucide-react';

export default function DeleteEventModal({ isOpen, onClose, onConfirm, isPastEvent }) {
    if (!isOpen) return null;

    const [reversePoints, setReversePoints] = useState(false);
    const [actionType, setActionType] = useState('archive'); // 'archive' | 'delete'

    const handleConfirm = () => {
        onConfirm({ reversePoints, actionType });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e1e24] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl transform transition-all scale-100 p-1">
                <div className="bg-[#2a2a35] rounded-xl p-6">
                    <div className="flex items-center mb-4 text-red-400">
                        <AlertTriangle size={24} className="ml-2" />
                        <h3 className="text-xl font-bold text-white">حذف النشاط</h3>
                    </div>

                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                        {isPastEvent
                            ? "هذا النشاط قد انتهى بالفعل. لضمان سلامة السجلات، يرجى تحديد خيارات الحذف:"
                            : "هل أنت متأكد من رغبتك في حذف هذا النشاط المستقبلي؟"}
                    </p>

                    {isPastEvent && (
                        <div className="space-y-4 mb-8 bg-black/20 p-4 rounded-xl border border-white/5">
                            {/* Option 1: Reverse Points */}
                            <label className="flex items-center cursor-pointer group">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ml-3 transition-colors ${reversePoints ? 'bg-indigo-600 border-indigo-600' : 'border-gray-500 group-hover:border-indigo-500'}`}>
                                    {reversePoints && <CheckCircle size={14} className="text-white" />}
                                </div>
                                <input type="checkbox" className="hidden" checked={reversePoints} onChange={(e) => setReversePoints(e.target.checked)} />
                                <span className={reversePoints ? 'text-white' : 'text-gray-400'}>سحب النقاط من الطلاب (إلغاء التأثير)</span>
                            </label>

                            <div className="h-px bg-white/10 my-2"></div>

                            {/* Option 2: Action Type */}
                            <div className="space-y-2">
                                <label className="flex items-center cursor-pointer">
                                    <input type="radio" name="delType" className="ml-2 accent-indigo-500" checked={actionType === 'archive'} onChange={() => setActionType('archive')} />
                                    <span className={actionType === 'archive' ? 'text-white font-bold' : 'text-gray-400'}>أرشفة فقط (إخفاء من الجدول)</span>
                                </label>
                                <label className="flex items-center cursor-pointer">
                                    <input type="radio" name="delType" className="ml-2 accent-red-500" checked={actionType === 'delete'} onChange={() => setActionType('delete')} />
                                    <span className={actionType === 'delete' ? 'text-red-400 font-bold' : 'text-gray-400'}>حذف نهائي (مسح من البيانات)</span>
                                </label>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 space-x-reverse">
                        <button
                            onClick={onClose}
                            className="bg-[#4a4a5a] text-gray-300 px-6 py-2 rounded-xl font-bold hover:bg-[#5a5a6a] transition-colors"
                        >
                            إلغاء
                        </button>
                        <button
                            onClick={handleConfirm}
                            className={`px-6 py-2 rounded-xl font-bold transition-transform transform active:scale-95 flex items-center ${actionType === 'delete'
                                    ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                                    : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/30'
                                }`}
                        >
                            {actionType === 'delete' ? <><Trash2 size={16} className="ml-2" /> حذف نهائي</> : <><Archive size={16} className="ml-2" /> أرشفة</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

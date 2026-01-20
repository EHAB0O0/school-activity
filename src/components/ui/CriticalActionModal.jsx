import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function CriticalActionModal({ isOpen, onClose, onConfirm, title, message, verificationText = "تأكيد" }) {
    const [input, setInput] = useState('');

    if (!isOpen) return null;

    const isMatch = input === verificationText || input === "CONFIRM" || input === "Confirm" || input === verificationText;

    const handleConfirm = () => {
        if (isMatch) {
            onConfirm();
            setInput('');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-[#1e1e24] border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl transform transition-all scale-100 p-1">
                <div className="bg-[#2a2a35] rounded-xl p-6 text-center relative overflow-hidden">
                    {/* Background Noise */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                        <AlertTriangle size={32} className="text-red-500" />
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                        {message}
                    </p>

                    <div className="mb-6 bg-black/30 p-4 rounded-xl border border-red-500/20">
                        <label className="block text-xs text-red-300 mb-2">
                            للعلم بأن هذا الإجراء لا يمكن التراجع عنه. يرجى كتابة <span className="font-bold text-white select-all">"{verificationText}"</span> للتأكيد.
                        </label>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={`اكتب "${verificationText}" هنا...`}
                            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white text-center font-bold focus:border-red-500 outline-none transition-colors"
                        />
                    </div>

                    <div className="flex justify-center space-x-3 space-x-reverse">
                        <button
                            onClick={handleConfirm}
                            disabled={!isMatch}
                            className={`px-6 py-3 rounded-xl font-bold transition-all transform flex items-center gap-2 ${isMatch
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 scale-100'
                                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            تأكيد الإجراء
                        </button>
                        <button
                            onClick={() => { setInput(''); onClose(); }}
                            className="bg-white/5 text-gray-300 px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-colors"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

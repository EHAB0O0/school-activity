import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = "حسناً", cancelText = "إلغاء", isDestructive = false }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#1e1e24] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl transform transition-all scale-100 p-1">
                <div className="bg-[#2a2a35] rounded-xl p-6 text-center">
                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                        {message}
                    </p>

                    <div className="flex justify-center space-x-3 space-x-reverse">
                        <button
                            onClick={onConfirm}
                            className={`px-8 py-2 rounded-full font-bold transition-transform transform active:scale-95 ${isDestructive
                                    ? 'bg-[#ffb4b4] text-[#5a1a1a] hover:bg-[#ff9999]'
                                    : 'bg-[#e0b0ff] text-[#4a1a6a] hover:bg-[#d090ef]'
                                }`}
                        >
                            {confirmText}
                        </button>
                        <button
                            onClick={onClose}
                            className="bg-[#4a4a5a] text-gray-300 px-8 py-2 rounded-full font-bold hover:bg-[#5a5a6a] transition-colors"
                        >
                            {cancelText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function NetworkStatusAlert() {
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [wasOffline, setWasOffline] = useState(false);
    const [showRestored, setShowRestored] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            if (wasOffline) {
                setShowRestored(true);
                const timer = setTimeout(() => {
                    setShowRestored(false);
                    setWasOffline(false);
                }, 3000);
                return () => clearTimeout(timer);
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
            setWasOffline(true);
            setShowRestored(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [wasOffline]);

    if (isOnline && !showRestored) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-sm sm:max-w-md w-[90%] sm:w-auto transition-all duration-300 animate-in fade-in slide-in-from-top-4">
            {!isOnline ? (
                <div
                    dir="rtl"
                    className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl bg-red-950/50 hover:bg-red-950/60 border border-red-500/40 text-red-200 backdrop-blur-md shadow-xl shadow-red-950/30 text-xs sm:text-sm font-bold"
                >
                    <div className="relative flex items-center justify-center">
                        <WifiOff size={18} className="text-red-400 shrink-0" />
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    </div>
                    <span>انقطع الاتصال بالإنترنت. جاري المحاولة تلقائياً...</span>
                </div>
            ) : showRestored ? (
                <div
                    dir="rtl"
                    className="flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 backdrop-blur-md shadow-xl shadow-emerald-950/30 text-xs sm:text-sm font-bold"
                >
                    <Wifi size={18} className="text-emerald-400 shrink-0" />
                    <span>تمت استعادة الاتصال بالإنترنت بنجاح</span>
                </div>
            ) : null}
        </div>
    );
}

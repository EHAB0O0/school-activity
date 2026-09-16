import { useState, useEffect } from 'react';

export default function LoadingScreen() {
    const [progress, setProgress] = useState(15);
    const [statusText, setStatusText] = useState('تهيئة الجلسة الآمنة...');

    useEffect(() => {
        const statuses = [
            { threshold: 25, text: 'تهيئة الجلسة الآمنة...' },
            { threshold: 55, text: 'مزامنة الجداول والأنشطة المدرسية...' },
            { threshold: 85, text: 'تحميل الموارد والملفات المعتمدة...' },
            { threshold: 100, text: 'اكتمل التحميل! جاري فتح النظام...' },
        ];

        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                const nextVal = prev + Math.floor(Math.random() * 14) + 6;
                const capped = Math.min(nextVal, 100);
                const currentStatus = statuses.find(s => capped <= s.threshold);
                if (currentStatus) setStatusText(currentStatus.text);
                return capped;
            });
        }, 160);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-[9999] bg-[#070913] flex flex-col items-center justify-center overflow-hidden font-cairo select-none" dir="rtl">
            {/* Ambient Backlight Glows */}
            <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-amber-500/15 via-indigo-600/20 to-blue-500/15 blur-[120px] pointer-events-none animate-pulse-slow"></div>
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-indigo-700/10 blur-[90px] pointer-events-none"></div>
            <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-amber-600/10 blur-[90px] pointer-events-none"></div>

            {/* Subtle Grid Overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none opacity-40"></div>

            {/* Cinematic Card Container */}
            <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
                
                {/* Logo with 3D Float, Golden Aura, and Shimmer */}
                <div className="relative mb-8 group">
                    {/* Pulsing Aura Rings */}
                    <div className="absolute -inset-4 rounded-full bg-gradient-to-r from-amber-400/30 via-indigo-500/30 to-amber-300/30 blur-xl opacity-70 animate-pulse"></div>
                    <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-300/40 via-transparent to-amber-600/40 opacity-80 blur-sm"></div>

                    {/* Logo Image Container with Shimmer Mask */}
                    <div className="relative w-36 h-36 md:w-44 md:h-44 rounded-3xl p-2 bg-gradient-to-b from-[#181d33] to-[#0d1020] border border-amber-400/30 shadow-2xl shadow-black/80 flex items-center justify-center overflow-hidden">
                        <img
                            src="/school-logo.png"
                            alt="شعار إدارة الأنشطة المدرسية"
                            className="w-full h-full object-contain filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)] transform hover:scale-105 transition-transform duration-700 animate-float"
                            onError={(e) => {
                                // Graceful fallback if image path isn't loaded yet
                                e.target.style.display = 'none';
                            }}
                        />

                        {/* Light Shimmer Sweep Animation */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer pointer-events-none"></div>
                    </div>
                </div>

                {/* System Title */}
                <div className="space-y-2 mb-8">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-100 tracking-tight drop-shadow-sm">
                        منظومة إدارة النشاط المدرسي
                    </h1>
                    <p className="text-xs md:text-sm font-medium tracking-widest text-indigo-300/80 uppercase font-mono">
                        School Activity Management System
                    </p>
                </div>

                {/* Modern Progress Bar */}
                <div className="w-full max-w-xs space-y-3">
                    <div className="relative h-2 w-full bg-black/60 rounded-full overflow-hidden border border-white/10 p-[1px] shadow-inner">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-300 ease-out relative shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                            style={{ width: `${progress}%` }}
                        >
                            {/* Glowing Leading Head */}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_8px_#ffffff]"></div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-gray-400 font-cairo transition-all duration-200">
                            {statusText}
                        </span>
                        <span className="text-amber-400 font-bold">
                            {progress}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer Tagline */}
            <div className="absolute bottom-6 text-center text-gray-500/60 text-xs tracking-wider font-mono">
                المملكة العربية السعودية &bull; الإصدار المعتمد 2026
            </div>
        </div>
    );
}

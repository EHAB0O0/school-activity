export default function AppLogo({ className = "", size = "normal" }) {
    // size: 'small' | 'normal' | 'large' | 'icon-only'
    const dim = size === 'small' ? 36 : size === 'large' ? 96 : 48;
    const textSize = size === 'small' ? 'text-base' : size === 'large' ? 'text-3xl' : 'text-xl';

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <div
                className="relative flex items-center justify-center shrink-0 rounded-2xl overflow-hidden shadow-md shadow-black/40 border border-amber-400/30 bg-gradient-to-b from-[#181d33] to-[#0a0d1a]"
                style={{ width: dim, height: dim }}
            >
                <img
                    src="/school-logo.png"
                    alt="شعار النشاط المدرسي"
                    className="w-full h-full object-contain p-0.5 transform hover:scale-110 transition-transform duration-300"
                    onError={(e) => {
                        // Fallback SVG if image not found
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'block';
                    }}
                />
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-3/4 h-3/4 text-amber-400 hidden"
                >
                    <path
                        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                </svg>
            </div>

            {size !== 'icon-only' && (
                <div className="flex flex-col">
                    <span className={`font-black text-white leading-tight ${textSize}`}>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-200">النشاط</span> المدرسي
                    </span>
                    {size !== 'small' && (
                        <span className="text-[10px] text-indigo-300/70 font-mono tracking-wider">
                            School Activity ERP
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

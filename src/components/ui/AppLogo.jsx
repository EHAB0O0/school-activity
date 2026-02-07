export default function AppLogo({ className = "", size = "normal" }) {
    // size: 'small' | 'normal' | 'large'
    const dim = size === 'small' ? 32 : size === 'large' ? 120 : 48;
    const textSize = size === 'small' ? 'text-lg' : size === 'large' ? 'text-5xl' : 'text-2xl';

    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <div className={`relative flex items-center justify-center`} style={{ width: dim, height: dim }}>
                {/* Shield Base */}
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-indigo-500 drop-shadow-lg">
                    <path
                        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                        fill="currentColor"
                        className="opacity-20 animate-pulse"
                    />
                    <path
                        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                        stroke="url(#gradient)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Interior Star/Spark */}
                    <path
                        d="M12 8L13.5 11H17L14 13.5L15.5 17L12 14.5L8.5 17L10 13.5L7 11H10.5L12 8Z"
                        fill="url(#gradient)"
                        className="animate-spin-slow"
                        style={{ transformOrigin: 'center' }}
                    />
                    <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="24" y2="24">
                            <stop offset="0%" stopColor="#818cf8" />
                            <stop offset="100%" stopColor="#c084fc" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            {size !== 'icon-only' && (
                <h1 className={`font-bold tracking-tight text-white ${textSize}`}>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Activity</span> Master
                </h1>
            )}
        </div>
    );
}

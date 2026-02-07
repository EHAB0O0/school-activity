import AppLogo from './AppLogo';

export default function LoadingScreen() {
    return (
        <div className="fixed inset-0 z-[9999] bg-[#0f0f15] flex flex-col items-center justify-center animate-fade-out-slow">
            <div className="animate-pulse-slow transform scale-150 mb-10">
                <AppLogo size="large" />
            </div>

            <div className="flex flex-col items-center gap-2">
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-150"></div>
                    <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce delay-300"></div>
                </div>
                <p className="text-gray-400 font-mono text-sm tracking-widest mt-4 opacity-70 animate-pulse">
                    جاري تجهيز النظام...
                </p>
            </div>
        </div>
    );
}

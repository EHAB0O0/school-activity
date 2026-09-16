import { useState } from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, LogOut, Menu, Box, FileText, Lock, Mail, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

import AppLogo from './ui/AppLogo';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { logout, currentUser, isEmergency } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Close sidebar on route change (Mobile UX)
    const [prevPath, setPrevPath] = useState(location.pathname);
    if (prevPath !== location.pathname) {
        setPrevPath(location.pathname);
        setIsSidebarOpen(false);
    }

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSendReset = async () => {
        try {
            await sendPasswordResetEmail(auth, "admin@school.com");
            toast.success("تم إرسال رابط الاستعادة إلى البريد الإلكتروني");
        } catch (e) {
            toast.error("فشل الإرسال: " + e.message);
        }
    };

    const navItems = [
        { path: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
        { path: '/scheduler', label: 'الجدول والأنشطة', icon: Calendar },
        { path: '/students', label: 'الطلاب والنقاط', icon: Users },
        { path: '/assets', label: 'الموارد والقاعات', icon: Box },
        { path: '/reports', label: 'التقارير', icon: FileText },
        { path: '/settings', label: 'الإعدادات', icon: Settings },
    ];

    const getPageTitle = () => {
        const currentItem = navItems.find(item => item.path === location.pathname);
        if (currentItem) return currentItem.label;
        if (location.pathname === '/') return 'لوحة التحكم';
        return 'نظام إدارة الأنشطة';
    };

    return (
        <div className="flex h-screen w-full bg-slate-900 text-white overflow-hidden font-cairo" dir="rtl">
            {/* --- EMERGENCY LOCKDOWN MODAL --- */}
            {isEmergency && (
                <div className="fixed inset-0 z-[999] bg-red-900/90 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8">
                    <div className="bg-black/40 p-10 rounded-3xl border border-red-500/50 shadow-2xl max-w-lg w-full animate-bounce-slow">
                        <Lock className="w-24 h-24 text-red-500 mx-auto mb-6" />
                        <h1 className="text-3xl font-bold text-white mb-4">⚠️ وضع الطوارئ نشط</h1>
                        <p className="text-red-200 text-lg mb-8 leading-relaxed">
                            لقد قمت بالدخول باستخدام مفتاح الاسترداد.
                            <br />
                            لدواعي الأمان، تم قفل النظام حتى تقوم بإعادة تعيين كلمة المرور.
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={handleLogout}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold rounded-xl shadow-lg transition-transform transform hover:scale-105 flex items-center justify-center gap-2"
                            >
                                <Lock size={18} /> تغيير كلمة المرور وتوليد مفتاح جديد
                            </button>

                            <button
                                onClick={handleSendReset}
                                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-colors flex items-center justify-center gap-2"
                            >
                                <Mail size={18} /> إرسال رابط الاستعادة للبريد
                            </button>

                            <button
                                onClick={handleLogout}
                                className="w-full py-3 bg-red-950/60 hover:bg-red-900/60 text-red-200 rounded-xl border border-red-500/30 transition-colors flex items-center justify-center gap-2"
                            >
                                <LogOut size={18} /> تسجيل الخروج
                            </button>
                        </div>

                        <p className="mt-8 text-xs text-red-400">
                            * ملاحظة: بعد تغيير كلمة المرور من البريد، قم بتسجيل الخروج والدخول بكلمة المرور الجديدة.
                        </p>
                    </div>
                </div>
            )}
            {/* --- MOBILE SIDEBAR OVERLAY --- */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* --- SIDEBAR --- */}
            <aside className={`
                fixed md:static inset-y-0 right-0 z-50 w-64 bg-slate-800 border-l border-slate-700 flex flex-col transition-transform duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
            `}>
                <div className="h-16 flex items-center justify-center border-b border-slate-700">
                    <AppLogo size="small" />
                </div>

                <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                                    }
                                `}
                            >
                                <item.icon size={20} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors'} />
                                <span className="font-semibold">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-700">
                    <div className="bg-slate-900/50 rounded-xl p-4 mb-4 border border-slate-700/50">
                        <p className="text-xs text-slate-400 mb-1">مسجل الدخول كـ</p>
                        <p className="font-bold text-sm truncate">{currentUser?.email}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-colors"
                    >
                        <LogOut size={20} />
                        <span className="font-semibold">تسجيل الخروج</span>
                    </button>
                </div>
            </aside>

            {/* --- MAIN CONTENT WRAPPER --- */}
            <main className="flex-1 flex flex-col h-full relative min-w-0 bg-slate-900">
                {/* Mobile Header */}
                <header className="h-16 flex items-center px-4 border-b border-slate-700 md:hidden bg-slate-800/80 backdrop-blur-md sticky top-0 z-30">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        aria-label="فتح القائمة الجانبية"
                        className="p-2 -mr-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50"
                    >
                        <Menu size={24} />
                    </button>
                    <h2 className="mr-4 text-lg font-bold text-white">{getPageTitle()}</h2>
                </header>

                {/* SCROLLABLE PAGE CONTENT */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8 custom-scrollbar relative">
                    <div className="max-w-7xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
}

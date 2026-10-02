import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, LogOut, Menu, Box, FileText, Lock, Mail, Settings, Link2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';

import AppLogo from './ui/AppLogo';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [pendingSubmissionsCount, setPendingSubmissionsCount] = useState(0);
    const { logout, currentUser, isEmergency } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Collapsed & Resizable Sidebar State
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('sidebar_collapsed') === 'true';
    });
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar_width');
        return saved ? Math.max(200, Math.min(450, parseInt(saved, 10))) : 260;
    });
    const [isResizing, setIsResizing] = useState(false);
    const isResizingRef = useRef(false);

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            localStorage.setItem('sidebar_collapsed', next.toString());
            return next;
        });
    };

    const startResizing = useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (moveEvent) => {
            if (!isResizingRef.current) return;
            // In RTL, sidebar is pinned to the right edge of the screen.
            // Distance from right window edge to mouse clientX is window.innerWidth - clientX.
            const newWidth = window.innerWidth - moveEvent.clientX;
            const clamped = Math.max(200, Math.min(450, newWidth));
            setSidebarWidth(clamped);
        };

        const handleMouseUp = () => {
            isResizingRef.current = false;
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            setSidebarWidth(current => {
                localStorage.setItem('sidebar_width', current.toString());
                return current;
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, []);

    // Live listener for pending submissions badge
    useEffect(() => {
        const q = query(
            collection(db, 'link_submissions'),
            where('status', '==', 'pending')
        );
        const unsubscribe = onSnapshot(q, (snap) => {
            setPendingSubmissionsCount(snap.size);
        }, (err) => {
            console.warn("Layout pending count error:", err);
        });
        return () => unsubscribe();
    }, []);

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
        { path: '/registration-links', label: 'روابط التسجيل', icon: Link2, badge: pendingSubmissionsCount },
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
            <aside
                style={{
                    width: typeof window !== 'undefined' && window.innerWidth >= 768
                        ? (isCollapsed ? '76px' : `${sidebarWidth}px`)
                        : undefined
                }}
                className={`
                    fixed md:static inset-y-0 right-0 z-50 bg-slate-800 border-l border-slate-700 flex flex-col md:relative
                    ${isResizing ? 'transition-none select-none' : 'transition-[width,transform] duration-200 ease-in-out'}
                    ${isSidebarOpen ? 'translate-x-0 w-72' : 'translate-x-full md:translate-x-0 w-72 md:w-auto'}
                `}
            >
                {/* Desktop Resize Handle (Left Edge in RTL) */}
                {!isCollapsed && (
                    <div
                        onMouseDown={startResizing}
                        className={`hidden md:block absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:w-2 hover:bg-indigo-500 active:bg-indigo-600 transition-all select-none z-50 group ${isResizing ? 'w-2 bg-indigo-500' : 'bg-transparent'}`}
                        title="اسحب لتغيير عرض القائمة الجانبية"
                    >
                        <div className="absolute top-1/2 -translate-y-1/2 -left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-500 text-white rounded-full w-2.5 h-8 flex items-center justify-center pointer-events-none shadow-md">
                            <div className="w-0.5 h-4 bg-white/70 rounded-full" />
                        </div>
                    </div>
                )}

                {/* Sidebar Header with 3-Lines Menu Toggle */}
                <div className={`h-16 flex items-center border-b border-slate-700 px-3 transition-all ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!isCollapsed ? (
                        <>
                            <AppLogo size="small" />
                            <button
                                onClick={toggleCollapse}
                                title="تصغير الشريط الجانبي (إظهار الأيقونات فقط)"
                                className="hidden md:flex p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors items-center justify-center"
                            >
                                <Menu size={20} />
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={toggleCollapse}
                            title="توسيع الشريط الجانبي"
                            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-xl transition-colors flex items-center justify-center"
                        >
                            <Menu size={22} />
                        </button>
                    )}
                </div>

                {/* Navigation Items */}
                <nav className={`flex-1 overflow-y-auto py-5 space-y-1.5 ${isCollapsed ? 'px-2' : 'px-3'}`}>
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={isCollapsed ? item.label : undefined}
                                className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-3.5' : 'justify-between px-3.5 py-3'} rounded-xl transition-all duration-200 group relative
                                    ${isActive
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                                    }
                                `}
                            >
                                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} relative`}>
                                    <item.icon size={21} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white transition-colors'} />
                                    {!isCollapsed && <span className="font-semibold text-sm truncate">{item.label}</span>}
                                    {isCollapsed && item.badge > 0 && (
                                        <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black bg-amber-500 text-slate-950 flex items-center justify-center shadow">
                                            {item.badge}
                                        </span>
                                    )}
                                </div>
                                {!isCollapsed && item.badge > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950 animate-pulse">
                                        {item.badge}
                                    </span>
                                )}

                                {/* Floating Tooltip in Collapsed Mode */}
                                {isCollapsed && (
                                    <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg shadow-2xl border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50">
                                        {item.label}
                                        {item.badge > 0 && <span className="mr-1.5 text-amber-400 font-normal">({item.badge})</span>}
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Sidebar Footer */}
                <div className={`p-3 border-t border-slate-700 ${isCollapsed ? 'flex flex-col items-center gap-3 px-2' : ''}`}>
                    {!isCollapsed ? (
                        <>
                            <div className="bg-slate-900/50 rounded-xl p-3 mb-2.5 border border-slate-700/50">
                                <p className="text-xs text-slate-400 mb-0.5">مسجل الدخول كـ</p>
                                <p className="font-bold text-xs truncate text-slate-200">{currentUser?.email}</p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-3 w-full px-3.5 py-2.5 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-colors text-sm font-semibold"
                            >
                                <LogOut size={18} />
                                <span>تسجيل الخروج</span>
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Collapsed User Avatar */}
                            <div
                                title={`مسجل الدخول كـ: ${currentUser?.email || ''}`}
                                className="w-10 h-10 rounded-xl bg-slate-900/70 border border-slate-700 flex items-center justify-center text-slate-300 font-bold text-xs cursor-default relative group"
                            >
                                {currentUser?.email ? currentUser.email[0].toUpperCase() : 'U'}
                                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-slate-800 text-white text-xs rounded-lg shadow-2xl border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
                                    <span className="text-slate-400 block text-[10px]">الحساب الحالي</span>
                                    {currentUser?.email}
                                </div>
                            </div>

                            {/* Collapsed Logout */}
                            <button
                                onClick={handleLogout}
                                title="تسجيل الخروج"
                                className="w-10 h-10 flex items-center justify-center text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-xl transition-colors relative group"
                            >
                                <LogOut size={20} />
                                <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-slate-800 text-red-300 text-xs font-bold rounded-lg shadow-2xl border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
                                    تسجيل الخروج
                                </div>
                            </button>
                        </>
                    )}
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

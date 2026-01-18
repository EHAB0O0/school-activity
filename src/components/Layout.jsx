import { useState, useEffect } from 'react';
import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Calendar, Settings, LogOut, Menu, X, Box, FileText, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { logout, currentUser } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Close sidebar on route change (Mobile UX)
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error("Logout failed", error);
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
                <div className="h-16 flex items-center justify-between px-6 border-b border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                            <Shield className="text-white" size={20} />
                        </div>
                        <h1 className="text-lg font-bold tracking-tight">Activity Master</h1>
                    </div>
                    {/* Mobile Close Button */}
                    <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
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

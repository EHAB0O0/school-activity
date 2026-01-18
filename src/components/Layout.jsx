import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Users, Box, Settings as SettingsIcon, FileBarChart, LogOut, Home } from 'lucide-react';
import clsx from 'clsx';
import CommandPalette from './CommandPalette';

export default function Layout() {
    const { logout } = useAuth();
    const location = useLocation();

    const navItems = [
        { path: '/', label: 'الرئيسية', icon: Home },
        { path: '/scheduler', label: 'الجدول', icon: Calendar },
        { path: '/students', label: 'الطلاب', icon: Users },
        { path: '/assets', label: 'الموارد', icon: Box },
        { path: '/reports', label: 'التقارير', icon: FileBarChart },
        { path: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ];

    return (
        <div className="flex h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black text-white overflow-hidden font-cairo">

            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"></div>

            {/* Sidebar */}
            <aside className="w-72 bg-white/10 backdrop-blur-xl border-l border-white/10 flex flex-col hidden md:flex z-40 shadow-2xl relative">
                <div className="p-6 border-b border-white/10 flex items-center justify-center">
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        نظام الأنشطة
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-3">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={clsx(
                                "flex items-center space-x-4 space-x-reverse px-4 py-3 rounded-xl transition-all duration-300 group",
                                location.pathname === item.path
                                    ? "bg-gradient-to-l from-indigo-600/80 to-purple-600/80 shadow-lg shadow-indigo-500/20 text-white translate-x-2"
                                    : "text-gray-300 hover:bg-white/5 hover:text-white hover:translate-x-1"
                            )}
                        >
                            <item.icon size={22} className={location.pathname === item.path ? "text-white" : "text-gray-400 group-hover:text-white"} />
                            <span className="font-medium text-lg">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button
                        onClick={logout}
                        className="flex items-center space-x-3 space-x-reverse px-4 py-3 w-full text-red-300 hover:bg-red-500/10 hover:text-red-200 rounded-xl transition-all"
                    >
                        <LogOut size={20} />
                        <span>تسجيل خروج</span>
                    </button>
                    <div className="text-center text-xs text-gray-500 mt-4 font-mono">
                        v1.0.0 Stable
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                <div className="p-6 md:p-10 max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Nav (Bottom Bar) */}
            <div className="md:hidden fixed bottom-4 left-4 right-4 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex justify-around p-2 z-50">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className={clsx(
                            "flex flex-col items-center p-2 rounded-xl transition-all",
                            location.pathname === item.path
                                ? "bg-indigo-600/80 text-white shadow-lg"
                                : "text-gray-400"
                        )}
                    >
                        <item.icon size={24} />
                    </Link>
                ))}
            </div>

            <CommandPalette />
        </div>
    );
}

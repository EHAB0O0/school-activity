import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ShieldAlert, Key, HelpCircle, Lock, ArrowLeft, Activity, Loader2 } from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';

export default function Login() {
    const [password, setPassword] = useState('');
    const { login, activateEmergencyMode } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // login | recovery
    const [recoveryKey, setRecoveryKey] = useState('');
    const [hint, setHint] = useState('');

    // Auto-setup logic (Hidden/Dev helper)
    const ensureAdminExists = async () => {
        try {
            await createUserWithEmailAndPassword(auth, "admin@school.com", "Aa123456789");
            console.log("Default admin created");
        } catch (e) {
            if (e.code !== 'auth/email-already-in-use') {
                console.warn("Setup notice:", e.message);
            }
        }
    };

    useEffect(() => {
        ensureAdminExists();
    }, []);

    const handleForgot = async () => {
        try {
            const docSnap = await getDoc(doc(db, "settings", "global"));
            if (docSnap.exists() && docSnap.data().passwordHint) {
                setHint(docSnap.data().passwordHint);
                toast("تلميح كلمة المرور: " + docSnap.data().passwordHint, { icon: '💡', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
            } else {
                toast.error("لم يتم تعيين تلميح.");
            }
        } catch (e) {
            toast.error("تعذر استرجاع التلميح.");
        }
    };

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'login') {
                // Hardcoded Email as requested
                await login("admin@school.com", password);
                navigate('/');
            } else {
                // Recovery Mode
                const docSnap = await getDoc(doc(db, "settings", "global"));
                if (docSnap.exists() && docSnap.data().recoveryKeyHash) {
                    if (docSnap.data().recoveryKeyHash === recoveryKey) {
                        activateEmergencyMode();
                        toast.success("تم الدخول في وضع الطوارئ", { icon: '🚨' });
                        navigate('/');
                    } else {
                        toast.error("مفتاح الاسترداد غير صحيح");
                    }
                } else {
                    toast.error("لم يتم إعداد مفتاح استرداد للنظام.");
                }
            }
        } catch (error) {
            toast.error('بيانات الدخول غير صحيحة');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-black font-cairo relative overflow-hidden" dir="rtl">
            {/* Abstract Background Shapes */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 right-20 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

            <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl relative z-10 transform transition-all hover:scale-[1.01]">

                <div className="flex flex-col items-center mb-8">
                    {mode === 'login' ? (
                        <div className="mb-6 transform hover:scale-105 transition-transform">
                            <AppLogo size="normal" />
                        </div>
                    ) : (
                        <div className={`p-4 rounded-full mb-4 shadow-lg bg-red-600`}>
                            <ShieldAlert className="text-white w-8 h-8" />
                        </div>
                    )}
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                        {mode === 'login' ? 'أهلاً بك مجدداً' : 'دخول الطوارئ'}
                    </h2>
                    <p className="text-indigo-200 text-sm mt-2">
                        {mode === 'login' ? 'الرجاء إدخال كلمة المرور الرئيسية للمتابعة' : 'بروتوكول فتح النظام الآمن'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {mode === 'login' ? (
                        <div className="relative group">
                            <input
                                type="password"
                                required
                                placeholder=" "
                                className="peer w-full px-5 py-3.5 bg-gray-900/50 border border-gray-600/50 rounded-xl text-white placeholder-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <label className="absolute right-5 top-3.5 text-gray-400 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-3.5 peer-focus:-top-2.5 peer-focus:text-indigo-400 peer-focus:text-xs bg-transparent pointer-events-none">
                                كلمة المرور
                            </label>
                            <div className="absolute left-4 top-4 text-indigo-400">
                                <Lock size={18} />
                            </div>
                        </div>
                    ) : (
                        <div className="relative group">
                            <input
                                type="text"
                                required
                                placeholder=" "
                                className="peer w-full px-5 py-3.5 bg-red-900/40 border border-red-500/50 rounded-xl text-white placeholder-transparent focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all tracking-widest font-mono text-center"
                                value={recoveryKey}
                                onChange={(e) => setRecoveryKey(e.target.value)}
                            />
                            <label className="absolute right-5 top-3.5 text-red-300 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-red-300 peer-placeholder-shown:top-3.5 peer-focus:-top-2.5 peer-focus:text-red-400 peer-focus:text-xs bg-transparent pointer-events-none">
                                مفتاح الاسترداد (XXXX-XXXX)
                            </label>
                            <div className="absolute left-4 top-4 text-red-400">
                                <Key size={18} />
                            </div>
                        </div>
                    )}

                    {hint && (
                        <div className="p-3 bg-indigo-900/50 border border-indigo-500/30 rounded-lg flex items-start space-x-3 space-x-reverse">
                            <HelpCircle className="text-yellow-400 shrink-0" size={18} />
                            <span className="text-indigo-200 text-sm">تلميح: {hint}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-4 rounded-xl shadow-lg text-white font-bold text-lg transition-all transform hover:translate-y-[-2px] active:translate-y-[1px] flex items-center justify-center space-x-2 space-x-reverse ${mode === 'login'
                            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-indigo-500/30'
                            : 'bg-gradient-to-r from-red-600 to-orange-600 hover:shadow-red-500/30'
                            }`}
                    >
                        <span>{loading ? 'جاري التحقق...' : (mode === 'login' ? 'تسجيل الدخول' : 'تجاوز الأمان')}</span>
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowLeft size={20} />}
                    </button>
                </form>

                <div className="mt-8 flex justify-between items-center text-sm border-t border-white/10 pt-4">
                    <button
                        onClick={() => setMode(mode === 'login' ? 'recovery' : 'login')}
                        className={`transition-colors flex items-center space-x-1 space-x-reverse ${mode === 'login' ? 'text-red-400 hover:text-red-300' : 'text-indigo-300 hover:text-white'}`}
                    >
                        {mode === 'login' ? <span>نسيت كلمة المرور؟</span> : <span>عودة للدخول</span>}
                    </button>

                    {mode === 'login' && (
                        <button onClick={handleForgot} className="text-indigo-300 hover:text-white transition-colors">
                            إظهار التلميح
                        </button>
                    )}
                </div>
            </div>

            {/* Footer Info */}
            <div className="absolute bottom-4 text-center w-full text-white/20 text-xs">
                نظام إدارة النشاط المدرسي &copy; 2026
            </div>
        </div>
    );
}

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ShieldAlert, Key, HelpCircle, Lock, ArrowLeft, Activity, Loader2, Check, Copy, AlertTriangle, ShieldCheck } from 'lucide-react';
import AppLogo from '../components/ui/AppLogo';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, completeEmergencyReset } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // login | recovery | force_reset | reveal_key
    const [recoveryKey, setRecoveryKey] = useState('');
    const [hint, setHint] = useState('');

    // Force Reset State
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [newHint, setNewHint] = useState('');
    const [generatedNewKey, setGeneratedNewKey] = useState('');
    const [isCopied, setIsCopied] = useState(false);

    const handleForgot = async () => {
        try {
            const docSnap = await getDoc(doc(db, "settings", "global"));
            if (docSnap.exists() && docSnap.data().passwordHint) {
                setHint(docSnap.data().passwordHint);
                toast("تلميح كلمة المرور: " + docSnap.data().passwordHint, { icon: '💡', style: { borderRadius: '10px', background: '#333', color: '#fff' } });
            } else {
                toast.error("لم يتم تعيين تلميح.");
            }
        } catch {
            toast.error("تعذر استرجاع التلميح.");
        }
    };

    // Step 1: Normal Login or Recovery Key Verification
    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'login') {
                await login(email, password);
                navigate('/');
            } else if (mode === 'recovery') {
                // Verify Recovery Key
                const docSnap = await getDoc(doc(db, "settings", "global"));
                if (docSnap.exists() && docSnap.data().recoveryKeyHash) {
                    const savedKey = docSnap.data().recoveryKeyHash.trim();
                    if (savedKey === recoveryKey.trim()) {
                        toast.success("تم التحقق من مفتاح الاسترداد. يجب تغيير كلمة المرور وتوليد مفتاح جديد الآن.", { icon: '🔐' });
                        // Transition to Forced Reset Mode (Strict Protocol)
                        setMode('force_reset');
                    } else {
                        toast.error("مفتاح الاسترداد غير صحيح");
                    }
                } else {
                    toast.error("لم يتم إعداد مفتاح استرداد للنظام.");
                }
            }
        } catch (error) {
            console.error("Login/Recovery error:", error);
            toast.error('بيانات الدخول غير صحيحة');
        } finally {
            setLoading(false);
        }
    }

    // Step 2: Handle Forced Password Change & New Key Generation
    async function handleForcedPasswordSubmit(e) {
        e.preventDefault();
        if (newPassword.length < 6) {
            return toast.error("كلمة المرور يجب أن لا تقل عن 6 خانات");
        }
        if (newPassword !== confirmPassword) {
            return toast.error("كلمتا المرور غير متطابقتين");
        }

        setLoading(true);
        try {
            // Generate brand new emergency key
            const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            let newKey = "";
            for (let i = 0; i < 20; i++) {
                if (i > 0 && i % 4 === 0) newKey += "-";
                newKey += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            // Save new credentials and new recovery key in Firestore settings
            await setDoc(doc(db, "settings", "global"), {
                recoveryKeyHash: newKey,
                adminPassword: newPassword,
                passwordHint: newHint.trim() || ''
            }, { merge: true });

            setGeneratedNewKey(newKey);
            setMode('reveal_key');
            toast.success("تم تغيير كلمة المرور وتوليد المفتاح الجديد!");
        } catch (err) {
            console.error("Forced password reset error:", err);
            toast.error("حدث خطأ أثناء تحديث بيانات الأمان");
        } finally {
            setLoading(false);
        }
    }

    const copyKeyToClipboard = () => {
        if (!generatedNewKey) return;
        navigator.clipboard.writeText(generatedNewKey);
        setIsCopied(true);
        toast.success("تم نسخ المفتاح الجديد للحافظة");
        setTimeout(() => setIsCopied(false), 3000);
    };

    const handleEnterSystem = () => {
        // Log the user into system with the new credentials
        completeEmergencyReset({
            uid: 'admin',
            email: 'admin@school.com',
            role: 'admin'
        });
        toast.success("تم تسجيل الدخول بنجاح! نوصي بتسجيل الدخول بكلمة المرور الجديدة مستقبلاً.");
        navigate('/');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-black font-cairo relative overflow-hidden" dir="rtl">
            {/* Abstract Background Shapes */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 right-20 w-96 h-96 bg-amber-600 rounded-full mix-blend-multiply filter blur-3xl opacity-15 animate-blob animation-delay-4000"></div>

            <div className="w-full max-w-md p-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl relative z-10 transform transition-all">

                {/* Header */}
                <div className="flex flex-col items-center mb-8">
                    {mode === 'login' ? (
                        <div className="mb-4 transform hover:scale-105 transition-transform">
                            <AppLogo size="large" />
                        </div>
                    ) : mode === 'recovery' ? (
                        <div className="p-4 rounded-full mb-4 shadow-lg bg-red-600 animate-pulse">
                            <ShieldAlert className="text-white w-8 h-8" />
                        </div>
                    ) : mode === 'force_reset' ? (
                        <div className="p-4 rounded-full mb-4 shadow-lg bg-amber-500">
                            <AlertTriangle className="text-black w-8 h-8" />
                        </div>
                    ) : (
                        <div className="p-4 rounded-full mb-4 shadow-lg bg-emerald-600">
                            <ShieldCheck className="text-white w-8 h-8" />
                        </div>
                    )}

                    <h2 className="text-2xl font-bold text-white tracking-tight">
                        {mode === 'login' && 'أهلاً بك مجدداً'}
                        {mode === 'recovery' && 'دخول الطوارئ الآمن'}
                        {mode === 'force_reset' && 'إعادة ضبط الأمان الإجباري'}
                        {mode === 'reveal_key' && 'مفتاح الطوارئ الجديد'}
                    </h2>
                    <p className="text-indigo-200/80 text-sm mt-1 text-center">
                        {mode === 'login' && 'الرجاء إدخال بيانات الدخول للمتابعة'}
                        {mode === 'recovery' && 'أدخل مفتاح الاسترداد للبدء في بروتوكول الطوارئ'}
                        {mode === 'force_reset' && 'يجب تغيير كلمة المرور وتوليد مفتاح جديد قبل المتابعة'}
                        {mode === 'reveal_key' && 'احفظ هذا المفتاح بعناية، فقد تم إبطال المفتاح القديم'}
                    </p>
                </div>

                {/* --- MODE 1 & 2: LOGIN & RECOVERY --- */}
                {(mode === 'login' || mode === 'recovery') && (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {mode === 'login' ? (
                            <>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-indigo-200 block mr-1">البريد الإلكتروني</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-indigo-400 group-focus-within:text-white transition-colors">
                                            <Activity size={20} />
                                        </div>
                                        <input
                                            type="email"
                                            required
                                            className="w-full bg-black/40 border border-indigo-500/30 text-white text-lg rounded-xl pr-10 pl-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-gray-500"
                                            placeholder="admin@school.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center mr-1">
                                        <label className="text-sm font-medium text-indigo-200">كلمة المرور</label>
                                    </div>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-indigo-400 group-focus-within:text-white transition-colors">
                                            <Lock size={20} />
                                        </div>
                                        <input
                                            type="password"
                                            required
                                            className="w-full bg-black/40 border border-indigo-500/30 text-white text-lg rounded-xl pr-10 pl-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-gray-500"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            dir="ltr"
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="relative group">
                                <label className="text-xs text-red-300 block mb-2 font-bold">مفتاح الاسترداد (XXXX-XXXX-XXXX-XXXX)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        placeholder="ABCD-EFGH-JKLM-NPQR"
                                        className="w-full px-5 py-3.5 bg-red-950/40 border border-red-500/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all tracking-widest font-mono text-center"
                                        value={recoveryKey}
                                        onChange={(e) => setRecoveryKey(e.target.value)}
                                    />
                                    <div className="absolute left-4 top-4 text-red-400">
                                        <Key size={18} />
                                    </div>
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
                            <span>{loading ? 'جاري التحقق...' : (mode === 'login' ? 'تسجيل الدخول' : 'التحقق ومتابعة الطوارئ')}</span>
                            {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowLeft size={20} />}
                        </button>
                    </form>
                )}

                {/* --- MODE 3: FORCED RESET PASSWORD & REGENERATE KEY --- */}
                {mode === 'force_reset' && (
                    <form onSubmit={handleForcedPasswordSubmit} className="space-y-4">
                        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-relaxed flex items-start gap-2">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-400" />
                            <span>
                                بروتوكول الأمان يُلزمك بتعيين كلمة مرور جديدة قبل الدخول، وسيتم فوراً إلغاء المفتاح القديم وإنشاء مفتاح جديد.
                            </span>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-indigo-200 block">كلمة المرور الجديدة (6 خانات على الأقل)</label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                className="w-full bg-black/40 border border-white/20 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                dir="ltr"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-indigo-200 block">تأكيد كلمة المرور الجديدة</label>
                            <input
                                type="password"
                                required
                                minLength={6}
                                className="w-full bg-black/40 border border-white/20 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                dir="ltr"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs text-indigo-200 block">تلميح كلمة المرور (اختياري)</label>
                            <input
                                type="text"
                                className="w-full bg-black/40 border border-white/20 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                placeholder="مثال: اسم أول مدرسة أو تاريخ خاص"
                                value={newHint}
                                onChange={(e) => setNewHint(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 mt-4"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                            <span>حفظ كلمة المرور وتوليد مفتاح الطوارئ</span>
                        </button>
                    </form>
                )}

                {/* --- MODE 4: REVEAL NEW EMERGENCY KEY --- */}
                {mode === 'reveal_key' && (
                    <div className="space-y-5 animate-fade-in text-center">
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
                            تم بنجاح تحديث كلمة المرور وإلغاء مفتاح الطوارئ القديم!
                        </div>

                        <div>
                            <span className="text-xs text-gray-400 block mb-2">مفتاح الطوارئ الجديد الخاص بك:</span>
                            <div className="p-4 bg-black/60 border-2 border-emerald-500/50 rounded-xl font-mono text-xl md:text-2xl font-bold text-emerald-400 tracking-widest select-all">
                                {generatedNewKey}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={copyKeyToClipboard}
                            className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                        >
                            {isCopied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                            <span>{isCopied ? 'تم النسخ للحافظة!' : 'نسخ المفتاح للحافظة'}</span>
                        </button>

                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs leading-relaxed text-right">
                            ⚠️ تنبيه: يرجى طباعة هذا المفتاح أو حفظه في مكان آمن وخاص بك. لن تتمكن من استعادة الحساب بدون كلمة المرور أو هذا المفتاح.
                        </div>

                        <button
                            type="button"
                            onClick={handleEnterSystem}
                            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg transition-transform transform active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span>متابعة الدخول إلى النظام</span>
                            <ArrowLeft size={18} />
                        </button>
                    </div>
                )}

                {/* Bottom Navigation */}
                {(mode === 'login' || mode === 'recovery') && (
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
                )}
            </div>

            {/* Footer Info */}
            <div className="absolute bottom-4 text-center w-full text-white/20 text-xs">
                نظام إدارة النشاط المدرسي &copy; 2026
            </div>
        </div>
    );
}

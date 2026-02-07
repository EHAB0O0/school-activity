import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../firebase';
import { doc, setDoc, writeBatch, collection, getDocs, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, createUserWithEmailAndPassword } from 'firebase/auth';
import {
    Save, Shield, Key, AlertTriangle, RefreshCw, Clock,
    Settings, Plus, Trash2, List, Calendar, School, Edit3, CheckCircle, Box, X, Bell
} from 'lucide-react';
import ConfirmModal from '../components/ui/ConfirmModal';
import CriticalActionModal from '../components/ui/CriticalActionModal';

import toast from 'react-hot-toast';

export default function SettingsPage() {
    const {
        settings, activeProfile, switchProfile,
        updateEventTypes, eventTypes,
        saveTimeProfile, updateSchoolInfo, schoolInfo,
        updateHolidaysAndWeekends, weekends, holidays
    } = useSettings();

    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('general'); // general | time | schemas | security | notifications

    // --- Notifications State ---
    const [notifPermission, setNotifPermission] = useState('default');
    const [defaultReminders, setDefaultReminders] = useState([]); // [{ type: 'minutes', value: 60 }]

    useEffect(() => {
        if ('Notification' in window) {
            setNotifPermission(Notification.permission);
        }
        if (settings?.notifications?.defaultReminders) {
            setDefaultReminders(settings.notifications.defaultReminders);
        }
    }, [settings]);

    const requestNotifPermission = async () => {
        if (!('Notification' in window)) {
            toast.error("هذا المتصفح لا يدعم الإشعارات");
            return;
        }
        const permission = await Notification.requestPermission();
        setNotifPermission(permission);
        if (permission === 'granted') {
            toast.success("تم تفعيل الإشعارات");
            new Notification("تجربة الإشعارات", { body: "نظام إدارة الأنشطة يعمل بنجاح!" });
        } else {
            toast.error("تم رفض الإذن");
        }
    };

    const addDefaultReminder = () => {
        setDefaultReminders([...defaultReminders, { type: 'minutes', value: 15 }]);
    };

    const removeDefaultReminder = (index) => {
        const newReminders = [...defaultReminders];
        newReminders.splice(index, 1);
        setDefaultReminders(newReminders);
    };

    const updateDefaultReminder = (index, field, value) => {
        const newReminders = [...defaultReminders];
        newReminders[index][field] = value;
        setDefaultReminders(newReminders);
    };

    const handleSaveNotifications = async () => {
        try {
            await useSettings().updateNotificationSettings({
                defaultReminders
            });
            toast.success("تم حفظ إعدادات الإشعارات");
        } catch (e) {
            console.error(e);
            toast.error("فشل الحفظ");
        }
    };

    // --- 1. General Info State ---
    const [infoForm, setInfoForm] = useState({ name: '', termStart: '', termEnd: '' });
    // Holidays & Weekends State
    const [selectedWeekends, setSelectedWeekends] = useState([]); // [5, 6] etc.
    const [holidaysList, setHolidaysList] = useState([]);
    const [newHoliday, setNewHoliday] = useState({ date: '', reason: '' });

    // --- 2. Time Profile Builder State ---
    const [profilesList, setProfilesList] = useState([]); // Fetch locally or use from context if available
    const [selectedProfileId, setSelectedProfileId] = useState(null);
    const [editingProfile, setEditingProfile] = useState({ name: 'ملف جديد', slots: [] });

    // --- 3. Schema Builder State ---
    const [localTypes, setLocalTypes] = useState([]);
    const [selectedTypeId, setSelectedTypeId] = useState(null);
    const [editingType, setEditingType] = useState({ name: '', fields: [] });

    // --- Security State ---
    const [currentPwd, setCurrentPwd] = useState('');
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [generatedKey, setGeneratedKey] = useState('');
    const [hintText, setHintText] = useState('');

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDestructive: false });

    // --- End Of Year State ---
    const [criticalModal, setCriticalModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [archiveLabel, setArchiveLabel] = useState('');

    // --- Secure Prompt State ---
    const [securityPrompt, setSecurityPrompt] = useState({ isOpen: false, onVerified: null });
    const [securityPwd, setSecurityPwd] = useState('');

    // Initialization
    useEffect(() => {
        if (settings) {
            setInfoForm(schoolInfo || { name: '', termStart: '', termEnd: '' });
            setHintText(settings.passwordHint || '');
            setLocalTypes(eventTypes || []);
            // Initialize weekends/holidays from settings context (which defaults to [] if empty)
            setSelectedWeekends(settings.weekends || []);
            setHolidaysList(settings.holidays || []);
        }
        // We need to fetch profiles list separately or use a hook if it was in context
        // For now re-using the logic from previous component to fetch collection
        import('firebase/firestore').then(({ collection, getDocs }) => {
            getDocs(collection(db, 'time_profiles')).then(snap => {
                setProfilesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });
        });
    }, [settings, eventTypes, schoolInfo]);

    // --- Handlers: General Info ---
    const handleSaveInfo = async () => {
        try {
            await updateSchoolInfo(infoForm);
            toast.success("تم حفظ بيانات المدرسة");
        } catch (error) {
            toast.error("فشل الحفظ");
        }
    };

    const handleSaveHolidays = async () => {
        try {
            await updateHolidaysAndWeekends({
                weekends: selectedWeekends,
                holidays: holidaysList
            });
            toast.success("تم تحديث العطلات وأوقات الدوام");
        } catch (e) {
            toast.error("فشل الحفظ");
        }
    };

    const addHoliday = () => {
        if (!newHoliday.date || !newHoliday.reason) return toast.error("أدخل التاريخ والسبب");
        setHolidaysList([...holidaysList, { ...newHoliday, id: Date.now() }]);
        setNewHoliday({ date: '', reason: '' });
    };

    const removeHoliday = (id) => {
        setHolidaysList(holidaysList.filter(h => h.id !== id));
    };

    const toggleWeekend = (dayIndex) => {
        if (selectedWeekends.includes(dayIndex)) {
            setSelectedWeekends(selectedWeekends.filter(d => d !== dayIndex));
        } else {
            setSelectedWeekends([...selectedWeekends, dayIndex]);
        }
    };

    // --- Handlers: Time Profiles ---
    const handleSelectProfile = (profile) => {
        setSelectedProfileId(profile.id);
        setEditingProfile(profile);
    };

    const handleCreateProfile = () => {
        const newP = { id: null, name: 'توقيت جديد', slots: [] };
        setSelectedProfileId('NEW');
        setEditingProfile(newP);
    };

    const handleAddSlot = () => {
        setEditingProfile({
            ...editingProfile,
            slots: [...editingProfile.slots, { label: 'Hessa 1', start: '08:00', end: '08:45', type: 'Class' }]
        });
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...editingProfile.slots];
        newSlots[index][field] = value;
        setEditingProfile({ ...editingProfile, slots: newSlots });
    };

    const handleRemoveSlot = (index) => {
        const newSlots = [...editingProfile.slots];
        newSlots.splice(index, 1);
        setEditingProfile({ ...editingProfile, slots: newSlots });
    };

    const handleSaveProfile = async () => {
        if (!editingProfile.name) return toast.error("اسم الملف مطلوب");
        try {
            await saveTimeProfile(editingProfile);
            toast.success("تم حفظ الملف الزمني");
            // Refresh list
            const { collection, getDocs } = await import('firebase/firestore');
            const snap = await getDocs(collection(db, 'time_profiles'));
            setProfilesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            toast.error("فشل الحفظ");
        }
    };

    // --- Handlers: Schemas ---
    const handleSelectType = (type) => {
        setSelectedTypeId(type.id);
        setEditingType(type);
    };

    const handleCreateType = () => {
        const newT = { id: Date.now(), name: 'نشاط جديد', fields: [] };
        setSelectedTypeId(newT.id);
        setEditingType(newT);
    };

    const handleAddField = () => {
        setEditingType({
            ...editingType,
            fields: [...editingType.fields, { label: 'New Field', type: 'text' }]
        });
    };

    const handleFieldChange = (index, key, value) => {
        const newFields = [...editingType.fields];
        newFields[index][key] = value;
        setEditingType({ ...editingType, fields: newFields });
    };

    const handleSaveSchema = async () => {
        // Sanitize fields: Convert options string to array if needed
        const sanitizedType = {
            ...editingType,
            fields: editingType.fields.map(f => {
                if (f.type === 'select' && typeof f.options === 'string') {
                    return {
                        ...f,
                        options: f.options.split('\n').map(s => s.trim()).filter(Boolean)
                    };
                }
                return f;
            })
        };

        // Find index in localTypes
        let newLocalTypes = [...localTypes];
        const existingIndex = newLocalTypes.findIndex(t => t.id === sanitizedType.id);

        if (existingIndex >= 0) {
            newLocalTypes[existingIndex] = sanitizedType;
        } else {
            newLocalTypes.push(sanitizedType);
        }

        setLocalTypes(newLocalTypes);
        // Update editingType to match sanitized version so UI reflects the array (optional, but good for consistency)
        setEditingType(sanitizedType);

        try {
            await updateEventTypes(newLocalTypes);
            toast.success("تم تحديث هيكل الأنشطة");
        } catch (e) {
            toast.error("فشل الحفظ");
        }
    };


    // --- TestSprite Safety Logic ---
    const handleCreateTestAccount = async () => {
        const toastId = toast.loading('جاري إنشاء حساب الاختبار...');
        try {
            // 1. Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, "test_bot@school.com", "TestBot123!");
            const user = userCredential.user;

            // 2. Create User Profile in Firestore
            await setDoc(doc(db, "users", user.uid), {
                email: "test_bot@school.com",
                name: "TestSprite Bot 🤖",
                role: "admin", // Give admin to allow testing everything
                avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=TestBot", // Placeholder Robot
                createdAt: new Date(),
                isTestAccount: true
            });

            toast.success("تم إنشاء حساب TestSprite بنجاح! 🤖", { id: toastId });
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                toast.success("حساب الاختبار موجود مسبقاً", { id: toastId });
            } else {
                toast.error("فشلت العملية: " + error.message, { id: toastId });
            }
        }
    };

    const handlePurgeTestData = async () => {
        setConfirmModal({
            isOpen: true,
            title: 'تنظيف بيانات الاختبار',
            message: 'هل أنت متأكد من حذف جميع البيانات التي تبدأ بـ [TEST] أو TestSprite؟ لا يمكن التراجع عن هذا الإجراء.',
            isDestructive: true,
            onConfirm: async () => {
                const toastId = toast.loading('جاري تنظيف بيانات الاختبار... 🧹');
                try {
                    let deletedCount = 0;
                    const collectionsToCheck = ['events', 'students', 'assets'];

                    for (const colName of collectionsToCheck) {
                        const colRef = collection(db, colName);
                        const snapshot = await getDocs(colRef);

                        const batch = writeBatch(db);
                        let batchCount = 0;

                        snapshot.docs.forEach(docSnap => {
                            const data = docSnap.data();
                            const title = data.title || data.name || '';
                            // Check for Test Prefixes
                            const isTest = title.startsWith('[TEST]') || title.startsWith('TestSprite') || data.isTestData === true;

                            if (isTest) {
                                batch.delete(docSnap.ref);
                                batchCount++;
                                deletedCount++;
                            }
                        });

                        if (batchCount > 0) await batch.commit();
                    }
                    toast.success(`تم تنظيف ${deletedCount} سجل تجريبي بنجاح! ✨`, { id: toastId });
                } catch (error) {
                    console.error(error);
                    toast.error("حدث خطأ أثناء التنظيف", { id: toastId });
                }
            }
        });
    };

    // --- Security Logic from before ---
    const handlePassChange = async (e) => {
        e.preventDefault();
        if (newPwd !== confirmPwd) return toast.error("كلمات المرور غير متطابقة");
        const toastId = toast.loading("جاري التحديث...");
        try {
            const cred = EmailAuthProvider.credential(currentUser.email, currentPwd);
            await reauthenticateWithCredential(currentUser, cred);
            await updatePassword(currentUser, newPwd);
            toast.success("تم تغيير كلمة المرور", { id: toastId });
            setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
        } catch (error) { toast.error(error.message, { id: toastId }); }
    };
    const generateRecoveryKey = async () => {
        // Step 1: Open Security Prompt
        setSecurityPrompt({
            isOpen: true,
            onVerified: async () => {
                // Step 2: Actual Generation Logic (after verification)
                const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                let key = "";
                for (let i = 0; i < 20; i++) { if (i > 0 && i % 4 === 0) key += "-"; key += chars.charAt(Math.floor(Math.random() * chars.length)); }
                await setDoc(doc(db, "settings", "global"), { recoveryKeyHash: key }, { merge: true });
                setGeneratedKey(key);
                toast.success("تم توليد مفتاح جديد بنجاح");
            }
        });
    };

    const handleSecurityVerify = async (e) => {
        e.preventDefault();
        const toastId = toast.loading("جاري التحقق...");
        try {
            const cred = EmailAuthProvider.credential(currentUser.email, securityPwd);
            await reauthenticateWithCredential(currentUser, cred);

            toast.success("تم التحقق", { id: toastId });
            setSecurityPrompt({ ...securityPrompt, isOpen: false });
            setSecurityPwd('');

            // Execute the callback
            if (securityPrompt.onVerified) {
                await securityPrompt.onVerified();
            }

        } catch (error) {
            console.error(error);
            toast.error("كلمة المرور غير صحيحة", { id: toastId });
        }
    };

    // --- End Of Year Logic (Nuclear) ---
    const handleStartNewYear = () => {
        if (!archiveLabel) return toast.error("الرجاء إدخال اسم للأرشيف (مثلاً: عام 2024-2025)");

        setCriticalModal({
            isOpen: true,
            title: "بدء عام دراسي جديد",
            message: "هل أنت متأكد تماماً؟ سيتم أرشفة جميع الأنشطة الحالية وتصفير نقاط جميع الطلاب. لا يمكن التراجع عن هذا الإجراء بسهولة.",
            onConfirm: async () => {
                setCriticalModal(prev => ({ ...prev, isOpen: false }));
                const toastId = toast.loading("جاري معالجة البيانات (قد يستغرق وقتاً)...");

                try {
                    // 1. Archive Events
                    const eventsRef = collection(db, 'events');
                    // Fetch ALL events first (safer than compound queries without index)
                    const eventsSnap = await getDocs(eventsRef);
                    const eventsToArchive = eventsSnap.docs.filter(d => d.data().status !== 'archived');

                    // 2. Reset Students
                    const studentsRef = collection(db, 'students');
                    const studentsSnap = await getDocs(studentsRef);

                    // 3. Prepare Batch Ops
                    const allOps = [];

                    // Event Ops
                    eventsToArchive.forEach(docSnap => {
                        allOps.push({ type: 'update', ref: doc(db, 'events', docSnap.id), data: { status: 'archived', archiveLabel } });
                    });

                    // Student Ops
                    studentsSnap.docs.forEach(docSnap => {
                        const currentData = docSnap.data();
                        // Store history
                        const history = currentData.history || {};
                        history[archiveLabel] = currentData.totalPoints || 0;

                        allOps.push({
                            type: 'update',
                            ref: doc(db, 'students', docSnap.id),
                            data: { totalPoints: 0, history }
                        });
                    });

                    // Execute Batches (Chunk 400 for safety)
                    const CHUNK_SIZE = 400;
                    for (let i = 0; i < allOps.length; i += CHUNK_SIZE) {
                        const chunk = allOps.slice(i, i + CHUNK_SIZE);
                        const batch = writeBatch(db);

                        chunk.forEach(op => {
                            if (op.type === 'update') batch.update(op.ref, op.data);
                        });

                        await batch.commit();
                        // Update toast 
                        toast.loading(`تمت معالجة ${Math.min(i + CHUNK_SIZE, allOps.length)} من ${allOps.length}...`, { id: toastId });
                    }

                    toast.success("تم بدء العام الجديد بنجاح!", { id: toastId });
                    setArchiveLabel('');

                } catch (e) {
                    console.error(e);
                    toast.error("حدث خطأ أثناء المعالجة: " + e.message, { id: toastId });
                }
            }
        });
    };

    if (!settings) return <div className="text-white p-10 text-center">جاري التحميل...</div>;

    return (
        <div className="font-cairo h-full flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">مركز التحكم (The Brain)</h1>
                    <p className="text-gray-400 text-sm">إدارة هيكلية النظام والبيانات الأساسية</p>
                </div>
                <div className="flex bg-white/10 p-1 rounded-xl backdrop-blur-md">
                    {[
                        { id: 'general', label: 'عام', icon: School },
                        { id: 'classes', label: 'الصفوف والشعب', icon: Box },
                        { id: 'time', label: 'التوقيت', icon: Clock },
                        { id: 'schemas', label: 'هيكلة الأنشطة', icon: List },
                        { id: 'security', label: 'الأمان', icon: Shield },
                        { id: 'data', label: 'إدارة البيانات', icon: AlertTriangle },
                        { id: 'notifications', label: 'الإشعارات', icon: Bell },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg flex items-center space-x-2 space-x-reverse transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            <tab.icon size={16} />
                            <span className="hidden md:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* --- TAB CONTENT --- */}

            {/* SECURITY PROMPT MODAL */}
            {securityPrompt.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
                    <div className="bg-[#1e1e24] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6">
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Shield size={24} className="text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white">تحقق أمني مطلوب</h3>
                            <p className="text-gray-400 text-sm mt-1">الرجاء إدخال كلمة المرور الحالية للمتابعة</p>
                        </div>

                        <form onSubmit={handleSecurityVerify}>
                            <input
                                type="password"
                                autoFocus
                                required
                                value={securityPwd}
                                onChange={(e) => setSecurityPwd(e.target.value)}
                                placeholder="كلمة المرور الحالية"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none mb-6 text-center tracking-widest"
                            />

                            <div className="flex gap-3">
                                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-bold transition-colors">
                                    تحقق ومتابعة
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSecurityPrompt({ ...securityPrompt, isOpen: false }); setSecurityPwd(''); }}
                                    className="px-4 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl transition-colors"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 1. GENERAL INFO */}
            {activeTab === 'general' && (
                <div className="space-y-6 max-w-2xl mx-auto w-full">
                    {/* School Info Block */}
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-2xl shadow-xl animate-fade-in">
                        <h2 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">معلومات المدرسة</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 mb-1">اسم المدرسة</label>
                                <input
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white"
                                    value={infoForm.name}
                                    onChange={e => setInfoForm({ ...infoForm, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-gray-400 mb-1">بداية الفصل</label>
                                    <input type="date" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white"
                                        value={infoForm.termStart} onChange={e => setInfoForm({ ...infoForm, termStart: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-gray-400 mb-1">نهاية الفصل</label>
                                    <input type="date" className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white"
                                        value={infoForm.termEnd} onChange={e => setInfoForm({ ...infoForm, termEnd: e.target.value })} />
                                </div>
                            </div>
                            <button onClick={handleSaveInfo} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold mt-4">
                                <Save className="inline ml-2" size={18} /> حفظ التغييرات
                            </button>
                        </div>
                    </div>

                    {/* TestSprite Zone (New) */}
                    <div className="bg-red-900/10 border border-red-500/20 rounded-2xl p-6 relative overflow-hidden group hover:border-red-500/40 transition-colors animate-fade-in mb-6">
                        <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-red-500 to-orange-500"></div>
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Shield className="text-red-400" />
                            منطقة الاختبار (TestSprite Zone)
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                                    <h4 className="text-orange-300 font-bold mb-2 flex items-center gap-2">
                                        <Key size={16} /> بيانات حساب الاختبار
                                    </h4>
                                    <div className="text-sm space-y-1 font-mono text-gray-300" dir="ltr">
                                        <div>Email: <span className="text-white">test_bot@school.com</span></div>
                                        <div>Pass:  <span className="text-white">TestBot123!</span></div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2 font-cairo">
                                        * ملاحظة: استخدم البادئة <span className="text-yellow-400 font-bold">[TEST]</span> في بداية أي اسم لضمان حذفه لاحقاً.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 justify-center">
                                <button
                                    onClick={handleCreateTestAccount}
                                    className="w-full py-3 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus size={18} />
                                    إنشاء حساب الاختبار
                                </button>

                                <button
                                    onClick={handlePurgeTestData}
                                    className="w-full py-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    تنظيف بيانات الاختبار (Purge)
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Holidays & Weekends Block */}
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-2xl shadow-xl animate-fade-in relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
                        <h2 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4 flex items-center">
                            <Calendar className="ml-2 text-rose-400" /> إدارة العطلات والدوام
                        </h2>

                        {/* 1. Weekend Selector */}
                        <div className="mb-8">
                            <label className="block text-gray-400 mb-3 text-sm font-bold">أيام العطلة الأسبوعية (الإجازة المتكررة)</label>
                            <div className="flex flex-wrap gap-2">
                                {['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => toggleWeekend(idx)}
                                        className={`px-4 py-2 rounded-lg border transition-all ${selectedWeekends.includes(idx)
                                            ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold'
                                            : 'bg-black/20 border-white/5 text-gray-500 hover:bg-white/5'}`}
                                    >
                                        {day}
                                        {selectedWeekends.includes(idx) && <CheckCircle size={14} className="inline mr-2" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 2. Official Holidays */}
                        <div>
                            <label className="block text-gray-400 mb-3 text-sm font-bold">قائمة العطلات الرسمية</label>

                            {/* Add Form */}
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="date"
                                    className="bg-black/30 border border-white/10 rounded-xl px-3 text-white focus:border-rose-500 outline-none"
                                    value={newHoliday.date}
                                    onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                />
                                <input
                                    type="text"
                                    placeholder="سبب الإجازة (مثال: يوم التأسيس)"
                                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 text-white focus:border-rose-500 outline-none"
                                    value={newHoliday.reason}
                                    onChange={e => setNewHoliday({ ...newHoliday, reason: e.target.value })}
                                />
                                <button onClick={addHoliday} className="bg-rose-600 hover:bg-rose-500 text-white p-3 rounded-xl">
                                    <Plus size={20} />
                                </button>
                            </div>

                            {/* List */}
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                {holidaysList.length === 0 && <p className="text-gray-500 text-sm text-center py-2">لا يوجد عطلات مضافة</p>}
                                {holidaysList.map((h, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                        <div className="flex items-center">
                                            <div className="w-2 h-2 rounded-full bg-rose-500 ml-3"></div>
                                            <span className="text-rose-200 font-mono ml-3 font-bold">{h.date}</span>
                                            <span className="text-gray-300 text-sm">{h.reason}</span>
                                        </div>
                                        <button onClick={() => removeHoliday(h.id)} className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/10">
                            <button onClick={handleSaveHolidays} className="w-full bg-rose-600 hover:bg-rose-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-rose-900/20">
                                <Save className="inline ml-2" size={18} /> حفظ إعدادات العطلات
                            </button>
                        </div>
                    </div>


                </div>
            )}



            {/* --- 4. Notifications Tab --- */}
            {activeTab === 'notifications' && (
                <div className="space-y-8 max-w-4xl mx-auto w-full animate-fade-in">
                    {/* Permission Section */}
                    <div className="flex items-center justify-between bg-black/20 p-6 rounded-xl border border-white/5 backdrop-blur-md">
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">إذن الإشعارات</h3>
                            <p className="text-gray-400 text-sm">
                                حالة الإذن الحالية:
                                <span className={`mx-2 font-bold ${notifPermission === 'granted' ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {notifPermission === 'granted' ? 'مفعل' : notifPermission === 'denied' ? 'مرفوض' : 'غير محدد'}
                                </span>
                            </p>
                        </div>
                        <button
                            onClick={requestNotifPermission}
                            disabled={notifPermission === 'granted'}
                            className={`px-6 py-3 rounded-xl flex items-center gap-2 transition-all ${notifPermission === 'granted'
                                ? 'bg-emerald-500/10 text-emerald-400 cursor-default border border-emerald-500/20'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'
                                }`}
                        >
                            {notifPermission === 'granted' ? <CheckCircle size={20} /> : <Bell size={20} />}
                            {notifPermission === 'granted' ? 'تم التفعيل' : 'تفعيل الإشعارات'}
                        </button>
                    </div>

                    {/* Defaults Section */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 backdrop-blur-md shadow-xl">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Clock size={20} className="text-indigo-400" />
                            التذكيرات الافتراضية
                        </h3>
                        <p className="text-gray-400 text-sm mb-6">ستضاف هذه التذكيرات تلقائياً عند إنشاء أي نشاط جديد، ويمكنك تعديلها لكل نشاط على حدة.</p>

                        <div className="space-y-3 mb-6">
                            {defaultReminders.map((rem, idx) => (
                                <div key={idx} className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                                    <div className="text-gray-400 text-sm">تنبيه قبل:</div>
                                    <input
                                        type="number"
                                        value={rem.value}
                                        onChange={(e) => updateDefaultReminder(idx, 'value', parseInt(e.target.value))}
                                        className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white w-20 text-center focus:border-indigo-500 outline-none"
                                    />
                                    <select
                                        value={rem.type}
                                        onChange={(e) => updateDefaultReminder(idx, 'type', e.target.value)}
                                        className="bg-black/30 border border-white/10 rounded-lg px-3 py-1 text-white focus:border-indigo-500 outline-none"
                                    >
                                        <option value="minutes">دقيقة</option>
                                        <option value="hours">ساعة</option>
                                        <option value="days">يوم</option>
                                    </select>
                                    <button onClick={() => removeDefaultReminder(idx)} className="text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-colors">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {defaultReminders.length === 0 && <div className="text-gray-500 text-sm italic text-center py-4 border border-dashed border-white/10 rounded-xl">لا يوجد تذكيرات افتراضية</div>}
                        </div>

                        <button onClick={addDefaultReminder} className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-2 font-bold mb-8">
                            <Plus size={18} /> إضافة تذكير افتراضي
                        </button>

                        <div className="pt-6 border-t border-white/10 flex justify-end">
                            <button
                                onClick={handleSaveNotifications}
                                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition-all"
                            >
                                <Save size={20} /> حفظ الإعدادات
                            </button>
                        </div>
                    </div>
                </div>


            )}

            {/* 2. TIME PROFILE BUILDER */}
            {activeTab === 'time' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px] animate-fade-in">
                    {/* Left: List */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white">الملفات الزمنية</h3>
                            <button onClick={handleCreateProfile} className="bg-emerald-600 p-2 rounded-lg text-white hover:bg-emerald-500"><Plus size={16} /></button>
                        </div>
                        <div className="space-y-2">
                            {profilesList.map(p => (
                                <div
                                    key={p.id}
                                    onClick={() => handleSelectProfile(p)}
                                    className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedProfileId === p.id ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    {p.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Editor */}
                    <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto">
                        {editingProfile ? (
                            <div className="space-y-6">
                                <div className="flex justify-between items-end">
                                    <div className="flex-1 ml-4">
                                        <label className="block text-gray-400 text-sm mb-1">اسم الملف (مثال: توقيت رمضان)</label>
                                        <input
                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-lg focus:border-indigo-500 outline-none"
                                            value={editingProfile.name}
                                            onChange={e => setEditingProfile({ ...editingProfile, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex space-x-2 space-x-reverse">
                                        {settings?.activeProfileId === editingProfile.id ? (
                                            <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-4 py-3 rounded-xl font-bold flex items-center">
                                                <CheckCircle size={18} className="ml-2" /> نشط حالياً
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => switchProfile(editingProfile.id)}
                                                disabled={!editingProfile.id} // Disable if new/unsaved
                                                className="bg-gray-700 text-white px-4 py-3 rounded-xl font-bold hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={!editingProfile.id ? 'يجب حفظ الملف أولاً' : 'اعتماد هذا الجدول للنظام'}
                                            >
                                                اعتماد كجدول رسمي
                                            </button>
                                        )}

                                        <button onClick={handleSaveProfile} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 shadow-lg">
                                            <Save size={18} className="ml-2 inline" /> حفظ
                                        </button>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-white font-bold">الحصص والفترات</h4>
                                        <button onClick={handleAddSlot} className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center"><Plus size={14} className="ml-1" /> إضافة فترة</button>
                                    </div>

                                    <div className="space-y-2">
                                        {editingProfile.slots.map((slot, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-black/20 p-2 rounded-lg border border-white/5">
                                                <div className="col-span-4">
                                                    <input className="w-full bg-transparent text-white text-sm px-2 focus:bg-black/40 rounded transition-colors"
                                                        value={slot.label} onChange={e => handleSlotChange(idx, 'label', e.target.value)} placeholder="الاسم" />
                                                </div>
                                                <div className="col-span-3">
                                                    <input type="time" className="w-full bg-transparent text-gray-300 text-sm px-1 focus:text-white"
                                                        value={slot.start} onChange={e => handleSlotChange(idx, 'start', e.target.value)} />
                                                </div>
                                                <div className="col-span-3">
                                                    <input type="time" className="w-full bg-transparent text-gray-300 text-sm px-1 focus:text-white"
                                                        value={slot.end} onChange={e => handleSlotChange(idx, 'end', e.target.value)} />
                                                </div>
                                                <div className="col-span-2 flex justify-end">
                                                    <button onClick={() => handleRemoveSlot(idx)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                        {editingProfile.slots.length === 0 && <p className="text-center text-gray-500 py-4">لا يوجد فترات مضافة</p>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">اختر ملفاً للتعديل أو أنشئ جديداً</div>
                        )}
                    </div>
                </div>
            )}

            {/* 3. SCHEMA BUILDER */}
            {activeTab === 'schemas' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px] animate-fade-in">
                    {/* Left: List */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-white">أنواع الأنشطة</h3>
                            <button onClick={handleCreateType} className="bg-purple-600 p-2 rounded-lg text-white hover:bg-purple-500"><Plus size={16} /></button>
                        </div>
                        <div className="space-y-2">
                            {localTypes.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => handleSelectType(t)}
                                    className={`p-3 rounded-xl cursor-pointer transition-all border ${selectedTypeId === t.id ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    {t.name}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Editor */}
                    <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto">
                        {editingType ? (
                            <div className="space-y-6">
                                <div className="flex justify-between items-end">
                                    <div className="flex-1 ml-4">
                                        <label className="block text-gray-400 text-sm mb-1">اسم الفئة (مثال: دوري كرة قدم)</label>
                                        <input
                                            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-lg focus:border-purple-500 outline-none"
                                            value={editingType.name}
                                            onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                                        />
                                    </div>
                                    <button onClick={handleSaveSchema} className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-500 shadow-lg">
                                        تحديث الهيكل
                                    </button>
                                </div>

                                <div className="border-t border-white/10 pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-white font-bold">الحقول المخصصة (Custom Fields)</h4>
                                        <button onClick={handleAddField} className="text-purple-400 hover:text-purple-300 text-sm flex items-center"><Plus size={14} className="ml-1" /> إضافة حقل</button>
                                    </div>
                                    <p className="text-gray-500 text-xs mb-4">هذه الحقول ستظهر في نافذة "إضافة نشاط" عند اختيار هذا النوع.</p>

                                    <div className="space-y-3">
                                        {editingType.fields.map((field, idx) => (
                                            <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/5 mb-2">
                                                <div className="flex space-x-3 space-x-reverse items-end">
                                                    <div className="flex-1">
                                                        <label className="text-xs text-gray-500 block mb-1">اسم الحقل</label>
                                                        <input className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white text-sm"
                                                            value={field.label} onChange={e => handleFieldChange(idx, 'label', e.target.value)} />
                                                    </div>
                                                    <div className="w-32">
                                                        <label className="text-xs text-gray-500 block mb-1">نوع البيانات</label>
                                                        <select className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-white text-sm"
                                                            value={field.type} onChange={e => handleFieldChange(idx, 'type', e.target.value)}>
                                                            <option value="text">نص</option>
                                                            <option value="number">رقم</option>
                                                            <option value="select">قائمة</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <button onClick={() => {
                                                            const newF = [...editingType.fields];
                                                            newF.splice(idx, 1);
                                                            setEditingType({ ...editingType, fields: newF });
                                                        }} className="text-red-400 hover:text-red-300 p-2"><Trash2 size={18} /></button>
                                                    </div>
                                                </div>

                                                {field.type === 'select' && (
                                                    <div className="mt-3 animate-fade-in">
                                                        <label className="text-xs text-gray-400 block mb-1 font-bold">الخيارات (كل خيار في سطر منفصل)</label>
                                                        <textarea
                                                            dir="auto"
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm min-h-[100px] focus:border-purple-500 outline-none resize-y placeholder-gray-600"
                                                            placeholder={"مثال:\nحكم\nمنظم\nمسعف"}
                                                            value={Array.isArray(field.options) ? field.options.join('\n') : (field.options || '')}
                                                            onChange={e => handleFieldChange(idx, 'options', e.target.value)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {editingType.fields.length === 0 && <p className="text-center text-gray-500 py-4">لا يوجد حقول مخصصة</p>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-500">اختر فئة للتعديل أو أنشئ جديدة</div>
                        )}
                    </div>
                </div>
            )}

            {/* 4. SECURITY (Unchanged Visuals, same logic) */}
            {activeTab === 'security' && (
                <div className="max-w-2xl mx-auto w-full space-y-6 animate-fade-in">
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-2xl shadow-xl">
                        <h2 className="text-xl font-bold text-white flex items-center mb-6"><Key className="ml-3 text-emerald-400" /> إدارة كلمة المرور</h2>
                        <form onSubmit={handlePassChange} className="space-y-4">
                            <input type="password" required className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white" placeholder="كلمة المرور الحالية" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} />
                            <div className="flex space-x-2 space-x-reverse">
                                <input type="text" required className="flex-1 bg-black/30 border border-white/10 rounded-xl p-3 text-white" placeholder="الجديدة" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                                <button type="button" onClick={() => { const p = Math.random().toString(36).slice(-10); setNewPwd(p); setConfirmPwd(p); }} className="px-4 bg-white/10 rounded-xl text-white"><RefreshCw /></button>
                            </div>
                            <input type="text" required className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white" placeholder="تأكيد الجديدة" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold">تحديث</button>
                        </form>
                    </div>
                    <div className="bg-red-900/10 backdrop-blur-md border border-red-500/30 p-8 rounded-2xl shadow-xl">
                        <h2 className="text-xl font-bold text-red-200 flex items-center mb-4"><Shield className="ml-3 text-red-400" /> مفتاح الطوارئ</h2>
                        {generatedKey ? <div className="bg-black/50 p-4 rounded-xl text-center font-mono text-2xl text-red-400 border border-red-500/50">{generatedKey}</div> :
                            <button onClick={generateRecoveryKey} className="bg-red-600 text-white px-6 py-2 rounded-xl">توليد مفتاح</button>}
                    </div>
                </div>
            )}

            {/* 5. CLASSES BUILDER */}
            {activeTab === 'classes' && <ClassesManager />}

            {/* 6. DATA MANAGEMENT (DANGER ZONE) */}
            {activeTab === 'data' && (
                <div className="max-w-2xl mx-auto w-full space-y-6 animate-fade-in">
                    <div className="bg-red-900/10 backdrop-blur-md border border-red-500/30 p-8 rounded-2xl shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none"></div>

                        <h2 className="text-xl font-bold text-red-200 flex items-center mb-6 border-b border-red-500/20 pb-4">
                            <AlertTriangle className="ml-3 text-red-400" /> إدارة نهاية العام (End of Year)
                        </h2>

                        <p className="text-gray-400 mb-6 leading-relaxed bg-black/20 p-4 rounded-xl border border-red-500/10">
                            هذه المنطقة مخصصة للإجراءات الحساسة. استخدم هذا القسم عند انتهاء العام الدراسي لبدء عام جديد.
                            <br /><br />
                            <span className="text-red-300 font-bold block mb-1">ماذا سيحدث عند البدء؟</span>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                                <li>سيتم أرشفة جميع الأنشطة الحالية تحت الاسم الذي تختاره.</li>
                                <li>سيتم تصفير نقاط جميع الطلاب (مع حفظ النقاط السابقة في السجل).</li>
                                <li>لن يتم حذف ملفات الطلاب أو الحسابات.</li>
                            </ul>
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-red-300/80 mb-2 font-bold text-sm">تسمية الأرشيف (مطلوب)</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/30 border border-red-500/30 rounded-xl p-3 text-white placeholder-gray-600 focus:border-red-500 outline-none transition-colors"
                                    placeholder="مثال: العام الدراسي 1445-1446"
                                    value={archiveLabel}
                                    onChange={e => setArchiveLabel(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={handleStartNewYear}
                                disabled={!archiveLabel}
                                className="w-full bg-gradient-to-r from-red-700 to-rose-800 hover:from-red-600 hover:to-rose-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-red-900/30 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            >
                                <AlertTriangle className="group-hover:rotate-12 transition-transform" />
                                أرشفة وبدء عام جديد
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                isDestructive={confirmModal.isDestructive}
            />

            <CriticalActionModal
                isOpen={criticalModal.isOpen}
                onClose={() => setCriticalModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={criticalModal.onConfirm}
                title={criticalModal.title}
                message={criticalModal.message}
                verificationText="تأكيد"
            />
        </div>
    );
}

// Sub-Component for Classes & Sections Helper
function ClassesManager() {
    const { grades, updateGrades } = useSettings();
    const [localGrades, setLocalGrades] = useState([]);
    const [editingGrade, setEditingGrade] = useState({ id: null, name: '', sections: [] });
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        if (grades) setLocalGrades(grades);
    }, [grades]);

    const handleSaveGrade = async () => {
        if (!editingGrade.name) return toast.error("اسم الصف مطلوب");

        let newGrades = [...localGrades];
        if (editingGrade.id) {
            // Update existing
            const index = newGrades.findIndex(g => g.id === editingGrade.id);
            if (index > -1) newGrades[index] = editingGrade;
        } else {
            // Create new
            const newG = { ...editingGrade, id: Date.now().toString() };
            newGrades.push(newG);
            setEditingGrade(newG); // Keep editing it to add sections
        }

        try {
            await updateGrades(newGrades);
            toast.success("تم حفظ الصف الدراسية");
            setLocalGrades(newGrades);
            if (!editingGrade.id) setIsEditing(true); // Switch to edit mode after create
        } catch (e) {
            toast.error("فشل الحفظ");
        }
    };

    const handleDeleteGrade = async (gradeId) => {
        if (!window.confirm("هل أنت متأكد من حذف هذا الصف؟ سيتم حذف جميع الشعب بداخله.")) return;
        const newGrades = localGrades.filter(g => g.id !== gradeId);
        try {
            await updateGrades(newGrades);
            setLocalGrades(newGrades);
            if (editingGrade.id === gradeId) {
                setEditingGrade({ id: null, name: '', sections: [] });
                setIsEditing(false);
            }
            toast.success("تم حذف الصف");
        } catch (e) {
            toast.error("فشل الحذف");
        }
    };

    const handleAddSection = async () => {
        const sectionName = prompt("أدخل اسم الشعبة (مثال: أ، ب، 1، 2)");
        if (!sectionName) return;

        // Check if exists
        if (editingGrade.sections.some(s => s.name === sectionName)) return toast.error("الشعبة موجودة بالفعل");

        const newSection = { id: Date.now().toString(), name: sectionName };
        const updatedGrade = {
            ...editingGrade,
            sections: [...editingGrade.sections, newSection]
        };

        setEditingGrade(updatedGrade);

        // Save immediately as requested
        let newGrades = [...localGrades];
        const index = newGrades.findIndex(g => g.id === editingGrade.id);
        if (index > -1) {
            newGrades[index] = updatedGrade;
            try {
                await updateGrades(newGrades);
                toast.success("تم إضافة الشعبة");
            } catch (e) {
                toast.error("فشل الحفظ");
            }
        }
    };

    const handleDeleteSection = async (sectionId) => {
        if (!window.confirm("حذف الشعبة؟")) return;
        const updatedSections = editingGrade.sections.filter(s => s.id !== sectionId);
        const updatedGrade = { ...editingGrade, sections: updatedSections };

        setEditingGrade(updatedGrade);

        // Save immediately
        let newGrades = [...localGrades];
        const index = newGrades.findIndex(g => g.id === editingGrade.id);
        if (index > -1) {
            newGrades[index] = updatedGrade;
            await updateGrades(newGrades);
            toast.success("تم حذف الشعبة");
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px] animate-fade-in">
            {/* Left: List */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white">الصفوف الدراسية</h3>
                    <button
                        onClick={() => {
                            setEditingGrade({ id: null, name: '', sections: [] });
                            setIsEditing(true);
                        }}
                        className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500"
                    >
                        <Plus size={16} />
                    </button>
                </div>
                <div className="space-y-2">
                    {localGrades.map(g => (
                        <div
                            key={g.id}
                            onClick={() => {
                                setEditingGrade(g);
                                setIsEditing(true);
                            }}
                            className={`p-3 rounded-xl cursor-pointer transition-all border flex justify-between items-center ${editingGrade.id === g.id ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                        >
                            <span>{g.name}</span>
                            <span className="text-xs bg-white/10 px-2 py-1 rounded-full">{g.sections?.length || 0} شعب</span>
                        </div>
                    ))}
                    {localGrades.length === 0 && <p className="text-center text-gray-500 text-sm py-4">لا يوجد صفوف مضافة</p>}
                </div>
            </div>

            {/* Right: Editor */}
            <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto">
                {isEditing ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end border-b border-white/10 pb-4">
                            <div className="flex-1 ml-4">
                                <label className="block text-gray-400 text-sm mb-1">اسم الصف (مثال: الصف الأول الثانوي)</label>
                                <input
                                    type="text"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-lg focus:border-indigo-500 outline-none"
                                    value={editingGrade.name}
                                    onChange={e => setEditingGrade({ ...editingGrade, name: e.target.value })}
                                />
                            </div>
                            <div className="flex space-x-2 space-x-reverse">
                                {editingGrade.id && (
                                    <button
                                        onClick={() => handleDeleteGrade(editingGrade.id)}
                                        className="bg-red-500/20 text-red-400 border border-red-500/50 px-3 py-3 rounded-xl hover:bg-red-500/30"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                                <button onClick={handleSaveGrade} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-500 shadow-lg">
                                    <Save size={18} className="ml-2 inline" /> حفظ
                                </button>
                            </div>
                        </div>

                        {editingGrade.id ? (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-white font-bold flex items-center"><Box className="ml-2 text-indigo-400" size={18} /> الشعب الدراسية</h4>
                                    <button onClick={handleAddSection} className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center font-bold px-3 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20 transition-all hover:bg-emerald-500/20">
                                        <Plus size={14} className="ml-1" /> إضافة شعبة
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {editingGrade.sections?.map(section => (
                                        <div key={section.id} className="group relative bg-black/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center hover:border-indigo-500 transition-colors">
                                            <span className="text-2xl font-bold text-white mb-1">{section.name}</span>
                                            <span className="text-xs text-gray-500">شعبة</span>

                                            <button
                                                onClick={() => handleDeleteSection(section.id)}
                                                className="absolute top-1 right-1 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!editingGrade.sections || editingGrade.sections.length === 0) && (
                                        <div className="col-span-full text-center py-8 text-gray-500 border border-dashed border-white/10 rounded-xl">
                                            لا يوجد شعب مضافة لهذا الصف
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-amber-400/80 bg-amber-500/10 p-4 rounded-xl text-center text-sm border border-amber-500/20">
                                يرجى حفظ اسم الصف أولاً لإضافة الشعب
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                        <Box size={48} className="text-gray-700 mb-2" />
                        <p>اختر صفاً للتعديل أو أنشئ صفاً جديداً</p>
                    </div>
                )}
            </div>
        </div>
    );
}



















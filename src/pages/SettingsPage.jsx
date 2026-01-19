import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
    Save, Shield, Key, AlertTriangle, RefreshCw, Clock,
    Settings, Plus, Trash2, List, Calendar, School, Edit3, CheckCircle, Box
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
    const {
        settings, activeProfile, switchProfile,
        updateEventTypes, eventTypes,
        saveTimeProfile, updateSchoolInfo, schoolInfo,
        updateHolidaysAndWeekends, weekends, holidays
    } = useSettings();

    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('general'); // general | time | schemas | security

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
        // Find index in localTypes
        let newLocalTypes = [...localTypes];
        const existingIndex = newLocalTypes.findIndex(t => t.id === editingType.id);

        if (existingIndex >= 0) {
            newLocalTypes[existingIndex] = editingType;
        } else {
            newLocalTypes.push(editingType);
        }

        setLocalTypes(newLocalTypes);
        try {
            await updateEventTypes(newLocalTypes);
            toast.success("تم تحديث هيكل الأنشطة");
        } catch (e) {
            toast.error("فشل الحفظ");
        }
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
        if (!confirm("توليد مفتاح جديد؟")) return;
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let key = "";
        for (let i = 0; i < 20; i++) { if (i > 0 && i % 4 === 0) key += "-"; key += chars.charAt(Math.floor(Math.random() * chars.length)); }
        await setDoc(doc(db, "settings", "global"), { recoveryKeyHash: key }, { merge: true });
        setGeneratedKey(key);
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
                                            <div key={idx} className="flex space-x-3 space-x-reverse items-center bg-black/20 p-3 rounded-xl border border-white/5">
                                                <div className="flex-1">
                                                    <label className="text-xs text-gray-500 block mb-1">اسم الحقل</label>
                                                    <input className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-sm"
                                                        value={field.label} onChange={e => handleFieldChange(idx, 'label', e.target.value)} />
                                                </div>
                                                <div className="w-32">
                                                    <label className="text-xs text-gray-500 block mb-1">نوع البيانات</label>
                                                    <select className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-sm"
                                                        value={field.type} onChange={e => handleFieldChange(idx, 'type', e.target.value)}>
                                                        <option value="text">نص</option>
                                                        <option value="number">رقم</option>
                                                        <option value="select">قائمة</option>
                                                    </select>
                                                </div>
                                                <div className="pt-5">
                                                    <button onClick={() => {
                                                        const newF = [...editingType.fields];
                                                        newF.splice(idx, 1);
                                                        setEditingType({ ...editingType, fields: newF });
                                                    }} className="text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                                                </div>
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
        </div>
    );
}

// Sub-Component for Cleanliness
function ClassesManager() {
    const { classes, updateClasses } = useSettings();
    const [localClasses, setLocalClasses] = useState([]);
    const [editingGrade, setEditingGrade] = useState(null); // { id, name, sections: [] }
    const [newSection, setNewSection] = useState('');

    useEffect(() => {
        setLocalClasses(classes || []);
    }, [classes]);

    const handleSaveAll = async () => {
        try {
            await updateClasses(localClasses);
            toast.success("تم تحديث هيكلة الصفوف");
        } catch (e) { toast.error("فشل الحفظ"); }
    };

    const addGrade = () => {
        const newG = { id: Date.now(), name: 'صف جديد', sections: [] };
        setLocalClasses([...localClasses, newG]);
        setEditingGrade(newG);
    };

    const removeGrade = (id) => {
        if (!confirm("حذف هذا الصف؟")) return;
        setLocalClasses(localClasses.filter(c => c.id !== id));
        if (editingGrade?.id === id) setEditingGrade(null);
    };

    const updateGradeName = (val) => {
        if (!editingGrade) return;
        const updated = { ...editingGrade, name: val };
        setEditingGrade(updated);
        setLocalClasses(localClasses.map(c => c.id === editingGrade.id ? updated : c));
    };

    const addSection = () => {
        if (!newSection || !editingGrade) return;
        if (editingGrade.sections.includes(newSection)) return toast.error("الشعبة موجودة مسبقاً");
        const updated = { ...editingGrade, sections: [...editingGrade.sections, newSection] };
        setEditingGrade(updated);
        setLocalClasses(localClasses.map(c => c.id === editingGrade.id ? updated : c));
        setNewSection('');
    };

    const removeSection = (sec) => {
        if (!editingGrade) return;
        const updated = { ...editingGrade, sections: editingGrade.sections.filter(s => s !== sec) };
        setEditingGrade(updated);
        setLocalClasses(localClasses.map(c => c.id === editingGrade.id ? updated : c));
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px] animate-fade-in text-right">
            {/* List */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white">الصفوف الدراسية</h3>
                    <button onClick={addGrade} className="bg-indigo-600 p-2 rounded-lg text-white hover:bg-indigo-500"><Plus size={16} /></button>
                </div>
                <div className="space-y-2">
                    {localClasses.map(c => (
                        <div
                            key={c.id}
                            onClick={() => setEditingGrade(c)}
                            className={`p-3 rounded-xl cursor-pointer transition-all border flex justify-between items-center ${editingGrade?.id === c.id ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-black/20 border-white/5 text-gray-400 hover:bg-white/10'}`}
                        >
                            <span>{c.name}</span>
                            <span className="text-xs bg-black/40 px-2 py-1 rounded text-gray-500">{c.sections?.length || 0} شعب</span>
                        </div>
                    ))}
                </div>
                <div className="mt-6 pt-4 border-t border-white/10">
                    <button onClick={handleSaveAll} className="w-full bg-emerald-600 text-white py-2 rounded-xl font-bold shadow-lg">حفظ التغييرات</button>
                </div>
            </div>

            {/* Editor */}
            <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-6 overflow-y-auto">
                {editingGrade ? (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-gray-400 text-sm mb-1">اسم المرحلة / الصف</label>
                            <div className="flex gap-2">
                                <input
                                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white font-bold text-lg focus:border-indigo-500 outline-none"
                                    value={editingGrade.name}
                                    onChange={e => updateGradeName(e.target.value)}
                                />
                                <button onClick={() => removeGrade(editingGrade.id)} className="bg-red-500/10 text-red-400 px-4 rounded-xl hover:bg-red-500/20"><Trash2 size={20} /></button>
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4">
                            <h4 className="text-white font-bold mb-4">الشعب الدراسية (Sections)</h4>

                            <div className="flex gap-2 mb-4">
                                <input
                                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-white focus:border-indigo-500 outline-none"
                                    placeholder="اسم الشعبة (مثال: 1/2، أ، Group A)"
                                    value={newSection}
                                    onChange={e => setNewSection(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addSection()}
                                />
                                <button onClick={addSection} className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-500"><Plus size={20} /></button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {editingGrade.sections?.map((sec, idx) => (
                                    <span key={idx} className="bg-indigo-900/40 text-indigo-200 border border-indigo-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                        {sec}
                                        <button onClick={() => removeSection(sec)} className="hover:text-white"><X size={14} /></button>
                                    </span>
                                ))}
                                {(!editingGrade.sections || editingGrade.sections.length === 0) && <span className="text-gray-500 text-sm">لا يوجد شعب مضافة</span>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">اختر صفاً للتعديل</div>
                )}
            </div>
        </div>
    );
}


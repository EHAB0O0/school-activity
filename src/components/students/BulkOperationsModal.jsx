import { useState } from 'react';
import { 
    X, 
    ArrowRightLeft, 
    Tag, 
    Award, 
    UserCheck, 
    AlertCircle, 
    Check, 
    Sparkles, 
    GraduationCap,
    SlidersHorizontal,
    Plus,
    Minus
} from 'lucide-react';
import MultiSelect from '../ui/MultiSelect';

export default function BulkOperationsModal({
    isOpen,
    onClose,
    initialTab = 'transfer',
    selectedStudents = [],
    grades = [],
    eventTypes = [],
    onApplyTransfer,
    onApplySpecialization,
    onApplyPoints,
    onApplyStatus,
    isProcessing = false
}) {
    const [activeTab, setActiveTab] = useState(initialTab);

    // Form states
    // 1. Transfer
    const [targetGrade, setTargetGrade] = useState(grades?.[0]?.name || '');
    const [targetSection, setTargetSection] = useState('');

    // 2. Specialization
    const [selectedSpecs, setSelectedSpecs] = useState([]);
    const [specMode, setSpecMode] = useState('append'); // 'append' | 'replace'

    // 3. Points
    const [pointsDelta, setPointsDelta] = useState(10);
    const [pointsType, setPointsType] = useState('add'); // 'add' | 'deduct'
    const [pointsReason, setPointsReason] = useState('');

    // 4. Status
    const [targetStatus, setTargetStatus] = useState('active'); // 'active' | 'graduated' | 'suspended'

    if (!isOpen) return null;

    const availableSections = grades?.find(g => g.name === targetGrade)?.sections || [];

    const specOptions = [
        { value: 'General', label: 'عام / جوكر' },
        ...(eventTypes || []).map(t => ({ value: t.name, label: t.name }))
    ];

    function handleSubmit(e) {
        e.preventDefault();
        if (activeTab === 'transfer') {
            if (!targetGrade || !targetSection) return;
            onApplyTransfer({ targetGrade, targetSection });
        } else if (activeTab === 'specialization') {
            if (selectedSpecs.length === 0) return;
            onApplySpecialization({ specializations: selectedSpecs, mode: specMode });
        } else if (activeTab === 'points') {
            const finalPoints = pointsType === 'add' ? Math.abs(Number(pointsDelta)) : -Math.abs(Number(pointsDelta));
            onApplyPoints({ points: finalPoints, reason: pointsReason.trim() });
        } else if (activeTab === 'status') {
            onApplyStatus({ status: targetStatus });
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <div 
                className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 text-right"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                            <SlidersHorizontal size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">إجراءات جماعية متقدمة</h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                سيتم تطبيق الإجراء على <span className="text-indigo-400 font-bold">{selectedStudents.length}</span> طلاب محددين
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        aria-label="إغلاق النافذة"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex items-center border-b border-white/10 bg-black/20 p-1 gap-1">
                    <button
                        onClick={() => setActiveTab('transfer')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'transfer' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <ArrowRightLeft size={14} />
                        <span>نقل الصف</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('specialization')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'specialization' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Tag size={14} />
                        <span>التخصصات</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('points')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'points' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Award size={14} />
                        <span>نقاط التميز</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('status')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeTab === 'status' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <UserCheck size={14} />
                        <span>الحالة</span>
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-5">

                    {/* TAB 1: Transfer Grade / Section */}
                    {activeTab === 'transfer' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2.5 text-indigo-300 text-xs leading-relaxed">
                                <GraduationCap size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    سيتم نقل الطلاب المحددين مباشرة إلى الصف والشعبة المختارة، وتحديث حقول الفصل وقاعدة البيانات تلقائياً.
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-1.5">الصف الدراسي المستهدف:</label>
                                    <select
                                        value={targetGrade}
                                        onChange={e => { setTargetGrade(e.target.value); setTargetSection(''); }}
                                        required
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500"
                                    >
                                        <option value="" disabled>اختر الصف...</option>
                                        {grades?.map(g => (
                                            <option key={g.id || g.name} value={g.name}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-1.5">الشعبة المستهدفة:</label>
                                    <select
                                        value={targetSection}
                                        onChange={e => setTargetSection(e.target.value)}
                                        required
                                        disabled={!targetGrade}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
                                    >
                                        <option value="">اختر الشعبة...</option>
                                        {availableSections?.map(s => (
                                            <option key={s.id || s.name} value={s.name}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {targetGrade && targetSection && (
                                <div className="text-xs text-gray-400 bg-white/5 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                                    <span>الاسم المدمج الجديد للفصل:</span>
                                    <span className="font-bold text-white bg-indigo-600/30 px-2 py-0.5 rounded border border-indigo-500/30">
                                        {targetGrade} - {targetSection}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: Specializations */}
                    {activeTab === 'specialization' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-2.5 text-indigo-300 text-xs leading-relaxed">
                                <Sparkles size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    يمكنك إسناد تخصصات نشاط جماعية للطلاب وتحديد ما إذا كنت ترغب بإضافتها لتخصصاتهم الحالية أو استبدالها بالكامل.
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">التخصصات والأنشطة:</label>
                                <MultiSelect
                                    options={specOptions}
                                    selectedValues={selectedSpecs}
                                    onChange={setSelectedSpecs}
                                    placeholder="اختر تخصصاً واحداً أو أكثر..."
                                />
                            </div>

                            <div className="space-y-2 pt-2 border-t border-white/10">
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">طريقة تطبيق التخصص:</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${specMode === 'append' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                                        <input
                                            type="radio"
                                            name="specMode"
                                            value="append"
                                            checked={specMode === 'append'}
                                            onChange={() => setSpecMode('append')}
                                            className="mt-1 accent-indigo-500"
                                        />
                                        <div>
                                            <div className="text-xs font-bold">إضافة للتخصصات الحالية</div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">يحافظ على تصنيفات الطالب السابقة ويضيف الجديد إليها.</div>
                                        </div>
                                    </label>

                                    <label className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${specMode === 'replace' ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                                        <input
                                            type="radio"
                                            name="specMode"
                                            value="replace"
                                            checked={specMode === 'replace'}
                                            onChange={() => setSpecMode('replace')}
                                            className="mt-1 accent-indigo-500"
                                        />
                                        <div>
                                            <div className="text-xs font-bold">استبدال التخصصات السابقة</div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">يمسح التصنيفات القديمة ويستبدلها بالاختيار الجديد فقط.</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Points */}
                    {activeTab === 'points' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-300 text-xs leading-relaxed">
                                <Award size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    منح أو خصم نقاط تميز لكافة الطلاب المحددين لتكريمهم أو توثيق مشاركتهم في فعالية معينة.
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPointsType('add')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${pointsType === 'add' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                                >
                                    <Plus size={15} />
                                    <span>منح نقاط إضافية (+)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPointsType('deduct')}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${pointsType === 'deduct' ? 'bg-rose-600/20 border-rose-500 text-rose-300' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                                >
                                    <Minus size={15} />
                                    <span>خصم نقاط (-)</span>
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">عدد النقاط:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="500"
                                    value={pointsDelta}
                                    onChange={e => setPointsDelta(Math.max(1, parseInt(e.target.value) || 1))}
                                    required
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white font-bold text-base outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">سبب المنح / الملاحظة (اختياري):</label>
                                <input
                                    type="text"
                                    placeholder="مثال: المشاركة المتميزة في حفل اليوم الوطني..."
                                    value={pointsReason}
                                    onChange={e => setPointsReason(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* TAB 4: Status */}
                    {activeTab === 'status' && (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2.5 text-blue-300 text-xs leading-relaxed">
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <div>
                                    تعديل حالة السجل الأكاديمي للطلاب المحددين دفعة واحدة.
                                </div>
                            </div>

                            <div className="space-y-2">
                                {[
                                    { id: 'active', title: 'نشط ومستمر بالدراسة', desc: 'يظهر في جميع قوائم الأنشطة والمشاركات المدرسية.' },
                                    { id: 'graduated', title: 'خريج', desc: 'تم إتمام المرحلة الدراسية بنجاح.' },
                                    { id: 'suspended', title: 'معلق / منقطع مؤقتاً', desc: 'إيقاف مؤقت للمشاركات مع بقاء بياناته محفوظة.' }
                                ].map(st => (
                                    <label
                                        key={st.id}
                                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${targetStatus === st.id ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="studentStatus"
                                            value={st.id}
                                            checked={targetStatus === st.id}
                                            onChange={() => setTargetStatus(st.id)}
                                            className="mt-1 accent-indigo-500"
                                        />
                                        <div>
                                            <div className="text-xs font-bold">{st.title}</div>
                                            <div className="text-[11px] text-gray-400 mt-0.5">{st.desc}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isProcessing}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                            إلغاء
                        </button>

                        <button
                            type="submit"
                            disabled={isProcessing || (activeTab === 'specialization' && selectedSpecs.length === 0)}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
                        >
                            {isProcessing ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <Check size={16} />
                            )}
                            <span>تطبيق على {selectedStudents.length} طلاب</span>
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

import { useState, useEffect } from 'react';
import { 
    Printer, 
    X, 
    Check, 
    Sliders, 
    Palette, 
    FileText, 
    Columns, 
    RotateCcw, 
    CheckSquare, 
    Square, 
    Sparkles, 
    Layers, 
    HelpCircle,
    FileSpreadsheet,
    Eye
} from 'lucide-react';

/**
 * Universal Advanced Print Modal
 * Gives complete freedom over printing:
 * - Dynamic columns visibility
 * - 3 Themes: Classic White, Monochrome Toner-Saver, Modern Dark Mode
 * - Page Orientation (Portrait / Landscape)
 * - Layout Density (Standard / Compact)
 * - Print Scope (All Records vs Selected Records)
 * - Toggles for Header, Signatures, KPI Cards, Signature Column
 * - Custom Title, Custom Footer Notes, Custom Signatures Names
 * - Persistent preferences stored in localStorage
 */
export default function AdvancedPrintModal({
    isOpen,
    onClose,
    title = 'خيارات الطباعة المتقدمة',
    reportType = 'general',
    availableColumns = [],
    totalRecordsCount = 0,
    selectedRecordsCount = 0,
    hasSelectionSupport = true,
    initialCustomTitle = '',
    initialSignatures = [
        { role: 'المعد / المسؤول', name: '________________' },
        { role: 'رائد النشاط الطلابي', name: 'أ. ________________' },
        { role: 'مدير المدرسة', name: 'أ. ________________' }
    ],
    sortOptions = [],
    extraToggles = [],
    onPrint
}) {
    const storageKey = `school_activity_print_prefs_${reportType}`;

    // Available Themes
    const themes = [
        {
            id: 'classic',
            name: 'أبيض رسمي كلاسيكي',
            badge: 'المعيار الإداري',
            description: 'ورقة بيضاء نقية مع خطوط كحلية رسمية، مثالي للمعاملات الحكومية والمحفوظات.',
            bgClass: 'bg-white',
            borderClass: 'border-slate-300',
            textClass: 'text-slate-900',
            accentClass: 'bg-indigo-600 text-white'
        },
        {
            id: 'monochrome',
            name: 'اقتصادي موفر للحبر',
            badge: 'توفير الحبر 100%',
            description: 'أبيض وأسود صريح 100% بدون أي تظليلات رمادية، يضاعف سرعة الطباعة وعمر الحبارة.',
            bgClass: 'bg-white',
            borderClass: 'border-black',
            textClass: 'text-black',
            accentClass: 'bg-black text-white'
        },
        {
            id: 'dark',
            name: 'أسود ليلي فخم',
            badge: 'مخصص للمشاركة الرقمية',
            description: 'تصميم داكن فاخر مع لمسات سماوية براقة، مثالي للحفظ كـ PDF والعرض على الشاشات.',
            bgClass: 'bg-[#090d16]',
            borderClass: 'border-sky-500/40',
            textClass: 'text-slate-100',
            accentClass: 'bg-sky-500 text-slate-950 font-bold'
        }
    ];

    // State
    const [selectedColumns, setSelectedColumns] = useState([]);
    const [theme, setTheme] = useState('classic');
    const [orientation, setOrientation] = useState('portrait');
    const [density, setDensity] = useState('standard');
    const [scope, setScope] = useState('all'); // 'all' | 'selected'
    const [showHeader, setShowHeader] = useState(true);
    const [showKpis, setShowKpis] = useState(true);
    const [showSignatures, setShowSignatures] = useState(true);
    const [showSignatureCol, setShowSignatureCol] = useState(false);
    const [customTitle, setCustomTitle] = useState('');
    const [footerNote, setFooterNote] = useState('');
    const [signatures, setSignatures] = useState(initialSignatures);
    const [activeTab, setActiveTab] = useState('layout'); // 'layout' | 'columns' | 'signatures'
    const [sortBy, setSortBy] = useState('');
    const [extraToggleValues, setExtraToggleValues] = useState({});

    // Load Saved Preferences on Mount / Open
    useEffect(() => {
        if (!isOpen) return;

        // Default all columns that have defaultVisible !== false
        const defaultColIds = availableColumns
            .filter(c => c.defaultVisible !== false)
            .map(c => c.id);

        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
                    // Only keep columns that currently exist
                    const validCols = parsed.columns.filter(id => availableColumns.some(c => c.id === id));
                    setSelectedColumns(validCols.length > 0 ? validCols : defaultColIds);
                } else {
                    setSelectedColumns(defaultColIds);
                }

                if (parsed.theme && ['classic', 'monochrome', 'dark'].includes(parsed.theme)) {
                    setTheme(parsed.theme);
                }
                if (parsed.orientation && ['portrait', 'landscape'].includes(parsed.orientation)) {
                    setOrientation(parsed.orientation);
                }
                if (parsed.density && ['standard', 'compact'].includes(parsed.density)) {
                    setDensity(parsed.density);
                }
                if (typeof parsed.showHeader === 'boolean') setShowHeader(parsed.showHeader);
                if (typeof parsed.showKpis === 'boolean') setShowKpis(parsed.showKpis);
                if (typeof parsed.showSignatures === 'boolean') setShowSignatures(parsed.showSignatures);
                if (typeof parsed.showSignatureCol === 'boolean') setShowSignatureCol(parsed.showSignatureCol);
                if (typeof parsed.footerNote === 'string') setFooterNote(parsed.footerNote);
                if (Array.isArray(parsed.signatures) && parsed.signatures.length > 0) {
                    setSignatures(parsed.signatures);
                }
            } else {
                setSelectedColumns(defaultColIds);
                setTheme('classic');
                setOrientation('portrait');
                setDensity('standard');
                setShowHeader(true);
                setShowKpis(true);
                setShowSignatures(true);
                setShowSignatureCol(false);
                setFooterNote('');
                setSignatures(initialSignatures);
            }
        } catch (e) {
            console.warn("Failed to load print preferences from localStorage", e);
            setSelectedColumns(defaultColIds);
        }

        // Initialize scope
        if (hasSelectionSupport && selectedRecordsCount > 0) {
            setScope('selected');
        } else {
            setScope('all');
        }

        setCustomTitle(initialCustomTitle || '');

        // Sorting & extra toggles defaults + saved values
        let savedPrefs = {};
        try { savedPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { savedPrefs = {}; }
        const validSort = sortOptions.some(o => o.id === savedPrefs.sortBy) ? savedPrefs.sortBy : (sortOptions[0]?.id || '');
        setSortBy(validSort);
        const toggleDefaults = {};
        extraToggles.forEach(t => {
            const sv = savedPrefs.extraToggles?.[t.id];
            toggleDefaults[t.id] = typeof sv === 'boolean' ? sv : t.defaultValue !== false;
        });
        setExtraToggleValues(toggleDefaults);
    }, [isOpen, reportKeyEffectDependency(availableColumns), storageKey, hasSelectionSupport, selectedRecordsCount, initialCustomTitle]);

    function reportKeyEffectDependency(cols) {
        return cols.map(c => c.id).join(',');
    }

    // Save preferences
    const saveCurrentPreferences = (overrides = {}) => {
        try {
            const prefs = {
                columns: overrides.columns || selectedColumns,
                theme: overrides.theme || theme,
                orientation: overrides.orientation || orientation,
                density: overrides.density || density,
                showHeader: overrides.showHeader !== undefined ? overrides.showHeader : showHeader,
                showKpis: overrides.showKpis !== undefined ? overrides.showKpis : showKpis,
                showSignatures: overrides.showSignatures !== undefined ? overrides.showSignatures : showSignatures,
                showSignatureCol: overrides.showSignatureCol !== undefined ? overrides.showSignatureCol : showSignatureCol,
                footerNote: overrides.footerNote !== undefined ? overrides.footerNote : footerNote,
                signatures: overrides.signatures || signatures,
                sortBy: overrides.sortBy || sortBy,
                extraToggles: overrides.extraToggles || extraToggleValues
            };
            localStorage.setItem(storageKey, JSON.stringify(prefs));
        } catch (e) {
            console.warn("Failed to save print preferences", e);
        }
    };

    // Handlers
    const toggleColumn = (colId) => {
        const next = selectedColumns.includes(colId)
            ? selectedColumns.filter(id => id !== colId)
            : [...selectedColumns, colId];
        
        // Prevent deselecting all columns
        if (next.length === 0) return;
        setSelectedColumns(next);
        saveCurrentPreferences({ columns: next });
    };

    const handleSelectAllColumns = () => {
        const all = availableColumns.map(c => c.id);
        setSelectedColumns(all);
        saveCurrentPreferences({ columns: all });
    };

    const handleResetColumns = () => {
        const defaultColIds = availableColumns
            .filter(c => c.defaultVisible !== false)
            .map(c => c.id);
        setSelectedColumns(defaultColIds);
        saveCurrentPreferences({ columns: defaultColIds });
    };

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
        saveCurrentPreferences({ theme: newTheme });
    };

    const handleOrientationChange = (newOri) => {
        setOrientation(newOri);
        saveCurrentPreferences({ orientation: newOri });
    };

    const handleDensityChange = (newDen) => {
        setDensity(newDen);
        saveCurrentPreferences({ density: newDen });
    };

    const handleResetDefaults = () => {
        try {
            localStorage.removeItem(storageKey);
        } catch {}
        const defaultColIds = availableColumns
            .filter(c => c.defaultVisible !== false)
            .map(c => c.id);
        setSelectedColumns(defaultColIds);
        setTheme('classic');
        setOrientation('portrait');
        setDensity('standard');
        setScope('all');
        setShowHeader(true);
        setShowKpis(true);
        setShowSignatures(true);
        setShowSignatureCol(false);
        setCustomTitle(initialCustomTitle || '');
        setFooterNote('');
        setSignatures(initialSignatures);
        setSortBy(sortOptions[0]?.id || '');
        const toggleDefaults = {};
        extraToggles.forEach(t => {
            toggleDefaults[t.id] = t.defaultValue !== false;
        });
        setExtraToggleValues(toggleDefaults);
    };

    const handleSignatureChange = (index, field, value) => {
        const next = [...signatures];
        next[index] = { ...next[index], [field]: value };
        setSignatures(next);
        saveCurrentPreferences({ signatures: next });
    };

    const handleExecutePrint = () => {
        saveCurrentPreferences();
        onPrint({
            columns: selectedColumns,
            theme,
            orientation,
            density,
            scope: hasSelectionSupport ? scope : 'all',
            showHeader,
            showKpis,
            showSignatures,
            showSignatureCol,
            signatures,
            customTitle: customTitle.trim(),
            footerNote: footerNote.trim(),
            sortBy,
            extraToggles: extraToggleValues
        });
        onClose();
    };

    if (!isOpen) return null;

    const printCount = (hasSelectionSupport && scope === 'selected') ? selectedRecordsCount : totalRecordsCount;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fade-in font-cairo" dir="rtl">
            <div className="bg-[#181a20] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
                            <Printer size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span>{title}</span>
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                                    {printCount} سجل سيتم طباعته
                                </span>
                            </h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                تخصيص كامل للأعمدة، الألوان، كثافة الطباعة، والتوقيعات
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-all"
                        aria-label="إغلاق النافذة"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-white/10 bg-black/20 px-4 pt-2 shrink-0 gap-2">
                    <button
                        onClick={() => setActiveTab('layout')}
                        className={`pb-2.5 px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
                            activeTab === 'layout'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <Palette size={16} />
                        الثيم والتخطيط
                    </button>
                    {availableColumns.length > 0 && (
                        <button
                            onClick={() => setActiveTab('columns')}
                            className={`pb-2.5 px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
                                activeTab === 'columns'
                                    ? 'border-indigo-500 text-indigo-400'
                                    : 'border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            <Columns size={16} />
                            تحديد الأعمدة ({selectedColumns.length}/{availableColumns.length})
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('signatures')}
                        className={`pb-2.5 px-4 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
                            activeTab === 'signatures'
                                ? 'border-indigo-500 text-indigo-400'
                                : 'border-transparent text-gray-400 hover:text-gray-200'
                        }`}
                    >
                        <FileText size={16} />
                        العناوين والتوقيعات
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                    {/* TAB 1: LAYOUT & THEME */}
                    {activeTab === 'layout' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* 1. Theme Selection */}
                            <div>
                                <label className="block text-sm font-bold text-white mb-2.5 flex items-center gap-2">
                                    <Palette size={16} className="text-indigo-400" />
                                    نمط ولون وثيقة الطباعة:
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {themes.map(t => {
                                        const isSelected = theme === t.id;
                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() => handleThemeChange(t.id)}
                                                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between relative ${
                                                    isSelected
                                                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                                                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.08]'
                                                }`}
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-2.5 left-2.5 w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                                                        <Check size={12} strokeWidth={3} />
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className={`w-6 h-6 rounded-md border ${t.borderClass} ${t.bgClass} flex items-center justify-center shadow-inner`}>
                                                            <div className={`w-3 h-1.5 rounded-sm ${t.accentClass}`}></div>
                                                        </div>
                                                        <span className="font-bold text-white text-xs sm:text-sm">{t.name}</span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-400 leading-relaxed">
                                                        {t.description}
                                                    </p>
                                                </div>
                                                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between">
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-medium">
                                                        {t.badge}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Scope & Density */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                                {/* Scope */}
                                {hasSelectionSupport && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-300 mb-2">
                                            نطاق السجلات المراد طباعتها:
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setScope('all')}
                                                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                    scope === 'all'
                                                        ? 'bg-indigo-600 text-white shadow'
                                                        : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                كل السجلات ({totalRecordsCount})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => selectedRecordsCount > 0 && setScope('selected')}
                                                disabled={selectedRecordsCount === 0}
                                                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                    scope === 'selected'
                                                        ? 'bg-indigo-600 text-white shadow'
                                                        : selectedRecordsCount === 0
                                                        ? 'opacity-40 cursor-not-allowed text-gray-500'
                                                        : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                المحددة فقط ({selectedRecordsCount})
                                            </button>
                                        </div>
                                        {selectedRecordsCount === 0 && (
                                            <p className="text-[10px] text-gray-500 mt-1">
                                                * لم يتم تحديد أي عناصر بواسطة مربعات الاختيار في الجدول
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Page Orientation */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-2">
                                        اتجاه ورقة الطباعة (A4):
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => handleOrientationChange('portrait')}
                                            className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                orientation === 'portrait'
                                                    ? 'bg-indigo-600 text-white shadow'
                                                    : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            <span>📄 طولي (Portrait)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleOrientationChange('landscape')}
                                            className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                orientation === 'landscape'
                                                    ? 'bg-indigo-600 text-white shadow'
                                                    : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            <span>📃 أفقي / عريض (Landscape)</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Density & Additional Toggles */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                                {/* Density */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-2">
                                        كثافة وتنسيق الجدول:
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => handleDensityChange('standard')}
                                            className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                density === 'standard'
                                                    ? 'bg-indigo-600 text-white shadow'
                                                    : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            قياسي (مريح)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDensityChange('compact')}
                                            className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                                                density === 'compact'
                                                    ? 'bg-indigo-600 text-white shadow'
                                                    : 'text-gray-400 hover:text-white'
                                            }`}
                                        >
                                            مضغوط (بيانات أكثر)
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        {density === 'compact' ? 'يقلل الحشو والخطوط لاستيعاب جداول عريضة وصفحات أقل.' : 'مسافات وهوامش مريحة للقراءة الورقية.'}
                                    </p>
                                </div>

                                {/* Section Toggles */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-300 mb-2">
                                        أقسام الوثيقة:
                                    </label>
                                    <div className="space-y-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                                            <input
                                                type="checkbox"
                                                checked={showHeader}
                                                onChange={e => {
                                                    setShowHeader(e.target.checked);
                                                    saveCurrentPreferences({ showHeader: e.target.checked });
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-white/10 border-white/20"
                                            />
                                            <span>الترويسة الوزارية الرسمية (3 أعمدة)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                                            <input
                                                type="checkbox"
                                                checked={showKpis}
                                                onChange={e => {
                                                    setShowKpis(e.target.checked);
                                                    saveCurrentPreferences({ showKpis: e.target.checked });
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-white/10 border-white/20"
                                            />
                                            <span>بطاقات الإحصائيات والأرقام (KPIs)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                                            <input
                                                type="checkbox"
                                                checked={showSignatureCol}
                                                onChange={e => {
                                                    setShowSignatureCol(e.target.checked);
                                                    saveCurrentPreferences({ showSignatureCol: e.target.checked });
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-white/10 border-white/20"
                                            />
                                            <span>إضافة عمود للتوقيع / الحضور اليدوي بالجدول</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                                            <input
                                                type="checkbox"
                                                checked={showSignatures}
                                                onChange={e => {
                                                    setShowSignatures(e.target.checked);
                                                    saveCurrentPreferences({ showSignatures: e.target.checked });
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-white/10 border-white/20"
                                            />
                                            <span>ذيل التوقيعات والاعتماد الرسمي</span>
                                        </label>
                                        {extraToggles.map(t => (
                                            <label key={t.id} className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 hover:text-white">
                                                <input
                                                    type="checkbox"
                                                    checked={!!extraToggleValues[t.id]}
                                                    onChange={e => {
                                                        const next = { ...extraToggleValues, [t.id]: e.target.checked };
                                                        setExtraToggleValues(next);
                                                        saveCurrentPreferences({ extraToggles: next });
                                                    }}
                                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-white/10 border-white/20"
                                                />
                                                <span>{t.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 4. Student Sorting */}
                            {sortOptions.length > 0 && (
                                <div className="pt-2 border-t border-white/10">
                                    <label className="block text-xs font-bold text-gray-300 mb-2">
                                        ترتيب الطلاب في التقرير:
                                    </label>
                                    <div className={`grid gap-2 bg-black/40 p-1 rounded-xl border border-white/10 text-xs`} style={{ gridTemplateColumns: `repeat(${sortOptions.length}, minmax(0, 1fr))` }}>
                                        {sortOptions.map(opt => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => { setSortBy(opt.id); saveCurrentPreferences({ sortBy: opt.id }); }}
                                                className={`py-2 px-3 rounded-lg font-bold transition-all ${sortBy === opt.id ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {sortOptions.find(o => o.id === sortBy)?.hint && (
                                        <p className="text-[10px] text-gray-400 mt-1">{sortOptions.find(o => o.id === sortBy).hint}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: COLUMNS SELECTION */}
                    {activeTab === 'columns' && availableColumns.length > 0 && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-xs font-bold text-white block">
                                        اختر الأعمدة المراد تضمينها في تقرير الطباعة:
                                    </span>
                                    <span className="text-[11px] text-gray-400">
                                        تم اختيار ({selectedColumns.length}) من أصل ({availableColumns.length}) عمود
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSelectAllColumns}
                                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-300 hover:text-white text-xs font-bold transition-colors"
                                    >
                                        تحديد الكل
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetColumns}
                                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold transition-colors"
                                    >
                                        الافتراضي
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                {availableColumns.map(col => {
                                    const isSelected = selectedColumns.includes(col.id);
                                    return (
                                        <div
                                            key={col.id}
                                            onClick={() => toggleColumn(col.id)}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                                isSelected
                                                    ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                                                    : 'border-white/5 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                                                    isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-500 bg-white/5'
                                                }`}>
                                                    {isSelected && <Check size={11} strokeWidth={3} />}
                                                </div>
                                                <span className="text-xs font-bold">{col.label}</span>
                                            </div>
                                            {col.badge && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300">
                                                    {col.badge}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {selectedColumns.length === 0 && (
                                <p className="text-xs text-rose-400 font-bold text-center p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                                    يجب تحديد عمود واحد على الأقل للطباعة!
                                </p>
                            )}
                        </div>
                    )}

                    {/* TAB 3: TITLES & SIGNATURES */}
                    {activeTab === 'signatures' && (
                        <div className="space-y-5 animate-fade-in">
                            {/* Custom Title Override */}
                            <div>
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                                    تخصيص عنوان الوثيقة (اختياري):
                                </label>
                                <input
                                    type="text"
                                    placeholder="اتركه فارغاً للاعتماد على العنوان التلقائي..."
                                    value={customTitle}
                                    onChange={e => setCustomTitle(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            {/* Footer Notes */}
                            <div>
                                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                                    ملاحظات تذييل الصفحة / إخلاء مسؤولية (تظهر أسفل التقرير):
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="مثال: هذا الكشف معتمد رسمياً لأغراض التوثيق الإداري والنشاط الطلابي..."
                                    value={footerNote}
                                    onChange={e => {
                                        setFooterNote(e.target.value);
                                        saveCurrentPreferences({ footerNote: e.target.value });
                                    }}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                                />
                            </div>

                            {/* Signatures List */}
                            <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between mb-3">
                                    <label className="text-xs font-bold text-gray-300">
                                        أسماء وصفات الموقعين في أسفل التقرير:
                                    </label>
                                    <span className="text-[11px] text-gray-500">
                                        يمكنك تعديل المسميات والأسماء بحرية
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {signatures.map((sig, idx) => (
                                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/30 p-2.5 rounded-xl border border-white/5">
                                            <div>
                                                <span className="text-[10px] text-gray-400 block mb-1">الصفة / المنصب:</span>
                                                <input
                                                    type="text"
                                                    value={sig.role}
                                                    onChange={e => handleSignatureChange(idx, 'role', e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-gray-400 block mb-1">الاسم:</span>
                                                <input
                                                    type="text"
                                                    value={sig.name}
                                                    onChange={e => handleSignatureChange(idx, 'name', e.target.value)}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 sm:p-5 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleResetDefaults}
                        className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors"
                        title="استعادة الإعدادات الافتراضية للطباعة"
                    >
                        <RotateCcw size={14} />
                        استعادة الإعدادات الأصلية
                    </button>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-bold transition-all"
                        >
                            إلغاء
                        </button>
                        <button
                            type="button"
                            onClick={handleExecutePrint}
                            disabled={availableColumns.length > 0 && selectedColumns.length === 0}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Printer size={16} />
                            طباعة التقرير / معاينة PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

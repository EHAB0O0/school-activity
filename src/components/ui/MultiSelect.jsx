import { useState } from 'react';
import { ChevronLeft, Search, Check, X } from 'lucide-react';

const MultiSelect = ({ label, options, selectedValues, onChange, placeholder, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const toggleSelection = (value) => {
        const newSelection = selectedValues.includes(value)
            ? selectedValues.filter(v => v !== value)
            : [...selectedValues, value];
        onChange(newSelection);
    };

    return (
        <div className="relative">
            <label className="block text-sm text-gray-400 mb-1">{label}</label>
            <div
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white min-h-[46px] cursor-pointer flex flex-wrap gap-2 items-center hover:border-indigo-500/50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedValues.length === 0 && <span className="text-gray-500">{placeholder}</span>}
                {selectedValues.map(val => {
                    const opt = options.find(o => o.value === val);
                    return (
                        <span key={val} className="bg-indigo-600/40 text-indigo-200 px-2 py-0.5 rounded-lg text-xs flex items-center border border-indigo-500/30">
                            {opt?.label || val}
                            <button onClick={(e) => { e.stopPropagation(); toggleSelection(val); }} className="mr-1 hover:text-white"><X size={12} /></button>
                        </span>
                    )
                })}
                <div className="mr-auto"><ChevronLeft size={16} className={`text-gray-500 transition-transform ${isOpen ? '-rotate-90' : ''}`} /></div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-gray-900 border border-indigo-500/30 rounded-xl shadow-2xl max-h-60 overflow-hidden flex flex-col animate-fade-in">
                    <div className="p-2 border-b border-white/5">
                        <div className="flex items-center bg-black/40 rounded-lg px-2">
                            <Search size={14} className="text-gray-500" />
                            <input
                                className="w-full bg-transparent p-2 text-sm text-white focus:outline-none"
                                placeholder="بحث..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-1">
                        {filteredOptions.map(opt => (
                            <div
                                key={opt.value}
                                onClick={() => toggleSelection(opt.value)}
                                className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${selectedValues.includes(opt.value) ? 'bg-indigo-600/20 text-indigo-300' : 'hover:bg-white/5 text-gray-300'}`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ml-3 ${selectedValues.includes(opt.value) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600'}`}>
                                    {selectedValues.includes(opt.value) && <Check size={10} className="text-white" />}
                                </div>
                                <span>{opt.label}</span>
                            </div>
                        ))}
                        {filteredOptions.length === 0 && <div className="text-center text-gray-500 py-4 text-xs">لا يوجد نتائج</div>}
                    </div>
                </div>
            )}
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>}
        </div>
    );
};

export default MultiSelect;

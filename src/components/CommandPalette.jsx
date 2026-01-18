import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

export default function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [queryText, setQueryText] = useState('');
    const [results, setResults] = useState([]);
    const navigate = useNavigate();

    // Toggle on Cmd+K
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Search logic (Basic client-side filtering of limited fetch or specific collections)
    // For production: use Algolia/Meilisearch. Here: Simple query.
    useEffect(() => {
        if (!queryText.trim()) {
            setResults([]);
            return;
        }

        // Quick debounce
        const timeoutId = setTimeout(async () => {
            // Search students and assets (simplified)
            // Note: Full text search in Firestore is limited. Simple prefix match simulation (via startAt) or client filter.
            // We'll simplisticly fetch recent/all and filter for prototype.

            const r = [];
            // Add static navigation
            if ("students".includes(queryText.toLowerCase())) r.push({ type: 'nav', label: 'Go to Students', path: '/students' });
            if ("assets".includes(queryText.toLowerCase())) r.push({ type: 'nav', label: 'Go to Assets', path: '/assets' });
            if ("schedule".includes(queryText.toLowerCase())) r.push({ type: 'nav', label: 'Go to Scheduler', path: '/' });

            setResults(r);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [queryText]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-20">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center p-4 border-b">
                    <Search className="text-gray-400 mr-3" />
                    <input
                        autoFocus
                        className="flex-1 outline-none text-lg"
                        placeholder="Search or jump to... (Try 'students')"
                        value={queryText}
                        onChange={e => setQueryText(e.target.value)}
                    />
                    <button onClick={() => setIsOpen(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                </div>
                <div className="max-h-64 overflow-y-auto p-2">
                    {results.length === 0 && queryText && <p className="text-center text-gray-500 py-4">No results found.</p>}
                    {results.map((res, i) => (
                        <button
                            key={i}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded flex flex-col"
                            onClick={() => {
                                if (res.type === 'nav') navigate(res.path);
                                setIsOpen(false);
                            }}
                        >
                            <span className="font-medium text-gray-800">{res.label}</span>
                            <span className="text-xs text-gray-400 capitalize">{res.type}</span>
                        </button>
                    ))}
                </div>
                <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t flex justify-between">
                    <span>Search functionality limited in prototype</span>
                    <span>Esc to close</span>
                </div>
            </div>
        </div>
    );
}

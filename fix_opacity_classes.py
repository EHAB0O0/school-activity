
import re

file_path = 'src/components/Scheduler.jsx'

# Map of problematic classes to safe arbitrary values
replacements = {
    # White/Black Opacities
    'bg-white/5': 'bg-[rgba(255,255,255,0.05)]',
    'bg-white/10': 'bg-[rgba(255,255,255,0.1)]',
    'border-white/5': 'border-[rgba(255,255,255,0.05)]',
    'border-white/10': 'border-[rgba(255,255,255,0.1)]',
    'divide-white/5': 'divide-[rgba(255,255,255,0.05)]',
    'bg-black/20': 'bg-[rgba(0,0,0,0.2)]',
    'bg-black/30': 'bg-[rgba(0,0,0,0.3)]',
    'bg-black/40': 'bg-[rgba(0,0,0,0.4)]',
    'bg-black/50': 'bg-[rgba(0,0,0,0.5)]',
    'text-white/10': 'text-[rgba(255,255,255,0.1)]',
    'text-white/40': 'text-[rgba(255,255,255,0.4)]',
    
    # Hover States
    'hover:bg-white/5': 'hover:bg-[rgba(255,255,255,0.05)]',
    'hover:bg-white/10': 'hover:bg-[rgba(255,255,255,0.1)]',
    
    # Colored Opacities
    'bg-rose-900/5': 'bg-[rgba(136,19,55,0.05)]',
    'bg-rose-900/10': 'bg-[rgba(136,19,55,0.1)]',
    'bg-rose-900/20': 'bg-[rgba(136,19,55,0.2)]',
    'text-rose-400/70': 'text-[rgba(251,113,133,0.7)]',
    'border-rose-500/20': 'border-[rgba(244,63,94,0.2)]',
    'border-rose-500/30': 'border-[rgba(244,63,94,0.3)]',
    
    'bg-indigo-600/20': 'bg-[rgba(79,70,229,0.2)]',
    'bg-indigo-500/10': 'bg-[rgba(99,102,241,0.1)]',
    'bg-indigo-500/20': 'bg-[rgba(99,102,241,0.2)]',
    'border-indigo-500/20': 'border-[rgba(99,102,241,0.2)]',
    
    'bg-amber-500/20': 'bg-[rgba(245,158,11,0.2)]',
    'border-amber-500/30': 'border-[rgba(245,158,11,0.3)]',
    
    'bg-emerald-900/90': 'bg-[rgba(6,78,59,0.9)]',
    'bg-teal-900/90': 'bg-[rgba(19,78,74,0.9)]',
    'bg-indigo-900/90': 'bg-[rgba(49,46,129,0.9)]',
    'bg-purple-900/90': 'bg-[rgba(88,28,135,0.9)]',
    
    # Border Opacities often used in shadows
    'border-emerald-500/40': 'border-[rgba(16,185,129,0.4)]',
    'border-indigo-500/40': 'border-[rgba(99,102,241,0.4)]',
}

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    
    # Sort keys by length descending to replace longer matches first (avoid partial replacements)
    keys = sorted(replacements.keys(), key=len, reverse=True)
    
    count = 0
    for k in keys:
        if k in content:
            new_val = replacements[k]
            # Use simple string replace
            content = content.replace(k, new_val)
            count += 1
            print(f"Replaced {k} -> {new_val}")

    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Successfully replaced {count} types of opacity classes.")
    else:
        print("No matches found.")

except Exception as e:
    print(f"Error: {e}")

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../firebase';
import {
    doc, collection, addDoc, query, where, getDocs,
    onSnapshot, updateDoc, deleteDoc, serverTimestamp, increment
} from 'firebase/firestore';
import {
    Lock, CheckCircle, AlertCircle, Users, Plus, Trash2,
    Edit2, Save, Sparkles, Clock, AlertTriangle, ArrowRight, X,
    HelpCircle, RotateCcw, Clipboard, CheckCircle2, Zap,
    ChevronDown, ChevronUp, Copy, Check, Layers, Tag
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import AppLogo from '../components/ui/AppLogo';
import { useSettings } from '../contexts/SettingsContext';

const GROUP_COLOR_THEMES = [
    {
        badge: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
        pillActive: 'bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-600/30',
        pillInactive: 'bg-violet-950/40 text-violet-300 border-violet-700/50 hover:bg-violet-900/50',
        cardBorder: 'border-r-4 border-r-violet-500',
        headerBg: 'bg-gradient-to-l from-violet-950/70 via-violet-950/30 to-slate-900/60 border-violet-500/40 text-violet-200',
        dot: 'bg-violet-400'
    },
    {
        badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        pillActive: 'bg-cyan-600 text-white border-cyan-400 shadow-lg shadow-cyan-600/30',
        pillInactive: 'bg-cyan-950/40 text-cyan-300 border-cyan-700/50 hover:bg-cyan-900/50',
        cardBorder: 'border-r-4 border-r-cyan-500',
        headerBg: 'bg-gradient-to-l from-cyan-950/70 via-cyan-950/30 to-slate-900/60 border-cyan-500/40 text-cyan-200',
        dot: 'bg-cyan-400'
    },
    {
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        pillActive: 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-600/30',
        pillInactive: 'bg-amber-950/40 text-amber-300 border-amber-700/50 hover:bg-amber-900/50',
        cardBorder: 'border-r-4 border-r-amber-500',
        headerBg: 'bg-gradient-to-l from-amber-950/70 via-amber-950/30 to-slate-900/60 border-amber-500/40 text-amber-200',
        dot: 'bg-amber-400'
    },
    {
        badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        pillActive: 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30',
        pillInactive: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50',
        cardBorder: 'border-r-4 border-r-emerald-500',
        headerBg: 'bg-gradient-to-l from-emerald-950/70 via-emerald-950/30 to-slate-900/60 border-emerald-500/40 text-emerald-200',
        dot: 'bg-emerald-400'
    },
    {
        badge: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
        pillActive: 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-lg shadow-fuchsia-600/30',
        pillInactive: 'bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-700/50 hover:bg-fuchsia-900/50',
        cardBorder: 'border-r-4 border-r-fuchsia-500',
        headerBg: 'bg-gradient-to-l from-fuchsia-950/70 via-fuchsia-950/30 to-slate-900/60 border-fuchsia-500/40 text-fuchsia-200',
        dot: 'bg-fuchsia-400'
    },
    {
        badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        pillActive: 'bg-blue-600 text-white border-blue-400 shadow-lg shadow-blue-600/30',
        pillInactive: 'bg-blue-950/40 text-blue-300 border-blue-700/50 hover:bg-blue-900/50',
        cardBorder: 'border-r-4 border-r-blue-500',
        headerBg: 'bg-gradient-to-l from-blue-950/70 via-blue-950/30 to-slate-900/60 border-blue-500/40 text-blue-200',
        dot: 'bg-blue-400'
    }
];

// --- Pure Arabic Normalization & Smart Text Parsing Engine ---

const cleanBidiAndZeroWidth = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g, '')
        .replace(/\u00A0/g, ' ');
};

const toWesternDigits = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
};

const normalizeArabic = (str) => {
    if (!str) return '';
    return cleanBidiAndZeroWidth(str)
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\u0640/g, '')
        .replace(/\s+/g, ' ');
};

const normalizeGroupKey = (str) => {
    if (!str) return '';
    return toWesternDigits(normalizeArabic(String(str)))
        .replace(/([^\d\s])\s*(\d)/g, '$1 $2')
        .replace(/(\d)\s*([^\d\s])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeArabicForMatch = (str) => {
    if (!str) return '';
    let s = toWesternDigits(cleanBidiAndZeroWidth(str))
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // Tashkeel
        .replace(/[أإآٱ]/g, 'ا') // Alef forms
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[ؤئ]/g, 'ي')
        .replace(/\u0640/g, '') // Tatweel
        .replace(/وو+/g, 'و') // داوود -> داود
        .replace(/يي+/g, 'ي') // محيي -> محي
        .replace(/[\(\)\[\]{}.,،_+\-–—\\/|:;؛!?~*"'«»]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Merge compound Arabic name prefixes (must use (^|\s) because \b is ASCII-only)
    s = s
        .replace(/(^|\s)عبد\s+(?=\S)/g, '$1عبد')
        .replace(/(^|\s)(ابو|ابي|ابا)\s+(?=\S)/g, '$1ابو')
        .replace(/(^|\s)ال\s+(?=\S)/g, '$1ال')
        .replace(/(^|\s)ذو\s+(?=\S)/g, '$1ذو')
        .replace(/\s+/g, ' ')
        .trim();

    return s;
};

const STOP_NAME_CONNECTORS = new Set(['بن', 'ابن', 'ابنه', 'بنت', 'ولد', 'ال']);

const getComparableTokens = (normStr) => {
    if (!normStr) return [];
    return normStr
        .split(' ')
        .map(t => t.trim())
        .filter(t => t && !STOP_NAME_CONNECTORS.has(t));
};

const stripLeadingAl = (token) => {
    if (!token || token.length < 5) return token;
    if (token.startsWith('ال') && !token.startsWith('الله') && !token.startsWith('الاه')) {
        return token.slice(2);
    }
    return token;
};

const levenshteinDistance = (a, b) => {
    if (a === b) return 0;
    if (!a) return b ? b.length : 0;
    if (!b) return a.length;
    if (Math.abs(a.length - b.length) > 2) return 99;
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
};

const scoreTokenSimilarity = (t1, t2, allowFuzzy = true) => {
    if (!t1 || !t2) return 0;
    if (t1 === t2) return 1.0;
    // Trailing hamza drop (e.g. علاء <-> علا, براء <-> برا)
    const h1 = t1.replace(/ء$/, '');
    const h2 = t2.replace(/ء$/, '');
    if (h1 === h2 && h1.length >= 3) return 0.98;
    // Leading "ال" on family/tribal names (e.g. الزهراني <-> زهراني)
    const s1 = stripLeadingAl(h1);
    const s2 = stripLeadingAl(h2);
    if (s1 === s2 && s1.length >= 3) return 0.96;
    // Common prefix/abbreviation or 1-char OCR/typing typo on longer tokens
    if (allowFuzzy && s1.length >= 4 && s2.length >= 4) {
        const dist = levenshteinDistance(s1, s2);
        if (dist === 1) return 0.86;
    }
    return 0;
};

// Map Arabic section letters to section numbers
const SECTION_LETTER_TO_NUM = {
    'ا': '1', 'أ': '1', 'a': '1',
    'ب': '2', 'b': '2',
    'ج': '3', 'c': '3',
    'د': '4', 'd': '4',
    'ه': '5', 'هـ': '5', 'e': '5',
    'و': '6', 'f': '6',
    'ز': '7', 'ح': '8', 'ط': '9'
};

// Words that clearly indicate non-name noise, status, role, activity, or table headers
const NON_NAME_NOISE_WORDS = new Set([
    // Status & Attendance
    'حاضر', 'حضور', 'غائب', 'غياب', 'مشارك', 'مشاركه', 'مشترك', 'منسحب', 'معتذر', 'مستأذن', 'مستاذن',
    'معتمد', 'تم', 'مكتمل', 'مؤكد', 'احتياط', 'احتياطي', 'اساسي', 'مرشح', 'فائز', 'مجتاز', 'منتظم',
    'مستجد', 'منقول', 'معيد', 'نعم', 'لا', 'صح', 'خطا', 'موافق', 'مرفوض', 'انتظار', 'تحت', 'المراجعه',
    // Grades / Evaluations
    'ممتاز', 'جيد', 'جدا', 'مقبول', 'ضعيف', 'متفوق', 'متميز', 'متقن', 'اولى', 'ثانيه', 'ثالثه',
    'رابعه', 'خامسه', 'سادسه', 'ثانوي', 'الثانوي', 'متوسط', 'المتوسط', 'ابتدائي', 'الابتدائي',
    'علمي', 'ادبي', 'شرعي', 'عام', 'مسار', 'صحي', 'هندسه', 'حاسب', 'اداره', 'اعمال', 'شريعه',
    'مقررات', 'فصلي', 'فصل', 'الفصل', 'صف', 'الصف', 'شعبه', 'الشعبه', 'قاعه', 'القاعه', 'مجموعه', 'المجموعه',
    'دفعه', 'الدفعه', 'صفحه', 'الصفحه', 'ص', 'ش', 'ف', 'م', 'ت', 'ر', 'ج',
    // Roles & Activities
    'قائد', 'نائب', 'عضو', 'مفوض', 'منسق', 'مشرف', 'رائد', 'عريف', 'مسؤول', 'لجنه', 'اللجنه',
    'اذاعه', 'الاذاعه', 'مسابقه', 'المسابقه', 'نشاط', 'النشاط', 'الأنشطه', 'الانشطه', 'تطوع', 'تطوعي',
    'رياضي', 'الرياضي', 'ثقافي', 'الثقافي', 'الاجتماعي', 'اجتماعي', 'كشفي', 'كشافه', 'الكشافه', 'فني',
    'مسرح', 'النظام', 'الامتياز', 'رحله', 'زياره', 'مبادره', 'برنامج', 'دوره', 'ندوه', 'محاضره',
    'بطوله', 'دوري', 'فريق', 'فرقه', 'اعلامي', 'الاعلاميه', 'اعلاميه', 'تنظيم', 'استقبال',
    // Scores / Units / Table Metadata
    'نقطه', 'نقاط', 'درجه', 'درجات', 'ريال', 'ملاحظه', 'ملاحظات', 'التوقيع', 'توقيع', 'بدون',
    'يوجد', 'فراغ', 'الاسم', 'الطالب', 'الطلاب', 'اسم', 'طالب', 'المشارك', 'المشاركين', 'المشاركون',
    'كشف', 'قائمه', 'بيان', 'اسماء', 'الاسماء', 'المجموع', 'اجمالي', 'الاجمالي', 'العدد', 'التاريخ',
    'اليوم', 'المدرسه', 'مدرسه', 'اداره', 'تعليم', 'وزاره', 'المملكه', 'العربيه', 'السعوديه',
    'بسم', 'الله', 'الرحمن', 'الرحيم', 'مدير', 'وكيل', 'مرشد', 'المرشد', 'الاستاذ', 'استاذ',
    'معلم', 'المعلم', 'جوال', 'الجوال', 'هاتف', 'الهاتف', 'رقم', 'الهويه', 'السجل', 'المدني',
    'student', 'name', 'class', 'grade', 'section', 'phone', 'mobile', 'notes', 'status', 'yes', 'no', 'ok', 'page'
]);

// Detect grade level number (1..6) from a string WITHOUT confusing section digits with grade digits
const detectGradeLevelNumber = (str) => {
    if (!str) return null;
    const norm = toWesternDigits(normalizeArabic(str))
        .replace(/[\(\)\[\]{}.,،_+\-–—\\/|:;؛!?~*]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!norm) return null;

    // 1. Check explicit Arabic/English grade words in order of occurrence
    const tokens = norm.split(' ');
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1] || '';
        const prev = tokens[i - 1] || '';

        if (/^(اول|اولي|الاول|الاولي|1ث|ث1|1م|م1|first|1st|g10)$/.test(t) || (t === '1' && /^(ث|ثانوي|الثانوي|م|متوسط)$/.test(next)) || (t === '10' && prev === 'grade')) return 1;
        if (/^(ثاني|ثانيه|ثان|الثاني|الثانيه|2ث|ث2|2م|م2|second|2nd|g11)$/.test(t) || (t === '2' && /^(ث|ثانوي|الثانوي|م|متوسط)$/.test(next)) || (t === '11' && prev === 'grade')) return 2;
        if (/^(ثالث|ثالثه|الثالث|الثالثه|3ث|ث3|3م|م3|third|3rd|g12)$/.test(t) || (t === '3' && /^(ث|ثانوي|الثانوي|م|متوسط)$/.test(next)) || (t === '12' && prev === 'grade')) return 3;
        if (/^(رابع|رابعه|الرابع|الرابعه)$/.test(t)) return 4;
        if (/^(خامس|خامسه|الخامس|الخامسه)$/.test(t)) return 5;
        if (/^(سادس|سادسه|السادس|السادسه)$/.test(t)) return 6;
    }

    // 2. Check Noor 3-digit class code (e.g. 101, 203, 304)
    const noorMatch = norm.match(/\b([1-6])0([1-9])\b/);
    if (noorMatch) return Number(noorMatch[1]);

    // 3. Check slash/hyphen numeric class (e.g. 2/1, 3 - 2) from original string
    const rawWest = toWesternDigits(cleanBidiAndZeroWidth(str));
    const slashMatch = rawWest.match(/(?:^|\s|\(|\[|فصل|صف)\s*([1-6])\s*[\/\\\-–—]\s*([1-9]\d?)(?:\s|\)|\]|$)/);
    if (slashMatch) return Number(slashMatch[1]);

    return null;
};

// Extract Grade & Section from any class/hint string (never treats random words or page numbers as section)
const extractGradeAndSectionFromFragment = (fragment) => {
    if (!fragment) return { gradeLevel: null, section: null, isClassFragment: false };
    let raw = toWesternDigits(cleanBidiAndZeroWidth(fragment)).trim();
    if (!raw) return { gradeLevel: null, section: null, isClassFragment: false };

    const norm = normalizeArabic(raw);

    // Reject obvious page/group/points/phone fragments so "ص 1" or "10 نقاط" is NEVER treated as a class/section
    if (/^(ص|صفحه|الصفحه|مجموعه|المجموعه|دفعه|الدفعه|page|group)\s*\d+$/i.test(norm)) {
        return { gradeLevel: null, section: null, isClassFragment: false };
    }
    if (/^\d+\s*(نقطه|نقاط|درجه|درجات|ريال|طالب|طلاب)$/.test(norm)) {
        return { gradeLevel: null, section: null, isClassFragment: false };
    }
    if (/^(?:\+?966|00966|0)?5\d{8}$/.test(raw.replace(/[\s\-]/g, ''))) {
        return { gradeLevel: null, section: null, isClassFragment: false };
    }

    // 1. Noor 3-digit class code (e.g., 102 -> Grade 1, Sec 2; 204 -> Grade 2, Sec 4)
    const noorMatch = norm.match(/^(?:فصل|صف|شعبه|قاعه)?\s*([1-6])0([1-9])$/);
    if (noorMatch) {
        return { gradeLevel: Number(noorMatch[1]), section: noorMatch[2], isClassFragment: true };
    }

    // 2. Slash / hyphen numeric class (e.g., "2/1", "٢ / ٣", "فصل 3/2", "2 - 4")
    const slashMatch = raw.match(/^(?:فصل|الفصل|صف|الصف|شعبه|شعبة|class)?\s*([1-6])\s*(?:ث|م)?\s*[\/\\\-–—]\s*([1-9]\d?|[أابجدهو])\s*$/i);
    if (slashMatch) {
        let gNum = Number(slashMatch[1]);
        let secRaw = normalizeArabic(slashMatch[2]);
        let sec = SECTION_LETTER_TO_NUM[secRaw] || secRaw;
        return { gradeLevel: gNum, section: sec, isClassFragment: true };
    }

    // 3. Explicit Grade words + optional Section
    const ordinalMap = {
        'اول': 1, 'اولي': 1, 'الاول': 1, 'الاولي': 1, '1ث': 1, 'ث1': 1, '1م': 1, 'م1': 1, 'first': 1, '1st': 1, 'g10': 1,
        'ثاني': 2, 'ثانيه': 2, 'ثان': 2, 'الثاني': 2, 'الثانيه': 2, '2ث': 2, 'ث2': 2, '2م': 2, 'م2': 2, 'second': 2, '2nd': 2, 'g11': 2,
        'ثالث': 3, 'ثالثه': 3, 'الثالث': 3, 'الثالثه': 3, '3ث': 3, 'ث3': 3, '3م': 3, 'م3': 3, 'third': 3, '3rd': 3, 'g12': 3,
        'رابع': 4, 'رابعه': 4, 'الرابع': 4, 'الرابعه': 4,
        'خامس': 5, 'خامسه': 5, 'الخامس': 5, 'الخامسه': 5,
        'سادس': 6, 'سادسه': 6, 'السادس': 6, 'السادسه': 6
    };

    const cleanTokens = norm
        .replace(/[\(\)\[\]{}.,،_+\-–—\\/|:;؛!?~*]/g, ' ')
        .replace(/([1-6])\s+(ث|م)\b/g, '$1$2')
        .replace(/\b(ث|م)\s+([1-6])/g, '$1$2')
        .split(/\s+/)
        .filter(Boolean);

    let foundGradeLevel = null;
    let gradeTokenIndex = -1;

    for (let i = 0; i < cleanTokens.length; i++) {
        const tk = cleanTokens[i];
        if (ordinalMap[tk]) {
            foundGradeLevel = ordinalMap[tk];
            gradeTokenIndex = i;
            break;
        }
        if ((tk === 'صف' || tk === 'الصف' || tk === 'grade') && cleanTokens[i + 1] && /^[1-6]$/.test(cleanTokens[i + 1])) {
            foundGradeLevel = Number(cleanTokens[i + 1]);
            gradeTokenIndex = i + 1;
            break;
        }
    }

    if (foundGradeLevel !== null) {
        let foundSection = null;
        const stageIgnore = new Set([
            'ثانوي', 'الثانوي', 'ثانويه', 'الثانويه', 'متوسط', 'المتوسط', 'ابتدائي', 'الابتدائي',
            'صف', 'الصف', 'فصل', 'الفصل', 'شعبه', 'الشعبه', 'قاعه', 'القاعه', 'ش', 'ف',
            'مسار', 'المسار', 'عام', 'العام', 'علمي', 'العلمي', 'ادبي', 'الادبي', 'شرعي', 'الشرعي',
            'صحي', 'هندسه', 'حاسب', 'اداره', 'اعمال', 'مقررات', 'سنه', 'السنه', 'grade', 'sec', 'section', 'class'
        ]);

        for (let i = 0; i < cleanTokens.length; i++) {
            if (i === gradeTokenIndex) continue;
            const tk = cleanTokens[i];
            if (stageIgnore.has(tk)) continue;

            if (/^([1-9]|1\d|20)$/.test(tk)) {
                foundSection = tk;
                break;
            }
            if (i > gradeTokenIndex && ordinalMap[tk]) {
                // e.g., "ثاني اول" -> Grade 2, Section 1; "ثالث ثاني" -> Grade 3, Section 2
                foundSection = String(ordinalMap[tk]);
                break;
            }
            if (SECTION_LETTER_TO_NUM[tk] && (i > gradeTokenIndex || cleanTokens.includes('شعبه') || cleanTokens.includes('فصل'))) {
                foundSection = SECTION_LETTER_TO_NUM[tk];
                break;
            }
        }

        // Verify that the fragment doesn't contain unrelated person name words
        const nonClassWords = cleanTokens.filter((tk, idx) => {
            if (idx === gradeTokenIndex) return false;
            if (stageIgnore.has(tk)) return false;
            if (/^([1-9]|1\d|20)$/.test(tk)) return false;
            if (ordinalMap[tk]) return false;
            if (SECTION_LETTER_TO_NUM[tk]) return false;
            return true;
        });

        return {
            gradeLevel: foundGradeLevel,
            section: foundSection,
            isClassFragment: nonClassWords.length === 0
        };
    }

    // 4. Section-only fragment (e.g., "شعبة 3", "شعبه ٢", "فصل 4", "ش 2", or pure small integer in a section column)
    const secOnlyMatch = norm.match(/^(?:شعبه|الشعبه|فصل|الفصل|قاعه|القاعه|ش|ف|sec|section)\s*[:\-]?\s*([1-9]|1\d|20|[ابجدهو])$/);
    if (secOnlyMatch) {
        const sVal = secOnlyMatch[1];
        return {
            gradeLevel: null,
            section: SECTION_LETTER_TO_NUM[sVal] || sVal,
            isClassFragment: true
        };
    }

    return { gradeLevel: null, section: null, isClassFragment: false };
};

// Check if a token or phrase consists purely of non-name noise words
const isPureNoisePhrase = (phrase) => {
    const norm = normalizeArabicForMatch(phrase);
    if (!norm) return true;
    // Check page/group/points patterns
    if (/^(ص|صفحه|الصفحه|مجموعه|المجموعه|دفعه|الدفعه)\s*\d+$/.test(norm)) return true;
    if (/^\d+\s*(نقطه|نقاط|درجه|درجات|ريال|طالب|طلاب)$/.test(norm)) return true;
    const tokens = norm.split(' ').filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every(tk => NON_NAME_NOISE_WORDS.has(tk) || /^\d+$/.test(tk));
};

// Check if a whole line is a non-student header/footer line (e.g. "بسم الله الرحمن الرحيم", "الاسم | الصف | الشعبة", "ص 1")
const isHeaderOrMetadataLine = (line) => {
    const norm = normalizeArabicForMatch(line);
    if (!norm) return true;
    if (/^(بسم الله|قائمه الطلاب|كشف اسماء|اسماء الطلاب|الطلاب المشاركين|المجموع|اجمالي|التوقيع|مدير المدرسه|رائد النشاط|وكيل المدرسه)/.test(norm)) {
        return true;
    }
    if (/^(ص|صفحه|الصفحه|مجموعه|المجموعه|دفعه|الدفعه|ورقه|الورقه)\s*\d+(\s*من\s*\d+)?$/.test(norm)) {
        return true;
    }
    const tokens = norm.split(' ').filter(Boolean);
    if (tokens.length > 0 && tokens.every(tk => NON_NAME_NOISE_WORDS.has(tk) || /^\d+$/.test(tk))) {
        return true;
    }
    return false;
};

const parsePastedStudentsText = (rawText) => {
    if (!rawText || !rawText.trim()) return [];

    const cleanedRaw = cleanBidiAndZeroWidth(rawText);
    let rawLines = cleanedRaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // If only 1 line but separated by commas or semicolons:
    if (rawLines.length === 1 && (rawLines[0].includes('،') || rawLines[0].includes(',') || rawLines[0].includes('؛'))) {
        const commaSplit = rawLines[0].split(/[،,؛]/).map(s => s.trim()).filter(Boolean);
        if (commaSplit.length > 1) {
            rawLines = commaSplit;
        }
    }

    const results = [];
    let currentContextGradeLevel = null;
    let currentContextSection = null;

    rawLines.forEach(originalLine => {
        let line = toWesternDigits(cleanBidiAndZeroWidth(originalLine)).trim();
        if (!line) return;

        // Strip decorative divider lines (---, ===, ***)
        if (/^[\-=*_~•●▪▫\s]+$/.test(line)) return;

        // 1. Remove leading list numbering (e.g. "1-", "١.", "(2)", "[3]", "1/", "1 -", "- 1 -")
        line = line.replace(/^\s*[\(\[\{]?\s*\d{1,3}\s*[\)\]\}]?\s*[\.\-\–\—\:\/\|]?\s*/, '');
        // Remove leading bullets, emojis, checkmarks, icons
        line = line.replace(/^[\s•●○■▪▫▪️▫️✦★☆✓✔✅☑❌❎👤🧑👨‍🎓🔹🔸◾◽👈👉⬅️➡️\-*~–—_+|/]+/, '').trim();
        // Remove trailing checkmarks or emojis
        line = line.replace(/[\s•●○■▪▫▪️▫️✦★☆✓✔✅☑❌❎👤🧑👨‍🎓🔹🔸◾◽👈👉⬅️➡️*~_]+$/, '').trim();

        if (!line) return;

        // 2. Check if this entire line is a Class Context Header (e.g., "فصل ثاني ثانوي 2:" or "الصف الثالث ثانوي شعبة 1")
        const headerCandidate = line.replace(/[:：\-–—]+$/, '').trim();
        const headerClassInfo = extractGradeAndSectionFromFragment(headerCandidate);
        if (headerClassInfo.isClassFragment && (headerClassInfo.gradeLevel !== null || headerClassInfo.section !== null)) {
            if (headerClassInfo.gradeLevel !== null) currentContextGradeLevel = headerClassInfo.gradeLevel;
            if (headerClassInfo.section !== null) currentContextSection = headerClassInfo.section;
            return;
        }

        // Check if this line is a pure header/footer/noise line (e.g. "بسم الله الرحمن الرحيم", "الاسم | الصف", "ص 1")
        if (isHeaderOrMetadataLine(line)) {
            return;
        }

        // 3. Extract and strip Saudi phone numbers (05xxxxxxxx, +9665xxxxxxxx) so their digits never pollute grade/section
        let inlinePhoneHint = '';
        line = line.replace(/(?:\+?966|00966|0)?5\d[\s\-]?\d{3}[\s\-]?\d{4}\b/g, (match) => {
            const digits = match.replace(/\D/g, '');
            inlinePhoneHint = digits.startsWith('966') ? '0' + digits.slice(3) : (digits.startsWith('00966') ? '0' + digits.slice(5) : (digits.startsWith('5') ? '0' + digits : digits));
            return ' ';
        });

        // Strip long ID numbers (5+ digits like National ID or Academic ID) and Hijri/Gregorian years (1440-1450, 2020-2030)
        line = line.replace(/\b\d{5,15}\b/g, ' ');
        line = line.replace(/\b(14[345]\d|20[23]\d)(?:\/\d{1,2}(?:\/\d{1,2})?)?\b/g, ' ');

        // Strip explicit prefixes like "اسم الطالب:" or "الطالب /" or "المشارك:"
        line = line.replace(/^(?:اسم\s+الطالب|الطالب|الاسم|المشارك|طالب|الأخ|الاخ|الابن)\s*[:：\/\-–—]\s*/i, '').trim();

        let inlineGradeLevel = null;
        let inlineGradeHint = '';
        let inlineSectionHint = '';
        const ignoredNotes = [];

        // 4. Extract parenthetical (...) and bracketed [...] segments anywhere in the line
        line = line.replace(/[\(\[\{]([^\)\]\}]*)[\)\]\}]/g, (fullMatch, inner) => {
            const trimmedInner = inner.trim();
            if (!trimmedInner) return ' ';
            const classInfo = extractGradeAndSectionFromFragment(trimmedInner);
            if (classInfo.gradeLevel !== null || classInfo.section !== null) {
                if (classInfo.gradeLevel !== null) {
                    inlineGradeLevel = classInfo.gradeLevel;
                    inlineGradeHint = trimmedInner;
                }
                if (classInfo.section !== null) {
                    inlineSectionHint = classInfo.section;
                }
                return ' ';
            }
            // If it's noise/notes inside brackets (like "(مشارك)" or "(غائب)" or "(ص 1)"), strip it!
            if (isPureNoisePhrase(trimmedInner) || /\d/.test(trimmedInner)) {
                ignoredNotes.push(trimmedInner);
                return ' ';
            }
            // Even if it's arbitrary commentary in parentheses (e.g. "(إذاعة مدرسية)"), strip it unless it starts with "آل "
            if (!/^(آل|ال)\s+\S+$/.test(trimmedInner)) {
                ignoredNotes.push(trimmedInner);
                return ' ';
            }
            return ' ' + trimmedInner + ' ';
        });

        // 5. Handle multi-column lines (Tab \t, Pipe |, or spaced delimiters " - ", " – ", " — ", " : ")
        if (line.includes('\t') || line.includes('|') || /\s+[\-–—:]\s+/.test(line)) {
            const rawParts = line
                .split(/\t|\||(?:\s+[\-–—:]\s+)/)
                .map(p => p.trim())
                .filter(Boolean);

            const nameCandidateParts = [];

            rawParts.forEach(part => {
                // Skip pure row numbers
                if (/^\d{1,3}$/.test(part)) {
                    // Only treat a standalone 1..20 digit as section if we ALREADY found a grade in an earlier column and don't have a section yet
                    if (inlineGradeLevel !== null && !inlineSectionHint && /^([1-9]|1\d|20)$/.test(part)) {
                        inlineSectionHint = part;
                    }
                    return;
                }
                // Check if this column is a single Arabic section letter after a grade column
                if (inlineGradeLevel !== null && !inlineSectionHint && SECTION_LETTER_TO_NUM[normalizeArabic(part)]) {
                    inlineSectionHint = SECTION_LETTER_TO_NUM[normalizeArabic(part)];
                    return;
                }

                // Check if this part is a class/grade/section fragment
                const cInfo = extractGradeAndSectionFromFragment(part);
                if (cInfo.isClassFragment && (cInfo.gradeLevel !== null || cInfo.section !== null)) {
                    if (cInfo.gradeLevel !== null) {
                        inlineGradeLevel = cInfo.gradeLevel;
                        inlineGradeHint = part;
                    }
                    if (cInfo.section !== null) {
                        inlineSectionHint = cInfo.section;
                    }
                    return;
                }

                // Check if this part is non-name noise (like "مشارك", "حاضر", "ممتاز", "ص 1", "10 نقاط")
                if (isPureNoisePhrase(part)) {
                    ignoredNotes.push(part);
                    return;
                }

                nameCandidateParts.push(part);
            });

            // Choose the best name part (usually the first multi-word Arabic/English name segment)
            line = nameCandidateParts.join(' ').trim();
        }

        // 6. Now inspect tokens of the remaining string for unseparated leading/trailing class or noise tokens
        // e.g. "محمد أحمد علي الزهراني ثاني ثانوي 1" or "2/3 خالد عبدالله القحطاني" or "سعد فهد العتيبي مشارك"
        line = line.replace(/^["'«]+|["'»]+$/g, '').trim();

        // Check leading slash class (e.g., "2/1 محمد أحمد الزهراني")
        const leadingSlash = line.match(/^(?:فصل|صف|شعبه|شعبة)?\s*([1-6])\s*[\/\\\-–—]\s*([1-9]\d?)\s+(.+)$/);
        if (leadingSlash) {
            if (inlineGradeLevel === null) {
                inlineGradeLevel = Number(leadingSlash[1]);
                inlineGradeHint = `${leadingSlash[1]}/${leadingSlash[2]}`;
            }
            if (!inlineSectionHint) inlineSectionHint = leadingSlash[2];
            line = leadingSlash[3].trim();
        }

        // Check trailing slash class (e.g., "محمد أحمد الزهراني 2/1" or "محمد أحمد الزهراني - 2/1")
        const trailingSlash = line.match(/^(.+?)\s+[\-–—\/]?\s*(?:فصل|صف|شعبه|شعبة)?\s*([1-6])\s*(?:ث|م)?\s*[\/\\\-–—]\s*([1-9]\d?|[أابجدهو])$/);
        if (trailingSlash) {
            if (inlineGradeLevel === null) {
                inlineGradeLevel = Number(trailingSlash[2]);
                inlineGradeHint = `${trailingSlash[2]}/${trailingSlash[3]}`;
            }
            if (!inlineSectionHint) {
                const sRaw = normalizeArabic(trailingSlash[3]);
                inlineSectionHint = SECTION_LETTER_TO_NUM[sRaw] || sRaw;
            }
            line = trailingSlash[1].trim();
        }

        // Check trailing Noor 3-digit class code (e.g., "محمد أحمد الزهراني 203")
        const trailingNoor = line.match(/^(.+?)\s+([1-6])0([1-9])$/);
        if (trailingNoor) {
            if (inlineGradeLevel === null) {
                inlineGradeLevel = Number(trailingNoor[2]);
                inlineGradeHint = `${trailingNoor[2]}/${trailingNoor[3]}`;
            }
            if (!inlineSectionHint) inlineSectionHint = trailingNoor[3];
            line = trailingNoor[1].trim();
        }

        // Check leading explicit class phrase (e.g., "ثاني ثانوي 1 محمد أحمد الزهراني")
        const leadingClassMatch = line.match(/^(?:الصف\s+|صف\s+|فصل\s+)?(أول|اول|أولى|اولى|الأول|الاول|ثاني|ثانية|ثانيه|الثاني|ثالث|ثالثة|ثالثه|الثالث|[1-3]\s*ث)\s*(?:ثانوي|الثانوي|متوسط|علمي|أدبي|ادبي|عام)?\s*(?:[\/\-]?\s*(?:شعبة|شعبه|فصل|ش|ف)?\s*([1-9]\d?))?\s*[:\-–—\/]?\s+(.+)$/i);
        if (leadingClassMatch) {
            const remainWords = leadingClassMatch[3].trim().split(/\s+/);
            // Only treat as leading class if explicit stage/section is present or remaining has >= 2 name words
            if (remainWords.length >= 2) {
                const cInfo = extractGradeAndSectionFromFragment(`${leadingClassMatch[1]} ثانوي ${leadingClassMatch[2] || ''}`);
                if (cInfo.gradeLevel !== null && inlineGradeLevel === null) {
                    inlineGradeLevel = cInfo.gradeLevel;
                    inlineGradeHint = leadingClassMatch[1];
                }
                if (cInfo.section !== null && !inlineSectionHint) {
                    inlineSectionHint = cInfo.section;
                }
                line = leadingClassMatch[3].trim();
            }
        }

        // Check trailing explicit class phrase (e.g. "محمد أحمد الزهراني ثاني ثانوي 1", "محمد الزهراني ثالث 2", "محمد الزهراني اولى ثانوي", "محمد الزهراني ثاني اول")
        const trailingClassMatch = line.match(/^(.+?)\s+[\-–—\/]?\s*(?:الصف\s+|صف\s+|فصل\s+)?((?:أول|اول|أولى|اولى|الأول|الاول|ثاني|ثانية|ثانيه|الثاني|ثالث|ثالثة|ثالثه|الثالث|[1-3]\s*ث)(?:\s+(?:ثانوي|الثانوي|متوسط|علمي|أدبي|ادبي|عام|مسار\s+\S+))?(?:\s*[\/\-]?\s*(?:شعبة|شعبه|فصل|ش|ف)?\s*(?:[1-9]\d?|أول|اول|ثاني|ثالث|[أابجدهو]))?)$/i);
        if (trailingClassMatch) {
            const namePart = trailingClassMatch[1].trim();
            const classPart = trailingClassMatch[2].trim();
            const classNorm = normalizeArabic(classPart);
            // Protect against "محمد ثاني" where "ثاني" is the father/family name without any stage word or section number
            const hasExplicitClassSignal = /(ثانوي|متوسط|ابتدائي|علمي|ادبي|عام|شعبه|فصل|صف|اولي|ثانيه|ثالثه|\d|\bث\b)/.test(classNorm) ||
                /\b(اول|ثاني|ثالث)\s+(اول|ثاني|ثالث)\b/.test(classNorm);

            if (hasExplicitClassSignal && namePart.split(/\s+/).length >= 1) {
                const cInfo = extractGradeAndSectionFromFragment(classPart);
                if (cInfo.gradeLevel !== null && inlineGradeLevel === null) {
                    inlineGradeLevel = cInfo.gradeLevel;
                    inlineGradeHint = classPart;
                }
                if (cInfo.section !== null && !inlineSectionHint) {
                    inlineSectionHint = cInfo.section;
                }
                line = namePart;
            }
        }

        // Check trailing section-only phrase (e.g. "محمد أحمد الزهراني شعبة 3" or "محمد أحمد الزهراني ف 2")
        const trailingSecOnly = line.match(/^(.+?)\s+[\-–—\/]?\s*(?:شعبة|شعبه|الشعبة|فصل|الفصل|قاعة|ش|ف)\s*[:\-]?\s*([1-9]\d?|[أابجدهو])$/i);
        if (trailingSecOnly) {
            const sRaw = normalizeArabic(trailingSecOnly[2]);
            if (!inlineSectionHint) inlineSectionHint = SECTION_LETTER_TO_NUM[sRaw] || sRaw;
            line = trailingSecOnly[1].trim();
        }

        // 7. Strip trailing or leading non-name noise tokens (e.g. "محمد أحمد الزهراني مشارك", "محمد أحمد الزهراني ص 1", "محمد أحمد الزهراني 1")
        // Also strip trailing standalone page/group tags like "ص1" or "ص 2"
        line = line.replace(/\s+[\-–—\/]?\s*(?:ص|صفحة|صفحه|مجموعة|مجموعه|دفعة|دفعه)\s*\d+$/i, '').trim();

        let words = line.split(/\s+/).filter(Boolean);

        // Strip trailing noise words or stray trailing numbers
        while (words.length > 1) {
            const lastWord = words[words.length - 1];
            const lastNorm = normalizeArabicForMatch(lastWord);
            if (/^\d+$/.test(lastNorm)) {
                // If it's a small number 1..15 at the very end and we already have a grade (or no section), it might be a section number or noise
                if (!inlineSectionHint && /^([1-9]|1[0-5])$/.test(lastNorm) && inlineGradeLevel !== null) {
                    inlineSectionHint = lastNorm;
                }
                words.pop();
                continue;
            }
            if (NON_NAME_NOISE_WORDS.has(lastNorm)) {
                ignoredNotes.push(words.pop());
                continue;
            }
            break;
        }

        // Strip leading noise words (like "الطالب", "المشارك", "الاسم", "أ.")
        while (words.length > 1) {
            const firstWord = words[0];
            const firstNorm = normalizeArabicForMatch(firstWord);
            if (NON_NAME_NOISE_WORDS.has(firstNorm) || /^(ا|أ|د|م)\.$/.test(firstWord) || /^\d+$/.test(firstNorm)) {
                words.shift();
                continue;
            }
            break;
        }

        let cleanName = words.join(' ')
            .replace(/^[\.\:\-–—\/\|،,]+|[\.\:\-–—\/\|،,]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Reject if remaining name is empty, purely numeric, or purely noise words
        if (!cleanName || cleanName.length < 2 || /^\d+$/.test(cleanName) || isPureNoisePhrase(cleanName)) {
            return;
        }

        // Apply context header grade/section if this student line didn't specify its own
        const finalGradeLevel = inlineGradeLevel !== null ? inlineGradeLevel : currentContextGradeLevel;
        const finalSectionHint = inlineSectionHint || (inlineGradeLevel === null ? (currentContextSection || '') : '');

        results.push({
            rawName: cleanName,
            inlineGradeLevel: finalGradeLevel,
            inlineGradeHint: inlineGradeHint || (finalGradeLevel ? String(finalGradeLevel) : ''),
            inlineSectionHint: finalSectionHint,
            inlinePhoneHint,
            ignoredNoise: ignoredNotes.join(' ، ')
        });
    });

    return results;
};

export default function PublicRegistrationPage() {
    const { linkId } = useParams();
    const { schoolInfo, grades } = useSettings();

    const [linkData, setLinkData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Passcode State
    const [isPasscodeVerified, setIsPasscodeVerified] = useState(false);
    const [enteredPasscode, setEnteredPasscode] = useState('');
    const [passcodeError, setPasscodeError] = useState('');

    // Entry Mode: 'single' | 'rapid'
    const [entryMode, setEntryMode] = useState('single');

    // Single Form State
    const [singleForm, setSingleForm] = useState({
        studentName: '',
        isGradeUnknown: false,
        grade: '',
        section: '',
        phone: '',
        customValues: {}
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Rapid Entry State (multi-row)
    const [rapidRows, setRapidRows] = useState([
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' },
        { studentName: '', isGradeUnknown: false, grade: '', section: '', customValues: {}, phone: '' }
    ]);

    // Smart Bulk Paste state & students list from DB
    const [students, setStudents] = useState([]);
    const [smartPasteText, setSmartPasteText] = useState('');
    const [isSmartPasteExpanded, setIsSmartPasteExpanded] = useState(true);
    const [batchGroupName, setBatchGroupName] = useState('');
    const [publicGroupFilter, setPublicGroupFilter] = useState('all');

    // Submissions by this link listener
    const [submissions, setSubmissions] = useState([]);
    const [editingSub, setEditingSub] = useState(null);

    // 1. Fetch Link Data
    useEffect(() => {
        if (!linkId) return;

        const unsubscribe = onSnapshot(doc(db, 'registration_links', linkId), (docSnap) => {
            if (docSnap.exists()) {
                const data = { id: docSnap.id, ...docSnap.data() };
                setLinkData(data);
                if (!data.passcode) {
                    setIsPasscodeVerified(true);
                }
                setNotFound(false);
            } else {
                setNotFound(true);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching link:", err);
            setNotFound(true);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [linkId]);

    // 2. Real-time Submissions Listener (only attach if passcode is verified or not required)
    useEffect(() => {
        if (!linkId || !isPasscodeVerified) return;

        const q = query(
            collection(db, 'link_submissions'),
            where('linkId', '==', linkId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a, b) => {
                const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return tB - tA;
            });
            setSubmissions(list);
        }, (err) => {
            console.error("Error fetching submissions:", err);
        });

        return () => unsubscribe();
    }, [linkId, isPasscodeVerified]);

    // Fetch active students for smart matching in rapid mode
    useEffect(() => {
        let isMounted = true;
        async function fetchStudents() {
            try {
                const snap = await getDocs(query(collection(db, 'students'), where('active', '==', true)));
                let list = snap.docs.map(d => ({ ...d.data(), id: d.id }));
                if (list.length === 0) {
                    const fallbackSnap = await getDocs(collection(db, 'students'));
                    list = fallbackSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(s => s.active !== false);
                }
                if (isMounted) {
                    setStudents(list);
                }
            } catch (err) {
                console.error("Error fetching students for smart match:", err);
            }
        }
        fetchStudents();
        return () => { isMounted = false; };
    }, []);

    // Set default grade when linkData loads
    useEffect(() => {
        if (linkData && (!linkData.allowedGrades || linkData.allowedGrades.includes('all'))) {
            if (grades && grades.length > 0) {
                const firstGrade = typeof grades[0] === 'object' ? (grades[0].name || grades[0].id) : grades[0];
                setSingleForm(prev => ({ ...prev, grade: prev.grade || firstGrade || '' }));
            }
        } else if (linkData?.allowedGrades && linkData.allowedGrades.length > 0) {
            const firstAllowed = typeof linkData.allowedGrades[0] === 'object' ? (linkData.allowedGrades[0].name || linkData.allowedGrades[0].id) : linkData.allowedGrades[0];
            setSingleForm(prev => ({ ...prev, grade: prev.grade || firstAllowed || '' }));
        }
    }, [linkData, grades]);

    // Allowed grade options (always strings)
    const gradeOptions = useMemo(() => {
        if (!linkData) {
            return (grades?.map(g => typeof g === 'object' ? (g.name || g.id) : g) || ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي']).filter(Boolean);
        }
        return (linkData.allowedGrades?.includes('all') || !linkData.allowedGrades?.length
            ? (grades?.map(g => typeof g === 'object' ? (g.name || g.id) : g) || ['أول ثانوي', 'ثاني ثانوي', 'ثالث ثانوي'])
            : linkData.allowedGrades.map(g => typeof g === 'object' ? (g.name || g.id) : g)
        ).filter(Boolean);
    }, [linkData, grades]);

    // Section options helper (always returns array of strings)
    const getSectionOptions = (gradeName) => {
        const found = grades?.find(g => (typeof g === 'object' ? (g.name || g.id) : g) === gradeName);
        if (found && Array.isArray(found.sections) && found.sections.length > 0) {
            return found.sections.map(sec => {
                if (typeof sec === 'object' && sec !== null) {
                    return String(sec.name || sec.id || '');
                }
                return String(sec);
            }).filter(Boolean);
        }
        return ['1', '2', '3', '4', '5', '6'];
    };

    // Pre-indexed students for fast and accurate matching
    const preparedStudents = useMemo(() => {
        return (students || []).map(s => {
            const sNorm = normalizeArabicForMatch(s.name);
            const sTokens = getComparableTokens(sNorm);
            const sStrippedTokens = sTokens.map(stripLeadingAl);
            const classFrag = extractGradeAndSectionFromFragment(s.class || '');
            const sGradeLevel = detectGradeLevelNumber(s.grade || '') || classFrag.gradeLevel || detectGradeLevelNumber(s.class || '');
            const rawSec = toWesternDigits(cleanBidiAndZeroWidth(s.section || classFrag.section || '')).trim();
            const sSection = rawSec.replace(/^(?:شعبة|شعبه|فصل|ش|ف)\s*/i, '').trim();
            return {
                ...s,
                sNorm,
                sTokens,
                sStrippedTokens,
                sGradeLevel,
                sSection
            };
        });
    }, [students]);

    // Match a student name against pre-indexed school students (with optional grade/section disambiguation)
    const findBestStudentMatch = (rawName, hintGradeLevel = null, hintSection = '') => {
        if (!rawName || !preparedStudents.length) return null;

        // If rawName still has inline class/noise (e.g. when typing directly in a single row input), clean it first for matching
        const parsedInline = parsePastedStudentsText(rawName);
        const effectiveName = parsedInline.length === 1 ? parsedInline[0].rawName : rawName;
        const effGradeLevel = hintGradeLevel !== null ? hintGradeLevel : (parsedInline[0]?.inlineGradeLevel ?? null);
        const effSection = hintSection || parsedInline[0]?.inlineSectionHint || '';

        const queryNorm = normalizeArabicForMatch(effectiveName);
        if (!queryNorm) return null;
        const queryTokens = getComparableTokens(queryNorm);
        if (queryTokens.length === 0) return null;
        const queryStripped = queryTokens.map(stripLeadingAl);

        const pickBestByClassHint = (candidatesList) => {
            if (!candidatesList.length) return null;
            if (candidatesList.length === 1) return candidatesList[0];
            if (effGradeLevel !== null || effSection) {
                const exactClassMatch = candidatesList.find(
                    c => (effGradeLevel === null || c.sGradeLevel === effGradeLevel) &&
                         (!effSection || c.sSection === String(effSection))
                );
                if (exactClassMatch) return exactClassMatch;
                if (effGradeLevel !== null) {
                    const gradeOnlyMatch = candidatesList.find(c => c.sGradeLevel === effGradeLevel);
                    if (gradeOnlyMatch) return gradeOnlyMatch;
                }
            }
            return candidatesList[0];
        };

        // 1. Exact Normalized Name Match
        const exactMatches = preparedStudents.filter(s => s.sNorm === queryNorm);
        if (exactMatches.length > 0) {
            return { student: pickBestByClassHint(exactMatches), matchType: 'exact', confidence: 100 };
        }

        // 2. Exact Comparable Tokens Match (ignoring "بن" / "ابن" and "ال" prefix differences on family name)
        if (queryTokens.length >= 2) {
            const qJoined = queryTokens.join(' ');
            const qStrippedJoined = queryStripped.join(' ');
            const tokenExactMatches = preparedStudents.filter(
                s => s.sTokens.join(' ') === qJoined || s.sStrippedTokens.join(' ') === qStrippedJoined
            );
            if (tokenExactMatches.length > 0) {
                return { student: pickBestByClassHint(tokenExactMatches), matchType: 'tokens_exact', confidence: 98 };
            }
        }

        // 3. Ordered Subsequence / Prefix Match (e.g. "محمد أحمد الزهراني" -> "محمد أحمد علي الزهراني")
        if (queryTokens.length >= 2) {
            const subseqCandidates = [];

            for (const s of preparedStudents) {
                if (s.sTokens.length < 2) continue;

                // First name must match strongly
                const firstSim = scoreTokenSimilarity(queryTokens[0], s.sTokens[0], false);
                if (firstSim < 0.95) continue;

                // Check if all queryTokens appear in order inside s.sTokens (or vice versa if DB has fewer tokens)
                const shorter = queryTokens.length <= s.sTokens.length ? queryTokens : s.sTokens;
                const longer = queryTokens.length <= s.sTokens.length ? s.sTokens : queryTokens;

                let sIdx = 0;
                let matchedCount = 0;
                for (let qIdx = 0; qIdx < shorter.length; qIdx++) {
                    while (sIdx < longer.length) {
                        if (scoreTokenSimilarity(shorter[qIdx], longer[sIdx], false) >= 0.95) {
                            matchedCount++;
                            sIdx++;
                            break;
                        }
                        sIdx++;
                    }
                }

                if (matchedCount === shorter.length) {
                    const lastSim = scoreTokenSimilarity(
                        queryTokens[queryTokens.length - 1],
                        s.sTokens[s.sTokens.length - 1],
                        false
                    );
                    // If only 2 tokens (e.g. "محمد الزهراني" or "محمد أحمد"), require either last name match or 3+ tokens, or unique prefix
                    if (shorter.length >= 3 || lastSim >= 0.95) {
                        let rankScore = (shorter.length / longer.length) + (lastSim >= 0.95 ? 0.15 : 0);
                        if (effGradeLevel !== null && s.sGradeLevel === effGradeLevel) rankScore += 0.2;
                        if (effSection && s.sSection === String(effSection)) rankScore += 0.1;
                        if (effGradeLevel !== null && s.sGradeLevel && s.sGradeLevel !== effGradeLevel && shorter.length === 2) {
                            // Avoid matching a 2-word name to the wrong grade when an explicit grade was given
                            continue;
                        }
                        subseqCandidates.push({ student: s, rankScore });
                    }
                }
            }

            if (subseqCandidates.length > 0) {
                subseqCandidates.sort((a, b) => b.rankScore - a.rankScore);
                return {
                    student: subseqCandidates[0].student,
                    matchType: 'subsequence',
                    confidence: 94
                };
            }
        }

        // 4. Fuzzy & OCR-Typo Tolerant Match (First Name + Family Name / Multi-token similarity)
        if (queryTokens.length >= 2) {
            let bestCandidate = null;
            let bestScore = 0;

            for (const s of preparedStudents) {
                if (s.sTokens.length < 2) continue;

                const firstSim = scoreTokenSimilarity(queryTokens[0], s.sTokens[0], true);
                if (firstSim < 0.85) continue;

                const lastSim = scoreTokenSimilarity(
                    queryTokens[queryTokens.length - 1],
                    s.sTokens[s.sTokens.length - 1],
                    true
                );

                // Count how many query tokens match a distinct token in s.sTokens in order
                let matchedWeight = 0;
                let matchedTokensCount = 0;
                let sCursor = 0;

                for (let i = 0; i < queryTokens.length; i++) {
                    let bestTokenSim = 0;
                    let bestTokenIdx = -1;
                    for (let j = sCursor; j < s.sTokens.length; j++) {
                        const sim = scoreTokenSimilarity(queryTokens[i], s.sTokens[j], true);
                        if (sim > bestTokenSim) {
                            bestTokenSim = sim;
                            bestTokenIdx = j;
                        }
                    }
                    if (bestTokenSim >= 0.85) {
                        matchedWeight += bestTokenSim;
                        matchedTokensCount++;
                        sCursor = bestTokenIdx + 1;
                    }
                }

                const minRequiredTokens = queryTokens.length === 2 ? 2 : Math.min(3, queryTokens.length);
                if (matchedTokensCount < minRequiredTokens) continue;
                if (queryTokens.length === 2 && lastSim < 0.85) continue;

                let score = (matchedWeight * 2) / (queryTokens.length + s.sTokens.length);
                if (lastSim >= 0.95) score += 0.08;
                if (firstSim === 1) score += 0.04;

                // Class hint bonus/penalty
                if (effGradeLevel !== null && s.sGradeLevel) {
                    if (s.sGradeLevel === effGradeLevel) {
                        score += 0.1;
                        if (effSection && s.sSection === String(effSection)) score += 0.05;
                    } else if (queryTokens.length <= 2) {
                        // Do not fuzzy-match a 2-word name across a contradicting explicit grade
                        continue;
                    } else {
                        score -= 0.08;
                    }
                }

                const threshold = queryTokens.length === 2 ? 0.62 : 0.60;
                if (score > bestScore && score >= threshold) {
                    bestScore = score;
                    bestCandidate = s;
                }
            }

            if (bestCandidate) {
                return {
                    student: bestCandidate,
                    matchType: 'fuzzy',
                    confidence: Math.min(95, Math.round(bestScore * 100))
                };
            }
        }

        return null;
    };

    // Helper to resolve grade and section from matched student and/or inline hints without ever confusing section digits with grade digits
    const resolveGradeAndSection = (matchedStudent, inlineGradeHint = '', inlineSectionHint = '', inlineGradeLevel = null) => {
        const inlineFrag = extractGradeAndSectionFromFragment(inlineGradeHint);
        const hintGradeNum = inlineGradeLevel !== null ? inlineGradeLevel : (inlineFrag.gradeLevel || detectGradeLevelNumber(inlineGradeHint));
        const hintSecRaw = inlineSectionHint || inlineFrag.section || '';

        const dbClassFrag = extractGradeAndSectionFromFragment(matchedStudent?.class || '');
        const dbGradeRaw = matchedStudent?.grade && matchedStudent.grade !== 'غير معروف' ? String(matchedStudent.grade).trim() : '';
        const dbGradeNum = detectGradeLevelNumber(dbGradeRaw) || dbClassFrag.gradeLevel || detectGradeLevelNumber(matchedStudent?.class || '');
        const dbSecRaw = matchedStudent?.section || dbClassFrag.section || '';

        let resolvedGrade = '';

        // Helper to map a grade string or level number (1..6) to the school's configured gradeOptions
        const mapToGradeOption = (gradeStr, gradeLevelNum) => {
            if (gradeStr) {
                const normTarget = normalizeArabicForMatch(gradeStr);
                const direct = gradeOptions.find(g => normalizeArabicForMatch(g) === normTarget);
                if (direct) return direct;
            }
            const levelToFind = gradeLevelNum || detectGradeLevelNumber(gradeStr);
            if (levelToFind !== null) {
                const byLevel = gradeOptions.find(g => detectGradeLevelNumber(g) === levelToFind);
                if (byLevel) return byLevel;
                // Fallback index if gradeOptions are ordered [1st, 2nd, 3rd]
                if (levelToFind >= 1 && levelToFind <= gradeOptions.length) {
                    return gradeOptions[levelToFind - 1];
                }
            }
            if (gradeStr) {
                const partial = gradeOptions.find(g => g.includes(gradeStr) || gradeStr.includes(g));
                if (partial) return partial;
            }
            return '';
        };

        // 1. Resolve Grade (prefer DB grade if student is matched in school records, otherwise inline hint)
        if (matchedStudent && (dbGradeRaw || dbGradeNum !== null)) {
            resolvedGrade = mapToGradeOption(dbGradeRaw, dbGradeNum);
        }
        if (!resolvedGrade && (inlineGradeHint || hintGradeNum !== null)) {
            resolvedGrade = mapToGradeOption(inlineGradeHint, hintGradeNum);
        }
        if (!resolvedGrade) {
            resolvedGrade = gradeOptions[0] || '';
        }

        // 2. Resolve Section strictly against availableSections for resolvedGrade
        const availableSections = getSectionOptions(resolvedGrade).map(s => String(s).trim());
        const rawCandidateSec = (matchedStudent && dbSecRaw) ? dbSecRaw : (hintSecRaw || dbSecRaw || '');

        let cleanSec = toWesternDigits(cleanBidiAndZeroWidth(String(rawCandidateSec)))
            .replace(/^(?:شعبة|شعبه|الشعبة|فصل|الفصل|قاعة|القاعة|ش|ف|sec|section)\s*[:\-]?\s*/i, '')
            .trim();

        // If cleanSec still has slash (like "ثاني / 3"), extract only the section from it
        if (cleanSec && !/^\d+$/.test(cleanSec) && !SECTION_LETTER_TO_NUM[normalizeArabic(cleanSec)]) {
            const secFrag = extractGradeAndSectionFromFragment(cleanSec);
            if (secFrag.section) {
                cleanSec = secFrag.section;
            } else {
                cleanSec = '';
            }
        }

        if (cleanSec && !availableSections.includes(cleanSec)) {
            const letterMapped = SECTION_LETTER_TO_NUM[normalizeArabic(cleanSec)];
            if (letterMapped && availableSections.includes(letterMapped)) {
                cleanSec = letterMapped;
            } else if (/^\d+$/.test(cleanSec)) {
                const numStr = String(Number(cleanSec));
                if (availableSections.includes(numStr)) {
                    cleanSec = numStr;
                }
            }
        }

        // Strictly validate that resolvedSection is a valid section from availableSections (never random text!)
        let resolvedSection = '1';
        if (cleanSec && availableSections.includes(cleanSec)) {
            resolvedSection = cleanSec;
        } else if (availableSections.length > 0) {
            resolvedSection = availableSections[0] || '1';
        }

        const classSource = matchedStudent && (dbGradeRaw || dbGradeNum !== null)
            ? 'db'
            : (inlineGradeHint || hintGradeNum !== null || hintSecRaw ? 'text' : 'default');

        return {
            grade: resolvedGrade,
            section: resolvedSection,
            classSource
        };
    };

    // Memoized live analysis stats of pasted text
    const smartAnalysisStats = useMemo(() => {
        if (!smartPasteText || !smartPasteText.trim()) {
            return { total: 0, matched: 0, unmatched: 0, withInlineClass: 0, cleanedNoiseCount: 0, candidates: [] };
        }

        const parsed = parsePastedStudentsText(smartPasteText);
        let matchedCount = 0;
        let withInlineClass = 0;
        let cleanedNoiseCount = 0;

        const candidates = parsed.map(item => {
            const matchRes = findBestStudentMatch(item.rawName, item.inlineGradeLevel, item.inlineSectionHint);
            const matched = matchRes?.student || null;
            if (matched) matchedCount++;
            if (item.inlineGradeLevel !== null || item.inlineGradeHint || item.inlineSectionHint) withInlineClass++;
            if (item.ignoredNoise) cleanedNoiseCount++;

            const resolved = resolveGradeAndSection(
                matched,
                item.inlineGradeHint,
                item.inlineSectionHint,
                item.inlineGradeLevel
            );

            return {
                ...item,
                matchResult: matchRes,
                resolvedGrade: resolved.grade,
                resolvedSection: resolved.section,
                classSource: resolved.classSource
            };
        });

        return {
            total: candidates.length,
            matched: matchedCount,
            unmatched: candidates.length - matchedCount,
            withInlineClass,
            cleanedNoiseCount,
            candidates
        };
    }, [smartPasteText, preparedStudents, gradeOptions]);

    // Existing batch groups in this link (ordered by earliest submission so group 1 keeps color 0, etc.)
    const existingGroups = useMemo(() => {
        const chronological = [...submissions].reverse();
        const map = new Map();
        chronological.forEach(s => {
            const rawG = (s.batchGroupName || '').trim();
            if (!rawG) return;
            const norm = normalizeGroupKey(rawG);
            if (!map.has(norm)) {
                const themeIdx = map.size % GROUP_COLOR_THEMES.length;
                map.set(norm, {
                    name: rawG,
                    normName: norm,
                    count: 1,
                    theme: GROUP_COLOR_THEMES[themeIdx]
                });
            } else {
                map.get(norm).count += 1;
            }
        });
        return Array.from(map.values());
    }, [submissions]);

    const groupThemeByNorm = useMemo(() => {
        const lookup = {};
        existingGroups.forEach(g => {
            lookup[g.normName] = g.theme;
        });
        return lookup;
    }, [existingGroups]);

    // Check if the typed batchGroupName matches an existing group in this link (if so, new students will be appended to it)
    const matchingExistingGroup = useMemo(() => {
        const trimmed = batchGroupName.trim();
        if (!trimmed) return null;
        const norm = normalizeGroupKey(trimmed);
        return existingGroups.find(g => g.normName === norm) || null;
    }, [batchGroupName, existingGroups]);

    // Filtered and grouped submissions for the bottom list in PublicRegistrationPage
    const filteredPublicSubmissions = useMemo(() => {
        let list = submissions;
        if (publicGroupFilter === '__ungrouped__') {
            list = submissions.filter(s => !(s.batchGroupName || '').trim());
        } else if (publicGroupFilter !== 'all') {
            list = submissions.filter(s => normalizeGroupKey(s.batchGroupName || '') === publicGroupFilter);
        }

        // Group items of the same batchGroupName together consecutively
        if (existingGroups.length === 0) return list;

        const groupOrder = new Map();
        existingGroups.forEach((g, idx) => groupOrder.set(g.normName, idx));

        return [...list].sort((a, b) => {
            const gA = normalizeGroupKey(a.batchGroupName || '');
            const gB = normalizeGroupKey(b.batchGroupName || '');
            if (gA !== gB) {
                if (!gA) return 1;
                if (!gB) return -1;
                return (groupOrder.get(gA) ?? 999) - (groupOrder.get(gB) ?? 999);
            }
            const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return tA - tB;
        });
    }, [submissions, publicGroupFilter, existingGroups]);

    // Parse Custom Fields
    const customFields = linkData ? (Array.isArray(linkData.customFields)
        ? linkData.customFields
        : (linkData.customFieldLabel ? [{ id: 'f_legacy', label: linkData.customFieldLabel, required: !!linkData.customFieldRequired }] : [])) : [];

    // Status checks
    const now = new Date();
    const isExpired = linkData?.endAt && new Date(linkData.endAt) < now;
    const isNotStarted = linkData?.startAt && new Date(linkData.startAt) > now;
    const isPaused = linkData?.status === 'paused';

    const hasMaxCap = linkData?.maxCapacity !== null && linkData?.maxCapacity !== undefined && linkData?.maxCapacity !== '' && Number(linkData?.maxCapacity) > 0;
    const maxCap = hasMaxCap ? Number(linkData.maxCapacity) : null;
    const approvedCount = submissions.filter(s => s.status === 'approved').length;
    const pendingCount = submissions.filter(s => s.status === 'pending').length;
    // In review mode, pending submissions occupy seats until reviewed; in immediate mode, approved count is used
    const activeCount = linkData?.approvalMode === 'immediate' ? approvedCount : (approvedCount + pendingCount);
    const isFull = hasMaxCap ? activeCount >= maxCap : false;
    const canWaitlist = !!linkData?.allowWaitlist;

    // Remaining Seats
    const remainingSeats = hasMaxCap ? Math.max(0, maxCap - activeCount) : null;
    const capacityPercent = hasMaxCap ? Math.min(100, Math.round((activeCount / maxCap) * 100)) : 100;

    // Verify Passcode Handler
    const handleVerifyPasscode = (e) => {
        e.preventDefault();
        if (enteredPasscode.trim() === linkData?.passcode?.trim()) {
            setIsPasscodeVerified(true);
            setPasscodeError('');
            toast.success("تم الدخول بنجاح");
        } else {
            setPasscodeError("رمز المرور غير صحيح، يرجى التأكد من الرمز والمحاولة مجدداً.");
        }
    };

    // Apply smart paste text to rapidRows
    const handleApplySmartPaste = (customText = null) => {
        const textToUse = customText !== null ? customText : smartPasteText;
        if (!textToUse || !textToUse.trim()) {
            toast.error("يرجى لصق أو إدخال أسماء الطلاب أولاً");
            return;
        }

        const parsed = parsePastedStudentsText(textToUse);
        if (parsed.length === 0) {
            toast.error("لم يتم العثور على أي أسماء في النص المدخل");
            return;
        }

        const initialCustomValues = {};
        customFields.forEach(field => {
            if (field.isFixed && field.fixedValue) {
                initialCustomValues[field.id] = field.fixedValue;
            }
        });

        let matchedCount = 0;
        const newRows = parsed.map(item => {
            const matchRes = findBestStudentMatch(item.rawName, item.inlineGradeLevel, item.inlineSectionHint);
            const matched = matchRes?.student;
            if (matched) matchedCount++;

            const { grade, section, classSource } = resolveGradeAndSection(
                matched,
                item.inlineGradeHint,
                item.inlineSectionHint,
                item.inlineGradeLevel
            );

            return {
                studentName: matched ? matched.name : item.rawName,
                isGradeUnknown: false,
                grade,
                section,
                classSource,
                phone: matched?.phone || item.inlinePhoneHint || '',
                matchedStudentId: matched?.id || null,
                matchedStudentName: matched?.name || null,
                customValues: { ...initialCustomValues }
            };
        });

        // Replace blank rows or append
        const currentFilled = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0);
        if (currentFilled.length === 0) {
            setRapidRows(newRows);
        } else {
            setRapidRows([...currentFilled, ...newRows]);
        }

        toast.success(`تم التعرف على ${newRows.length} طالب بنجاح (${matchedCount} مطابق بالسجل المدرسي)`);
        setSmartPasteText('');
    };

    // Direct paste from clipboard
    const handlePasteFromClipboard = async () => {
        try {
            if (!navigator.clipboard?.readText) {
                toast.error("متصفحك لا يدعم القراءة المباشرة من الحافظة، يرجى اللصق يدوياً في المربع");
                return;
            }
            const text = await navigator.clipboard.readText();
            if (!text || !text.trim()) {
                toast("الحافظة فارغة، يرجى نسخ الأسماء أولاً", { icon: '📋' });
                return;
            }
            setSmartPasteText(text);
            handleApplySmartPaste(text);
        } catch (err) {
            console.warn("Clipboard access denied or failed:", err);
            toast.error("تعذر الوصول للحافظة، يرجى لصق النص يدوياً داخل المربع");
        }
    };

    // Submit Single Entry
    const handleSaveSingle = async (e, addAnother = false) => {
        if (e) e.preventDefault();

        if (!singleForm.studentName.trim()) {
            toast.error("يرجى إدخال اسم الطالب");
            return;
        }

        // Validate multiple custom fields (skip required validation if field has fixed value)
        for (const field of customFields) {
            const hasFixed = field.isFixed && field.fixedValue;
            if (field.required && !hasFixed && !singleForm.customValues?.[field.id]?.trim()) {
                toast.error(`يرجى تحديد ${field.label}`);
                return;
            }
        }

        const normInput = normalizeArabic(singleForm.studentName);
        const isDupInLink = submissions.some(s => normalizeArabic(s.studentName) === normInput);
        if (isDupInLink) {
            if (!window.confirm(`تنبيه: الطالب "${singleForm.studentName.trim()}" مسجل مسبقاً في هذا الرابط. هل ترغب في المتابعة وتأكيد تسجيله مرة أخرى؟`)) {
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const submissionStatus = isFull
                ? (canWaitlist ? 'waitlist' : 'rejected')
                : (linkData.approvalMode === 'immediate' ? 'approved' : 'pending');

            const customValues = { ...(singleForm.customValues || {}) };
            customFields.forEach(f => {
                if (f.isFixed && f.fixedValue) {
                    customValues[f.id] = f.fixedValue;
                }
            });
            const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

            const isUnknown = !!singleForm.isGradeUnknown;
            const finalGrade = isUnknown ? 'غير معروف' : (singleForm.grade || gradeOptions[0] || '');
            const finalSection = isUnknown ? '' : (singleForm.section || '1');
            const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

            const payload = {
                linkId: linkData.id,
                studentName: singleForm.studentName.trim(),
                grade: finalGrade,
                section: finalSection,
                class: finalClass,
                isGradeUnknown: isUnknown,
                phone: singleForm.phone || '',
                customValues,
                customFieldValue,
                status: submissionStatus,
                createdAt: serverTimestamp()
            };

            await addDoc(collection(db, 'link_submissions'), payload);

            if (submissionStatus === 'approved') {
                await updateDoc(doc(db, 'registration_links', linkData.id), {
                    currentCount: increment(1)
                }).catch(console.warn);
            }

            if (submissionStatus === 'waitlist') {
                toast.success("تم تسجيلك في قائمة الانتظار لاكتمال المقاعد");
            } else {
                toast.success("تم تسجيل بيانات الطالب بنجاح");
            }

            if (addAnother) {
                setSingleForm(prev => ({
                    ...prev,
                    studentName: '',
                    isGradeUnknown: false,
                    phone: '',
                    customValues: {}
                }));
            } else {
                setSingleForm({
                    studentName: '',
                    isGradeUnknown: false,
                    grade: gradeOptions[0] || '',
                    section: '1',
                    phone: '',
                    customValues: {}
                });
            }
        } catch (err) {
            console.error("Submission error:", err);
            toast.error("حدث خطأ أثناء الإرسال: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Bulk toggle unknown grades in Rapid Mode
    const handleSetAllRapidUnknown = () => {
        setRapidRows(prev => prev.map(row => ({
            ...row,
            isGradeUnknown: true,
            grade: 'غير معروف',
            section: ''
        })));
        toast.success('تم تعيين "الصف غير معروف" لجميع الطلاب في القائمة');
    };

    const handleClearAllRapidUnknown = () => {
        const defaultGrade = gradeOptions[0] || '';
        const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
        setRapidRows(prev => prev.map(row => {
            const targetGrade = (row.grade && row.grade !== 'غير معروف') ? row.grade : defaultGrade;
            const availableSecs = getSectionOptions(targetGrade);
            const targetSection = (row.section && row.grade !== 'غير معروف' && availableSecs.includes(row.section))
                ? row.section
                : (availableSecs[0] || defaultSection);
            return {
                ...row,
                isGradeUnknown: false,
                grade: targetGrade,
                section: targetSection
            };
        }));
        toast.success('تم إلغاء خيار "غير معروف" واستعادة الصفوف لجميع الطلاب');
    };

    // Rapid Entry row management helpers
    const handleAddRapidRow = (count = 1) => {
        const allCurrentlyUnknown = rapidRows.length > 0 && rapidRows.every(r => r.isGradeUnknown);
        const defaultGrade = gradeOptions[0] || '';
        const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
        const newRows = Array.from({ length: count }, () => ({
            studentName: '',
            isGradeUnknown: allCurrentlyUnknown,
            grade: allCurrentlyUnknown ? 'غير معروف' : defaultGrade,
            section: allCurrentlyUnknown ? '' : defaultSection,
            customValues: {},
            phone: '',
            matchedStudentId: null
        }));
        setRapidRows(prev => [...prev, ...newRows]);
    };

    const handleRemoveEmptyRapidRows = () => {
        const filled = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0);
        if (filled.length === 0) {
            const defaultGrade = gradeOptions[0] || '';
            const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
            setRapidRows([{
                studentName: '',
                isGradeUnknown: false,
                grade: defaultGrade,
                section: defaultSection,
                customValues: {},
                phone: '',
                matchedStudentId: null
            }]);
            toast('تمت إعادة تعيين القائمة إلى سطر فارغ واحد', { icon: 'ℹ️' });
            return;
        }
        const removedCount = rapidRows.length - filled.length;
        setRapidRows(filled);
        toast.success(`تم حذف ${removedCount} سطر فارغ`);
    };

    // Rapid Entry live metrics
    const totalRapidRows = rapidRows.length;
    const filledRapidRows = rapidRows.filter(r => r.studentName && r.studentName.trim().length > 0).length;
    const emptyRapidRows = totalRapidRows - filledRapidRows;

    // Submit Rapid Entries
    const handleSaveRapid = async () => {
        const validRows = rapidRows.filter(r => r.studentName.trim().length > 0);
        if (validRows.length === 0) {
            toast.error("يرجى إدخال اسم طالب واحد على الأقل");
            return;
        }

        const rawGroupInput = batchGroupName.trim();
        const cleanGroupName = rawGroupInput
            ? (matchingExistingGroup ? matchingExistingGroup.name : rawGroupInput)
            : '';
        const wasExistingGroup = Boolean(matchingExistingGroup);

        // Validate multiple custom fields in rapid mode (skip if fixed)
        for (const field of customFields) {
            const hasFixed = field.isFixed && field.fixedValue;
            if (field.required && !hasFixed) {
                const missingCustom = validRows.some(r => !r.customValues?.[field.id]?.trim());
                if (missingCustom) {
                    toast.error(`يرجى تحديد "${field.label}" لجميع الطلاب المدخلين`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        const toastId = toast.loading(
            cleanGroupName
                ? (wasExistingGroup
                    ? `جاري إضافة ${validRows.length} طالب وإلحاقهم بمجموعة "${cleanGroupName}"...`
                    : `جاري حفظ ${validRows.length} طالب ضمن مجموعة "${cleanGroupName}"...`)
                : `جاري حفظ ${validRows.length} طالب...`
        );

        try {
            let seatsLeft = hasMaxCap ? Math.max(0, maxCap - activeCount) : 999999;

            for (const row of validRows) {
                const rowIsFull = hasMaxCap && seatsLeft <= 0;
                const submissionStatus = rowIsFull
                    ? (canWaitlist ? 'waitlist' : 'rejected')
                    : (linkData.approvalMode === 'immediate' ? 'approved' : 'pending');

                if (hasMaxCap && !rowIsFull) {
                    seatsLeft--;
                }

                const customValues = { ...(row.customValues || {}) };
                customFields.forEach(f => {
                    if (f.isFixed && f.fixedValue) {
                        customValues[f.id] = f.fixedValue;
                    }
                });
                const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ');

                const isUnknown = !!row.isGradeUnknown || row.grade === 'غير معروف';
                const finalGrade = isUnknown ? 'غير معروف' : (row.grade || gradeOptions[0] || '');
                const finalSection = isUnknown ? '' : (row.section || '1');
                const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

                await addDoc(collection(db, 'link_submissions'), {
                    linkId: linkData.id,
                    studentName: row.studentName.trim(),
                    grade: finalGrade,
                    section: finalSection,
                    class: finalClass,
                    isGradeUnknown: isUnknown,
                    phone: row.phone || '',
                    customValues,
                    customFieldValue,
                    status: submissionStatus,
                    matchedStudentId: row.matchedStudentId || null,
                    batchGroupName: cleanGroupName || null,
                    createdAt: serverTimestamp()
                });

                if (submissionStatus === 'approved') {
                    await updateDoc(doc(db, 'registration_links', linkData.id), {
                        currentCount: increment(1)
                    }).catch(console.warn);
                }
            }

            toast.success(
                cleanGroupName
                    ? (wasExistingGroup
                        ? `تم إلحاق ${validRows.length} طالب بمجموعة "${cleanGroupName}" بنجاح`
                        : `تم تسجيل ${validRows.length} طالب في مجموعة "${cleanGroupName}" بنجاح`)
                    : "تم تسجيل جميع الطلاب بنجاح",
                { id: toastId }
            );
            const defaultGrade = gradeOptions[0] || '';
            const defaultSection = getSectionOptions(defaultGrade)[0] || '1';
            setRapidRows([
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' },
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' },
                { studentName: '', isGradeUnknown: false, grade: defaultGrade, section: defaultSection, customValues: {}, phone: '' }
            ]);
            setSmartPasteText('');
            setBatchGroupName('');
        } catch (err) {
            console.error("Rapid submit error:", err);
            toast.error("حدث خطأ أثناء الحفظ", { id: toastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Delete Submission (by delegate)
    const handleDeleteSubmission = async (sub) => {
        if (!window.confirm(`هل أنت متأكد من حذف اسم الطالب "${sub.studentName}"؟`)) return;
        try {
            await deleteDoc(doc(db, 'link_submissions', sub.id));
            if (sub.status === 'approved') {
                await updateDoc(doc(db, 'registration_links', linkData.id), {
                    currentCount: increment(-1)
                }).catch(console.warn);
            }
            toast.success("تم حذف الاسم بنجاح");
        } catch (err) {
            toast.error("فشل في الحذف: " + err.message);
        }
    };

    // Save Edited Submission
    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editingSub) return;
        try {
            const customValues = editingSub.customValues || {};
            const customFieldValue = Object.values(customValues).filter(Boolean).join(' | ') || editingSub.customFieldValue || '';

            const isUnknown = editingSub.grade === 'غير معروف' || !!editingSub.isGradeUnknown;
            const finalGrade = isUnknown ? 'غير معروف' : (editingSub.grade || '');
            const finalSection = isUnknown ? '' : (editingSub.section || '');
            const finalClass = isUnknown ? 'غير معروف' : `${finalGrade} / ${finalSection}`.trim();

            const rawEditGroup = (editingSub.batchGroupName || '').trim();
            const matchedEditGroup = rawEditGroup
                ? existingGroups.find(g => g.normName === normalizeGroupKey(rawEditGroup))
                : null;
            const finalGroupName = rawEditGroup ? (matchedEditGroup ? matchedEditGroup.name : rawEditGroup) : null;

            await updateDoc(doc(db, 'link_submissions', editingSub.id), {
                studentName: editingSub.studentName,
                grade: finalGrade,
                section: finalSection,
                class: finalClass,
                isGradeUnknown: isUnknown,
                customValues,
                customFieldValue,
                phone: editingSub.phone || '',
                batchGroupName: finalGroupName,
                status: editingSub.status,
                linkId: linkData.id,
                updatedAt: serverTimestamp()
            });
            toast.success("تم تحديث البيانات");
            setEditingSub(null);
        } catch (err) {
            console.error("Save edit error:", err);
            toast.error("فشل في الحفظ: " + err.message);
        }
    };

    // Early return: Loading
    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-slate-400">جاري تحميل صفحة التسجيل...</span>
                </div>
            </div>
        );
    }

    // Early return: Link Not Found
    if (notFound || !linkData) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 font-cairo text-right" dir="rtl">
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-4">
                    <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                        <AlertCircle size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-white">رابط التسجيل غير موجود</h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        عذراً، هذا الرابط غير متاح أو قد تم حذفه من قِبل إدارة النشاط المدرسي. يرجى التواصل مع رائد النشاط أو الطالب المفوض.
                    </p>
                </div>
            </div>
        );
    }

    // Early return: Passcode Screen
    if (!isPasscodeVerified && linkData.passcode) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4 font-cairo text-right" dir="rtl">
                <Toaster position="top-center" />
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl text-center space-y-6">
                    <AppLogo size="normal" className="justify-center" />
                    <div>
                        <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 mb-3">
                            <Lock size={28} />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">{linkData.title}</h2>
                        <p className="text-xs text-indigo-300 font-semibold">
                            إشراف الطالب: {linkData.delegateName}
                        </p>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        هذا الرابط محمي برمز مرور سري. يرجى إدخال الرمز الممنوح لك من الطالب المفوض للدخول.
                    </div>

                    <form onSubmit={handleVerifyPasscode} className="space-y-4">
                        <div>
                            <input
                                type="text"
                                required
                                autoFocus
                                placeholder="أدخل رمز المرور..."
                                value={enteredPasscode}
                                onChange={(e) => setEnteredPasscode(e.target.value)}
                                className="w-full text-center tracking-widest text-lg font-mono px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                            />
                            {passcodeError && (
                                <p className="text-xs text-rose-400 mt-2">{passcodeError}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-sm"
                        >
                            تأكيد والدخول
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-slate-950 text-white font-cairo text-right py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center overflow-y-auto" dir="rtl">
            <Toaster position="top-center" />

            <div className="max-w-3xl w-full space-y-6">
                {/* School & Brand Header */}
                <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-4 rounded-3xl shadow-xl backdrop-blur-md">
                    <AppLogo size="normal" />
                    <div className="text-left">
                        <span className="text-xs text-slate-400 block font-semibold">المملكة العربية السعودية</span>
                        <span className="text-xs font-bold text-white">{schoolInfo?.name || "وزارة التعليم"}</span>
                    </div>
                </div>

                {/* Campaign Main Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
                    <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 rounded-t-3xl" />

                    {/* Title & Subtitle */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                استمارة تسجيل مشاركة
                            </span>
                            {(linkData.specializations?.length > 0 || linkData.specialization) && (
                                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                    المجال: {Array.isArray(linkData.specializations) && linkData.specializations.length > 0
                                        ? linkData.specializations.map(s => typeof s === 'object' ? (s.name || s.id) : String(s)).join('، ')
                                        : (typeof linkData.specialization === 'object' ? (linkData.specialization?.name || '') : String(linkData.specialization || ''))}
                                </span>
                            )}
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                            {linkData.title}
                        </h1>

                        {linkData.eventTitle && (
                            <p className="text-xs text-indigo-400 font-semibold">
                                الفعالية المرتبطة: {linkData.eventTitle}
                            </p>
                        )}
                    </div>

                    {/* Delegate Card */}
                    <div className="bg-gradient-to-r from-indigo-950/40 via-slate-800/60 to-slate-900 p-4 rounded-2xl border border-indigo-900/40 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                                <Users size={22} />
                            </div>
                            <div>
                                <span className="text-[11px] text-slate-400 block font-semibold">إشراف وتنظيم الطالب المفوض</span>
                                <span className="text-sm font-bold text-white">{linkData.delegateName}</span>
                            </div>
                        </div>

                        {linkData.pointsPerStudent > 0 && (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold">
                                <Sparkles size={14} />
                                <span>+{linkData.pointsPerStudent} نقاط تميز لكل طالب</span>
                            </div>
                        )}
                    </div>

                    {/* Admin Instructions Box */}
                    {linkData.instructions && (
                        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-1">
                            <span className="font-bold text-indigo-300 block mb-1">تعليمات وشروط التسجيل:</span>
                            <p className="whitespace-pre-line">{linkData.instructions}</p>
                        </div>
                    )}

                    {/* Visual Capacity Bar */}
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                                <Users size={14} /> {hasMaxCap ? "الطاقة الاستيعابية للنشاط" : "المشاركون في النشاط"}
                            </span>
                            <span className="font-bold text-white">
                                {hasMaxCap ? (
                                    <span>{activeCount} من {maxCap} مقعد ({capacityPercent}%)</span>
                                ) : (
                                    <span>{activeCount} مسجل (مفتوح بدون حد أقصى)</span>
                                )}
                                {linkData.approvalMode === 'review' && pendingCount > 0 && (
                                    <span className="text-amber-400 font-normal mr-1 text-[11px]">
                                        ({approvedCount} معتمد، {pendingCount} قيد المراجعة)
                                    </span>
                                )}
                            </span>
                        </div>

                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                    !hasMaxCap
                                        ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                                        : capacityPercent >= 100 ? 'bg-rose-500' : capacityPercent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                                }`}
                                style={{ width: hasMaxCap ? `${capacityPercent}%` : '100%' }}
                            />
                        </div>

                        <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                            {hasMaxCap ? (
                                <span>المقاعد المتبقية: <strong className="text-indigo-400">{remainingSeats}</strong></span>
                            ) : (
                                <span className="text-emerald-400 font-semibold">التسجيل متاح لجميع الطلاب بدون حد أقصى</span>
                            )}
                            {isFull && canWaitlist && (
                                <span className="text-blue-400 font-semibold">متاح التسجيل في قائمة الانتظار</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Status Banners (Paused / Expired / Full) */}
                {isPaused ? (
                    <div className="bg-amber-950/40 border border-amber-800/50 p-6 rounded-3xl text-center space-y-2">
                        <AlertTriangle size={32} className="mx-auto text-amber-400" />
                        <h3 className="text-base font-bold text-amber-200">التسجيل موقوف مؤقتاً</h3>
                        <p className="text-xs text-amber-300/80">
                            تم إيقاف التسجيل في هذا الرابط مؤقتاً بواسطة إدارة النشاط. يرجى المراجعة لاحقاً.
                        </p>
                    </div>
                ) : isNotStarted ? (
                    <div className="bg-blue-950/40 border border-blue-800/50 p-6 rounded-3xl text-center space-y-2">
                        <Clock size={32} className="mx-auto text-blue-400" />
                        <h3 className="text-base font-bold text-blue-200">لم يبدأ التسجيل بعد</h3>
                        <p className="text-xs text-blue-300/80">
                            موعد بدء التسجيل المحدد: {new Date(linkData.startAt).toLocaleString('ar-SA')}
                        </p>
                    </div>
                ) : isExpired ? (
                    <div className="bg-rose-950/40 border border-rose-800/50 p-6 rounded-3xl text-center space-y-2">
                        <Clock size={32} className="mx-auto text-rose-400" />
                        <h3 className="text-base font-bold text-rose-200">انتهت فترة التسجيل</h3>
                        <p className="text-xs text-rose-300/80">
                            انتهت المدة الزمنية المحددة لاستقبال المشاركات في هذه الفعالية.
                        </p>
                    </div>
                ) : isFull && !canWaitlist ? (
                    <div className="bg-rose-950/40 border border-rose-800/50 p-6 rounded-3xl text-center space-y-2">
                        <AlertCircle size={32} className="mx-auto text-rose-400" />
                        <h3 className="text-base font-bold text-rose-200">اكتملت المقاعد المتاحة</h3>
                        <p className="text-xs text-rose-300/80">
                            نعتذر، لقد تم حجز جميع المقاعد المحددة لهذا النشاط بالكامل.
                        </p>
                    </div>
                ) : (
                    /* Entry Section */
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                        {/* Waitlist Warning Banner */}
                        {isFull && canWaitlist && (
                            <div className="bg-blue-950/40 border border-blue-800/60 p-4 rounded-2xl flex items-center gap-3 text-blue-300 text-xs">
                                <Clock size={20} className="shrink-0 text-blue-400" />
                                <div>
                                    <strong className="block font-bold">تنبيه: المقاعد الأساسية مكتملة</strong>
                                    <span>سيتم إدراج تسجيلك في قائمة الانتظار، وسيتم قبولك في حال اعتذار أي مشارك.</span>
                                </div>
                            </div>
                        )}

                        {/* Mode Selector Tabs */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus size={18} className="text-indigo-400" />
                                <span>إدخال بيانات الطلاب</span>
                            </h2>

                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                                <button
                                    onClick={() => setEntryMode('single')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        entryMode === 'single'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    إدخال تفصيلي فردي
                                </button>
                                <button
                                    onClick={() => setEntryMode('rapid')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        entryMode === 'rapid'
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    وضع الإدخال السريع المتعدد
                                </button>
                            </div>
                        </div>

                        {/* Mode 1: Single Entry Form */}
                        {entryMode === 'single' && (
                            <form onSubmit={(e) => handleSaveSingle(e, false)} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        اسم الطالب الثلاثي / الرباعي <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="مثال: خالد عبد العزيز الشمري"
                                        value={singleForm.studentName}
                                        onChange={(e) => setSingleForm({ ...singleForm, studentName: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                {/* Option: الصف غير معروف (بين خانة الاسم والصف) */}
                                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={!!singleForm.isGradeUnknown}
                                            onChange={(e) => {
                                                const isUnknown = e.target.checked;
                                                setSingleForm(prev => ({
                                                    ...prev,
                                                    isGradeUnknown: isUnknown,
                                                    grade: isUnknown ? 'غير معروف' : (prev.grade === 'غير معروف' ? (gradeOptions[0] || '') : prev.grade || gradeOptions[0] || ''),
                                                    section: isUnknown ? '' : (prev.section || getSectionOptions(gradeOptions[0] || '')[0] || '1')
                                                }));
                                            }}
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                        />
                                        <div>
                                            <span className="text-xs font-bold text-slate-200 block">
                                                الصف غير معروف
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                                حدد هذا الخيار إذا لم تكن متأكداً من صف الطالب أو تعذر تحديده حالياً
                                            </span>
                                        </div>
                                    </label>
                                    {singleForm.isGradeUnknown && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full font-bold">
                                            صف غير معروف
                                        </span>
                                    )}
                                </div>

                                {singleForm.isGradeUnknown ? (
                                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
                                        <span>⚠️ تم تعيين الصف كـ <strong>غير معروف</strong>. لا يلزم اختيار الصف أو الشعبة.</span>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                                الصف الدراسي <span className="text-rose-400">*</span>
                                            </label>
                                            <select
                                                value={singleForm.grade}
                                                onChange={(e) => {
                                                    const newGrade = e.target.value;
                                                    const firstSec = getSectionOptions(newGrade)[0] || '1';
                                                    setSingleForm({ ...singleForm, grade: newGrade, section: firstSec });
                                                }}
                                                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                            >
                                                {gradeOptions.map(g => (
                                                    <option key={g} value={g}>{g}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                                الشعبة <span className="text-rose-400">*</span>
                                            </label>
                                            <select
                                                value={singleForm.section}
                                                onChange={(e) => setSingleForm({ ...singleForm, section: e.target.value })}
                                                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                            >
                                                {getSectionOptions(singleForm.grade).map(sec => (
                                                    <option key={sec} value={sec}>شعبة {sec}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Dynamic Custom Fields for Single Mode */}
                                {customFields.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {customFields.map((field) => (
                                            field.isFixed && field.fixedValue ? (
                                                <div key={field.id} className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 flex flex-col justify-center">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-xs font-semibold text-amber-300">
                                                            {field.label}
                                                        </label>
                                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                                            قيمة موحدة مسبقاً
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-white">
                                                        {field.fixedValue}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div key={field.id}>
                                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                                        {field.label} {field.required ? <span className="text-rose-400 mr-1">*</span> : <span className="text-slate-500 font-normal mr-1">(اختياري)</span>}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        required={field.required}
                                                        placeholder={`أدخل ${field.label}...`}
                                                        value={singleForm.customValues?.[field.id] || ''}
                                                        onChange={(e) => setSingleForm({
                                                            ...singleForm,
                                                            customValues: { ...(singleForm.customValues || {}), [field.id]: e.target.value }
                                                        })}
                                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                                    />
                                                </div>
                                            )
                                        ))}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                                        رقم الجوال للتواصل (اختياري)
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="05xxxxxxxx"
                                        value={singleForm.phone}
                                        onChange={(e) => setSingleForm({ ...singleForm, phone: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                                    />
                                </div>

                                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={(e) => handleSaveSingle(e, true)}
                                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                                    >
                                        <Plus size={16} />
                                        <span>حفظ وإضافة طالب آخر</span>
                                    </button>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-xs flex items-center justify-center gap-2"
                                    >
                                        <Save size={16} />
                                        <span>{isSubmitting ? "جاري الحفظ..." : "حفظ وإنهاء"}</span>
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Mode 2: Rapid Multi-row Entry */}
                        {entryMode === 'rapid' && (
                            <div className="space-y-4">
                                {/* صندوق اللصق والادخال الذكي المجمع مع التعرف التلقائي على الفصول */}
                                <div className="bg-gradient-to-br from-indigo-950/40 via-slate-900/95 to-slate-950/95 border-2 border-indigo-500/30 rounded-3xl p-4 sm:p-5 shadow-2xl relative overflow-hidden space-y-3.5">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

                                    {/* رأس الصندوق */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                                                <Sparkles size={20} className="animate-pulse" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                                                        الادخال واللصق الذكي المجمع للأسماء
                                                    </h3>
                                                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                                                        ⚡ يتعرف على الفصول والشعب فورياً
                                                    </span>
                                                </div>
                                                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed">
                                                    الصق أسماء الطلاب دفعة واحدة (من الواتساب، إكسل، أو كشف مرقم) وسيتعرف النظام عليهم ويعبئ فصولهم وشعبهم تلقائياً.
                                                </p>
                                            </div>
                                        </div>

                                        {/* الأزرار العلوية */}
                                        <div className="flex items-center gap-2 self-end sm:self-center">
                                            <button
                                                type="button"
                                                onClick={handlePasteFromClipboard}
                                                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
                                                title="قراءة الأسماء مباشرة من الحافظة وتعبئة الجدول فورياً"
                                            >
                                                <Clipboard size={14} />
                                                <span>📋 لصق فوري من الحافظة</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsSmartPasteExpanded(!isSmartPasteExpanded)}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors"
                                                title={isSmartPasteExpanded ? "تصغير المربع" : "توسيع المربع"}
                                            >
                                                {isSmartPasteExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* حقل تسمية المجموعة / الدفعة الحالية */}
                                    <div className="bg-slate-950/85 border border-indigo-500/30 rounded-2xl p-3.5 space-y-2.5 relative z-10">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <label className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                                                <Layers size={15} className="text-indigo-400 shrink-0" />
                                                <span>اسم المجموعة / الدفعة لهذه الأسماء (اختياري):</span>
                                            </label>
                                            <span className="text-[10px] text-slate-400">
                                                لتسهيل فرزهم واعتمادهم معاً (إذا اخترت اسم مجموعة موجودة سيُضافون لنفس المجموعة)
                                            </span>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                            <div className="relative flex-1">
                                                <Tag size={14} className="absolute right-3 top-2.5 text-slate-400" />
                                                <input
                                                    type="text"
                                                    value={batchGroupName}
                                                    onChange={(e) => setBatchGroupName(e.target.value)}
                                                    placeholder="مثال: ص 1 ، ص 2 ، صفحة 1 ، مجموعة أ ..."
                                                    className={`w-full pr-9 pl-8 py-2 bg-slate-900 border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                                                        matchingExistingGroup
                                                            ? 'border-amber-500/80 focus:border-amber-400 bg-amber-950/20'
                                                            : batchGroupName.trim()
                                                            ? 'border-emerald-500/60 focus:border-emerald-400'
                                                            : 'border-slate-700 focus:border-indigo-500'
                                                    }`}
                                                />
                                                {batchGroupName && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setBatchGroupName('')}
                                                        className="absolute left-2.5 top-2.5 text-slate-400 hover:text-white"
                                                        title="مسح اسم المجموعة"
                                                    >
                                                        <X size={13} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* اقتراحات سريعة لاسم المجموعة */}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[10px] text-slate-400 ml-1">اختيار سريع:</span>
                                                {['ص 1', 'ص 2', 'ص 3', 'ص 4', 'مجموعة 1', 'مجموعة 2'].map(preset => {
                                                    const normPreset = normalizeGroupKey(preset);
                                                    const existingMatch = existingGroups.find(g => g.normName === normPreset);
                                                    const isSelected = normalizeGroupKey(batchGroupName) === normPreset;
                                                    return (
                                                        <button
                                                            key={preset}
                                                            type="button"
                                                            onClick={() => setBatchGroupName(isSelected ? '' : (existingMatch ? existingMatch.name : preset))}
                                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${
                                                                isSelected
                                                                    ? (existingMatch
                                                                        ? 'bg-amber-600 border-amber-400 text-white shadow-sm'
                                                                        : 'bg-indigo-600 border-indigo-400 text-white shadow-sm')
                                                                    : existingMatch
                                                                    ? 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-700/60 text-amber-300'
                                                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                                            }`}
                                                            title={existingMatch ? `المجموعة "${existingMatch.name}" موجودة (${existingMatch.count} طلاب) — اضغط لإلحاق طلاب جدد بها` : `تسمية الدفعة "${preset}"`}
                                                        >
                                                            <span>{preset}</span>
                                                            {existingMatch && (
                                                                <span className="text-[9px] opacity-90 font-mono">
                                                                    (+{existingMatch.count})
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* تنبيه فوري بأن الطلاب سينضافون لنفس المجموعة الموجودة لأن الاسم مطابق */}
                                        {matchingExistingGroup && (
                                            <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl p-2.5 flex items-center gap-2 text-xs text-amber-200 animate-in fade-in">
                                                <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                                                <span>
                                                    🔔 تنبيه: اسم المجموعة <strong>"{matchingExistingGroup.name}"</strong> مطابق لمجموعة موجودة مسبقاً في هذا الرابط وتضم حالياً <strong>({matchingExistingGroup.count} طلاب)</strong> — سيتم <strong>إضافة الطلاب الجدد إلى نفس هذه المجموعة</strong> مباشرة.
                                                </span>
                                            </div>
                                        )}

                                        {/* عرض المجموعات المسجلة مسبقاً في الرابط لمعرفة ما تم إنجازه أو الضغط عليها للإلحاق بها */}
                                        {existingGroups.length > 0 && (
                                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-800/80">
                                                <span className="text-[10px] text-slate-400">المجموعات المضافة بالرابط حالياً (اضغط للإلحاق بها):</span>
                                                {existingGroups.map(g => {
                                                    const isSelected = normalizeGroupKey(batchGroupName) === g.normName;
                                                    return (
                                                        <button
                                                            key={g.normName}
                                                            type="button"
                                                            onClick={() => setBatchGroupName(isSelected ? '' : g.name)}
                                                            className={`text-[10px] px-2 py-0.5 rounded-md border font-bold flex items-center gap-1 transition-all ${
                                                                isSelected ? g.theme.pillActive : g.theme.badge
                                                            }`}
                                                            title={`اضغط لإضافة طلاب جدد إلى مجموعة "${g.name}"`}
                                                        >
                                                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : g.theme.dot}`} />
                                                            <span>{g.name}</span>
                                                            <span className="opacity-75 font-mono">({g.count})</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* مربع النص والتحليل الذكي */}
                                    {isSmartPasteExpanded && (
                                        <div className="space-y-3 relative z-10 pt-1">
                                            <div className="relative">
                                                <textarea
                                                    rows={4}
                                                    value={smartPasteText}
                                                    onChange={(e) => setSmartPasteText(e.target.value)}
                                                    placeholder={`الصق قائمة الطلاب هنا...\nمثال:\n1- محمد أحمد علي الزهراني\n2- خالد عبدالله القحطاني\n• سعد فهد العتيبي (ثاني ثانوي 1)\nعبدالعزيز صالح`}
                                                    className="w-full px-3.5 py-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans transition-all resize-y min-h-[90px]"
                                                    dir="rtl"
                                                />
                                            </div>

                                            {/* إحصائيات التعرف والإجراءات */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                                                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                                    {smartAnalysisStats.total > 0 ? (
                                                        <>
                                                            <span className="px-2.5 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 font-medium">
                                                                تم رصد <strong className="text-white font-mono">{smartAnalysisStats.total}</strong> اسم
                                                            </span>
                                                            <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium flex items-center gap-1">
                                                                <CheckCircle2 size={12} className="text-emerald-400" />
                                                                <strong className="font-mono">{smartAnalysisStats.matched}</strong> مطابق بالسجل
                                                            </span>
                                                            {smartAnalysisStats.unmatched > 0 && (
                                                                <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1">
                                                                    <AlertCircle size={12} className="text-amber-400" />
                                                                    <strong className="font-mono">{smartAnalysisStats.unmatched}</strong> غير مسجل
                                                                </span>
                                                            )}
                                                            {smartAnalysisStats.withInlineClass > 0 && (
                                                                <span className="px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-medium flex items-center gap-1">
                                                                    <Sparkles size={12} className="text-indigo-400" />
                                                                    <strong className="font-mono">{smartAnalysisStats.withInlineClass}</strong> فصل مستنتج من النص
                                                                </span>
                                                            )}
                                                            {smartAnalysisStats.cleanedNoiseCount > 0 && (
                                                                <span className="px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-medium flex items-center gap-1" title="تم استبعاد نصوص إضافية ليست جزءاً من اسم الطالب أو شعبته">
                                                                    <span>🧹 تم تنظيف نصوص زائدة ({smartAnalysisStats.cleanedNoiseCount})</span>
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400">
                                                            💡 يفهم جميع الصيغ (ثاني ثانوي 1، 2/3، ٢٠٤، شعبة ب، قوائم الفصول، الواتساب، والإكسل) ويتجاهل النصوص الزائدة تلقائياً.
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {smartPasteText.trim().length > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSmartPasteText('')}
                                                            className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl bg-slate-800/60 hover:bg-slate-800 transition-colors"
                                                        >
                                                            مسح
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApplySmartPaste()}
                                                        disabled={!smartPasteText.trim()}
                                                        className="flex-1 sm:flex-none px-4 py-2 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        <Zap size={14} className="fill-current" />
                                                        <span>تعبئة وتحديث الجدول ({smartAnalysisStats.total || 0})</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* معاينة فورية ذكية للأسماء والفصول المستخرجة قبل التعبئة */}
                                            {smartAnalysisStats.candidates.length > 0 && (
                                                <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-2.5 space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar">
                                                    <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pb-1 border-b border-slate-800/80">
                                                        <span className="font-bold text-indigo-300">🔍 معاينة التحليل الذكي ({smartAnalysisStats.candidates.length} طالب):</span>
                                                        <span>اضغط &quot;تعبئة وتحديث الجدول&quot; لاعتمادهم بالجدول أدناه</span>
                                                    </div>
                                                    {smartAnalysisStats.candidates.map((cand, cIdx) => {
                                                        const matchedStu = cand.matchResult?.student;
                                                        return (
                                                            <div
                                                                key={cIdx}
                                                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] flex-wrap"
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-[10px] font-mono text-slate-500 w-4 text-center shrink-0">
                                                                        {cIdx + 1}
                                                                    </span>
                                                                    <span className="font-bold text-white truncate">
                                                                        {matchedStu ? matchedStu.name : cand.rawName}
                                                                    </span>
                                                                    {matchedStu && normalizeArabic(matchedStu.name) !== normalizeArabic(cand.rawName) && (
                                                                        <span className="text-[10px] text-slate-400 truncate">
                                                                            (بالنص: {cand.rawName})
                                                                        </span>
                                                                    )}
                                                                    {cand.ignoredNoise && (
                                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700" title="نص إضافي تم تجاهله حتى لا يؤثر على الاسم أو الشعبة">
                                                                            تجاهل: {cand.ignoredNoise}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                                                                        cand.classSource === 'db'
                                                                            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                                                            : cand.classSource === 'text'
                                                                            ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300'
                                                                            : 'bg-slate-800 border-slate-700 text-slate-300'
                                                                    }`}>
                                                                        {cand.resolvedGrade} - شعبة {cand.resolvedSection}
                                                                    </span>
                                                                    {matchedStu ? (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                                                                            ✓ بالسجل
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold">
                                                                            جديد
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* شريط التحكم الجماعي لتعيين / إلغاء الصف غير معروف */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/80 border border-slate-800 p-3 rounded-2xl">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-300">
                                            التحكم السريع بحالة الصفوف:
                                        </span>
                                        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border transition-colors ${
                                            rapidRows.some(r => r.isGradeUnknown)
                                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>
                                            {rapidRows.filter(r => r.isGradeUnknown).length} من {rapidRows.length} غير معروف
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSetAllRapidUnknown}
                                            className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 text-amber-300 border border-amber-500/40 shadow-sm"
                                            title="جعل صف جميع الطلاب الحاليين غير معروف"
                                        >
                                            <HelpCircle size={14} className="shrink-0" />
                                            <span>تحديد الكل كصف غير معروف</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleClearAllRapidUnknown}
                                            className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 shadow-sm"
                                            title="إلغاء غير معروف واستعادة الصفوف لجميع الطلاب"
                                        >
                                            <RotateCcw size={14} className="shrink-0" />
                                            <span>إلغاء غير معروف للكل</span>
                                        </button>
                                    </div>
                                </div>

                                {/* الشريط الثابت العلوي: زر إضافة سطر ومؤشرات الأسطر المعبأة والفارغة */}
                                <div className="sticky top-2 sm:top-4 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-2.5 sm:p-3 rounded-2xl shadow-xl shadow-black/40 flex flex-wrap items-center justify-between gap-2.5">
                                    {/* أزرار الإضافة السريعة */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(1)}
                                            className="px-3.5 py-1.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-1.5 transition-all"
                                            title="إضافة سطر طالب جديد"
                                        >
                                            <Plus size={15} className="stroke-[2.5]" />
                                            <span>إضافة سطر</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(5)}
                                            className="px-2.5 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all"
                                            title="إضافة 5 أسطر دفعة واحدة"
                                        >
                                            +5 أسطر
                                        </button>

                                        {emptyRapidRows > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleRemoveEmptyRapidRows}
                                                className="px-2.5 py-1.5 sm:py-2 bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
                                                title="حذف جميع الأسطر الفارغة"
                                            >
                                                <Trash2 size={13} />
                                                <span>حذف الفاضي ({emptyRapidRows})</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* عدادات الأسطر: الإجمالي، المليانين، الفاضيين */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        {/* الإجمالي */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-300" title="إجمالي عدد الأسطر">
                                            <span className="text-slate-400 text-[11px]">الأسطر:</span>
                                            <span className="font-bold text-white font-mono text-xs">{totalRapidRows}</span>
                                        </div>

                                        {/* المليانين */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300" title="عدد الأسطر التي تم إدخال اسم الطالب بها">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                                            <span className="text-[11px]">مليان:</span>
                                            <span className="font-bold font-mono text-xs text-emerald-200">{filledRapidRows}</span>
                                        </div>

                                        {/* الفاضيين */}
                                        <div className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 border rounded-xl transition-colors ${
                                            emptyRapidRows > 0
                                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                                : 'bg-slate-950/50 border-slate-800 text-slate-500'
                                        }`} title="عدد الأسطر الفارغة">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${emptyRapidRows > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`}></span>
                                            <span className="text-[11px]">فاضي:</span>
                                            <span className={`font-bold font-mono text-xs ${emptyRapidRows > 0 ? 'text-amber-200' : 'text-slate-500'}`}>{emptyRapidRows}</span>
                                        </div>

                                        {/* حفظ سريع مباشر من الشريط الثابت */}
                                        <button
                                            type="button"
                                            disabled={isSubmitting || filledRapidRows === 0}
                                            onClick={handleSaveRapid}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all disabled:opacity-40"
                                            title="حفظ الأسطر المكتملة الآن"
                                        >
                                            <Save size={14} />
                                            <span>
                                                {batchGroupName.trim()
                                                    ? (matchingExistingGroup
                                                        ? `إلحاق بمجموعة "${matchingExistingGroup.name}" (${filledRapidRows})`
                                                        : `حفظ في "${batchGroupName.trim()}" (${filledRapidRows})`)
                                                    : `حفظ (${filledRapidRows})`}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    {rapidRows.map((row, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-slate-800/50 p-2.5 rounded-2xl border border-slate-800 flex-wrap sm:flex-nowrap">
                                            <span className="text-xs text-slate-500 font-mono w-6 text-center shrink-0">
                                                {idx + 1}
                                            </span>

                                            <div className="flex-2 min-w-[150px] flex flex-col gap-1">
                                                <input
                                                    type="text"
                                                    placeholder="اسم الطالب..."
                                                    value={row.studentName}
                                                    onChange={(e) => {
                                                        const updated = [...rapidRows];
                                                        const newName = e.target.value;
                                                        updated[idx].studentName = newName;
                                                        const inlineParsed = parsePastedStudentsText(newName)[0];
                                                        const matchRes = findBestStudentMatch(
                                                            inlineParsed?.rawName || newName,
                                                            inlineParsed?.inlineGradeLevel ?? null,
                                                            inlineParsed?.inlineSectionHint || ''
                                                        );
                                                        if (matchRes?.student) {
                                                            updated[idx].matchedStudentId = matchRes.student.id;
                                                            updated[idx].matchedStudentName = matchRes.student.name;
                                                            const { grade, section } = resolveGradeAndSection(
                                                                matchRes.student,
                                                                inlineParsed?.inlineGradeHint,
                                                                inlineParsed?.inlineSectionHint,
                                                                inlineParsed?.inlineGradeLevel ?? null
                                                            );
                                                            if (!updated[idx].isGradeUnknown) {
                                                                updated[idx].grade = grade;
                                                                updated[idx].section = section;
                                                            }
                                                        } else {
                                                            updated[idx].matchedStudentId = null;
                                                            updated[idx].matchedStudentName = null;
                                                            if (inlineParsed && (inlineParsed.inlineGradeLevel !== null || inlineParsed.inlineSectionHint) && !updated[idx].isGradeUnknown) {
                                                                const { grade, section } = resolveGradeAndSection(
                                                                    null,
                                                                    inlineParsed.inlineGradeHint,
                                                                    inlineParsed.inlineSectionHint,
                                                                    inlineParsed.inlineGradeLevel
                                                                );
                                                                updated[idx].grade = grade;
                                                                updated[idx].section = section;
                                                            }
                                                        }
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                />
                                                {row.matchedStudentId ? (
                                                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold px-1">
                                                        <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
                                                        <span>مطابق بالسجل ({row.grade} / {row.section})</span>
                                                    </div>
                                                ) : (row.studentName && row.studentName.trim().length > 0) ? (
                                                    <div className="flex items-center gap-1 text-[10px] text-amber-400/80 font-medium px-1">
                                                        <AlertCircle size={11} className="shrink-0 text-amber-400" />
                                                        <span>اسم جديد</span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            {/* خيار الصف غير معروف بين خانة الاسم والصف */}
                                            <label
                                                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-semibold cursor-pointer shrink-0 select-none transition-all ${
                                                    row.isGradeUnknown
                                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                                        : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-slate-200'
                                                }`}
                                                title="الصف غير معروف لهذا الطالب"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!row.isGradeUnknown}
                                                    onChange={(e) => {
                                                        const isUnknown = e.target.checked;
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            isGradeUnknown: isUnknown,
                                                            grade: isUnknown ? 'غير معروف' : (gradeOptions[0] || ''),
                                                            section: isUnknown ? '' : (getSectionOptions(gradeOptions[0] || '')[0] || '1')
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                                />
                                                <span>الصف غير معروف</span>
                                            </label>

                                            {row.isGradeUnknown ? (
                                                <div className="w-28 px-2 py-2 bg-amber-950/30 border border-amber-600/30 rounded-xl text-[11px] text-amber-300 text-center font-bold">
                                                    غير معروف
                                                </div>
                                            ) : (
                                                <select
                                                    value={row.grade || gradeOptions[0]}
                                                    onChange={(e) => {
                                                        const newGrade = e.target.value;
                                                        const availableSections = getSectionOptions(newGrade);
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            grade: newGrade,
                                                            section: availableSections[0] || '1'
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-28 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                >
                                                    {gradeOptions.map(g => (
                                                        <option key={g} value={g}>{g}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {row.isGradeUnknown ? (
                                                <div className="w-24 px-2 py-2 bg-slate-900/40 border border-dashed border-slate-700 rounded-xl text-xs text-slate-500 text-center">
                                                    -
                                                </div>
                                            ) : (
                                                <select
                                                    value={row.section || getSectionOptions(row.grade || gradeOptions[0])[0] || '1'}
                                                    onChange={(e) => {
                                                        const updated = [...rapidRows];
                                                        updated[idx] = {
                                                            ...updated[idx],
                                                            section: e.target.value
                                                        };
                                                        setRapidRows(updated);
                                                    }}
                                                    className="w-24 px-2 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white text-center"
                                                >
                                                    {getSectionOptions(row.grade || gradeOptions[0]).map(sec => (
                                                        <option key={sec} value={sec}>شعبة {sec}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {customFields.map((field) => (
                                                field.isFixed && field.fixedValue ? (
                                                    <div
                                                        key={field.id}
                                                        className="flex items-center px-3 py-2 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300 min-w-[110px]"
                                                        title={`${field.label}: ${field.fixedValue} (قيمة موحدة مسبقاً)`}
                                                    >
                                                        <span className="truncate font-semibold">{field.fixedValue}</span>
                                                    </div>
                                                ) : (
                                                    <input
                                                        key={field.id}
                                                        type="text"
                                                        placeholder={`${field.label}${field.required ? ' *' : ''}`}
                                                        value={row.customValues?.[field.id] || ''}
                                                        onChange={(e) => {
                                                            const updated = [...rapidRows];
                                                            updated[idx].customValues = {
                                                                ...(updated[idx].customValues || {}),
                                                                [field.id]: e.target.value
                                                            };
                                                            setRapidRows(updated);
                                                        }}
                                                        className="flex-1 min-w-[110px] px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white"
                                                    />
                                                )
                                            ))}

                                            {rapidRows.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setRapidRows(rapidRows.filter((_, i) => i !== idx))}
                                                    className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(1)}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            <Plus size={14} />
                                            <span>إضافة سطر جديد</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleAddRapidRow(5)}
                                            className="px-3 py-2 bg-slate-800/60 hover:bg-slate-700 border border-slate-700/80 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                                            title="إضافة 5 أسطر جديدة دفعة واحدة"
                                        >
                                            +5 أسطر
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={handleSaveRapid}
                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-50"
                                    >
                                        <Save size={16} />
                                        <span>
                                            {isSubmitting
                                                ? "جاري الحفظ..."
                                                : batchGroupName.trim()
                                                ? (matchingExistingGroup
                                                    ? `حفظ وإلحاق بمجموعة "${matchingExistingGroup.name}" (${filledRapidRows})`
                                                    : `حفظ الكل في مجموعة "${batchGroupName.trim()}" (${filledRapidRows})`)
                                                : `حفظ الكل دفعة واحدة (${filledRapidRows})`}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom Section: Submissions by this delegate */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
                        <h3 className="font-bold text-white text-base flex items-center gap-2">
                            <Users size={18} className="text-indigo-400" />
                            <span>الأسماء المسجلة عبر هذا الرابط ({submissions.length})</span>
                        </h3>
                        <span className="text-xs text-slate-400">
                            يمكنك تعديل أو حذف أي اسم قمت بإدخاله طالما أن التسجيل نشط
                        </span>
                    </div>

                    {/* فلاتر المجموعات (إذا تم إدخال مجموعات في هذا الرابط) */}
                    {existingGroups.length > 0 && (
                        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                                    <Layers size={14} className="text-indigo-400" />
                                    <span>تصفية الأسماء حسب المجموعة:</span>
                                </span>
                                {publicGroupFilter !== 'all' && (
                                    <button
                                        type="button"
                                        onClick={() => setPublicGroupFilter('all')}
                                        className="text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                                    >
                                        عرض كل المجموعات
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setPublicGroupFilter('all')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                        publicGroupFilter === 'all'
                                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                                            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                                    }`}
                                >
                                    الكل ({submissions.length})
                                </button>
                                {existingGroups.map(g => {
                                    const isActive = publicGroupFilter === g.normName;
                                    return (
                                        <button
                                            key={g.normName}
                                            type="button"
                                            onClick={() => setPublicGroupFilter(isActive ? 'all' : g.normName)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                                                isActive ? g.theme.pillActive : g.theme.pillInactive
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : g.theme.dot}`} />
                                            <span>{g.name}</span>
                                            <span className="font-mono text-[11px] opacity-85">({g.count})</span>
                                        </button>
                                    );
                                })}
                                {submissions.some(s => !(s.batchGroupName || '').trim()) && (
                                    <button
                                        type="button"
                                        onClick={() => setPublicGroupFilter(publicGroupFilter === '__ungrouped__' ? 'all' : '__ungrouped__')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                                            publicGroupFilter === '__ungrouped__'
                                                ? 'bg-slate-600 text-white border-slate-400'
                                                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
                                        }`}
                                    >
                                        بدون مجموعة ({submissions.filter(s => !(s.batchGroupName || '').trim()).length})
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {filteredPublicSubmissions.length === 0 ? (
                        <div className="text-center py-10 text-slate-500 text-xs">
                            لم يتم تسجيل أي أسماء حتى الآن. استخدم النموذج أعلاه لبدء التسجيل.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredPublicSubmissions.map((sub, idx) => {
                                const subGroupRaw = (sub.batchGroupName || '').trim();
                                const subGroupNorm = normalizeGroupKey(subGroupRaw);
                                const prevGroupNorm = idx > 0 ? normalizeGroupKey((filteredPublicSubmissions[idx - 1].batchGroupName || '').trim()) : null;
                                const isFirstInGroup = existingGroups.length > 0 && subGroupNorm !== prevGroupNorm;
                                const groupTheme = subGroupNorm ? (groupThemeByNorm[subGroupNorm] || GROUP_COLOR_THEMES[0]) : null;
                                const groupObj = subGroupNorm ? existingGroups.find(g => g.normName === subGroupNorm) : null;

                                return (
                                    <div key={sub.id} className="space-y-2">
                                        {isFirstInGroup && (
                                            <div className={`px-3.5 py-2 rounded-xl border flex items-center justify-between text-xs font-bold mt-2 ${
                                                groupTheme
                                                    ? groupTheme.headerBg
                                                    : 'bg-slate-800/60 border-slate-700 text-slate-300'
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    <Layers size={14} />
                                                    <span>
                                                        {subGroupRaw ? `مجموعة: ${subGroupRaw}` : 'طلاب مسجلون بشكل فردي (بدون مجموعة)'}
                                                    </span>
                                                </div>
                                                <span className="text-[11px] font-mono opacity-85">
                                                    {subGroupRaw && groupObj ? `${groupObj.count} طلاب` : `${submissions.filter(s => !(s.batchGroupName || '').trim()).length} طلاب`}
                                                </span>
                                            </div>
                                        )}

                                        <div
                                            className={`bg-slate-800/60 border border-slate-800 p-3 rounded-2xl flex items-center justify-between gap-3 flex-wrap ${
                                                groupTheme ? groupTheme.cardBorder : ''
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-slate-500 font-mono w-5 text-center">
                                                    {idx + 1}
                                                </span>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h4 className="font-bold text-white text-sm">{sub.studentName}</h4>
                                                        {subGroupRaw && groupTheme && (
                                                            <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold flex items-center gap-1 ${groupTheme.badge}`}>
                                                                <Tag size={10} />
                                                                <span>مجموعة: {subGroupRaw}</span>
                                                            </span>
                                                        )}
                                                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                                                            sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                                ? 'bg-amber-950/60 text-amber-300 border border-amber-600/30'
                                                                : 'bg-slate-900 text-slate-300'
                                                        }`}>
                                                            {sub.grade === 'غير معروف' || !sub.grade || sub.isGradeUnknown
                                                                ? 'الصف غير معروف'
                                                                : `${typeof sub.grade === 'object' ? (sub.grade?.name || '') : sub.grade} - شعبة ${typeof sub.section === 'object' ? (sub.section?.name || '') : (sub.section || '1')}`
                                                            }
                                                        </span>
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                                            sub.status === 'approved'
                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                : sub.status === 'waitlist'
                                                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                        }`}>
                                                            {sub.status === 'approved' ? 'معتمد' : sub.status === 'waitlist' ? 'قائمة انتظار' : 'بانتظار الاعتماد'}
                                                        </span>
                                                    </div>
                                                    {/* Custom Fields Badges */}
                                                    {customFields.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                                            {customFields.map((f) => {
                                                                const val = sub.customValues?.[f.id] || (f.id === 'f_legacy' ? sub.customFieldValue : '');
                                                                if (!val) return null;
                                                                const displayVal = typeof val === 'object' ? (val.name || val.label || JSON.stringify(val)) : String(val);
                                                                return (
                                                                    <span key={f.id} className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-indigo-300">
                                                                        <span className="text-slate-400">{f.label}: </span>
                                                                        {displayVal}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Edit / Delete (Allowed if link is active) */}
                                            {!isExpired && !isPaused && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => setEditingSub(sub)}
                                                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                                        title="تعديل"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSubmission(sub)}
                                                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                        title="حذف"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Edit Modal */}
                {editingSub && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-right space-y-4" dir="rtl">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h3 className="font-bold text-white text-base">تعديل بيانات الطالب</h3>
                                <button onClick={() => setEditingSub(null)} className="text-slate-400 hover:text-white">
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleSaveEdit} className="space-y-3">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">اسم الطالب</label>
                                    <input
                                        type="text"
                                        required
                                        value={editingSub.studentName}
                                        onChange={(e) => setEditingSub({ ...editingSub, studentName: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">اسم المجموعة / الدفعة (اختياري)</label>
                                    <input
                                        type="text"
                                        placeholder="مثال: ص 1"
                                        value={editingSub.batchGroupName || ''}
                                        onChange={(e) => setEditingSub({ ...editingSub, batchGroupName: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                    />
                                </div>

                                {/* Option: الصف غير معروف */}
                                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between">
                                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={editingSub.grade === 'غير معروف' || !!editingSub.isGradeUnknown}
                                            onChange={(e) => {
                                                const isUnknown = e.target.checked;
                                                setEditingSub({
                                                    ...editingSub,
                                                    isGradeUnknown: isUnknown,
                                                    grade: isUnknown ? 'غير معروف' : (editingSub.grade === 'غير معروف' ? (gradeOptions[0] || '') : editingSub.grade || gradeOptions[0] || ''),
                                                    section: isUnknown ? '' : (editingSub.section || '1')
                                                });
                                            }}
                                            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                                        />
                                        <span>الصف غير معروف</span>
                                    </label>
                                    {(editingSub.grade === 'غير معروف' || editingSub.isGradeUnknown) && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
                                            صف غير معروف
                                        </span>
                                    )}
                                </div>

                                {editingSub.grade === 'غير معروف' || editingSub.isGradeUnknown ? (
                                    <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300">
                                        ⚠️ تم تحديد الصف والشعبة كـ: <strong>غير معروف</strong>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">الصف</label>
                                            <select
                                                value={editingSub.grade || gradeOptions[0] || ''}
                                                onChange={(e) => {
                                                    const newGrade = e.target.value;
                                                    const secs = getSectionOptions(newGrade);
                                                    const currentSec = String(editingSub.section || '').trim();
                                                    const nextSec = secs.includes(currentSec) ? currentSec : (secs[0] || '1');
                                                    setEditingSub({ ...editingSub, grade: newGrade, section: nextSec });
                                                }}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                                            >
                                                {(() => {
                                                    const currentG = String(editingSub.grade || '').trim();
                                                    const allG = currentG && currentG !== 'غير معروف' && !gradeOptions.includes(currentG)
                                                        ? [currentG, ...gradeOptions]
                                                        : gradeOptions;
                                                    return allG.map(g => (
                                                        <option key={g} value={g}>{g}</option>
                                                    ));
                                                })()}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-400 mb-1">الشعبة</label>
                                            <select
                                                value={editingSub.section || getSectionOptions(editingSub.grade || gradeOptions[0])[0] || '1'}
                                                onChange={(e) => setEditingSub({ ...editingSub, section: e.target.value })}
                                                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
                                            >
                                                {(() => {
                                                    const secs = getSectionOptions(editingSub.grade || gradeOptions[0]);
                                                    const currentSec = String(editingSub.section || '').trim();
                                                    const allSecs = currentSec && !secs.includes(currentSec) ? [currentSec, ...secs] : secs;
                                                    return allSecs.map(sec => (
                                                        <option key={sec} value={sec}>شعبة {sec}</option>
                                                    ));
                                                })()}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {customFields.map((field) => (
                                    <div key={field.id}>
                                        <label className="block text-xs text-slate-400 mb-1">{field.label}</label>
                                        <input
                                            type="text"
                                            value={editingSub.customValues?.[field.id] || (field.id === 'f_legacy' ? editingSub.customFieldValue : '') || ''}
                                            onChange={(e) => setEditingSub({
                                                ...editingSub,
                                                customValues: {
                                                    ...(editingSub.customValues || {}),
                                                    [field.id]: e.target.value
                                                }
                                            })}
                                            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm"
                                        />
                                    </div>
                                ))}
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">رقم الجوال</label>
                                    <input
                                        type="text"
                                        value={editingSub.phone || ''}
                                        onChange={(e) => setEditingSub({ ...editingSub, phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setEditingSub(null)}
                                        className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                                    >
                                        حفظ التعديلات
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="text-center text-xs text-slate-600 py-4 font-mono">
                    نظام إدارة النشاط المدرسي &bull; School Activity Management
                </div>
            </div>
        </div>
    );
}

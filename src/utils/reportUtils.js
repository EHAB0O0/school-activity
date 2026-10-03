/**
 * Universal Printing & Reporting Utilities
 * Standardized for Saudi Ministry of Education guidelines and high-quality vector printing.
 */

/**
 * Universal Arabic-aware student name sorting (أبجدي)
 */
export const sortStudentsArabic = (list, nameKey = 'name') => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => {
        let nameA = '';
        let nameB = '';

        if (typeof a === 'string') {
            nameA = a;
        } else if (a && typeof a === 'object') {
            nameA = a[nameKey] || a.name || a.studentName || a.title || '';
        }

        if (typeof b === 'string') {
            nameB = b;
        } else if (b && typeof b === 'object') {
            nameB = b[nameKey] || b.name || b.studentName || b.title || '';
        }

        return String(nameA).trim().localeCompare(String(nameB).trim(), 'ar', {
            sensitivity: 'base',
            numeric: true
        });
    });
};

/**
 * Universal clean class string formatter
 * Prevents trailing hyphens ('غير معروف - ') and ensures standard display.
 */
export const cleanClassString = (stOrClass, grade, section) => {
    if (!stOrClass && !grade && !section) return 'غير معروف';

    const isUnknownGrade = (g) => {
        if (!g) return true;
        const str = String(g).trim();
        return str === 'غير معروف' || str === 'Unknown' || str.startsWith('غير معروف');
    };

    // If student object passed
    if (typeof stOrClass === 'object' && stOrClass !== null) {
        const g = stOrClass.grade;
        const sec = stOrClass.section;
        const cls = stOrClass.class;
        const isUnknown = stOrClass.isGradeUnknown || isUnknownGrade(g) || (cls && String(cls).trim().startsWith('غير معروف'));
        if (isUnknown) return 'غير معروف';

        const cleanG = g ? String(g).replace(/\s*-\s*$/, '').trim() : '';
        const cleanSec = sec ? String(sec).trim() : '';

        if (cleanG && cleanSec) return `${cleanG} - ${cleanSec}`;
        if (cleanG) return cleanG;
        if (cls) return String(cls).replace(/\s*-\s*$/, '').trim();
        return cleanSec || 'غير معروف';
    }

    // If separate string arguments passed
    const isUnknown = isUnknownGrade(grade) || (stOrClass && String(stOrClass).trim().startsWith('غير معروف'));
    if (isUnknown) return 'غير معروف';

    const cleanG = grade ? String(grade).replace(/\s*-\s*$/, '').trim() : '';
    const cleanSec = section ? String(section).trim() : '';

    if (cleanG && cleanSec) return `${cleanG} - ${cleanSec}`;
    if (cleanG) return cleanG;
    if (stOrClass) return String(stOrClass).replace(/\s*-\s*$/, '').trim();
    return cleanSec || 'غير معروف';
};

/**
 * Standard Saudi Ministry of Education 3-Column Report Header
 * Right: المملكة العربية السعودية / وزارة التعليم / إدارة التعليم بالرياض / ثانوية الإمام الالوسي
 * Center: اسم التقرير + اسم الطالب أو النشاط + البيانات الفرعية
 * Left: التواريخ والأوقات وباقي المعلومات المهمة
 */
export const getOfficialReportHeaderHtml = ({
    schoolInfo = {},
    title = 'تقرير النشاط المدرسي',
    subTitle = '',
    studentName = '',
    centerDetails = [],
    leftDetails = [],
    showDate = true,
    showTime = true,
    dateStr = '',
    timeStr = ''
}) => {
    const admin = (schoolInfo?.educationAdmin && schoolInfo?.educationAdmin !== "إدارة التعليم بالمنطقة") 
        ? schoolInfo.educationAdmin 
        : "إدارة التعليم بالرياض";
    const school = (schoolInfo?.name && schoolInfo?.name !== "ثانوية الملك عبدالله") 
        ? schoolInfo.name 
        : "ثانوية الإمام الالوسي";

    const currentDate = dateStr || new Date().toLocaleDateString('ar-SA');
    const currentTime = timeStr || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    const centerDetailsHtml = Array.isArray(centerDetails) && centerDetails.length > 0
        ? `<div class="official-header-details">${centerDetails.filter(Boolean).map(d => `<span>${d}</span>`).join(' • ')}</div>`
        : '';

    const leftDetailsHtml = Array.isArray(leftDetails) && leftDetails.length > 0
        ? leftDetails.filter(Boolean).map(item => {
            if (typeof item === 'object' && item.label) {
                return `<div>${item.label}: <strong>${item.value}</strong></div>`;
            }
            return `<div>${item}</div>`;
        }).join('')
        : '';

    return `
        <div class="official-header">
            <div class="official-header-right">
                <div>المملكة العربية السعودية</div>
                <div>وزارة التعليم</div>
                <div>${admin}</div>
                <div>${school}</div>
            </div>
            <div class="official-header-center">
                <h1 class="official-header-title">${title}</h1>
                ${subTitle ? `<div class="official-header-sub">${subTitle}</div>` : ''}
                ${studentName ? `<div class="official-header-student">اسم الطالب: <strong>${studentName}</strong></div>` : ''}
                ${centerDetailsHtml}
            </div>
            <div class="official-header-left">
                ${showDate ? `<div>التاريخ: <strong>${currentDate}</strong></div>` : ''}
                ${showTime ? `<div>الوقت: <strong>${currentTime}</strong></div>` : ''}
                ${leftDetailsHtml}
            </div>
        </div>
    `;
};

/**
 * Standard Report Footer with Custom Signatures and Notes
 */
export const getOfficialReportFooterHtml = ({
    signatures = [
        { role: 'المعد / المسؤول', name: '________________' },
        { role: 'رائد النشاط الطلابي', name: 'أ. ________________' },
        { role: 'مدير المدرسة', name: 'أ. ________________' }
    ],
    footerNote = '',
    showSignatures = true
} = {}) => {
    if (!showSignatures && !footerNote) return '';

    const sigBoxesHtml = (showSignatures && Array.isArray(signatures)) ? signatures.map(sig => `
        <div class="sig-box">
            <div class="sig-role">${sig.role}</div>
            <div class="sig-name">${sig.name || '________________'}</div>
            <div class="sig-line">التوقيع / الختم</div>
        </div>
    `).join('') : '';

    return `
        <div class="report-footer-container">
            ${footerNote ? `<div class="report-footer-note">${footerNote}</div>` : ''}
            ${showSignatures ? `<div class="footer-signatures">${sigBoxesHtml}</div>` : ''}
        </div>
    `;
};

/**
 * Standard CSS for Printable Documents
 * Supports:
 * - Themes: 'classic' (Official White), 'monochrome' (Ink-Saver B&W), 'dark' (Modern Dark Mode)
 * - Orientation: 'portrait' | 'landscape'
 * - Density: 'standard' | 'compact'
 * - Extra CSS override
 */
export const getStandardPrintStyles = (options = {}) => {
    let extraCss = '';
    let theme = 'classic';
    let orientation = 'portrait';
    let density = 'standard';

    if (typeof options === 'string') {
        extraCss = options;
    } else if (typeof options === 'object' && options !== null) {
        extraCss = options.extraCss || '';
        theme = options.theme || 'classic';
        orientation = options.orientation || 'portrait';
        density = options.density || 'standard';
    }

    const isDark = theme === 'dark';
    const isMonochrome = theme === 'monochrome';
    const isCompact = density === 'compact';

    const pageMargin = isCompact ? '8mm 10mm' : '12mm 15mm';
    const cellPadding = isCompact ? '4px 6px' : '8px 10px';
    const tableFontSize = isCompact ? '10px' : '12px';
    const titleFontSize = isCompact ? '18px' : '20px';

    return `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    
    @page {
        size: A4 ${orientation};
        margin: ${pageMargin};
    }

    * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    body {
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        background: ${isDark ? '#090d16' : '#ffffff'} !important;
        color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#0f172a'} !important;
        margin: 0;
        padding: 0;
        line-height: 1.5;
        direction: rtl;
    }

    /* Official 3-Column Header */
    .official-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid ${isDark ? '#38bdf8' : isMonochrome ? '#000000' : '#0f172a'};
        padding-bottom: ${isCompact ? '8px' : '12px'};
        margin-bottom: ${isCompact ? '12px' : '20px'};
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .official-header-right {
        text-align: right;
        font-size: ${isCompact ? '11px' : '13px'};
        font-weight: 700;
        line-height: 1.5;
        color: ${isDark ? '#e2e8f0' : isMonochrome ? '#000000' : '#1e293b'};
        min-width: ${isCompact ? '140px' : '180px'};
    }

    .official-header-center {
        text-align: center;
        flex: 1;
        padding: 0 10px;
    }

    .official-header-title {
        margin: 0;
        font-size: ${titleFontSize};
        font-weight: 900;
        color: ${isDark ? '#ffffff' : isMonochrome ? '#000000' : '#0f172a'};
        letter-spacing: -0.3px;
    }

    .official-header-sub {
        margin: 2px 0 0;
        font-size: ${isCompact ? '12px' : '14px'};
        font-weight: 700;
        color: ${isDark ? '#38bdf8' : isMonochrome ? '#000000' : '#4338ca'};
    }

    .official-header-student {
        margin: 3px 0 0;
        font-size: ${isCompact ? '12px' : '14px'};
        font-weight: 700;
        color: ${isDark ? '#ffffff' : isMonochrome ? '#000000' : '#0f172a'};
    }

    .official-header-details {
        margin-top: 4px;
        font-size: ${isCompact ? '10px' : '11px'};
        font-weight: 600;
        color: ${isDark ? '#94a3b8' : isMonochrome ? '#333333' : '#64748b'};
    }

    .official-header-left {
        text-align: left;
        font-size: ${isCompact ? '10.5px' : '12px'};
        font-weight: 600;
        line-height: 1.5;
        color: ${isDark ? '#cbd5e1' : isMonochrome ? '#000000' : '#334155'};
        min-width: ${isCompact ? '140px' : '180px'};
        direction: rtl;
    }

    /* Table & Pagination Rules */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: ${isCompact ? '10px' : '15px'};
        margin-bottom: ${isCompact ? '12px' : '20px'};
        font-size: ${tableFontSize};
        page-break-inside: auto !important;
        break-inside: auto !important;
    }

    thead {
        display: table-header-group !important;
    }

    tfoot {
        display: table-footer-group !important;
    }

    tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    th, td {
        border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#cbd5e1'};
        padding: ${cellPadding};
        text-align: right;
        vertical-align: middle;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        color: ${isDark ? '#f1f5f9' : isMonochrome ? '#000000' : '#0f172a'};
    }

    th {
        background-color: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f1f5f9'} !important;
        color: ${isDark ? '#38bdf8' : isMonochrome ? '#000000' : '#0f172a'} !important;
        font-weight: 800;
        border-bottom: ${isMonochrome ? '2px solid #000000' : isDark ? '2px solid #38bdf8' : '1px solid #cbd5e1'};
    }

    tr:nth-child(even) td {
        background-color: ${isDark ? '#0d131f' : isMonochrome ? '#ffffff' : '#f8fafc'} !important;
    }
    tr:nth-child(odd) td {
        background-color: ${isDark ? '#090d16' : '#ffffff'} !important;
    }

    /* Badges & Tags */
    .badge, .status, .type-pill {
        display: inline-block;
        font-size: ${isCompact ? '9px' : '10px'};
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid ${isDark ? '#334155' : isMonochrome ? '#000000' : '#cbd5e1'};
        background: ${isDark ? '#1e293b' : isMonochrome ? 'transparent' : '#f1f5f9'};
        color: ${isDark ? '#e2e8f0' : isMonochrome ? '#000000' : '#475569'};
    }

    .badge.success, .status.success {
        background: ${isDark ? '#064e3b' : isMonochrome ? 'transparent' : '#ecfdf5'} !important;
        color: ${isDark ? '#34d399' : isMonochrome ? '#000000' : '#059669'} !important;
        border-color: ${isDark ? '#059669' : isMonochrome ? '#000000' : '#a7f3d0'} !important;
    }

    .badge.danger, .status.danger {
        background: ${isDark ? '#4c0519' : isMonochrome ? 'transparent' : '#fef2f2'} !important;
        color: ${isDark ? '#fb7185' : isMonochrome ? '#000000' : '#dc2626'} !important;
        border-color: ${isDark ? '#e11d48' : isMonochrome ? '#000000' : '#fecaca'} !important;
    }

    /* KPI Cards & Containers */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: ${isCompact ? '8px' : '12px'};
        margin-bottom: ${isCompact ? '12px' : '20px'};
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .kpi-card {
        background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
        border: 1px solid ${isDark ? '#1e293b' : isMonochrome ? '#000000' : '#e2e8f0'};
        border-radius: 8px;
        padding: ${isCompact ? '8px 10px' : '12px 14px'};
        text-align: center;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .kpi-label {
        font-size: ${isCompact ? '10px' : '11px'};
        color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'};
        font-weight: 700;
        margin-bottom: 3px;
    }

    .kpi-value {
        font-size: ${isCompact ? '14px' : '16px'};
        font-weight: 900;
        color: ${isDark ? '#ffffff' : isMonochrome ? '#000000' : '#0f172a'};
    }

    .kpi-value.points {
        color: ${isDark ? '#34d399' : isMonochrome ? '#000000' : '#059669'};
    }

    /* Official Signatures Footer */
    .report-footer-container {
        margin-top: ${isCompact ? '20px' : '30px'};
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .report-footer-note {
        padding: 8px 12px;
        background: ${isDark ? '#111827' : isMonochrome ? '#ffffff' : '#f8fafc'};
        border: 1px dashed ${isDark ? '#334155' : isMonochrome ? '#000000' : '#cbd5e1'};
        border-radius: 6px;
        font-size: ${isCompact ? '10px' : '11px'};
        color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'};
        margin-bottom: ${isCompact ? '15px' : '20px'};
        text-align: center;
    }

    .footer-signatures {
        display: flex;
        justify-content: space-around;
        text-align: center;
        font-size: ${isCompact ? '11px' : '13px'};
        font-weight: 700;
        color: ${isDark ? '#e2e8f0' : isMonochrome ? '#000000' : '#1e293b'};
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .sig-box {
        min-width: ${isCompact ? '140px' : '180px'};
    }

    .sig-role {
        font-weight: 800;
    }

    .sig-name {
        margin-top: 4px;
        font-size: ${isCompact ? '10.5px' : '12px'};
        color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#475569'};
    }

    .sig-line {
        margin-top: ${isCompact ? '25px' : '40px'};
        border-top: 1px dashed ${isDark ? '#475569' : isMonochrome ? '#000000' : '#64748b'};
        padding-top: 4px;
        font-size: ${isCompact ? '9.5px' : '11px'};
        color: ${isDark ? '#94a3b8' : isMonochrome ? '#000000' : '#64748b'};
    }

    ${extraCss}
    `;
};

/**
 * Execute native vector printing via an isolated invisible iframe.
 * Gives crisp vector text, proper @page styling, automatic repeating thead, and Save to PDF capability.
 */
export const printHtmlDocument = (htmlContent, docTitle = 'تقرير النشاط المدرسي') => {
    return new Promise((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const docIframe = iframe.contentWindow.document;
        docIframe.open();
        docIframe.write(htmlContent);
        docIframe.close();

        setTimeout(() => {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (err) {
                console.error("Print error:", err);
            }
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve();
            }, 2500);
        }, 700);
    });
};

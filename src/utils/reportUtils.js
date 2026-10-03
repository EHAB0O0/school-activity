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
 * Standard CSS for Printable Documents
 * Ensures clean page splitting, repeated table headers, no clipped cells, and exact colors.
 */
export const getStandardPrintStyles = (extraCss = '') => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    
    @page {
        size: A4 portrait;
        margin: 12mm 15mm;
    }

    * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }

    body {
        font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
        background: #ffffff !important;
        color: #0f172a !important;
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
        border-bottom: 2px solid #0f172a;
        padding-bottom: 12px;
        margin-bottom: 20px;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .official-header-right {
        text-align: right;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.6;
        color: #1e293b;
        min-width: 180px;
    }

    .official-header-center {
        text-align: center;
        flex: 1;
        padding: 0 15px;
    }

    .official-header-title {
        margin: 0;
        font-size: 20px;
        font-weight: 900;
        color: #0f172a;
        letter-spacing: -0.3px;
    }

    .official-header-sub {
        margin: 3px 0 0;
        font-size: 14px;
        font-weight: 700;
        color: #4338ca;
    }

    .official-header-student {
        margin: 4px 0 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
    }

    .official-header-details {
        margin-top: 5px;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
    }

    .official-header-left {
        text-align: left;
        font-size: 12px;
        font-weight: 600;
        line-height: 1.6;
        color: #334155;
        min-width: 180px;
        direction: rtl;
    }

    /* Table & Pagination Rules */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
        margin-bottom: 20px;
        font-size: 12px;
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
        border: 1px solid #cbd5e1;
        padding: 8px 10px;
        text-align: right;
        vertical-align: middle;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    th {
        background-color: #f1f5f9 !important;
        color: #0f172a !important;
        font-weight: 800;
    }

    tr:nth-child(even) {
        background-color: #f8fafc !important;
    }

    /* Cards & Containers */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 20px;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .kpi-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px 14px;
        text-align: center;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .kpi-label {
        font-size: 11px;
        color: #64748b;
        font-weight: 700;
        margin-bottom: 4px;
    }

    .kpi-value {
        font-size: 16px;
        font-weight: 900;
        color: #0f172a;
    }

    .kpi-value.points {
        color: #059669;
    }

    /* Official Signatures Footer */
    .footer-signatures {
        display: flex;
        justify-content: space-around;
        margin-top: 35px;
        text-align: center;
        font-size: 13px;
        font-weight: 700;
        color: #1e293b;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
    }

    .sig-box {
        min-width: 180px;
    }

    .sig-line {
        margin-top: 45px;
        border-top: 1px dashed #64748b;
        padding-top: 5px;
        font-size: 11px;
        color: #64748b;
    }

    ${extraCss}
`;

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

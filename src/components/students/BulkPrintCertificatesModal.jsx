import { useState } from 'react';
import { X, Printer, Award, Sparkles } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

export default function BulkPrintCertificatesModal({
    isOpen,
    onClose,
    selectedStudents = []
}) {
    const { settings } = useSettings();
    const schoolName = settings?.schoolName || 'ثانوية الملك عبدالله';

    const [certificateTitle, setCertificateTitle] = useState('شـهـادة شـكـر وتـقـديـر');
    const [certificateReason, setCertificateReason] = useState('تقديراً لمشاركته الفاعلة وتميزه الإيجابي في برامج وأنشطة المدرسة خلال العام الدراسي، متمنين له دوام التوفيق والنجاح.');
    const [supervisorTitle, setSupervisorTitle] = useState('مشرف النشاط الطلابي');
    const [supervisorName, setSupervisorName] = useState('');
    const [principalTitle, setPrincipalTitle] = useState('مدير المدرسة');
    const [principalName, setPrincipalName] = useState('');
    const [certificateDate, setCertificateDate] = useState(new Date().toLocaleDateString('ar-SA'));
    const [isPrinting, setIsPrinting] = useState(false);

    if (!isOpen) return null;

    function handlePrint() {
        setIsPrinting(true);

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();

        const certificatesHtml = selectedStudents.map((student) => `
            <div class="cert-page">
                <div class="cert-outer-border">
                    <div class="cert-inner-border">
                        <!-- Top Header -->
                        <div class="cert-header">
                            <div class="header-side">
                                <div>المملكة العربية السعودية</div>
                                <div>وزارة التعليم</div>
                                <div>إدارة التعليم بالمنطقة</div>
                                <div class="school-name">${schoolName}</div>
                            </div>
                            <div class="cert-badge">
                                <div class="badge-icon">🎖️</div>
                            </div>
                            <div class="header-side left">
                                <div>التاريخ: ${certificateDate}</div>
                                <div>الصف: ${student.class || 'طالب متميز'}</div>
                            </div>
                        </div>

                        <!-- Main Title -->
                        <div class="cert-title">${certificateTitle}</div>

                        <!-- Certificate Body -->
                        <div class="cert-body">
                            <p class="cert-intro">يسر إدارة المدرسة وقسم النشاط الطلابي أن تمنح الطالب المتميز:</p>
                            <div class="student-name">${student.name}</div>
                            <p class="cert-reason">${certificateReason}</p>
                        </div>

                        <!-- Signatures -->
                        <div class="cert-signatures">
                            <div class="sign-block">
                                <div class="sign-role">${supervisorTitle}</div>
                                <div class="sign-name">${supervisorName || '................................'}</div>
                                <div class="sign-line">التوقيع: .....................</div>
                            </div>
                            
                            <div class="cert-seal">
                                <div class="seal-circle">
                                    <span>ختم المدرسة الرسمي</span>
                                </div>
                            </div>

                            <div class="sign-block">
                                <div class="sign-role">${principalTitle}</div>
                                <div class="sign-name">${principalName || '................................'}</div>
                                <div class="sign-line">التوقيع: .....................</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        doc.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>شهادات شكر وتقدير</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Amiri:wght@700&display=swap" rel="stylesheet">
                <style>
                    @page {
                        size: A4 landscape;
                        margin: 0;
                    }
                    * {
                        box-sizing: border-box;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Tajawal', sans-serif;
                        background: #ffffff;
                        color: #1f2937;
                    }
                    .cert-page {
                        width: 297mm;
                        height: 210mm;
                        padding: 12mm;
                        page-break-after: always;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .cert-outer-border {
                        width: 100%;
                        height: 100%;
                        border: 6px double #b45309;
                        padding: 6px;
                        border-radius: 8px;
                        background: #fffbeb;
                    }
                    .cert-inner-border {
                        width: 100%;
                        height: 100%;
                        border: 2px solid #d97706;
                        border-radius: 6px;
                        padding: 24px 36px;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        background: #ffffff;
                        position: relative;
                    }
                    .cert-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        font-size: 13px;
                        line-height: 1.6;
                        color: #4b5563;
                    }
                    .school-name {
                        font-weight: bold;
                        color: #92400e;
                        font-size: 14px;
                    }
                    .cert-badge {
                        text-align: center;
                    }
                    .badge-icon {
                        font-size: 42px;
                    }
                    .header-side.left {
                        text-align: left;
                    }
                    .cert-title {
                        font-family: 'Amiri', serif;
                        font-size: 40px;
                        font-weight: 700;
                        color: #b45309;
                        text-align: center;
                        letter-spacing: 2px;
                        margin-top: -10px;
                    }
                    .cert-body {
                        text-align: center;
                        margin: 10px 0;
                    }
                    .cert-intro {
                        font-size: 17px;
                        color: #4b5563;
                        margin-bottom: 12px;
                    }
                    .student-name {
                        font-size: 34px;
                        font-weight: 900;
                        color: #1e1b4b;
                        padding: 6px 30px;
                        display: inline-block;
                        border-bottom: 3px solid #f59e0b;
                        margin-bottom: 14px;
                    }
                    .cert-reason {
                        font-size: 16px;
                        color: #374151;
                        max-width: 780px;
                        margin: 0 auto;
                        line-height: 1.7;
                    }
                    .cert-signatures {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        padding-top: 15px;
                        font-size: 14px;
                    }
                    .sign-block {
                        text-align: center;
                        min-width: 180px;
                    }
                    .sign-role {
                        font-weight: bold;
                        color: #92400e;
                        margin-bottom: 6px;
                    }
                    .sign-name {
                        font-weight: bold;
                        color: #111827;
                        margin-bottom: 8px;
                    }
                    .sign-line {
                        font-size: 12px;
                        color: #6b7280;
                    }
                    .cert-seal {
                        text-align: center;
                    }
                    .seal-circle {
                        width: 85px;
                        height: 85px;
                        border: 2px dashed #d97706;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #b45309;
                        font-size: 11px;
                        font-weight: bold;
                        text-align: center;
                        padding: 5px;
                    }
                </style>
            </head>
            <body>
                ${certificatesHtml}
            </body>
            </html>
        `);
        doc.close();

        setTimeout(() => {
            setIsPrinting(false);
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 2000);
        }, 1000);
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
                        <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Award size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">طباعة شهادات شكر وتقدير جماعية</h2>
                            <p className="text-xs text-gray-400 mt-0.5">
                                سيتم توليد <span className="text-amber-400 font-bold">{selectedStudents.length}</span> شهادات جاهزة للطباعة
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isPrinting}
                        aria-label="إغلاق"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form Controls */}
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-amber-300 text-xs leading-relaxed">
                        <Sparkles size={18} className="shrink-0 mt-0.5" />
                        <div>
                            يتم إنشاء شهادة تقدير رسمية مستقلة لكل طالب محدد بتنسيق أفقي أنيق ومناسب للطباعة والتوثيق.
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1.5">عنوان الشهادة الرئيسي:</label>
                        <input
                            type="text"
                            value={certificateTitle}
                            onChange={e => setCertificateTitle(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-amber-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1.5">نص وسبب التقدير:</label>
                        <textarea
                            rows={3}
                            value={certificateReason}
                            onChange={e => setCertificateReason(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white text-xs outline-none focus:border-amber-500 resize-none leading-relaxed"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-300 mb-1.5">المسمى الوظيفي للمشرف:</label>
                            <input
                                type="text"
                                value={supervisorTitle}
                                onChange={e => setSupervisorTitle(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-300 mb-1.5">اسم المشرف (اختياري):</label>
                            <input
                                type="text"
                                placeholder="اكتب الاسم هنا..."
                                value={supervisorName}
                                onChange={e => setSupervisorName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-300 mb-1.5">المسمى الوظيفي للمدير:</label>
                            <input
                                type="text"
                                value={principalTitle}
                                onChange={e => setPrincipalTitle(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-300 mb-1.5">اسم المدير (اختياري):</label>
                            <input
                                type="text"
                                placeholder="اكتب الاسم هنا..."
                                value={principalName}
                                onChange={e => setPrincipalName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-300 mb-1.5">تاريخ الشهادة:</label>
                        <input
                            type="text"
                            value={certificateDate}
                            onChange={e => setCertificateDate(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isPrinting}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        إلغاء
                    </button>

                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={isPrinting || selectedStudents.length === 0}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white font-bold text-xs shadow-lg shadow-amber-600/30 transition-all disabled:opacity-50"
                    >
                        {isPrinting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <Printer size={16} />
                        )}
                        <span>معاينة وطباعة {selectedStudents.length} شهادات</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useRef } from 'react';
import { X, Copy, Download, Printer, Check, QrCode, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { useSettings } from '../../contexts/SettingsContext';

export default function LinkQRCodeModal({ isOpen, onClose, link }) {
    const { schoolInfo } = useSettings();
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const printAreaRef = useRef(null);

    const publicUrl = link ? `${window.location.origin}/register/${link.id}` : '';

    useEffect(() => {
        if (!isOpen || !link) return;

        // Generate high-resolution QR Code
        QRCode.toDataURL(publicUrl, {
            width: 512,
            margin: 2,
            color: {
                dark: '#090d16',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'H'
        })
            .then(url => setQrDataUrl(url))
            .catch(err => {
                console.error("QR generation error:", err);
                toast.error("فشل في توليد رمز QR");
            });
    }, [isOpen, link, publicUrl]);

    if (!isOpen || !link) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        toast.success("تم نسخ الرابط بنجاح");
        setTimeout(() => setCopied(false), 2500);
    };

    const handleDownload = () => {
        if (!qrDataUrl) return;
        const a = document.createElement('a');
        a.href = qrDataUrl;
        a.download = `QR-${link.title.replace(/\s+/g, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("تم بدء تحميل رمز QR");
    };

    const handlePrint = () => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="utf-8">
                <title>رمز الاستجابة السريعة - ${link.title}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
                    body {
                        font-family: 'Cairo', sans-serif;
                        margin: 0;
                        padding: 40px;
                        background: #fff;
                        color: #0f172a;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 90vh;
                        text-align: center;
                    }
                    .card {
                        border: 3px solid #0f172a;
                        border-radius: 24px;
                        padding: 36px 48px;
                        max-width: 500px;
                        width: 100%;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.08);
                    }
                    .school-name {
                        font-size: 20px;
                        font-weight: 700;
                        color: #475569;
                        margin-bottom: 8px;
                    }
                    .title {
                        font-size: 24px;
                        font-weight: 900;
                        color: #0f172a;
                        margin: 10px 0;
                    }
                    .delegate {
                        font-size: 15px;
                        color: #4338ca;
                        font-weight: 700;
                        background: #eef2ff;
                        padding: 6px 16px;
                        border-radius: 30px;
                        display: inline-block;
                        margin-bottom: 24px;
                    }
                    .qr-wrapper {
                        background: #fff;
                        padding: 16px;
                        border-radius: 20px;
                        border: 2px dashed #cbd5e1;
                        display: inline-block;
                        margin-bottom: 20px;
                    }
                    .qr-image {
                        width: 260px;
                        height: 260px;
                        display: block;
                    }
                    .instructions {
                        font-size: 14px;
                        color: #64748b;
                        margin-top: 10px;
                        line-height: 1.6;
                    }
                    .passcode-box {
                        margin-top: 16px;
                        padding: 8px 16px;
                        background: #f8fafc;
                        border: 1px solid #e2e8f0;
                        border-radius: 12px;
                        font-size: 14px;
                        font-weight: 700;
                        color: #334155;
                    }
                    @media print {
                        body { padding: 0; }
                        .card { border-width: 2px; }
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="school-name">${schoolInfo?.name || "المملكة العربية السعودية - وزارة التعليم"}</div>
                    <h1 class="title">${link.title}</h1>
                    <div class="delegate">إشراف الطالب المفوض: ${link.delegateName}</div>
                    
                    <div class="qr-wrapper">
                        <img src="${qrDataUrl}" class="qr-image" alt="QR Code" />
                    </div>

                    <div class="instructions">
                        امسح رمز الاستجابة السريعة (QR Code) بكاميرا الجوال للدخول المباشر إلى صفحة التسجيل
                    </div>

                    ${link.passcode ? `<div class="passcode-box">رمز الدخول السري: <span style="font-family: monospace; letter-spacing: 2px; color: #4338ca;">${link.passcode}</span></div>` : ''}
                </div>
            </body>
            </html>
        `);
        doc.close();

        iframe.contentWindow.focus();
        setTimeout(() => {
            iframe.contentWindow.print();
            document.body.removeChild(iframe);
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-right" dir="rtl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-800/60">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                            <QrCode size={20} />
                        </div>
                        <h2 className="text-base font-bold text-white">رمز الاستجابة السريعة (QR)</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col items-center text-center space-y-4" ref={printAreaRef}>
                    <div>
                        <h3 className="text-base font-bold text-white mb-1">{link.title}</h3>
                        <p className="text-xs text-indigo-400 font-semibold bg-indigo-950/60 border border-indigo-800/50 px-3 py-1 rounded-full inline-block">
                            إشراف الطالب: {link.delegateName}
                        </p>
                    </div>

                    {/* QR Display */}
                    <div className="p-4 bg-white rounded-2xl shadow-xl border-4 border-slate-800 inline-block">
                        {qrDataUrl ? (
                            <img
                                src={qrDataUrl}
                                alt="QR Code"
                                className="w-56 h-56 rounded-lg block"
                            />
                        ) : (
                            <div className="w-56 h-56 flex items-center justify-center text-slate-500 text-xs">
                                جاري توليد الرمز...
                            </div>
                        )}
                    </div>

                    {/* Passcode notice */}
                    {link.passcode && (
                        <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-xl font-mono">
                            رمز الدخول المطلوب: <span className="font-bold tracking-widest text-amber-200">{link.passcode}</span>
                        </div>
                    )}

                    {/* URL Input with copy */}
                    <div className="w-full flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl p-1.5 text-xs text-slate-300">
                        <input
                            type="text"
                            readOnly
                            value={publicUrl}
                            className="bg-transparent flex-1 px-2 py-1 outline-none text-slate-300 text-left font-mono truncate"
                            dir="ltr"
                        />
                        <button
                            onClick={handleCopy}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copied ? "تم" : "نسخ"}</span>
                        </button>
                    </div>

                    <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline pt-1"
                    >
                        <span>فتح الرابط في صفحة جديدة</span>
                        <ExternalLink size={12} />
                    </a>
                </div>

                {/* Actions Bar */}
                <div className="p-4 border-t border-slate-800 bg-slate-800/40 grid grid-cols-2 gap-3">
                    <button
                        onClick={handleDownload}
                        className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        <Download size={16} />
                        تحميل الصورة
                    </button>
                    <button
                        onClick={handlePrint}
                        className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-colors"
                    >
                        <Printer size={16} />
                        طباعة كرت الدعوة
                    </button>
                </div>
            </div>
        </div>
    );
}

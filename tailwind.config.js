/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {},
        colors: {
            // Explicitly replace ENTIRE palette to prevent oklab
            transparent: 'transparent',
            current: 'currentColor',
            black: '#000000',
            white: '#ffffff',
            indigo: {
                50: '#eef2ff',
                100: '#e0e7ff',
                200: '#c7d2fe',
                300: '#a5b4fc',
                400: '#818cf8',
                500: '#6366f1',
                600: '#4f46e5',
                700: '#4338ca',
                800: '#3730a3',
                900: '#312e81',
                950: '#1e1b4b',
            },
            emerald: {
                50: '#ecfdf5',
                100: '#d1fae5',
                400: '#34d399',
                500: '#10b981',
                600: '#059669',
                900: '#064e3b',
            },
            purple: {
                400: '#c084fc',
                500: '#a855f7',
                600: '#9333ea',
                900: '#581c87',
            },
            rose: {
                300: '#fda4af',
                400: '#fb7185',
                500: '#f43f5e',
                900: '#881337',
            },
            amber: {
                400: '#fbbf24',
                500: '#f59e0b',
            },
            gray: {
                50: '#f9fafb',
                100: '#f3f4f6',
                200: '#e5e7eb',
                300: '#d1d5db',
                400: '#9ca3af',
                500: '#6b7280',
                600: '#4b5563',
                700: '#374151',
                800: '#1f2937',
                900: '#111827',
                950: '#030712',
            },
            primary: {
                50: '#f0f9ff',
                100: '#e0f2fe',
                500: '#0ea5e9',
                600: '#0284c7',
                700: '#0369a1',
            }
        }
    },
    plugins: [],
}

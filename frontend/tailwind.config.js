/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                /* VizzyPilot Editorial Palette */
                'cream': '#F5F2EB',
                'warm-white': '#FCFAF5',
                'pine': '#16231b',
                'sand': '#E4DED4',
                'sand-light': '#ece7d9',
                'olive': '#7C725D',
                'warm-gray': '#4A453A',
                'sand-subtle': '#F0EDE5',

                /* Functional tokens */
                'error': '#BA1A1A',
                'emerald-accent': '#469446',

                /* Legacy compat (used by admin pages) */
                'navy': '#14213d',
                'admin-purple': '#7c3aed',
            },
            fontFamily: {
                "headline": ["Host Grotesk", "Plus Jakarta Sans", "sans-serif"],
                "body": ["Host Grotesk", "Inter", "sans-serif"],
                "label": ["Inter", "sans-serif"],
                "mono": ["DM Mono", "JetBrains Mono", "monospace"],
                "serif": ["Instrument Serif", "Georgia", "serif"],
            },
            keyframes: {
                'fade-scale': {
                    '0%': {
                        opacity: '0',
                        transform: 'translateY(-50%) scale(0.95)'
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'translateY(-50%) scale(1)'
                    }
                },
                'fade-in': {
                    '0%': { opacity: '0', transform: 'translateY(4px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' }
                }
            },
            animation: {
                'fade-scale': 'fade-scale 0.2s ease-out',
                'fade-in': 'fade-in 0.3s ease-out'
            }
        },
    },
    plugins: [],
}

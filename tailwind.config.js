/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        cream: { 50: '#FDFAF4', 100: '#F8F1E4', 200: '#F0E4CE', 300: '#E5D2B0' },
        ink: { DEFAULT: '#2E2A25', soft: '#5F574D', mute: '#7A7166' },
      },
      boxShadow: {
        soft: '0 8px 30px -12px rgba(90, 62, 20, 0.25), 0 2px 6px -2px rgba(90, 62, 20, 0.12)',
      },
    },
  },
  plugins: [],
};

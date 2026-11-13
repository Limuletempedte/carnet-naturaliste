/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./contexts/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                'nature-beige': '#F2F2F7',
                'nature-green': '#34C759',
                'nature-dark': '#1C1C1E',
                'nature-accent': '#007AFF',
                'nature-gray': '#8E8E93',
                'nature-light-gray': '#E5E5EA',
                'nature-dark-bg': '#000000',
                'nature-dark-surface': '#1C1C1E',
                'nature-dark-text': '#F2F2F7',
                'nature-green-text': '#1B8A2F',
                // Lavande réservée à l'assistant IA (boutons, cartes, compteur).
                // Contrastes vérifiés par tests/aiColorContrast.test.ts :
                // 700 sur blanc et sur 50, 200 sur fond sombre, blanc sur 600.
                ai: {
                    50: '#F5F3FF',
                    100: '#EDE9FE',
                    200: '#DDD6FE',
                    300: '#C4B5FD',
                    400: '#A78BFA',
                    500: '#8B5CF6',
                    600: '#7C3AED',
                    700: '#6D28D9',
                    800: '#5B21B6',
                    900: '#4C1D95',
                },
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Merriweather', 'serif'],
            },
            boxShadow: {
                'ios': '0 4px 20px rgba(0, 0, 0, 0.08)',
                'ios-hover': '0 8px 30px rgba(0, 0, 0, 0.12)',
            }
        },
    },
    plugins: [],
}

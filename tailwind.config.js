/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./contexts/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
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

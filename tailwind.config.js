/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6e8efb',
        secondary: '#a16efa',
        dark: '#121212',
        darkCard: '#1e1e1e'
      },
    },
  },
  plugins: [],
}
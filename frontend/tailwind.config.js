/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f7ff',
          100: '#e6ebff',
          500: '#5b6bff',
          600: '#4757ff',
          700: '#3645d6',
        },
      },
    },
  },
  plugins: [],
};

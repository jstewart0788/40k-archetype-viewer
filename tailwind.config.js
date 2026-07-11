/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
      },
    },
  },
  safelist: [
    'bg-green-600',
    'bg-yellow-600',
    'bg-red-600',
    'bg-slate-600',
    'bg-green-500',
    'bg-yellow-500',
    'bg-red-500',
    'text-green-400',
    'text-yellow-400',
    'text-red-400',
    'border-green-500',
    'border-yellow-500',
    'border-red-500',
  ],
  plugins: [],
}

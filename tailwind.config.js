/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    colors: {
      primary: "#F2C94C",        // gold
      accent: "#BB86FC",         // purple
      "neutral-100": "#E5E5E5",
      "neutral-700": "#2A2A2A",
      "neutral-800": "#1A1A1A",
      "neutral-900": "#0D0D0D",
      white: "#FFFFFF",
      black: "#000000",
    },
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
    },
    boxShadow: {
      glow: "0 0 25px rgba(242,201,76,0.45)",
    },
  },
  plugins: [],
};

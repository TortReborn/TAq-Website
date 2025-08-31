import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50:  "#effbfd",
          100: "#d7f4fb",
          200: "#b2e9f7",
          300: "#82d8f1",
          400: "#54c3e7",
          500: "#38a9cf",
          600: "#2a86aa",
          700: "#246c8b",
          800: "#235a73",
          900: "#204a5f"
        },
        sand: {
          100: "#fff6e6",
          200: "#fde8c3",
          300: "#f8d59a"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(0,0,0,0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;

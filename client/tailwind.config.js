/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 24px rgba(44, 255, 156, 0.22)"
      },
      animation: {
        "pin-pulse": "pin-pulse 1.5s ease-in-out infinite",
        "splash-pulse": "splash-pulse 2.8s ease-in-out infinite"
      },
      keyframes: {
        "pin-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.08)", opacity: "0.62" }
        },
        "splash-pulse": {
          "0%, 100%": { opacity: "0.42", transform: "scale(0.92)" },
          "50%": { opacity: "0.9", transform: "scale(1.05)" }
        }
      }
    }
  },
  plugins: []
};

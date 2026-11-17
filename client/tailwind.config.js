/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Unbounded"', "system-ui", "sans-serif"],
        body: ['"Figtree"', "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0B0A09",
        panel: "#161412",
        lift: "#211E1A",
        gold: "#C9A66B",
        "gold-bright": "#E8D5A3",
        mist: "#F2EDE4",
        mute: "#9A9186",
        signal: "#E8573A",
        teal: "#2A9D8F",
      },
      boxShadow: {
        glow: "0 0 40px rgba(201, 166, 107, 0.18)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "50%": { transform: "translateY(-18px) translateX(10px)" },
        },
        drift: {
          "0%": { transform: "translate3d(0,0,0) scale(1)" },
          "33%": { transform: "translate3d(12px,-22px,0) scale(1.04)" },
          "66%": { transform: "translate3d(-14px,10px,0) scale(0.96)" },
          "100%": { transform: "translate3d(0,0,0) scale(1)" },
        },
        reveal: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.92)", opacity: "0.55" },
          "70%": { transform: "scale(1.12)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        drift: "drift 14s ease-in-out infinite",
        reveal: "reveal 0.6s ease-out both",
        "pulse-ring": "pulseRing 2.2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

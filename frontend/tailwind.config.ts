import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00D4FF",
          50: "#E0FAFF",
          100: "#B3F4FF",
          200: "#80EDFF",
          300: "#4DE6FF",
          400: "#1ADFFF",
          500: "#00D4FF",
          600: "#00AACF",
          700: "#00809F",
          800: "#00566F",
          900: "#002C3F",
        },
        jarvis: {
          bg: "#050A0F",
          surface: "#0A1520",
          border: "#0D2137",
          accent: "#00D4FF",
          "accent-dim": "#0066CC",
          text: "#E0F4FF",
          "text-muted": "#5A8A9F",
          glow: "#00D4FF40",
          danger: "#FF3366",
          warning: "#FFB800",
          success: "#00FF88",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-jarvis":
          "linear-gradient(135deg, #050A0F 0%, #0A1520 50%, #050A0F 100%)",
        "gradient-glass":
          "linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(0,102,204,0.05) 100%)",
      },
      animation: {
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "scan-line": "scanLine 3s linear infinite",
        "hud-pulse": "hudPulse 4s ease-in-out infinite",
        "data-stream": "dataStream 2s linear infinite",
        "spin-slow": "spin 8s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "typing": "typing 1s step-end infinite",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": {
            boxShadow: "0 0 5px #00D4FF40, 0 0 10px #00D4FF20",
          },
          "50%": {
            boxShadow: "0 0 20px #00D4FF80, 0 0 40px #00D4FF40, 0 0 60px #00D4FF20",
          },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        hudPulse: {
          "0%, 100%": { opacity: "0.7" },
          "50%": { opacity: "1" },
        },
        dataStream: {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 100%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        typing: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        "jarvis-sm": "0 0 10px rgba(0,212,255,0.2)",
        "jarvis-md": "0 0 20px rgba(0,212,255,0.3)",
        "jarvis-lg": "0 0 40px rgba(0,212,255,0.4)",
        "jarvis-xl": "0 0 60px rgba(0,212,255,0.5)",
        "inner-jarvis": "inset 0 0 20px rgba(0,212,255,0.1)",
        "card": "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      borderColor: {
        jarvis: "#0D2137",
        "jarvis-accent": "#00D4FF40",
      },
    },
  },
  plugins: [],
};

export default config;

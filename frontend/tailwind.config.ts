import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--ink)",
          deep: "var(--ink-deep)",
          soft: "var(--ink-soft)",
        },
        parchment: {
          DEFAULT: "var(--parchment)",
          dim: "var(--parchment-dim)",
          mute: "var(--parchment-mute)",
          faint: "var(--parchment-faint)",
        },
        ember: {
          DEFAULT: "var(--ember)",
          glow: "var(--ember-glow)",
          shade: "var(--ember-shade)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          sunk: "var(--surface-sunk)",
        },
        edge: {
          DEFAULT: "var(--edge)",
          strong: "var(--edge-strong)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "3px",
      },
      boxShadow: {
        soft: "0 1px 0 0 var(--edge), 0 8px 32px -16px rgba(0,0,0,0.5)",
        ember: "0 0 0 1px var(--ember-shade), 0 8px 24px -12px var(--ember-glow)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "stream-cursor": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        "petal-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "version-pulse": {
          "0%": { boxShadow: "0 0 0 0 var(--ember-glow)" },
          "70%": { boxShadow: "0 0 0 12px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        "panel-slide": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "stream-cursor": "stream-cursor 900ms ease-in-out infinite",
        "petal-spin": "petal-spin 2.4s linear infinite",
        "version-pulse": "version-pulse 1.4s ease-out 1",
        "panel-slide": "panel-slide 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;

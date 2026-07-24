import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        paper: "#F4F3EE", // app background — warm neutral, cooler than cream
        surface: "#FCFBF8", // cards / raised surfaces
        line: "#E4E1D8", // hairline borders
        "line-strong": "#D6D2C6",

        // Ink
        ink: "#23221F",
        "ink-soft": "#6A685F",
        "ink-faint": "#94918616", // reserved (rare)

        // Brand — deep petrol-pine
        pine: {
          DEFAULT: "#1E4D45",
          dark: "#163A34",
          soft: "#3A6E64",
          tint: "#E7EFEC",
        },

        // Semantic signals (baseline-relative tracking is the product)
        better: { DEFAULT: "#2F7A57", tint: "#E6F1EB" },
        worse: { DEFAULT: "#B45309", tint: "#F7ECDF" },
        steady: { DEFAULT: "#8A887E", tint: "#EDEBE4" },
        alarm: { DEFAULT: "#B42318", dark: "#8F1C11", tint: "#FBEAE7" },

        // Sparing structural accent
        gold: "#B8863B",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "10px",
        lg: "14px",
        xl: "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,26,20,0.04), 0 1px 3px rgba(28,26,20,0.03)",
        raised:
          "0 2px 4px rgba(28,26,20,0.05), 0 6px 16px rgba(28,26,20,0.06)",
        focus: "0 0 0 3px rgba(30,77,69,0.18)",
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
      maxWidth: {
        prose: "38rem",
      },
    },
  },
  plugins: [],
};
export default config;

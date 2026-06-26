import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wb: {
          purple: "#A73AFD",
          "purple-dark": "#8B2FD4",
          light: "#F5EEFF",
        },
      },
    },
  },
  plugins: [],
};

export default config;

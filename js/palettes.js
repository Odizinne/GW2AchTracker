export const PALETTES = [
  {
    id: "orange", label: "Orange", swatch: "#d47a3a",
    dark:  { accent: "#d47a3a", dim: "#9e5a24", glow: "rgba(212,122,58,0.15)"  },
    light: { accent: "#bf6a2a", dim: "#a85820", glow: "rgba(191,106,42,0.18)"  },
  },
  {
    id: "red", label: "Red", swatch: "#d94f4f",
    dark:  { accent: "#d94f4f", dim: "#a83535", glow: "rgba(217,79,79,0.15)"   },
    light: { accent: "#c03838", dim: "#922828", glow: "rgba(192,56,56,0.18)"   },
  },
  {
    id: "green", label: "Green", swatch: "#4caf7d",
    dark:  { accent: "#4caf7d", dim: "#347a57", glow: "rgba(76,175,125,0.15)"  },
    light: { accent: "#2e8a5a", dim: "#1e6040", glow: "rgba(46,138,90,0.18)"   },
  },
  {
    id: "pink", label: "Pink", swatch: "#d47aaa",
    dark:  { accent: "#d47aaa", dim: "#9e5a7d", glow: "rgba(212,122,170,0.15)" },
    light: { accent: "#c05888", dim: "#923f66", glow: "rgba(192,88,136,0.18)"  },
  },
  {
    id: "violet", label: "Violet", swatch: "#9a7ad4",
    dark:  { accent: "#9a7ad4", dim: "#7255a8", glow: "rgba(154,122,212,0.15)" },
    light: { accent: "#7358bf", dim: "#5540a0", glow: "rgba(115,88,191,0.18)"  },
  },
  {
    id: "yellow", label: "Yellow", swatch: "#d4b83a",
    dark:  { accent: "#d4b83a", dim: "#a88c20", glow: "rgba(212,184,58,0.15)"  },
    light: { accent: "#9a8018", dim: "#7a6410", glow: "rgba(154,128,24,0.18)"  },
  },
  {
    id: "teal", label: "Teal", swatch: "#3abdd4",
    dark:  { accent: "#3abdd4", dim: "#208fa8", glow: "rgba(58,189,212,0.15)"  },
    light: { accent: "#1a90a8", dim: "#106e82", glow: "rgba(26,144,168,0.18)"  },
  },
  {
    id: "blue", label: "Blue", swatch: "#4a8ad4",
    dark:  { accent: "#4a8ad4", dim: "#2a60a8", glow: "rgba(74,138,212,0.15)"  },
    light: { accent: "#2a5ebf", dim: "#1a469a", glow: "rgba(42,94,191,0.18)"   },
  },
];

export function applyPalette(paletteId, theme) {
  const palette = PALETTES.find(p => p.id === paletteId) || PALETTES[0];
  const c = theme === "light" ? palette.light : palette.dark;
  const root = document.documentElement;
  root.style.setProperty("--accent",      c.accent);
  root.style.setProperty("--accent-dim",  c.dim);
  root.style.setProperty("--accent-glow", c.glow);
}

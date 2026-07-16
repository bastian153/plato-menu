/**
 * Restaurant vibe presets — simple, visual, no design skills needed.
 * Applied as CSS variables on the guest menu.
 */
window.PLATO_THEMES = [
  {
    id: "sunset-taco",
    name: "Sunset taco",
    emoji: "🌮",
    blurb: "Warm orange · street food energy",
    accent: "#e85d04",
    accent2: "#f48c06",
    bg: "#0f0e0c",
    card: "#221f1a",
    soft: "#2a261f",
    text: "#faf6f0",
    muted: "#a89f91",
  },
  {
    id: "coastal-fresh",
    name: "Coastal fresh",
    emoji: "🍋",
    blurb: "Ocean teal · light seafood cafés",
    accent: "#0d9488",
    accent2: "#2dd4bf",
    bg: "#0a1214",
    card: "#132022",
    soft: "#1a2c30",
    text: "#f0fdfa",
    muted: "#94b8b4",
  },
  {
    id: "night-ramen",
    name: "Night ramen",
    emoji: "🍜",
    blurb: "Deep red · late-night noodles",
    accent: "#dc2626",
    accent2: "#f97316",
    bg: "#0c0a0a",
    card: "#1c1414",
    soft: "#2a1a1a",
    text: "#fef2f2",
    muted: "#b5a09f",
  },
  {
    id: "garden-bowl",
    name: "Garden bowl",
    emoji: "🥗",
    blurb: "Green · healthy / vegan spots",
    accent: "#16a34a",
    accent2: "#84cc16",
    bg: "#0a100c",
    card: "#142018",
    soft: "#1c2a20",
    text: "#f0fdf4",
    muted: "#9ab8a4",
  },
  {
    id: "espresso-bar",
    name: "Espresso bar",
    emoji: "☕",
    blurb: "Coffee brown · bakeries & cafés",
    accent: "#a16207",
    accent2: "#d97706",
    bg: "#100e0c",
    card: "#1f1a16",
    soft: "#2c241c",
    text: "#faf6f0",
    muted: "#b0a294",
  },
  {
    id: "sakura-night",
    name: "Sakura night",
    emoji: "🍣",
    blurb: "Soft pink · sushi / Japanese",
    accent: "#db2777",
    accent2: "#f472b6",
    bg: "#100a0e",
    card: "#1f141a",
    soft: "#2a1c24",
    text: "#fdf2f8",
    muted: "#b89aab",
  },
  {
    id: "fire-grill",
    name: "Fire grill",
    emoji: "🔥",
    blurb: "Charcoal + flame · BBQ / steak",
    accent: "#ea580c",
    accent2: "#fbbf24",
    bg: "#0c0b0a",
    card: "#1a1714",
    soft: "#28221c",
    text: "#fffbeb",
    muted: "#a89b88",
  },
  {
    id: "clean-light",
    name: "Clean light",
    emoji: "✨",
    blurb: "Bright & simple · modern casual",
    accent: "#2563eb",
    accent2: "#38bdf8",
    bg: "#0b0f14",
    card: "#141a22",
    soft: "#1c2530",
    text: "#f8fafc",
    muted: "#94a3b8",
  },
];

window.platoGetTheme = function platoGetTheme(idOrRestaurant) {
  let id = idOrRestaurant;
  if (idOrRestaurant && typeof idOrRestaurant === "object") {
    id =
      idOrRestaurant.themeId ||
      (idOrRestaurant.theme && idOrRestaurant.theme.id) ||
      null;
  }
  return (
    PLATO_THEMES.find((t) => t.id === id) ||
    PLATO_THEMES[0]
  );
};

/** Apply theme CSS variables to document root (or element) */
window.platoApplyTheme = function platoApplyTheme(theme, el) {
  const t = theme && theme.accent ? theme : platoGetTheme(theme);
  const root = el || document.documentElement;
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent-2", t.accent2);
  root.style.setProperty("--bg", t.bg);
  root.style.setProperty("--bg-elev", t.bg);
  root.style.setProperty("--bg-card", t.card);
  root.style.setProperty("--bg-soft", t.soft);
  root.style.setProperty("--text", t.text);
  root.style.setProperty("--muted", t.muted);
  const soft = t.accent + "26"; // rough alpha if hex 6-digit
  try {
    if (t.accent.startsWith("#") && t.accent.length === 7) {
      const r = parseInt(t.accent.slice(1, 3), 16);
      const g = parseInt(t.accent.slice(3, 5), 16);
      const b = parseInt(t.accent.slice(5, 7), 16);
      root.style.setProperty("--accent-soft", `rgba(${r},${g},${b},0.15)`);
    }
  } catch {
    root.style.setProperty("--accent-soft", soft);
  }
  document.body && (document.body.style.background = t.bg);
};

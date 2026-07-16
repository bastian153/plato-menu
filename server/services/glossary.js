/**
 * Terms that should not be machine-translated (dish names / cultural terms).
 * Matched case-insensitively as whole words / phrases.
 */
const DEFAULT_GLOSSARY = [
  "al pastor",
  "carne asada",
  "carnitas",
  "birria",
  "horchata",
  "elote",
  "nopales",
  "queso fresco",
  "salsa verde",
  "salsa roja",
  "pico de gallo",
  "guacamole",
  "taco",
  "tacos",
  "burrito",
  "enchilada",
  "tamale",
  "tamales",
  "pozole",
  "menudo",
  "agua fresca",
  "jamaica",
  "torta",
  "quesadilla",
  "mole",
  "adobada",
  "pastor",
  "asada",
  "cotija",
  "achiote",
  "consomé",
  "consomme",
];

function protectGlossary(text, glossary = DEFAULT_GLOSSARY) {
  if (!text) return { text: "", tokens: [] };
  let out = String(text);
  const tokens = [];
  const sorted = [...glossary].sort((a, b) => b.length - a.length);
  sorted.forEach((term, i) => {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
    out = out.replace(re, () => {
      const token = `__PLATO_G${i}__`;
      tokens.push({ token, term });
      return token;
    });
  });
  // unique tokens only (last wins for term)
  const map = new Map();
  tokens.forEach((t) => map.set(t.token, t.term));
  return {
    text: out,
    tokens: [...map.entries()].map(([token, term]) => ({ token, term })),
  };
}

function restoreGlossary(text, tokens) {
  let out = String(text || "");
  (tokens || []).forEach(({ token, term }) => {
    out = out.split(token).join(term);
    // Some MTs mangle underscores
    const soft = token.replace(/_/g, "[_\\s]*");
    out = out.replace(new RegExp(soft, "gi"), term);
  });
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadGlossary() {
  const extra = (process.env.TRANSLATE_GLOSSARY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_GLOSSARY, ...extra])];
}

module.exports = {
  DEFAULT_GLOSSARY,
  protectGlossary,
  restoreGlossary,
  loadGlossary,
};

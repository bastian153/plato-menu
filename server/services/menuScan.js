/**
 * Extract dishes from a paper-menu photo or plain text.
 * Uses SpaceXAI / xAI vision when XAI_API_KEY is set; otherwise heuristic text parse.
 * Preserves real menu sections (Soup & Salads, Pasta, Mains, …).
 */
const config = require("../config");

const SYSTEM = `You extract restaurant menu items from images or text.
Return ONLY valid JSON (no markdown) with this shape:
{
  "sections": [
    {
      "title": "Section title exactly as printed (e.g. Soup & Salads, Ravioli / Pasta, Mains)",
      "items": [
        {
          "name": "Dish name in original language",
          "description": "Short description if available, else empty string",
          "price": 12.50,
          "spicy": 0
        }
      ]
    }
  ],
  "sourceLanguage": "en" | "es" | "zh" | etc,
  "notes": "optional short note"
}
Rules:
- Preserve the menu's real section headers and order (top to bottom).
- Never invent sections that are not on the menu. If no headers, use one section titled "Menu".
- price must be a number in the menu's currency (no $ sign). If missing, use 0.
- spicy 0-3 if you can infer, else 0.
- Skip pure headers as dishes; they become section titles only.
- Max 40 dishes total across all sections.
- Keep authentic dish names (e.g. Al Pastor, Cacio e Pepe).
- Do NOT force categories into tacos/bowls — use the printed section titles.`;

function slugifyCategory(input) {
  let s = String(input || "menu")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!s) s = "menu";
  // Legacy taco-app slugs still OK if they appear
  return s;
}

async function extractFromImage(buffer, mime = "image/jpeg") {
  const key = process.env.XAI_API_KEY || config.xaiApiKey || "";
  if (!key) {
    return {
      dishes: [],
      sections: [],
      sourceLanguage: "en",
      notes:
        "Set XAI_API_KEY for AI photo scan. You can still paste menu text or use bulk add.",
      provider: "none",
    };
  }

  const b64 = buffer.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  const model = process.env.XAI_VISION_MODEL || process.env.XAI_MODEL || "grok-4.5";

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
            {
              type: "text",
              text:
                "Extract every section header and all menu items under each section, with names, prices, and descriptions. Keep section order as printed.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Vision API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  return { ...parseModelJson(content), provider: "xai" };
}

async function extractFromText(text) {
  const key = process.env.XAI_API_KEY || config.xaiApiKey || "";
  if (key && text && text.length > 20) {
    const model = process.env.XAI_MODEL || "grok-4.5";
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Extract sections and dishes from this menu text:\n\n${text.slice(0, 8000)}`,
          },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const content =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;
      return { ...parseModelJson(content), provider: "xai" };
    }
  }
  return { ...heuristicParse(text), provider: "heuristic" };
}

function parseModelJson(content) {
  if (!content) {
    return { dishes: [], sections: [], sourceLanguage: "en", notes: "Empty model response" };
  }
  let raw = String(content).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    return normalizeResult(JSON.parse(raw));
  } catch {
    const i = raw.indexOf("{");
    const j = raw.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return normalizeResult(JSON.parse(raw.slice(i, j + 1)));
      } catch {
        /* fall through */
      }
    }
    return {
      dishes: [],
      sections: [],
      sourceLanguage: "en",
      notes: "Could not parse AI JSON",
      raw: raw.slice(0, 200),
    };
  }
}

function normalizeDish(d, categorySlug, categoryLabel) {
  const name = String(d.name || d.title || "").trim();
  if (!name) return null;
  const label =
    String(categoryLabel || d.categoryLabel || d.section || d.category || "Menu").trim() ||
    "Menu";
  const slug = slugifyCategory(categorySlug || d.categorySlug || d.category || label);
  return {
    name,
    description: String(d.description || d.desc || "").trim(),
    price: Number(String(d.price || 0).replace(/[^0-9.]/g, "")) || 0,
    category: slug,
    categoryLabel: label,
    spicy: Math.min(3, Math.max(0, Number(d.spicy) || 0)),
  };
}

function normalizeResult(parsed) {
  const dishes = [];
  const sections = [];
  const seenSlugs = new Set();

  // Preferred: sections[] with items
  if (Array.isArray(parsed.sections) && parsed.sections.length) {
    parsed.sections.forEach((sec, idx) => {
      const title = String(sec.title || sec.name || sec.category || "Menu").trim() || "Menu";
      const slug = slugifyCategory(sec.slug || title);
      if (!seenSlugs.has(slug)) {
        sections.push({ id: slug, title, sortOrder: idx });
        seenSlugs.add(slug);
      }
      const items = sec.items || sec.dishes || [];
      items.forEach((item) => {
        const d = normalizeDish(item, slug, title);
        if (d) dishes.push(d);
      });
    });
  }

  // Fallback: flat dishes[] with free-text category
  if (!dishes.length && Array.isArray(parsed.dishes)) {
    parsed.dishes.forEach((raw) => {
      const label = String(raw.categoryLabel || raw.section || raw.category || "Menu").trim() || "Menu";
      const slug = slugifyCategory(raw.categorySlug || raw.category || label);
      if (!seenSlugs.has(slug)) {
        sections.push({ id: slug, title: label, sortOrder: sections.length });
        seenSlugs.add(slug);
      }
      const d = normalizeDish(raw, slug, label);
      if (d) dishes.push(d);
    });
  }

  // Rebuild sections from dishes if model only returned dishes with mixed categories
  if (!sections.length && dishes.length) {
    const order = [];
    dishes.forEach((d) => {
      if (!order.includes(d.category)) order.push(d.category);
    });
    order.forEach((slug, i) => {
      const sample = dishes.find((d) => d.category === slug);
      sections.push({
        id: slug,
        title: (sample && sample.categoryLabel) || slug,
        sortOrder: i,
      });
    });
  }

  return {
    dishes: dishes.slice(0, 40),
    sections: sections.slice(0, 20),
    sourceLanguage: parsed.sourceLanguage || "en",
    notes: parsed.notes || "",
  };
}

/** Offline-friendly line parser with simple ALL-CAPS section detection */
function heuristicParse(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const dishes = [];
  const sections = [];
  let currentLabel = "Menu";
  let currentSlug = "menu";

  for (const line of lines) {
    // Section header: short line, mostly letters, no price
    if (
      line.length >= 3 &&
      line.length <= 48 &&
      !/\$?\d/.test(line) &&
      (/^[A-Z0-9][A-Z0-9\s/&'-]+$/.test(line) ||
        /^(appetizer|soup|salad|pasta|ravioli|main|entree|entr|side|drink|dessert|pizza|taco)/i.test(
          line
        ))
    ) {
      currentLabel = line.replace(/[:.]+$/, "").trim();
      currentSlug = slugifyCategory(currentLabel);
      if (!sections.find((s) => s.id === currentSlug)) {
        sections.push({ id: currentSlug, title: currentLabel, sortOrder: sections.length });
      }
      continue;
    }
    if (line.length < 3 || line.length > 120) continue;

    const m = line.match(/^(.*?)[\s.·…]+\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
    if (m) {
      dishes.push({
        name: m[1].replace(/[\s.·…]+$/, "").trim(),
        description: "",
        price: Number(m[2].replace(",", ".")) || 0,
        category: currentSlug,
        categoryLabel: currentLabel,
        spicy: 0,
      });
    } else if (
      /^[A-ZÁÉÍÓÚÑ][\w\s'&áéíóúñÁÉÍÓÚÑ-]{2,40}$/.test(line) &&
      !/^\d/.test(line)
    ) {
      dishes.push({
        name: line,
        description: "",
        price: 0,
        category: currentSlug,
        categoryLabel: currentLabel,
        spicy: 0,
      });
    }
  }

  if (!sections.length && dishes.length) {
    sections.push({ id: "menu", title: "Menu", sortOrder: 0 });
  }

  return {
    dishes: dishes.slice(0, 40),
    sections,
    sourceLanguage: /[áéíóúñ¿¡]/i.test(text) ? "es" : "en",
    notes: dishes.length
      ? "Parsed without AI (heuristic). Review sections, prices, and descriptions."
      : "No dishes found. Paste clearer lines like: Carnitas 4.50",
  };
}

module.exports = {
  extractFromImage,
  extractFromText,
  heuristicParse,
  slugifyCategory,
};

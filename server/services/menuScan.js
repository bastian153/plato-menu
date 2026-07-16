/**
 * Extract dishes from a paper-menu photo or plain text.
 * Uses SpaceXAI / xAI vision when XAI_API_KEY is set; otherwise heuristic text parse.
 */
const config = require("../config");

const SYSTEM = `You extract restaurant menu items from images or text.
Return ONLY valid JSON (no markdown) with this shape:
{
  "dishes": [
    {
      "name": "Dish name in original language",
      "description": "Short description if available, else empty string",
      "price": 12.50,
      "category": "mains" | "sides" | "drinks" | "tacos" | "bowls" | "other",
      "spicy": 0
    }
  ],
  "sourceLanguage": "en" | "es" | "zh" | etc,
  "notes": "optional short note"
}
Rules:
- price must be a number in the menu's currency (no $ sign). If missing, use 0.
- spicy 0-3 if you can infer, else 0.
- Skip headers like "Appetizers" as dishes; use them as category when possible.
- Max 40 dishes.
- Keep authentic dish names (e.g. Al Pastor).`;

async function extractFromImage(buffer, mime = "image/jpeg") {
  const key = process.env.XAI_API_KEY || config.xaiApiKey || "";
  if (!key) {
    return {
      dishes: [],
      sourceLanguage: "en",
      notes:
        "Set XAI_API_KEY for AI photo scan. You can still paste menu text or use bulk add.",
      provider: "none",
    };
  }

  const b64 = buffer.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  const model = process.env.XAI_VISION_MODEL || process.env.XAI_MODEL || "grok-2-vision-1212";

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
              text: "Extract all menu items with names, prices, and descriptions.",
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
            content: `Extract dishes from this menu text:\n\n${text.slice(0, 8000)}`,
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
  if (!content) return { dishes: [], sourceLanguage: "en", notes: "Empty model response" };
  let raw = String(content).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  try {
    const parsed = JSON.parse(raw);
    return normalizeResult(parsed);
  } catch {
    // try find first { ... }
    const i = raw.indexOf("{");
    const j = raw.lastIndexOf("}");
    if (i >= 0 && j > i) {
      try {
        return normalizeResult(JSON.parse(raw.slice(i, j + 1)));
      } catch {
        /* fall through */
      }
    }
    return { dishes: [], sourceLanguage: "en", notes: "Could not parse AI JSON", raw: raw.slice(0, 200) };
  }
}

function normalizeResult(parsed) {
  const dishes = Array.isArray(parsed.dishes) ? parsed.dishes : [];
  return {
    dishes: dishes
      .slice(0, 40)
      .map((d) => ({
        name: String(d.name || d.title || "").trim(),
        description: String(d.description || d.desc || "").trim(),
        price: Number(String(d.price || 0).replace(/[^0-9.]/g, "")) || 0,
        category: mapCategory(d.category),
        spicy: Math.min(3, Math.max(0, Number(d.spicy) || 0)),
      }))
      .filter((d) => d.name),
    sourceLanguage: parsed.sourceLanguage || "en",
    notes: parsed.notes || "",
  };
}

function mapCategory(c) {
  const s = String(c || "other").toLowerCase();
  if (/taco/.test(s)) return "tacos";
  if (/bowl|rice|plate|main|entree|entr/.test(s)) return "bowls";
  if (/side|drink|bever|agua|soda|dessert/.test(s)) return "sides";
  if (s === "tacos" || s === "bowls" || s === "sides") return s;
  return "tacos";
}

/** Offline-friendly line parser: "Tacos al pastor .... $4.50" */
function heuristicParse(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const dishes = [];
  for (const line of lines) {
    if (line.length < 3 || line.length > 120) continue;
    if (/^(menu|appetizer|entree|sides?|drinks?|bebidas|tacos)\b/i.test(line) && !/\d/.test(line)) {
      continue;
    }
    const m = line.match(/^(.*?)[\s.·…]+\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
    if (m) {
      dishes.push({
        name: m[1].replace(/[\s.·…]+$/, "").trim(),
        description: "",
        price: Number(m[2].replace(",", ".")) || 0,
        category: "tacos",
        spicy: 0,
      });
    } else if (/^[A-ZÁÉÍÓÚÑ][\w\s'&áéíóúñÁÉÍÓÚÑ-]{2,40}$/.test(line) && !/^\d/.test(line)) {
      dishes.push({
        name: line,
        description: "",
        price: 0,
        category: "tacos",
        spicy: 0,
      });
    }
  }
  return {
    dishes: dishes.slice(0, 40),
    sourceLanguage: /[áéíóúñ¿¡]/i.test(text) ? "es" : "en",
    notes: dishes.length
      ? "Parsed without AI (heuristic). Review prices and descriptions."
      : "No dishes found. Paste clearer lines like: Carnitas 4.50",
  };
}

module.exports = {
  extractFromImage,
  extractFromText,
  heuristicParse,
};

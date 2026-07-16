const config = require("../config");
const { protectGlossary, restoreGlossary, loadGlossary } = require("./glossary");

const glossary = loadGlossary();

async function translateRaw(text, from, to, provider) {
  if (!text || from === to) return text;

  if (provider === "deepl") {
    return translateDeepL(text, from, to);
  }
  if (provider === "google") {
    return translateGoogle(text, from, to);
  }
  return translateMyMemory(text, from, to);
}

function pickProvider() {
  const p = config.translate.provider;
  if (p === "deepl" && config.translate.deeplKey) return "deepl";
  if (p === "google" && config.translate.googleKey) return "google";
  if (p === "mymemory") return "mymemory";
  // auto
  if (config.translate.deeplKey) return "deepl";
  if (config.translate.googleKey) return "google";
  return "mymemory";
}

async function translateDeepL(text, from, to) {
  const form = new URLSearchParams();
  form.set("text", text);
  form.set("source_lang", from.toUpperCase());
  form.set("target_lang", mapDeepL(to));
  const res = await fetch(config.translate.deeplUrl, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${config.translate.deeplKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepL error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.translations && data.translations[0] && data.translations[0].text) || text;
}

function mapDeepL(code) {
  const m = { en: "EN", es: "ES", fr: "FR", de: "DE", it: "IT", pt: "PT", ru: "RU", ja: "JA", zh: "ZH", ko: "KO" };
  return m[code] || code.toUpperCase();
}

async function translateGoogle(text, from, to) {
  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", config.translate.googleKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: from,
      target: to,
      format: "text",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Translate error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (
    (data.data &&
      data.data.translations &&
      data.data.translations[0] &&
      data.data.translations[0].translatedText) ||
    text
  );
}

async function translateMyMemory(text, from, to) {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text.slice(0, 450)) +
    "&langpair=" +
    encodeURIComponent(`${from}|${to}`);
  const res = await fetch(url);
  const data = await res.json();
  let out =
    (data && data.responseData && data.responseData.translatedText) || text;
  if (/MYMEMORY WARNING|QUERY LENGTH|LIMIT/i.test(out)) out = text;
  return out;
}

async function translateText(text, from, to, opts = {}) {
  if (!text || !String(text).trim()) return "";
  if (from === to) return text;

  const useGlossary = opts.glossary !== false;
  let payload = String(text);
  let tokens = [];
  if (useGlossary) {
    const protected_ = protectGlossary(payload, glossary);
    payload = protected_.text;
    tokens = protected_.tokens;
  }

  const provider = opts.provider || pickProvider();
  let out;
  try {
    out = await translateRaw(payload, from, to, provider);
  } catch (err) {
    console.warn(`[translate] ${provider} failed, falling back to mymemory:`, err.message);
    if (provider !== "mymemory") {
      out = await translateMyMemory(payload, from, to);
    } else {
      out = text;
    }
  }

  if (useGlossary) out = restoreGlossary(out, tokens);
  return out;
}

async function translateDishFields({ name, desc, fromLang, toLangs }) {
  const nameMap = { [fromLang]: name };
  const descMap = { [fromLang]: desc };
  const targets = (toLangs || []).filter((c) => c !== fromLang);
  const provider = pickProvider();

  for (const to of targets) {
    nameMap[to] = await translateText(name, fromLang, to, {
      provider,
      glossary: true,
    });
    await sleep(provider === "mymemory" ? 100 : 20);
    descMap[to] = await translateText(desc, fromLang, to, {
      provider,
      glossary: true,
    });
    await sleep(provider === "mymemory" ? 100 : 20);
  }

  return { name: nameMap, desc: descMap, provider };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  translateText,
  translateDishFields,
  pickProvider,
};

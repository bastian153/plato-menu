/**
 * Translation pipeline for new menu items.
 *
 * Flow:
 * 1. Owner writes name + description in primary language (e.g. English or Spanish).
 * 2. "Translate to all languages" calls a free public MT API (MyMemory) per target.
 * 3. Results are stored per language; owner can edit any field before/after save.
 * 4. If API fails, we keep the source text so the dish is never blank.
 *
 * Production would use DeepL/Google Cloud Translate + human review queue.
 */
window.PlatoTranslate = (function () {
  const cache = new Map();

  function cacheKey(text, from, to) {
    return `${from}|${to}|${text}`;
  }

  async function translateText(text, from, to) {
    if (!text || !String(text).trim()) return "";
    if (from === to) return text;

    const key = cacheKey(text, from, to);
    if (cache.has(key)) return cache.get(key);

    // MyMemory free endpoint (rate-limited; fine for demos)
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 450)) +
      "&langpair=" +
      encodeURIComponent(from + "|" + to);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      let out =
        (data && data.responseData && data.responseData.translatedText) || text;
      // API sometimes returns QUOTA EXCEEDED message
      if (/MYMEMORY WARNING|QUERY LENGTH|LIMIT/i.test(out)) {
        out = text;
      }
      cache.set(key, out);
      return out;
    } catch (e) {
      console.warn("Translate failed", from, to, e);
      return text; // never leave empty
    }
  }

  /**
   * Translate a string into many languages.
   * @param {string} text
   * @param {string} fromLang
   * @param {string[]} toLangs
   * @param {(done:number,total:number)=>void} onProgress
   * @returns {Promise<Record<string,string>>}
   */
  async function translateToMany(text, fromLang, toLangs, onProgress) {
    const result = { [fromLang]: text };
    const targets = toLangs.filter((c) => c !== fromLang);
    let done = 0;
    for (const to of targets) {
      result[to] = await translateText(text, fromLang, to);
      done++;
      if (onProgress) onProgress(done, targets.length);
      // gentle pacing for free API
      await sleep(120);
    }
    return result;
  }

  /**
   * Build name + desc maps for a dish from source fields.
   */
  async function translateDishFields({ name, desc, fromLang, toLangs, onProgress }) {
    const totalSteps = (toLangs.length - 1) * 2;
    let step = 0;
    const tick = () => {
      step++;
      if (onProgress) onProgress(Math.min(step, totalSteps), Math.max(totalSteps, 1));
    };

    const nameMap = { [fromLang]: name };
    const descMap = { [fromLang]: desc };
    const targets = toLangs.filter((c) => c !== fromLang);

    for (const to of targets) {
      nameMap[to] = await translateText(name, fromLang, to);
      tick();
      await sleep(100);
      descMap[to] = await translateText(desc, fromLang, to);
      tick();
      await sleep(100);
    }
    return { name: nameMap, desc: descMap };
  }

  /**
   * Fill only missing language keys on an existing multilingual object.
   */
  async function fillMissing(map, fromLang, toLangs, onProgress) {
    const source = map[fromLang] || map.en || Object.values(map).find(Boolean) || "";
    const next = { ...map };
    const missing = toLangs.filter((c) => !next[c] || !String(next[c]).trim());
    let done = 0;
    for (const to of missing) {
      next[to] = await translateText(source, fromLang, to);
      done++;
      if (onProgress) onProgress(done, missing.length || 1);
      await sleep(120);
    }
    return next;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  return {
    translateText,
    translateToMany,
    translateDishFields,
    fillMissing,
  };
})();

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
  db,
  getRestaurantByOwner,
  getRestaurantBySlug,
  getRestaurantById,
  getMenuBundle,
  getStats,
  dishToJson,
} = require("./db");
const {
  id,
  uniqueSlug,
  signToken,
  authMiddleware,
  hashPassword,
  verifyPassword,
} = require("./auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
      ? ext
      : ".jpg";
    cb(null, `${Date.now()}-${id("img")}${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed"));
    }
    cb(null, true);
  },
});

function requireRestaurant(req, res) {
  const restaurant = getRestaurantByOwner(req.user.id);
  if (!restaurant) {
    res.status(404).json({ error: "No restaurant for this account" });
    return null;
  }
  return restaurant;
}

/* ---------- Auth ---------- */

router.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim();
    const restaurantName = String(
      req.body.restaurantName || name || "My Restaurant"
    ).trim();

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const userId = id("usr");
    const hash = await hashPassword(password);
    db.prepare(
      "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"
    ).run(userId, email, hash, name || restaurantName);

    const restId = id("rst");
    const slug = uniqueSlug(restaurantName);
    db.prepare(
      `INSERT INTO restaurants
       (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, enabled_langs_json, primary_lang)
       VALUES (?, ?, ?, ?, '🍽️', '{}', '{}', '{}', ?, 'en')`
    ).run(
      restId,
      userId,
      slug,
      restaurantName,
      JSON.stringify(["en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar"])
    );

    // default categories
    [
      ["tacos", { en: "Mains", es: "Platos" }],
      ["sides", { en: "Sides & drinks", es: "Acompañamientos" }],
    ].forEach(([slugCat, labels], i) => {
      db.prepare(
        `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id("cat"), restId, slugCat, JSON.stringify(labels), i);
    });

    const user = { id: userId, email, name: name || restaurantName };
    const token = signToken(user);
    const restaurant = getRestaurantById(restId);

    res.status(201).json({
      token,
      user,
      restaurant,
      menu: getMenuBundle(restId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const restaurant = getRestaurantByOwner(user.id);
    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name },
      restaurant,
      menu: restaurant ? getMenuBundle(restaurant.id) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", authMiddleware, (req, res) => {
  const restaurant = getRestaurantByOwner(req.user.id);
  res.json({
    user: req.user,
    restaurant,
    menu: restaurant ? getMenuBundle(restaurant.id) : null,
  });
});

/* ---------- Owner restaurant / menu ---------- */

router.get("/me/menu", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;
  res.json({
    menu: getMenuBundle(restaurant.id),
    stats: getStats(restaurant.id),
  });
});

router.patch("/me/restaurant", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;

  const name = req.body.name != null ? String(req.body.name).trim() : restaurant.name;
  const emoji = req.body.emoji != null ? String(req.body.emoji) : restaurant.emoji;
  const primaryLang =
    req.body.primaryLang != null
      ? String(req.body.primaryLang)
      : restaurant.primaryLang;
  const enabledLangs = Array.isArray(req.body.enabledLangs)
    ? req.body.enabledLangs
    : restaurant.enabledLangs;
  const tagline = req.body.tagline || restaurant.tagline;
  const address = req.body.address || restaurant.address;
  const hours = req.body.hours || restaurant.hours;

  db.prepare(
    `UPDATE restaurants SET
      name = ?, emoji = ?, primary_lang = ?, enabled_langs_json = ?,
      tagline_json = ?, address_json = ?, hours_json = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name,
    emoji,
    primaryLang,
    JSON.stringify(enabledLangs),
    JSON.stringify(tagline),
    JSON.stringify(address),
    JSON.stringify(hours),
    restaurant.id
  );

  res.json({ restaurant: getRestaurantById(restaurant.id), menu: getMenuBundle(restaurant.id) });
});

/* ---------- Dishes ---------- */

router.post("/me/dishes", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;

  const body = req.body || {};
  const dishId = body.id || id("dsh");
  const name = body.name || {};
  const desc = body.desc || {};
  if (!Object.values(name).some(Boolean)) {
    return res.status(400).json({ error: "Dish name required" });
  }

  const maxSort =
    db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), 0) as m FROM dishes WHERE restaurant_id = ?"
      )
      .get(restaurant.id).m || 0;

  db.prepare(
    `INSERT INTO dishes
     (id, restaurant_id, category_slug, price, spicy, popular, sold_out, name_json, desc_json, tags_json, allergens_json, photos_json, photo_count, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dishId,
    restaurant.id,
    body.category || "tacos",
    Number(body.price) || 0,
    Number(body.spicy) || 0,
    body.popular ? 1 : 0,
    body.soldOut ? 1 : 0,
    JSON.stringify(name),
    JSON.stringify(desc),
    JSON.stringify(body.tags || {}),
    JSON.stringify(body.allergens || {}),
    JSON.stringify(body.photos || []),
    (body.photos || []).length || body.photoCount || 0,
    maxSort + 1
  );

  const row = db.prepare("SELECT * FROM dishes WHERE id = ?").get(dishId);
  res.status(201).json({ dish: dishToJson(row), menu: getMenuBundle(restaurant.id) });
});

router.put("/me/dishes/:dishId", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;

  const existing = db
    .prepare("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?")
    .get(req.params.dishId, restaurant.id);
  if (!existing) return res.status(404).json({ error: "Dish not found" });

  const body = req.body || {};
  db.prepare(
    `UPDATE dishes SET
      category_slug = ?, price = ?, spicy = ?, popular = ?, sold_out = ?,
      name_json = ?, desc_json = ?, tags_json = ?, allergens_json = ?,
      photos_json = ?, photo_count = ?, updated_at = datetime('now')
     WHERE id = ? AND restaurant_id = ?`
  ).run(
    body.category != null ? body.category : existing.category_slug,
    body.price != null ? Number(body.price) : existing.price,
    body.spicy != null ? Number(body.spicy) : existing.spicy,
    body.popular != null ? (body.popular ? 1 : 0) : existing.popular,
    body.soldOut != null ? (body.soldOut ? 1 : 0) : existing.sold_out,
    JSON.stringify(body.name != null ? body.name : JSON.parse(existing.name_json)),
    JSON.stringify(body.desc != null ? body.desc : JSON.parse(existing.desc_json)),
    JSON.stringify(body.tags != null ? body.tags : JSON.parse(existing.tags_json || "{}")),
    JSON.stringify(
      body.allergens != null
        ? body.allergens
        : JSON.parse(existing.allergens_json || "{}")
    ),
    JSON.stringify(body.photos != null ? body.photos : JSON.parse(existing.photos_json || "[]")),
    body.photos != null
      ? body.photos.length
      : body.photoCount != null
        ? body.photoCount
        : existing.photo_count,
    req.params.dishId,
    restaurant.id
  );

  const row = db.prepare("SELECT * FROM dishes WHERE id = ?").get(req.params.dishId);
  res.json({ dish: dishToJson(row), menu: getMenuBundle(restaurant.id) });
});

router.patch("/me/dishes/:dishId/sold-out", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;
  const existing = db
    .prepare("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?")
    .get(req.params.dishId, restaurant.id);
  if (!existing) return res.status(404).json({ error: "Dish not found" });

  const soldOut =
    req.body.soldOut != null ? !!req.body.soldOut : !existing.sold_out;
  db.prepare(
    "UPDATE dishes SET sold_out = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(soldOut ? 1 : 0, req.params.dishId);

  const row = db.prepare("SELECT * FROM dishes WHERE id = ?").get(req.params.dishId);
  res.json({ dish: dishToJson(row), menu: getMenuBundle(restaurant.id) });
});

router.delete("/me/dishes/:dishId", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;
  const result = db
    .prepare("DELETE FROM dishes WHERE id = ? AND restaurant_id = ?")
    .run(req.params.dishId, restaurant.id);
  if (!result.changes) return res.status(404).json({ error: "Dish not found" });
  res.json({ ok: true, menu: getMenuBundle(restaurant.id) });
});

/* ---------- Pending photos ---------- */

router.post("/me/photos/:photoId/approve", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;
  const photo = db
    .prepare(
      "SELECT * FROM pending_photos WHERE id = ? AND restaurant_id = ?"
    )
    .get(req.params.photoId, restaurant.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });

  const dish = db
    .prepare("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?")
    .get(photo.dish_id, restaurant.id);
  if (dish) {
    const photos = JSON.parse(dish.photos_json || "[]");
    photos.push(photo.url);
    db.prepare(
      "UPDATE dishes SET photos_json = ?, photo_count = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(photos), photos.length, dish.id);
  }
  db.prepare("DELETE FROM pending_photos WHERE id = ?").run(photo.id);
  res.json({ ok: true, menu: getMenuBundle(restaurant.id) });
});

router.post("/me/photos/:photoId/reject", authMiddleware, (req, res) => {
  const restaurant = requireRestaurant(req, res);
  if (!restaurant) return;
  db.prepare(
    "DELETE FROM pending_photos WHERE id = ? AND restaurant_id = ?"
  ).run(req.params.photoId, restaurant.id);
  res.json({ ok: true, menu: getMenuBundle(restaurant.id) });
});

/* ---------- Upload ---------- */

router.post(
  "/me/upload",
  authMiddleware,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  },
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  }
);

/* ---------- Translate proxy ---------- */

router.post("/translate", authMiddleware, async (req, res) => {
  try {
    const text = String(req.body.text || "").slice(0, 450);
    const from = String(req.body.from || "en");
    const to = String(req.body.to || "es");
    if (!text) return res.json({ text: "" });
    if (from === to) return res.json({ text });

    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(`${from}|${to}`);

    const r = await fetch(url);
    const data = await r.json();
    let out =
      (data && data.responseData && data.responseData.translatedText) || text;
    if (/MYMEMORY WARNING|QUERY LENGTH|LIMIT/i.test(out)) out = text;
    res.json({ text: out });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Translation failed", text: req.body.text || "" });
  }
});

router.post("/translate/dish", authMiddleware, async (req, res) => {
  try {
    const name = String(req.body.name || "");
    const desc = String(req.body.desc || "");
    const fromLang = String(req.body.fromLang || "en");
    const toLangs = Array.isArray(req.body.toLangs) ? req.body.toLangs : ["en", "es"];

    async function tr(text, to) {
      if (!text || fromLang === to) return text;
      const url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text.slice(0, 450)) +
        "&langpair=" +
        encodeURIComponent(`${fromLang}|${to}`);
      try {
        const r = await fetch(url);
        const data = await r.json();
        let out =
          (data && data.responseData && data.responseData.translatedText) || text;
        if (/MYMEMORY WARNING|QUERY LENGTH|LIMIT/i.test(out)) out = text;
        return out;
      } catch {
        return text;
      }
    }

    const nameMap = { [fromLang]: name };
    const descMap = { [fromLang]: desc };
    for (const to of toLangs.filter((c) => c !== fromLang)) {
      nameMap[to] = await tr(name, to);
      await new Promise((r) => setTimeout(r, 100));
      descMap[to] = await tr(desc, to);
      await new Promise((r) => setTimeout(r, 100));
    }
    res.json({ name: nameMap, desc: descMap });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Translation failed" });
  }
});

/* ---------- Public menu ---------- */

router.get("/public/:slug", (req, res) => {
  const restaurant = getRestaurantBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });

  const lang = String(req.query.lang || "").slice(0, 8) || null;
  db.prepare(
    "INSERT INTO menu_events (restaurant_id, event_type, lang) VALUES (?, 'open', ?)"
  ).run(restaurant.id, lang);

  res.json({
    menu: getMenuBundle(restaurant.id),
    stats: getStats(restaurant.id),
  });
});

router.post("/public/:slug/events", (req, res) => {
  const restaurant = getRestaurantBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const type = String(req.body.type || "open");
  const dishId = req.body.dishId || null;
  const lang = req.body.lang || null;
  db.prepare(
    "INSERT INTO menu_events (restaurant_id, event_type, dish_id, lang) VALUES (?, ?, ?, ?)"
  ).run(restaurant.id, type, dishId, lang);
  res.json({ ok: true });
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "plato-api", time: new Date().toISOString() });
});

module.exports = router;

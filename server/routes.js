const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const QRCode = require("qrcode");
const config = require("./config");
const {
  get,
  run,
  all,
  getRestaurantByOwner,
  listRestaurantsByOwner,
  getOwnedRestaurant,
  getRestaurantBySlug,
  getRestaurantById,
  getMenuBundle,
  getStats,
  dishToJson,
  driver,
} = require("./db");
const {
  id,
  uniqueSlug,
  signToken,
  authMiddleware,
  hashPassword,
  verifyPassword,
  hashToken,
} = require("./auth");
const { translateDishFields, translateText, pickProvider } = require("./services/translate");
const { saveImage, driverInfo } = require("./services/storage");
const { sendMagicLink } = require("./services/mail");
const { extractFromImage, extractFromText } = require("./services/menuScan");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only images allowed"));
    cb(null, true);
  },
});

async function requireRestaurant(req, res) {
  const headerId =
    req.headers["x-restaurant-id"] ||
    req.query.restaurantId ||
    (req.body && req.body.restaurantId);
  const restaurant = await getOwnedRestaurant(req.user.id, headerId || null);
  if (!restaurant) {
    res.status(404).json({ error: "No restaurant for this account" });
    return null;
  }
  return restaurant;
}

function slugifyCategory(input) {
  let s = String(input || "menu")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "menu";
}

/** Ensure a category row exists for free-form section titles from scan/import. */
async function ensureCategory(restaurantId, slug, label, sortOrder = 0) {
  const safeSlug = slugifyCategory(slug || label || "menu");
  const title = String(label || slug || "Menu").trim() || "Menu";
  const existing = await get(
    "SELECT id, labels_json FROM categories WHERE restaurant_id = ? AND slug = ?",
    [restaurantId, safeSlug]
  );
  if (existing) return safeSlug;
  const labels = { en: title, es: title };
  await run(
    `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, ?, ?, ?)`,
    [id("cat"), restaurantId, safeSlug, JSON.stringify(labels), sortOrder]
  );
  return safeSlug;
}

async function insertDish(restaurantId, body, sortOrder) {
  const dishId = body.id || id("dsh");
  const name = body.name || {};
  const catSlug = await ensureCategory(
    restaurantId,
    body.category || body.categorySlug || "menu",
    body.categoryLabel || body.category || "Menu",
    typeof body.categorySort === "number" ? body.categorySort : 0
  );
  await run(
    `INSERT INTO dishes
     (id, restaurant_id, category_slug, price, spicy, popular, sold_out, name_json, desc_json, tags_json, allergens_json, photos_json, photo_count, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dishId,
      restaurantId,
      catSlug,
      Number(body.price) || 0,
      Number(body.spicy) || 0,
      body.popular ? 1 : 0,
      body.soldOut ? 1 : 0,
      JSON.stringify(name),
      JSON.stringify(body.desc || {}),
      JSON.stringify(body.tags || {}),
      JSON.stringify(body.allergens || {}),
      JSON.stringify(body.photos || []),
      (body.photos || []).length || 0,
      sortOrder,
    ]
  );
  return get("SELECT * FROM dishes WHERE id = ?", [dishId]);
}

/* ---------- Auth: password ---------- */

router.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const name = String(req.body.name || "").trim();
    const restaurantName = String(req.body.restaurantName || name || "My Restaurant").trim();
    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required" });
    if (password.length < 6) return res.status(400).json({ error: "Password min 6 characters" });

    if (await get("SELECT id FROM users WHERE email = ?", [email])) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const userId = id("usr");
    await run("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)", [
      userId,
      email,
      await hashPassword(password),
      name || restaurantName,
    ]);

    const restId = id("rst");
    const slug = await uniqueSlug(restaurantName);
    await run(
      `INSERT INTO restaurants
       (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, enabled_langs_json, primary_lang)
       VALUES (?, ?, ?, ?, '🍽️', '{}', '{}', '{}', ?, 'en')`,
      [
        restId,
        userId,
        slug,
        restaurantName,
        JSON.stringify(["en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar"]),
      ]
    );
    await run(
      `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, 'tacos', ?, 0)`,
      [id("cat"), restId, JSON.stringify({ en: "Mains", es: "Platos" })]
    );
    await run(
      `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, 'sides', ?, 1)`,
      [id("cat"), restId, JSON.stringify({ en: "Sides", es: "Acompañamientos" })]
    );

    const user = { id: userId, email, name: name || restaurantName };
    res.status(201).json({
      token: signToken(user),
      user,
      restaurant: await getRestaurantById(restId),
      menu: await getMenuBundle(restId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const restaurant = await getRestaurantByOwner(user.id);
    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, name: user.name },
      restaurant,
      menu: restaurant ? await getMenuBundle(restaurant.id) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

/* ---------- Magic link ---------- */

router.post("/auth/magic-link", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ error: "Valid email required" });

    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(raw);
    const linkId = id("mlk");
    const expires = new Date(Date.now() + config.magicLinkExpiresMin * 60 * 1000).toISOString();

    await run(
      "INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      [linkId, email, tokenHash, expires]
    );

    const link = `${config.publicBaseUrl}/api/auth/magic-link/verify?token=${raw}`;
    let user = await get("SELECT * FROM users WHERE email = ?", [email]);
    let restaurantName = "";
    if (user) {
      const r = await getRestaurantByOwner(user.id);
      restaurantName = r ? r.name : "";
    }

    await sendMagicLink({ to: email, link, restaurantName });

    res.json({
      ok: true,
      message: "If that email can receive mail, a sign-in link was sent.",
      // Dev helper when SMTP is off:
      devLink: config.smtp.host ? undefined : link,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not send magic link" });
  }
});

router.get("/auth/magic-link/verify", async (req, res) => {
  try {
    const raw = String(req.query.token || "");
    if (!raw) return res.status(400).send("Missing token");
    const tokenHash = hashToken(raw);
    const row = await get(
      "SELECT * FROM magic_links WHERE token_hash = ? LIMIT 1",
      [tokenHash]
    );
    if (!row) return res.status(400).send("Invalid link");
    if (row.used_at) return res.status(400).send("Link already used");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).send("Link expired");
    }

    await run("UPDATE magic_links SET used_at = ? WHERE id = ?", [
      new Date().toISOString(),
      row.id,
    ]);

    let user = await get("SELECT * FROM users WHERE email = ?", [row.email]);
    if (!user) {
      const userId = id("usr");
      await run("INSERT INTO users (id, email, name) VALUES (?, ?, ?)", [
        userId,
        row.email,
        row.email.split("@")[0],
      ]);
      const restId = id("rst");
      const slug = await uniqueSlug(row.email.split("@")[0] + "-menu");
      await run(
        `INSERT INTO restaurants
         (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, enabled_langs_json, primary_lang)
         VALUES (?, ?, ?, ?, '🍽️', '{}', '{}', '{}', ?, 'en')`,
        [
          restId,
          userId,
          slug,
          "My Restaurant",
          JSON.stringify(["en", "es"]),
        ]
      );
      user = await get("SELECT * FROM users WHERE id = ?", [userId]);
    }

    const token = signToken(user);
    // Redirect to app with token in hash for frontend pickup
    res.redirect(`/?magic_token=${encodeURIComponent(token)}#admin`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Verification failed");
  }
});

/* ---------- Google OAuth (optional) ---------- */

router.get("/auth/google", (req, res) => {
  if (!config.oauth.googleClientId) {
    return res.status(501).json({
      error: "Google OAuth not configured",
      hint: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
    });
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.oauth.googleClientId);
  url.searchParams.set("redirect_uri", config.oauth.googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});

router.get("/auth/google/callback", async (req, res) => {
  try {
    if (!config.oauth.googleClientId) return res.status(501).send("OAuth not configured");
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: config.oauth.googleClientId,
        client_secret: config.oauth.googleClientSecret,
        redirect_uri: config.oauth.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      return res.status(400).send("OAuth token exchange failed");
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();
    const email = String(profile.email || "").toLowerCase();
    const googleId = String(profile.id || "");
    if (!email) return res.status(400).send("No email from Google");

    let user =
      (await get("SELECT * FROM users WHERE google_id = ?", [googleId])) ||
      (await get("SELECT * FROM users WHERE email = ?", [email]));

    if (!user) {
      const userId = id("usr");
      await run(
        "INSERT INTO users (id, email, name, google_id) VALUES (?, ?, ?, ?)",
        [userId, email, profile.name || email, googleId]
      );
      const restId = id("rst");
      const slug = await uniqueSlug(profile.name || email);
      await run(
        `INSERT INTO restaurants
         (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, enabled_langs_json, primary_lang)
         VALUES (?, ?, ?, ?, '🍽️', '{}', '{}', '{}', ?, 'en')`,
        [restId, userId, slug, profile.name || "My Restaurant", JSON.stringify(["en", "es"])]
      );
      user = await get("SELECT * FROM users WHERE id = ?", [userId]);
    } else if (!user.google_id && googleId) {
      await run("UPDATE users SET google_id = ? WHERE id = ?", [googleId, user.id]);
    }

    const jwtToken = signToken(user);
    res.redirect(`/?magic_token=${encodeURIComponent(jwtToken)}#admin`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Google sign-in failed");
  }
});

router.get("/auth/me", authMiddleware, async (req, res) => {
  const restaurant = await getRestaurantByOwner(req.user.id);
  res.json({
    user: req.user,
    restaurant,
    menu: restaurant ? await getMenuBundle(restaurant.id) : null,
  });
});

/* ---------- Multi-restaurant (setup agent / multi-location) ---------- */

router.get("/me/restaurants", authMiddleware, async (req, res) => {
  const list = await listRestaurantsByOwner(req.user.id);
  res.json({ restaurants: list });
});

router.post("/me/restaurants", authMiddleware, async (req, res) => {
  try {
    const restaurantName = String(req.body.name || "New Restaurant").trim();
    const restId = id("rst");
    const slug = await uniqueSlug(restaurantName);
    await run(
      `INSERT INTO restaurants
       (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, enabled_langs_json, primary_lang, theme_id)
       VALUES (?, ?, ?, ?, '🍽️', '{}', '{}', '{}', ?, 'en', 'sunset-taco')`,
      [
        restId,
        req.user.id,
        slug,
        restaurantName,
        JSON.stringify(["en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar"]),
      ]
    );
    await run(
      `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, 'tacos', ?, 0)`,
      [id("cat"), restId, JSON.stringify({ en: "Mains", es: "Platos" })]
    );
    await run(
      `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, 'sides', ?, 1)`,
      [id("cat"), restId, JSON.stringify({ en: "Sides", es: "Acompañamientos" })]
    );
    const restaurant = await getRestaurantById(restId);
    res.status(201).json({
      restaurant,
      restaurants: await listRestaurantsByOwner(req.user.id),
      menu: await getMenuBundle(restId),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create restaurant" });
  }
});

/** Delete a restaurant the owner manages (and cascade menu data). Keeps at least one. */
router.delete("/me/restaurants/:restaurantId", authMiddleware, async (req, res) => {
  try {
    const list = await listRestaurantsByOwner(req.user.id);
    if (list.length <= 1) {
      return res.status(400).json({
        error: "You need at least one restaurant. Create another before deleting this one.",
      });
    }
    const target = list.find((r) => r.id === req.params.restaurantId);
    if (!target) return res.status(404).json({ error: "Restaurant not found" });

    // Explicit cleanup (SQLite CASCADE is enabled; this is still safe & clear)
    await run("DELETE FROM pending_photos WHERE restaurant_id = ?", [target.id]);
    await run("DELETE FROM menu_events WHERE restaurant_id = ?", [target.id]);
    await run("DELETE FROM dishes WHERE restaurant_id = ?", [target.id]);
    await run("DELETE FROM categories WHERE restaurant_id = ?", [target.id]);
    await run("DELETE FROM restaurants WHERE id = ? AND owner_id = ?", [
      target.id,
      req.user.id,
    ]);

    const remaining = await listRestaurantsByOwner(req.user.id);
    const next = remaining[0] || null;
    res.json({
      ok: true,
      deletedId: target.id,
      restaurants: remaining,
      restaurant: next,
      menu: next ? await getMenuBundle(next.id) : null,
      activeRestaurantId: next ? next.id : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not delete restaurant" });
  }
});

/* ---------- Owner menu ---------- */

router.get("/me/menu", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  res.json({
    menu: await getMenuBundle(restaurant.id),
    stats: await getStats(restaurant.id),
    restaurants: await listRestaurantsByOwner(req.user.id),
    activeRestaurantId: restaurant.id,
  });
});

router.patch("/me/restaurant", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  const name = req.body.name != null ? String(req.body.name).trim() : restaurant.name;
  const emoji = req.body.emoji != null ? String(req.body.emoji) : restaurant.emoji;
  const primaryLang =
    req.body.primaryLang != null ? String(req.body.primaryLang) : restaurant.primaryLang;
  const enabledLangs = Array.isArray(req.body.enabledLangs)
    ? req.body.enabledLangs
    : restaurant.enabledLangs;
  const tagline = req.body.tagline || restaurant.tagline;
  const address = req.body.address || restaurant.address;
  const hours = req.body.hours || restaurant.hours;
  const themeId =
    req.body.themeId != null ? String(req.body.themeId) : restaurant.themeId || "sunset-taco";
  const accent = req.body.accent != null ? String(req.body.accent) : restaurant.accent;

  await run(
    `UPDATE restaurants SET name=?, emoji=?, primary_lang=?, enabled_langs_json=?,
     tagline_json=?, address_json=?, hours_json=?, theme_id=?, accent=?, updated_at=? WHERE id=?`,
    [
      name,
      emoji,
      primaryLang,
      JSON.stringify(enabledLangs),
      JSON.stringify(tagline),
      JSON.stringify(address),
      JSON.stringify(hours),
      themeId,
      accent,
      new Date().toISOString(),
      restaurant.id,
    ]
  );
  res.json({
    restaurant: await getRestaurantById(restaurant.id),
    menu: await getMenuBundle(restaurant.id),
  });
});

/* ---------- Dishes ---------- */

router.post("/me/dishes", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  const body = req.body || {};
  const name = body.name || {};
  if (!Object.values(name).some(Boolean)) {
    return res.status(400).json({ error: "Dish name required" });
  }
  const maxRow = await get(
    "SELECT COALESCE(MAX(sort_order), 0) as m FROM dishes WHERE restaurant_id = ?",
    [restaurant.id]
  );
  const row = await insertDish(restaurant.id, body, (maxRow && maxRow.m) + 1);
  res.status(201).json({ dish: dishToJson(row), menu: await getMenuBundle(restaurant.id) });
});

/** Bulk create dishes (fast onboarding) */
router.post("/me/dishes/bulk", authMiddleware, async (req, res) => {
  try {
    const restaurant = await requireRestaurant(req, res);
    if (!restaurant) return;
    const items = Array.isArray(req.body.dishes) ? req.body.dishes : [];
    if (!items.length) return res.status(400).json({ error: "dishes array required" });

    const fromLang = String(req.body.fromLang || restaurant.primaryLang || "en");
    const translate = !!req.body.translate;
    const langs = restaurant.enabledLangs || ["en", "es"];

    const maxRow = await get(
      "SELECT COALESCE(MAX(sort_order), 0) as m FROM dishes WHERE restaurant_id = ?",
      [restaurant.id]
    );
    let sort = (maxRow && maxRow.m) || 0;
    const created = [];

    // Pre-create sections in order (from body.sections or first-seen dish categories)
    const sectionHints = Array.isArray(req.body.sections) ? req.body.sections : [];
    for (let i = 0; i < sectionHints.length; i++) {
      const sec = sectionHints[i] || {};
      await ensureCategory(
        restaurant.id,
        sec.id || sec.slug || sec.title,
        sec.title || sec.name || sec.id,
        typeof sec.sortOrder === "number" ? sec.sortOrder : i
      );
    }

    for (const item of items.slice(0, 40)) {
      const nameStr = String(item.name || "").trim();
      if (!nameStr) continue;
      const descStr = String(item.description || item.desc || "").trim();
      let nameMap = { [fromLang]: nameStr };
      let descMap = { [fromLang]: descStr || nameStr };
      if (translate) {
        try {
          const tr = await translateDishFields({
            name: nameStr,
            desc: descStr || nameStr,
            fromLang,
            toLangs: langs,
          });
          nameMap = tr.name;
          descMap = tr.desc;
        } catch (e) {
          console.warn("bulk translate fail", e.message);
        }
      }
      sort += 1;
      const catLabel = String(item.categoryLabel || item.section || item.category || "Menu").trim();
      const catSlug = String(item.category || item.categorySlug || catLabel).trim();
      const row = await insertDish(
        restaurant.id,
        {
          name: nameMap,
          desc: descMap,
          price: item.price,
          category: catSlug,
          categoryLabel: catLabel,
          categorySort: typeof item.categorySort === "number" ? item.categorySort : sort,
          spicy: item.spicy || 0,
        },
        sort
      );
      created.push(dishToJson(row));
    }

    res.status(201).json({
      created: created.length,
      dishes: created,
      menu: await getMenuBundle(restaurant.id),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Bulk create failed" });
  }
});

/**
 * Scan paper menu photo or pasted text → draft dishes (not saved until bulk confirm)
 */
router.post("/me/menu/scan", authMiddleware, (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return upload.single("photo")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  }
  next();
}, async (req, res) => {
  try {
    const restaurant = await requireRestaurant(req, res);
    if (!restaurant) return;

    let result;
    if (req.file) {
      result = await extractFromImage(req.file.buffer, req.file.mimetype);
    } else if (req.body && req.body.text) {
      result = await extractFromText(String(req.body.text));
    } else {
      return res.status(400).json({
        error: "Send multipart photo or JSON { text }",
      });
    }

    res.json({
      ...result,
      restaurantId: restaurant.id,
      hasAiKey: !!(process.env.XAI_API_KEY || config.xaiApiKey),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Scan failed" });
  }
});

router.put("/me/dishes/:dishId", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  const existing = await get("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?", [
    req.params.dishId,
    restaurant.id,
  ]);
  if (!existing) return res.status(404).json({ error: "Dish not found" });
  const body = req.body || {};
  const photos = body.photos != null ? body.photos : JSON.parse(existing.photos_json || "[]");
  let categorySlug = existing.category_slug;
  if (body.category != null || body.categoryLabel != null) {
    categorySlug = await ensureCategory(
      restaurant.id,
      body.category || existing.category_slug,
      body.categoryLabel || body.category || existing.category_slug,
      0
    );
  }
  await run(
    `UPDATE dishes SET category_slug=?, price=?, spicy=?, popular=?, sold_out=?,
     name_json=?, desc_json=?, tags_json=?, allergens_json=?, photos_json=?, photo_count=?, updated_at=?
     WHERE id=? AND restaurant_id=?`,
    [
      categorySlug,
      body.price != null ? Number(body.price) : existing.price,
      body.spicy != null ? Number(body.spicy) : existing.spicy,
      body.popular != null ? (body.popular ? 1 : 0) : existing.popular,
      body.soldOut != null ? (body.soldOut ? 1 : 0) : existing.sold_out,
      JSON.stringify(body.name != null ? body.name : JSON.parse(existing.name_json)),
      JSON.stringify(body.desc != null ? body.desc : JSON.parse(existing.desc_json)),
      JSON.stringify(body.tags != null ? body.tags : JSON.parse(existing.tags_json || "{}")),
      JSON.stringify(
        body.allergens != null ? body.allergens : JSON.parse(existing.allergens_json || "{}")
      ),
      JSON.stringify(photos),
      photos.length,
      new Date().toISOString(),
      req.params.dishId,
      restaurant.id,
    ]
  );
  const row = await get("SELECT * FROM dishes WHERE id = ?", [req.params.dishId]);
  res.json({ dish: dishToJson(row), menu: await getMenuBundle(restaurant.id) });
});

router.patch("/me/dishes/:dishId/sold-out", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  const existing = await get("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?", [
    req.params.dishId,
    restaurant.id,
  ]);
  if (!existing) return res.status(404).json({ error: "Dish not found" });
  const soldOut = req.body.soldOut != null ? !!req.body.soldOut : !existing.sold_out;
  await run("UPDATE dishes SET sold_out = ?, updated_at = ? WHERE id = ?", [
    soldOut ? 1 : 0,
    new Date().toISOString(),
    req.params.dishId,
  ]);
  const row = await get("SELECT * FROM dishes WHERE id = ?", [req.params.dishId]);
  res.json({ dish: dishToJson(row), menu: await getMenuBundle(restaurant.id) });
});

/**
 * Sync menu sections: rename, reorder, create empty sections.
 * Body: { categories: [ { id|slug, title|labels, sortOrder } ] }
 * Dish category_slug values are preserved; rename keeps the same slug by default.
 * Pass renameFrom + id to change slug (and migrate dishes).
 */
router.put("/me/categories", authMiddleware, async (req, res) => {
  try {
    const restaurant = await requireRestaurant(req, res);
    if (!restaurant) return;
    const list = Array.isArray(req.body.categories) ? req.body.categories : [];
    if (!list.length) {
      return res.status(400).json({ error: "categories array required" });
    }

    for (let i = 0; i < list.length; i++) {
      const item = list[i] || {};
      const title = String(
        item.title ||
          (item.labels && (item.labels.en || item.labels.es)) ||
          item.id ||
          item.slug ||
          "Menu"
      ).trim();
      const sortOrder = typeof item.sortOrder === "number" ? item.sortOrder : i;
      const newSlug = slugifyCategory(item.id || item.slug || title);
      const fromSlug = item.renameFrom
        ? slugifyCategory(item.renameFrom)
        : newSlug;

      const labels =
        item.labels && typeof item.labels === "object"
          ? item.labels
          : { en: title, es: title };

      // Migrate dishes if slug changed
      if (fromSlug !== newSlug) {
        const existingFrom = await get(
          "SELECT id FROM categories WHERE restaurant_id = ? AND slug = ?",
          [restaurant.id, fromSlug]
        );
        if (existingFrom) {
          await run(
            "UPDATE dishes SET category_slug = ? WHERE restaurant_id = ? AND category_slug = ?",
            [newSlug, restaurant.id, fromSlug]
          );
          // Remove old category row if new slug already exists, else rename
          const existingNew = await get(
            "SELECT id FROM categories WHERE restaurant_id = ? AND slug = ?",
            [restaurant.id, newSlug]
          );
          if (existingNew) {
            await run(
              "DELETE FROM categories WHERE restaurant_id = ? AND slug = ?",
              [restaurant.id, fromSlug]
            );
          } else {
            await run(
              "UPDATE categories SET slug = ?, labels_json = ?, sort_order = ? WHERE restaurant_id = ? AND slug = ?",
              [newSlug, JSON.stringify(labels), sortOrder, restaurant.id, fromSlug]
            );
            continue;
          }
        }
      }

      const row = await get(
        "SELECT id FROM categories WHERE restaurant_id = ? AND slug = ?",
        [restaurant.id, newSlug]
      );
      if (row) {
        await run(
          "UPDATE categories SET labels_json = ?, sort_order = ? WHERE restaurant_id = ? AND slug = ?",
          [JSON.stringify(labels), sortOrder, restaurant.id, newSlug]
        );
      } else {
        await run(
          `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, ?, ?, ?)`,
          [id("cat"), restaurant.id, newSlug, JSON.stringify(labels), sortOrder]
        );
      }
    }

    res.json({ ok: true, menu: await getMenuBundle(restaurant.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not update sections" });
  }
});

/** Delete a section. Optional moveTo slug for dishes; otherwise dishes go to "menu". */
router.delete("/me/categories/:slug", authMiddleware, async (req, res) => {
  try {
    const restaurant = await requireRestaurant(req, res);
    if (!restaurant) return;
    const slug = slugifyCategory(req.params.slug);
    const moveTo = slugifyCategory(req.query.moveTo || req.body?.moveTo || "menu");
    if (moveTo === slug) {
      return res.status(400).json({ error: "moveTo must be a different section" });
    }
    await ensureCategory(restaurant.id, moveTo, moveTo === "menu" ? "Menu" : moveTo, 999);
    await run(
      "UPDATE dishes SET category_slug = ? WHERE restaurant_id = ? AND category_slug = ?",
      [moveTo, restaurant.id, slug]
    );
    await run("DELETE FROM categories WHERE restaurant_id = ? AND slug = ?", [
      restaurant.id,
      slug,
    ]);
    res.json({ ok: true, menu: await getMenuBundle(restaurant.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not delete section" });
  }
});

router.delete("/me/dishes/:dishId", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  // Drop pending photos for this dish first
  await run("DELETE FROM pending_photos WHERE dish_id = ? AND restaurant_id = ?", [
    req.params.dishId,
    restaurant.id,
  ]);
  const result = await run("DELETE FROM dishes WHERE id = ? AND restaurant_id = ?", [
    req.params.dishId,
    restaurant.id,
  ]);
  if (!result.changes) return res.status(404).json({ error: "Dish not found" });
  res.json({ ok: true, menu: await getMenuBundle(restaurant.id) });
});

/** Clear entire menu (all dishes + pending photos). Keeps restaurant & categories. */
router.delete("/me/menu/dishes", authMiddleware, async (req, res) => {
  try {
    const restaurant = await requireRestaurant(req, res);
    if (!restaurant) return;
    await run("DELETE FROM pending_photos WHERE restaurant_id = ?", [restaurant.id]);
    const result = await run("DELETE FROM dishes WHERE restaurant_id = ?", [restaurant.id]);
    res.json({
      ok: true,
      deleted: result.changes || 0,
      menu: await getMenuBundle(restaurant.id),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Could not clear menu" });
  }
});

/* ---------- Photos ---------- */

router.post("/me/photos/:photoId/approve", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  const photo = await get(
    "SELECT * FROM pending_photos WHERE id = ? AND restaurant_id = ?",
    [req.params.photoId, restaurant.id]
  );
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  const dish = await get("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?", [
    photo.dish_id,
    restaurant.id,
  ]);
  if (dish) {
    const photos = JSON.parse(dish.photos_json || "[]");
    photos.push(photo.url);
    await run(
      "UPDATE dishes SET photos_json = ?, photo_count = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(photos), photos.length, new Date().toISOString(), dish.id]
    );
  }
  await run("DELETE FROM pending_photos WHERE id = ?", [photo.id]);
  res.json({ ok: true, menu: await getMenuBundle(restaurant.id) });
});

router.post("/me/photos/:photoId/reject", authMiddleware, async (req, res) => {
  const restaurant = await requireRestaurant(req, res);
  if (!restaurant) return;
  await run("DELETE FROM pending_photos WHERE id = ? AND restaurant_id = ?", [
    req.params.photoId,
    restaurant.id,
  ]);
  res.json({ ok: true, menu: await getMenuBundle(restaurant.id) });
});

/* Guest can submit photo for a dish on public menu */
router.post("/public/:slug/dishes/:dishId/photos", upload.single("photo"), async (req, res) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    const dish = await get("SELECT * FROM dishes WHERE id = ? AND restaurant_id = ?", [
      req.params.dishId,
      restaurant.id,
    ]);
    if (!dish) return res.status(404).json({ error: "Dish not found" });
    if (!req.file) return res.status(400).json({ error: "No photo" });
    const saved = await saveImage(req.file.buffer, req.file.mimetype);
    const photoId = id("pho");
    await run(
      "INSERT INTO pending_photos (id, restaurant_id, dish_id, url) VALUES (?, ?, ?, ?)",
      [photoId, restaurant.id, dish.id, saved.url]
    );
    res.status(201).json({ ok: true, id: photoId, pending: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

router.post(
  "/me/upload",
  authMiddleware,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const saved = await saveImage(req.file.buffer, req.file.mimetype);
      res.status(201).json(saved);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  }
);

/* ---------- Translate ---------- */

router.post("/translate", authMiddleware, async (req, res) => {
  try {
    const text = String(req.body.text || "");
    const from = String(req.body.from || "en");
    const to = String(req.body.to || "es");
    const out = await translateText(text, from, to);
    res.json({ text: out, provider: pickProvider() });
  } catch (err) {
    res.status(502).json({ error: err.message, text: req.body.text || "" });
  }
});

router.post("/translate/dish", authMiddleware, async (req, res) => {
  try {
    const result = await translateDishFields({
      name: String(req.body.name || ""),
      desc: String(req.body.desc || ""),
      fromLang: String(req.body.fromLang || "en"),
      toLangs: Array.isArray(req.body.toLangs) ? req.body.toLangs : ["en", "es"],
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Translation failed" });
  }
});

/* ---------- Public menu + QR ---------- */

router.get("/public/:slug", async (req, res) => {
  const restaurant = await getRestaurantBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  const lang = String(req.query.lang || "").slice(0, 8) || null;
  await run("INSERT INTO menu_events (restaurant_id, event_type, lang) VALUES (?, 'open', ?)", [
    restaurant.id,
    lang,
  ]);
  res.json({
    menu: await getMenuBundle(restaurant.id),
    stats: await getStats(restaurant.id),
    publicUrl: `${config.publicBaseUrl}/m/${restaurant.slug}`,
  });
});

router.post("/public/:slug/events", async (req, res) => {
  const restaurant = await getRestaurantBySlug(req.params.slug);
  if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
  await run(
    "INSERT INTO menu_events (restaurant_id, event_type, dish_id, lang) VALUES (?, ?, ?, ?)",
    [restaurant.id, String(req.body.type || "open"), req.body.dishId || null, req.body.lang || null]
  );
  res.json({ ok: true });
});

router.get("/public/:slug/qr.png", async (req, res) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).send("Not found");
    const target = `${config.publicBaseUrl}/m/${restaurant.slug}`;
    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: Number(req.query.size) || 512,
      margin: 2,
      color: { dark: "#0f0e0c", light: "#ffffff" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).send("QR failed");
  }
});

router.get("/public/:slug/qr.svg", async (req, res) => {
  try {
    const restaurant = await getRestaurantBySlug(req.params.slug);
    if (!restaurant) return res.status(404).send("Not found");
    const target = `${config.publicBaseUrl}/m/${restaurant.slug}`;
    const svg = await QRCode.toString(target, { type: "svg", margin: 2 });
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  } catch (err) {
    res.status(500).send("QR failed");
  }
});

/** Printable QR poster HTML (print → Save as PDF in browser) */
router.get("/public/:slug/qr-print", async (req, res) => {
  const restaurant = await getRestaurantBySlug(req.params.slug);
  if (!restaurant) return res.status(404).send("Not found");
  const url = `${config.publicBaseUrl}/m/${restaurant.slug}`;
  const pngUrl = `/api/public/${encodeURIComponent(restaurant.slug)}/qr.png?size=640`;
  res.type("html").send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>QR · ${escapeHtml(restaurant.name)}</title>
<style>
  body{font-family:system-ui,sans-serif;text-align:center;padding:40px;color:#111}
  h1{font-size:28px;margin:0 0 8px}
  p{color:#555}
  img{width:320px;height:320px;margin:24px 0}
  .url{font-size:14px;word-break:break-all;color:#333}
  @media print{button{display:none}}
</style></head><body>
  <h1>${escapeHtml(restaurant.emoji || "🌮")} ${escapeHtml(restaurant.name)}</h1>
  <p>Scan for the live menu — any language</p>
  <img src="${pngUrl}" alt="QR code"/>
  <p class="url">${escapeHtml(url)}</p>
  <p><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`);
});

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "plato-api",
    time: new Date().toISOString(),
    db: driver,
    storage: driverInfo(),
    translate: pickProvider(),
    oauthGoogle: !!config.oauth.googleClientId,
  });
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = router;

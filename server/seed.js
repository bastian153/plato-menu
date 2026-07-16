const path = require("path");
const { get, run, getRestaurantByOwner } = require("./db");
const { id, uniqueSlug, hashPassword } = require("./auth");
const config = require("./config");

function loadFrontendSeed() {
  try {
    return require(path.join(__dirname, "seed-data.json"));
  } catch {
    return null;
  }
}

async function ensureDemoAccount() {
  const email = config.demoEmail;
  const password = config.demoPassword;
  let user = await get("SELECT * FROM users WHERE email = ?", [email]);

  if (!user) {
    const userId = id("usr");
    const hash = await hashPassword(password);
    await run(
      "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
      [userId, email, hash, "Demo Owner"]
    );
    user = await get("SELECT * FROM users WHERE id = ?", [userId]);
  }

  let restaurant = await getRestaurantByOwner(user.id);
  if (!restaurant) {
    const seed = loadFrontendSeed();
    const restId = id("rst");
    const slug = await uniqueSlug(seed?.restaurant?.name || "taqueria-el-sol");
    const enabled = JSON.stringify([
      "en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar",
    ]);

    await run(
      `INSERT INTO restaurants
       (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, accent, enabled_langs_json, primary_lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        restId,
        user.id,
        slug,
        seed?.restaurant?.name || "Taquería El Sol",
        seed?.restaurant?.emoji || "🌮",
        JSON.stringify(seed?.restaurant?.tagline || { en: "Street tacos", es: "Tacos" }),
        JSON.stringify(seed?.restaurant?.address || { en: "Night market", es: "Mercado" }),
        JSON.stringify(seed?.restaurant?.hours || { en: "Open", es: "Abierto" }),
        seed?.restaurant?.accent || "#e85d04",
        enabled,
        "en",
      ]
    );

    const cats = seed?.categories || [
      { id: "tacos", labels: { en: "Tacos", es: "Tacos" } },
      { id: "bowls", labels: { en: "Bowls", es: "Bowls" } },
      { id: "sides", labels: { en: "Sides", es: "Acompañamientos" } },
    ];

    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      await run(
        `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order) VALUES (?, ?, ?, ?, ?)`,
        [id("cat"), restId, c.id, JSON.stringify(c.labels || { en: c.id }), i]
      );
    }

    const dishes = seed?.dishes || [];
    for (let i = 0; i < dishes.length; i++) {
      const d = dishes[i];
      await run(
        `INSERT INTO dishes
         (id, restaurant_id, category_slug, price, spicy, popular, sold_out, name_json, desc_json, tags_json, allergens_json, photos_json, photo_count, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          d.id || id("dsh"),
          restId,
          d.category || "tacos",
          d.price || 0,
          d.spicy || 0,
          d.popular ? 1 : 0,
          d.soldOut ? 1 : 0,
          JSON.stringify(d.name || {}),
          JSON.stringify(d.desc || {}),
          JSON.stringify(d.tags || {}),
          JSON.stringify(
            typeof d.allergens === "string" ? { en: d.allergens } : d.allergens || {}
          ),
          JSON.stringify(d.photos || []),
          d.photoCount || (d.photos || []).length,
          i,
        ]
      );
    }

    for (const p of seed?.pendingPhotos || []) {
      await run(
        `INSERT INTO pending_photos (id, restaurant_id, dish_id, url) VALUES (?, ?, ?, ?)`,
        [p.id || id("pho"), restId, p.dishId, p.url]
      );
    }

    restaurant = await getRestaurantByOwner(user.id);
  }

  return {
    email,
    password,
    userId: user.id,
    restaurant,
  };
}

module.exports = { ensureDemoAccount };

const path = require("path");
const { db, getRestaurantByOwner } = require("./db");
const { id, uniqueSlug, hashPassword } = require("./auth");

// Load seed dishes from frontend seed if available
function loadFrontendSeed() {
  try {
    // seed.js is browser-oriented; re-require a node-friendly copy
    const seedPath = path.join(__dirname, "seed-data.json");
    return require(seedPath);
  } catch {
    return null;
  }
}

async function ensureDemoAccount() {
  const email = process.env.PLATO_DEMO_EMAIL || "demo@plato.menu";
  const password = process.env.PLATO_DEMO_PASSWORD || "demo1234";
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user) {
    const userId = id("usr");
    const hash = await hashPassword(password);
    db.prepare(
      "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"
    ).run(userId, email, hash, "Demo Owner");
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  }

  let restaurant = getRestaurantByOwner(user.id);
  if (!restaurant) {
    const seed = loadFrontendSeed();
    const restId = id("rst");
    const slug = uniqueSlug(seed?.restaurant?.name || "taqueria-el-sol");
    const enabled = JSON.stringify([
      "en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar",
    ]);

    db.prepare(
      `INSERT INTO restaurants
       (id, owner_id, slug, name, emoji, tagline_json, address_json, hours_json, accent, enabled_langs_json, primary_lang)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      restId,
      user.id,
      slug,
      seed?.restaurant?.name || "Taquería El Sol",
      seed?.restaurant?.emoji || "🌮",
      JSON.stringify(seed?.restaurant?.tagline || { en: "Street tacos", es: "Tacos de la calle" }),
      JSON.stringify(seed?.restaurant?.address || { en: "Night market", es: "Mercado nocturno" }),
      JSON.stringify(seed?.restaurant?.hours || { en: "Open", es: "Abierto" }),
      seed?.restaurant?.accent || "#e85d04",
      enabled,
      "en"
    );

    const cats = seed?.categories || [
      { id: "tacos", labels: { en: "Tacos", es: "Tacos" } },
      { id: "bowls", labels: { en: "Bowls", es: "Bowls" } },
      { id: "sides", labels: { en: "Sides & drinks", es: "Acompañamientos" } },
    ];

    cats.forEach((c, i) => {
      db.prepare(
        `INSERT INTO categories (id, restaurant_id, slug, labels_json, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id("cat"), restId, c.id, JSON.stringify(c.labels || { en: c.id }), i);
    });

    const dishes = seed?.dishes || [];
    dishes.forEach((d, i) => {
      db.prepare(
        `INSERT INTO dishes
         (id, restaurant_id, category_slug, price, spicy, popular, sold_out, name_json, desc_json, tags_json, allergens_json, photos_json, photo_count, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
          typeof d.allergens === "string"
            ? { en: d.allergens }
            : d.allergens || {}
        ),
        JSON.stringify(d.photos || []),
        d.photoCount || (d.photos || []).length,
        i
      );
    });

    (seed?.pendingPhotos || []).forEach((p) => {
      db.prepare(
        `INSERT INTO pending_photos (id, restaurant_id, dish_id, url)
         VALUES (?, ?, ?, ?)`
      ).run(p.id || id("pho"), restId, p.dishId, p.url);
    });

    restaurant = getRestaurantByOwner(user.id);
  }

  return {
    email,
    password,
    userId: user.id,
    restaurant,
  };
}

module.exports = { ensureDemoAccount };

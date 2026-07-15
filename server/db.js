const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = process.env.PLATO_DB_PATH || path.join(DATA_DIR, "plato.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '🍽️',
      tagline_json TEXT NOT NULL DEFAULT '{}',
      address_json TEXT NOT NULL DEFAULT '{}',
      hours_json TEXT NOT NULL DEFAULT '{}',
      accent TEXT DEFAULT '#e85d04',
      enabled_langs_json TEXT NOT NULL,
      primary_lang TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      labels_json TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(restaurant_id, slug)
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_slug TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      spicy INTEGER NOT NULL DEFAULT 0,
      popular INTEGER NOT NULL DEFAULT 0,
      sold_out INTEGER NOT NULL DEFAULT 0,
      name_json TEXT NOT NULL,
      desc_json TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '{}',
      allergens_json TEXT NOT NULL DEFAULT '{}',
      photos_json TEXT NOT NULL DEFAULT '[]',
      photo_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_photos (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      dish_id TEXT,
      lang TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON restaurants(owner_id);
    CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_pending_restaurant ON pending_photos(restaurant_id);
  `);
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function restaurantToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji || "🍽️",
    tagline: parseJson(row.tagline_json, {}),
    address: parseJson(row.address_json, {}),
    hours: parseJson(row.hours_json, {}),
    accent: row.accent || "#e85d04",
    enabledLangs: parseJson(row.enabled_langs_json, ["en", "es"]),
    primaryLang: row.primary_lang || "en",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dishToJson(row) {
  if (!row) return null;
  const photos = parseJson(row.photos_json, []);
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    category: row.category_slug,
    price: row.price,
    spicy: row.spicy,
    popular: !!row.popular,
    soldOut: !!row.sold_out,
    name: parseJson(row.name_json, {}),
    desc: parseJson(row.desc_json, {}),
    tags: parseJson(row.tags_json, {}),
    allergens: parseJson(row.allergens_json, {}),
    photos,
    photoCount: row.photo_count || photos.length,
    sortOrder: row.sort_order,
  };
}

function categoryToJson(row) {
  if (!row) return null;
  return {
    id: row.slug,
    slug: row.slug,
    labels: parseJson(row.labels_json, {}),
    sortOrder: row.sort_order,
  };
}

function getRestaurantByOwner(ownerId) {
  const row = db
    .prepare("SELECT * FROM restaurants WHERE owner_id = ? LIMIT 1")
    .get(ownerId);
  return restaurantToJson(row);
}

function getRestaurantBySlug(slug) {
  const row = db
    .prepare("SELECT * FROM restaurants WHERE slug = ? COLLATE NOCASE LIMIT 1")
    .get(slug);
  return restaurantToJson(row);
}

function getRestaurantById(id) {
  const row = db.prepare("SELECT * FROM restaurants WHERE id = ?").get(id);
  return restaurantToJson(row);
}

function getMenuBundle(restaurantId) {
  const restaurant = getRestaurantById(restaurantId);
  if (!restaurant) return null;

  const categories = db
    .prepare(
      "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order ASC, slug ASC"
    )
    .all(restaurantId)
    .map(categoryToJson);

  const dishes = db
    .prepare(
      "SELECT * FROM dishes WHERE restaurant_id = ? ORDER BY sort_order ASC, created_at ASC"
    )
    .all(restaurantId)
    .map(dishToJson);

  const pendingPhotos = db
    .prepare(
      "SELECT id, dish_id as dishId, url, created_at as createdAt FROM pending_photos WHERE restaurant_id = ? ORDER BY created_at DESC"
    )
    .all(restaurantId);

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      emoji: restaurant.emoji,
      tagline: restaurant.tagline,
      address: restaurant.address,
      hours: restaurant.hours,
      accent: restaurant.accent,
      slug: restaurant.slug,
    },
    categories: categories.map((c) => ({
      id: c.slug,
      labels: c.labels,
    })),
    dishes,
    pendingPhotos,
    settings: {
      enabledLangs: restaurant.enabledLangs,
      primaryLang: restaurant.primaryLang,
    },
  };
}

function getStats(restaurantId) {
  const opens = db
    .prepare(
      "SELECT COUNT(*) as c FROM menu_events WHERE restaurant_id = ? AND event_type = 'open'"
    )
    .get(restaurantId).c;
  const nonEn = db
    .prepare(
      "SELECT COUNT(*) as c FROM menu_events WHERE restaurant_id = ? AND event_type = 'open' AND lang IS NOT NULL AND lang != 'en'"
    )
    .get(restaurantId).c;
  const top = db
    .prepare(
      `SELECT dish_id as dishId, COUNT(*) as c
       FROM menu_events
       WHERE restaurant_id = ? AND event_type = 'dish_open' AND dish_id IS NOT NULL
       GROUP BY dish_id
       ORDER BY c DESC
       LIMIT 1`
    )
    .get(restaurantId);

  const openCount = Number(opens) || 0;
  const nonEnCount = Number(nonEn) || 0;
  return {
    scans: openCount || 0,
    nonEn: openCount ? Math.round((nonEnCount / openCount) * 100) : 0,
    topDish: top ? top.dishId : null,
  };
}

migrate();

module.exports = {
  db,
  DB_PATH,
  parseJson,
  restaurantToJson,
  dishToJson,
  categoryToJson,
  getRestaurantByOwner,
  getRestaurantBySlug,
  getRestaurantById,
  getMenuBundle,
  getStats,
};

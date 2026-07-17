const fs = require("fs");
const path = require("path");
const config = require("./config");

const usePg = !!config.databaseUrl;
let db = null;
let pool = null;

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
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
    themeId: row.theme_id || "sunset-taco",
    enabledLangs: parseJson(row.enabled_langs_json, ["en", "es"]),
    primaryLang: row.primary_lang || "en",
    locationName: row.location_name || "",
    chainName: row.chain_name || "",
    constellationEnabled: !!Number(row.constellation_enabled || 0),
    ordersEnabled: row.orders_enabled == null ? true : !!Number(row.orders_enabled),
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
    price: Number(row.price),
    spicy: Number(row.spicy),
    popular: !!Number(row.popular),
    soldOut: !!Number(row.sold_out),
    name: parseJson(row.name_json, {}),
    desc: parseJson(row.desc_json, {}),
    tags: parseJson(row.tags_json, {}),
    allergens: parseJson(row.allergens_json, {}),
    photos,
    photoCount: Number(row.photo_count) || photos.length,
    sortOrder: Number(row.sort_order) || 0,
  };
}

function categoryToJson(row) {
  if (!row) return null;
  return {
    id: row.slug,
    slug: row.slug,
    labels: parseJson(row.labels_json, {}),
    sortOrder: Number(row.sort_order) || 0,
  };
}

function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function normalizeRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (k.endsWith("_json") && typeof out[k] === "object" && out[k] !== null) {
      out[k] = JSON.stringify(out[k]);
    }
  }
  return out;
}

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    name TEXT,
    google_id TEXT,
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
    theme_id TEXT DEFAULT 'sunset-taco',
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
  CREATE TABLE IF NOT EXISTS magic_links (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_code TEXT,
    guest_name TEXT,
    items_json TEXT NOT NULL DEFAULT '[]',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    total REAL NOT NULL DEFAULT 0,
    tip REAL NOT NULL DEFAULT 0,
    lang TEXT,
    stripe_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON restaurants(owner_id);
  CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
`;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    name TEXT,
    google_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🍽️',
    tagline_json JSONB NOT NULL DEFAULT '{}',
    address_json JSONB NOT NULL DEFAULT '{}',
    hours_json JSONB NOT NULL DEFAULT '{}',
    accent TEXT DEFAULT '#e85d04',
    theme_id TEXT DEFAULT 'sunset-taco',
    enabled_langs_json JSONB NOT NULL DEFAULT '["en","es"]',
    primary_lang TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    labels_json JSONB NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE(restaurant_id, slug)
  );
  CREATE TABLE IF NOT EXISTS dishes (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_slug TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL DEFAULT 0,
    spicy INTEGER NOT NULL DEFAULT 0,
    popular INTEGER NOT NULL DEFAULT 0,
    sold_out INTEGER NOT NULL DEFAULT 0,
    name_json JSONB NOT NULL DEFAULT '{}',
    desc_json JSONB NOT NULL DEFAULT '{}',
    tags_json JSONB NOT NULL DEFAULT '{}',
    allergens_json JSONB NOT NULL DEFAULT '{}',
    photos_json JSONB NOT NULL DEFAULT '[]',
    photo_count INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS pending_photos (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    dish_id TEXT NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS menu_events (
    id SERIAL PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    dish_id TEXT,
    lang TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS magic_links (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_code TEXT,
    guest_name TEXT,
    items_json JSONB NOT NULL DEFAULT '[]',
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    total DOUBLE PRECISION NOT NULL DEFAULT 0,
    tip DOUBLE PRECISION NOT NULL DEFAULT 0,
    lang TEXT,
    stripe_session_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON restaurants(owner_id);
  CREATE INDEX IF NOT EXISTS idx_dishes_restaurant ON dishes(restaurant_id);
  CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
`;

async function migrateRestaurantColumns() {
  const cols = [
    ["theme_id", "TEXT DEFAULT 'sunset-taco'"],
    ["location_name", "TEXT DEFAULT ''"],
    ["chain_name", "TEXT DEFAULT ''"],
    ["constellation_enabled", "INTEGER DEFAULT 0"],
    ["orders_enabled", "INTEGER DEFAULT 1"],
  ];
  for (const [name, def] of cols) {
    try {
      if (usePg) {
        await pool.query(`ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS ${name} ${def.replace("INTEGER", "INT")}`);
      } else {
        db.exec(`ALTER TABLE restaurants ADD COLUMN ${name} ${def}`);
      }
    } catch {
      /* exists */
    }
  }
}

async function init() {
  if (usePg) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: config.databaseUrl });
    await pool.query(PG_SCHEMA);
    await migrateRestaurantColumns();
    console.log("[db] Postgres ready");
    return { driver: "postgres" };
  }
  const { DatabaseSync } = require("node:sqlite");
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SQLITE_SCHEMA);
  try {
    db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
  } catch {
    /* ok */
  }
  await migrateRestaurantColumns();
  console.log("[db] SQLite", config.dbPath);
  return { driver: "sqlite" };
}

function run(sql, params = []) {
  if (usePg) {
    return pool.query(toPgParams(sql), params).then((r) => ({
      changes: r.rowCount || 0,
      rows: r.rows.map(normalizeRow),
    }));
  }
  const info = db.prepare(sql).run(...params);
  return Promise.resolve({ changes: info.changes || 0, rows: [] });
}

function get(sql, params = []) {
  if (usePg) {
    return pool
      .query(toPgParams(sql), params)
      .then((r) => normalizeRow(r.rows[0]));
  }
  return Promise.resolve(db.prepare(sql).get(...params));
}

function all(sql, params = []) {
  if (usePg) {
    return pool
      .query(toPgParams(sql), params)
      .then((r) => r.rows.map(normalizeRow));
  }
  return Promise.resolve(db.prepare(sql).all(...params));
}

async function getRestaurantByOwner(ownerId) {
  return restaurantToJson(
    await get("SELECT * FROM restaurants WHERE owner_id = ? LIMIT 1", [ownerId])
  );
}

async function listRestaurantsByOwner(ownerId) {
  const rows = await all(
    "SELECT * FROM restaurants WHERE owner_id = ? ORDER BY created_at ASC",
    [ownerId]
  );
  return rows.map(restaurantToJson);
}

async function getOwnedRestaurant(ownerId, restaurantId) {
  if (!restaurantId) return getRestaurantByOwner(ownerId);
  const row = await get(
    "SELECT * FROM restaurants WHERE id = ? AND owner_id = ? LIMIT 1",
    [restaurantId, ownerId]
  );
  return restaurantToJson(row);
}

async function getRestaurantBySlug(slug) {
  if (usePg) {
    return restaurantToJson(
      await get("SELECT * FROM restaurants WHERE lower(slug) = lower(?) LIMIT 1", [
        slug,
      ])
    );
  }
  return restaurantToJson(
    await get("SELECT * FROM restaurants WHERE slug = ? COLLATE NOCASE LIMIT 1", [
      slug,
    ])
  );
}

async function getRestaurantById(id) {
  return restaurantToJson(await get("SELECT * FROM restaurants WHERE id = ?", [id]));
}

async function getMenuBundle(restaurantId) {
  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) return null;
  const catRows = await all(
    "SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order ASC, slug ASC",
    [restaurantId]
  );
  const dishRows = await all(
    "SELECT * FROM dishes WHERE restaurant_id = ? ORDER BY sort_order ASC, created_at ASC",
    [restaurantId]
  );
  const pendingPhotos = await all(
    "SELECT id, dish_id as \"dishId\", url, created_at as \"createdAt\" FROM pending_photos WHERE restaurant_id = ? ORDER BY created_at DESC",
    [restaurantId]
  );
  // sqlite returns lowercase keys sometimes - normalize pending
  const pending = pendingPhotos.map((p) => ({
    id: p.id,
    dishId: p.dishId || p.dishid || p.dish_id,
    url: p.url,
    createdAt: p.createdAt || p.createdat || p.created_at,
  }));

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      emoji: restaurant.emoji,
      tagline: restaurant.tagline,
      address: restaurant.address,
      hours: restaurant.hours,
      accent: restaurant.accent,
      themeId: restaurant.themeId || "sunset-taco",
      slug: restaurant.slug,
      locationName: restaurant.locationName || "",
      chainName: restaurant.chainName || "",
      constellationEnabled: !!restaurant.constellationEnabled,
      ordersEnabled: restaurant.ordersEnabled !== false,
    },
    categories: catRows.map(categoryToJson).map((c) => ({
      id: c.slug,
      labels: c.labels,
      sortOrder: c.sortOrder,
    })),
    dishes: dishRows.map(dishToJson),
    pendingPhotos: pending,
    settings: {
      enabledLangs: restaurant.enabledLangs,
      primaryLang: restaurant.primaryLang,
    },
  };
}

async function getStats(restaurantId) {
  const opens = await get(
    "SELECT COUNT(*) as c FROM menu_events WHERE restaurant_id = ? AND event_type = 'open'",
    [restaurantId]
  );
  const nonEn = await get(
    "SELECT COUNT(*) as c FROM menu_events WHERE restaurant_id = ? AND event_type = 'open' AND lang IS NOT NULL AND lang != 'en'",
    [restaurantId]
  );
  const top = await get(
    `SELECT dish_id as "dishId", COUNT(*) as c
     FROM menu_events
     WHERE restaurant_id = ? AND event_type = 'dish_open' AND dish_id IS NOT NULL
     GROUP BY dish_id
     ORDER BY c DESC
     LIMIT 1`,
    [restaurantId]
  );
  const openCount = Number(opens && opens.c) || 0;
  const nonEnCount = Number(nonEn && nonEn.c) || 0;
  return {
    scans: openCount,
    nonEn: openCount ? Math.round((nonEnCount / openCount) * 100) : 0,
    topDish: top ? top.dishId || top.dishid : null,
  };
}

async function getAnalytics(restaurantId) {
  const stats = await getStats(restaurantId);
  const dishOpens = await all(
    `SELECT dish_id as "dishId", COUNT(*) as c
     FROM menu_events
     WHERE restaurant_id = ? AND event_type = 'dish_open' AND dish_id IS NOT NULL
     GROUP BY dish_id
     ORDER BY c DESC
     LIMIT 10`,
    [restaurantId]
  );
  const langs = await all(
    `SELECT COALESCE(lang, 'unknown') as lang, COUNT(*) as c
     FROM menu_events
     WHERE restaurant_id = ? AND event_type = 'open'
     GROUP BY lang
     ORDER BY c DESC`,
    [restaurantId]
  );
  const last7 = await all(
    `SELECT substr(created_at, 1, 10) as day, COUNT(*) as c
     FROM menu_events
     WHERE restaurant_id = ? AND event_type = 'open'
     GROUP BY substr(created_at, 1, 10)
     ORDER BY day DESC
     LIMIT 14`,
    [restaurantId]
  );
  const orderStats = await get(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
     FROM orders WHERE restaurant_id = ?`,
    [restaurantId]
  );
  const dishRows = await all(
    "SELECT id, name_json FROM dishes WHERE restaurant_id = ?",
    [restaurantId]
  );
  const nameById = {};
  dishRows.forEach((d) => {
    const names = parseJson(d.name_json, {});
    nameById[d.id] = names.en || names.es || Object.values(names)[0] || d.id;
  });
  return {
    ...stats,
    topDishes: (dishOpens || []).map((r) => ({
      dishId: r.dishId || r.dishid,
      name: nameById[r.dishId || r.dishid] || r.dishId,
      opens: Number(r.c) || 0,
    })),
    languages: (langs || []).map((r) => ({
      lang: r.lang || "unknown",
      opens: Number(r.c) || 0,
    })),
    dailyOpens: (last7 || [])
      .map((r) => ({ day: r.day, opens: Number(r.c) || 0 }))
      .reverse(),
    orders: {
      total: Number(orderStats && orderStats.total) || 0,
      pending: Number(orderStats && orderStats.pending) || 0,
      ready: Number(orderStats && orderStats.ready) || 0,
      done: Number(orderStats && orderStats.done) || 0,
    },
  };
}

function orderToJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableCode: row.table_code || "",
    guestName: row.guest_name || "",
    items: parseJson(row.items_json, []),
    note: row.note || "",
    status: row.status || "pending",
    total: Number(row.total) || 0,
    tip: Number(row.tip) || 0,
    lang: row.lang || "",
    stripeSessionId: row.stripe_session_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  init,
  run,
  get,
  all,
  usePg,
  parseJson,
  restaurantToJson,
  dishToJson,
  categoryToJson,
  orderToJson,
  getRestaurantByOwner,
  listRestaurantsByOwner,
  getOwnedRestaurant,
  getRestaurantBySlug,
  getRestaurantById,
  getMenuBundle,
  getStats,
  getAnalytics,
  get DB_PATH() {
    return usePg ? "[postgres]" : config.dbPath;
  },
  get driver() {
    return usePg ? "postgres" : "sqlite";
  },
};

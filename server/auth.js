const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("./config");
const { get } = require("./db");

function id(prefix = "") {
  return (prefix ? prefix + "_" : "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function slugify(text) {
  return (
    String(text || "restaurant")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "restaurant"
  );
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 0;
  while (await get("SELECT 1 as x FROM restaurants WHERE slug = ?", [slug])) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpires,
  });
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await get(
      "SELECT id, email, name, created_at FROM users WHERE id = ?",
      [payload.sub]
    );
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  id,
  slugify,
  uniqueSlug,
  signToken,
  authMiddleware,
  hashPassword,
  verifyPassword,
  hashToken,
};

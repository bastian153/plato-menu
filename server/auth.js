const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { db } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "plato-dev-secret-change-me";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

function id(prefix = "") {
  return (prefix ? prefix + "_" : "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function slugify(text) {
  return String(text || "restaurant")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "restaurant";
}

function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 0;
  while (db.prepare("SELECT 1 FROM restaurants WHERE slug = ?").get(slug)) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
      .get(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
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

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare("SELECT id, email, name, created_at FROM users WHERE id = ?")
      .get(payload.sub);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.created_at,
      };
    }
  } catch {
    /* ignore */
  }
  next();
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  id,
  slugify,
  uniqueSlug,
  signToken,
  authMiddleware,
  optionalAuth,
  hashPassword,
  verifyPassword,
  JWT_SECRET,
};

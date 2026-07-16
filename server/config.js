require("dotenv").config();
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";

function requiredInProd(name, value) {
  if (isProd && !value) {
    console.error(`Missing required env in production: ${name}`);
    process.exit(1);
  }
  return value;
}

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (isProd ? null : "plato-dev-secret-change-me");

if (isProd) {
  requiredInProd("JWT_SECRET", process.env.JWT_SECRET);
}

module.exports = {
  ROOT,
  isProd,
  port: Number(process.env.PORT || 3847),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3847}`).replace(/\/$/, ""),
  jwtSecret: JWT_SECRET || crypto.randomBytes(32).toString("hex"),
  jwtExpires: process.env.JWT_EXPIRES || "7d",
  magicLinkExpiresMin: Number(process.env.MAGIC_LINK_EXPIRES_MIN || 20),
  demoEmail: process.env.PLATO_DEMO_EMAIL || "demo@plato.menu",
  demoPassword: process.env.PLATO_DEMO_PASSWORD || "demo1234",
  databaseUrl: process.env.DATABASE_URL || "",
  dbPath: process.env.PLATO_DB_PATH || path.join(ROOT, "data", "plato.db"),
  storageDriver: (process.env.STORAGE_DRIVER || "local").toLowerCase(), // local | s3
  s3: {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, ""),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
  translate: {
    provider: (process.env.TRANSLATE_PROVIDER || "auto").toLowerCase(), // auto|mymemory|deepl|google
    deeplKey: process.env.DEEPL_API_KEY || "",
    deeplUrl: process.env.DEEPL_API_URL || "https://api-free.deepl.com/v2/translate",
    googleKey: process.env.GOOGLE_TRANSLATE_API_KEY || "",
  },
  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleRedirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      `${(process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3847}`).replace(/\/$/, "")}/api/auth/google/callback`,
  },
  smtp: {
    // If unset, magic links are logged to console
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Plato <noreply@plato.menu>",
  },
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || 40),
  },
  trustProxy: process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true",
};

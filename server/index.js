const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const { init, DB_PATH, driver } = require("./db");
const { ensureDemoAccount } = require("./seed");
const { pickProvider } = require("./services/translate");
const { driverInfo } = require("./services/storage");
const routes = require("./routes");

async function main() {
  await init();
  const demo = await ensureDemoAccount();

  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // demo serves inline scripts
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  const generalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many auth attempts, try later" },
  });

  app.use("/api/", generalLimiter);
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/magic-link", authLimiter);

  app.use("/uploads", express.static(path.join(config.ROOT, "uploads")));
  app.use("/api", routes);

  // Pretty public menu: /m/:slug
  app.get("/m/:slug", (req, res) => {
    res.sendFile(path.join(config.ROOT, "m.html"));
  });

  // Static frontend (no-cache JS/CSS so UI fixes show up on refresh)
  app.use(
    express.static(config.ROOT, {
      extensions: ["html"],
      setHeaders(res, filePath) {
        if (/\.(js|css|html)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-store, max-age=0");
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(config.ROOT, "index.html"));
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });

  app.listen(config.port, () => {
    console.log("");
    console.log("🌮  Plato API + frontend  (v0.3)");
    console.log(`   Local:     http://127.0.0.1:${config.port}`);
    console.log(`   Guest:     http://127.0.0.1:${config.port}/#menu`);
    console.log(`   Public:    http://127.0.0.1:${config.port}/m/${demo.restaurant.slug}`);
    console.log(`   QR print:  http://127.0.0.1:${config.port}/api/public/${demo.restaurant.slug}/qr-print`);
    console.log(`   Health:    http://127.0.0.1:${config.port}/api/health`);
    console.log(`   DB:        ${driver} ${DB_PATH}`);
    console.log(`   Storage:   ${driverInfo().driver}`);
    console.log(`   Translate: ${pickProvider()}`);
    console.log("");
    console.log("   Demo login:");
    console.log(`   email:    ${demo.email}`);
    console.log(`   password: ${demo.password}`);
    console.log(`   magic:    POST /api/auth/magic-link { email }`);
    if (config.oauth.googleClientId) console.log("   Google OAuth: enabled");
    console.log("");
  });
}

main().catch((err) => {
  console.error("Failed to start Plato server:", err);
  process.exit(1);
});

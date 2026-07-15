require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { ensureDemoAccount } = require("./seed");
const { DB_PATH } = require("./db");

const PORT = Number(process.env.PORT || 3847);
const ROOT = path.join(__dirname, "..");

async function main() {
  const demo = await ensureDemoAccount();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/uploads", express.static(path.join(ROOT, "uploads")));
  app.use("/api", routes);

  // Static frontend
  app.use(express.static(ROOT, { extensions: ["html"] }));

  // SPA-ish fallback (Express 5: no bare "*")
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      return next();
    }
    // Let static handler miss → serve index for client routes
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(ROOT, "index.html"));
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  });

  app.listen(PORT, () => {
    console.log("");
    console.log("🌮  Plato API + frontend");
    console.log(`   Local:   http://127.0.0.1:${PORT}`);
    console.log(`   Guest:   http://127.0.0.1:${PORT}/#menu`);
    console.log(`   Owner:   http://127.0.0.1:${PORT}/#admin`);
    console.log(`   Health:  http://127.0.0.1:${PORT}/api/health`);
    console.log(`   Public:  http://127.0.0.1:${PORT}/api/public/${demo.restaurant.slug}`);
    console.log(`   DB:      ${DB_PATH}`);
    console.log("");
    console.log("   Demo owner login:");
    console.log(`   email:    ${demo.email}`);
    console.log(`   password: ${demo.password}`);
    console.log(`   slug:     ${demo.restaurant.slug}`);
    console.log("");
  });
}

main().catch((err) => {
  console.error("Failed to start Plato server:", err);
  process.exit(1);
});

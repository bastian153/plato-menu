# Plato

**The menu that speaks their language.**

Living multi-language restaurant menus with real plate photos — not a PDF. Guests switch language and see what the food actually looks like. Owners add a dish once and translate it to every language in one tap.

![License](https://img.shields.io/badge/license-MIT-e85d04)
![Status](https://img.shields.io/badge/status-v0.3-2a9d8f)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-111)

---

## Why Plato?

| Problem | Plato |
|---------|--------|
| Menus are English-only (or one language) | 15 languages, guest picks instantly |
| Descriptions don’t help non-native speakers | Full dish text per language |
| Yelp photos are messy / wrong dish | Photos **per dish**, owner-approved |
| New item = rewrite everything | Write once → **translate all** → edit if needed |
| QR → static PDF | Beautiful mobile web menu |

**Who pays:** restaurants & food trucks (B2B).  
**Who uses free:** guests (scan QR, no app install).

---

## Quick start (real backend)

Requires **Node.js 22+** (uses built-in SQLite).

```bash
git clone https://github.com/bastian153/plato-menu.git
cd plato-menu
npm install
npm start
```

Open:

| Page | URL |
|------|-----|
| Landing | http://127.0.0.1:3847/ |
| Guest menu | http://127.0.0.1:3847/#menu |
| Owner dashboard | http://127.0.0.1:3847/#admin |
| **Public menu** | http://127.0.0.1:3847/m/taqueria-el-sol |
| **QR poster** | http://127.0.0.1:3847/api/public/taqueria-el-sol/qr-print |
| API health | http://127.0.0.1:3847/api/health |

### Demo login (seeded automatically)

- **Email:** `demo@plato.menu`  
- **Password:** `demo1234`  

Full API docs: **[BACKEND.md](./BACKEND.md)**

### Static-only (no API)

```bash
npm run static
# http://127.0.0.1:8765 — localStorage mode
```

---

## Features

### Guest
- Language picker (only languages the restaurant enables)
- Dish cards: price, spice, popular, sold-out, photo count
- Detail sheet with photo carousel
- Allergens + order hint
- “Help me choose” quiz
- RTL support for Arabic

### Owner
- Menu list: edit, sold-out toggle
- **Add dish:** name, description, price, category, spice, photo upload
- **Translate to all languages** (machine translation + review/edit)
- Photo approval queue
- Enable/disable languages + primary language
- Bulk “fill missing languages”
- QR / share link
- Local account (restaurant name + email)

### Languages (content)
English · Español · 中文 · 한국어 · 日本語 · Tiếng Việt · Português · Français · العربية · हिन्दी · Filipino · ไทย · Deutsch · Italiano · Русский

---

## How translation works (new menu item)

```
Owner writes dish in primary language (e.g. Spanish)
        │
        ▼
  “Translate to all languages”
        │
        ▼
  Every enabled language gets name + description
        │
        ▼
  Owner can edit any line
        │
        ▼
  Save → guests see the right language
```

If they save without translating, missing languages are still auto-filled so nothing is blank.

**Details:** [TRANSLATION.md](./TRANSLATION.md)

---

## Project structure

```
plato-menu/
├── index.html / css / js/   # Frontend (api.js + app)
├── server/                  # Express API + SQLite
├── data/ · uploads/         # Runtime (gitignored)
├── BACKEND.md               # API docs
├── PRODUCT.md · SALES.md · TRANSLATION.md · ROADMAP.md
├── package.json · LICENSE
└── README.md
```

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [BACKEND.md](./BACKEND.md) | API, auth, DB, demo credentials |
| [PRODUCT.md](./PRODUCT.md) | Problem, MVP, pricing, personas |
| [SALES.md](./SALES.md) | 2-min pitch, objections, outreach |
| [COMPETITIVE.md](./COMPETITIVE.md) | vs PDF QR, Toast, Yelp |
| [TRANSLATION.md](./TRANSLATION.md) | New dish → all languages |
| [ROADMAP.md](./ROADMAP.md) | Planned features |

---

## Tech notes

| Topic | With `npm start` (backend) | Static fallback |
|-------|----------------------------|-----------------|
| Stack | Express + SQLite + HTML/JS | HTML/CSS/JS only |
| Persistence | SQLite `data/plato.db` | `localStorage` |
| Auth | JWT + bcrypt | Local profile |
| Translation | `/api/translate/dish` proxy | Browser → MyMemory |
| Images | `POST /api/me/upload` → `/uploads` | data URLs |
| Multi-tenant | Users → restaurants by slug | Single browser |

Next: Postgres, DeepL, cloud object storage, Stripe — see [ROADMAP.md](./ROADMAP.md).

---

## Pricing (planned SaaS)

| Plan | Price | Includes |
|------|-------|----------|
| Food truck / stall | $39/mo | Multilingual menu, photos, QR |
| Restaurant | $99/mo | Guest photos, analytics, more languages |

---

## Contributing

Issues and PRs welcome. For big changes, open an issue first.

1. Fork & clone  
2. Create a branch  
3. Keep the demo runnable with `npm start` (no required build)  
4. PR with a clear description  

---

## License

[MIT](./LICENSE)

---

## Brand

**Plato** — plate / dish (Spanish); also the “form” of a menu done right.

> Write once. Speak every language. Show the real plate.

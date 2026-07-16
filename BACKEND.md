# Plato backend (v0.3)

## Quick start

```bash
cp .env.example .env
npm install
npm start
```

- App: http://127.0.0.1:3847  
- Public menu: http://127.0.0.1:3847/m/taqueria-el-sol  
- QR poster: http://127.0.0.1:3847/api/public/taqueria-el-sol/qr-print  
- Health: http://127.0.0.1:3847/api/health  

### Demo account

| | |
|--|--|
| Email | `demo@plato.menu` |
| Password | `demo1234` |

---

## Auth

| Method | Endpoint |
|--------|----------|
| Register | `POST /api/auth/register` |
| Password login | `POST /api/auth/login` |
| Magic link request | `POST /api/auth/magic-link` `{ "email" }` |
| Magic link verify | `GET /api/auth/magic-link/verify?token=…` → redirects with JWT |
| Google OAuth | `GET /api/auth/google` (needs env) |
| Session | `GET /api/auth/me` Bearer JWT |

Without SMTP, magic links are **printed in the server console** (`devLink` also returned in JSON).

---

## Public menus & QR

| URL | Purpose |
|-----|---------|
| `/m/:slug` | Guest-facing living menu |
| `/api/public/:slug` | JSON menu |
| `/api/public/:slug/qr.png` | QR PNG |
| `/api/public/:slug/qr.svg` | QR SVG |
| `/api/public/:slug/qr-print` | Printable poster (browser → PDF) |
| `POST /api/public/:slug/dishes/:dishId/photos` | Guest photo (pending approval) |

---

## Database

| Mode | Config |
|------|--------|
| **SQLite** (default) | `data/plato.db` via Node built-in `node:sqlite` |
| **Postgres** | Set `DATABASE_URL=postgres://…` |

Schema includes users, restaurants, categories, dishes, pending_photos, menu_events, magic_links.

---

## Storage

| Driver | Config |
|--------|--------|
| `local` | Files in `/uploads` |
| `s3` | S3 or R2 — set `STORAGE_DRIVER=s3` + `S3_*` keys |

---

## Translation

Provider order when `TRANSLATE_PROVIDER=auto`:

1. DeepL (if `DEEPL_API_KEY`)  
2. Google (if `GOOGLE_TRANSLATE_API_KEY`)  
3. MyMemory free fallback  

**Glossary** protects terms like *al pastor*, *horchata* from mangled translation. Extend with `TRANSLATE_GLOSSARY`.

---

## Security (v0.3)

- `helmet` headers  
- Rate limits on API + stricter on auth  
- JWT secret required in `NODE_ENV=production`  
- Optional `TRUST_PROXY=true` behind reverse proxies  
- Passwords bcrypt; magic tokens hashed at rest  

---

## Owner API (Bearer)

- `GET /api/me/menu`  
- `PATCH /api/me/restaurant`  
- `POST/PUT/DELETE /api/me/dishes…`  
- `POST /api/me/upload`  
- `POST /api/translate/dish`  
- Photo approve/reject  

See also [TRANSLATION.md](./TRANSLATION.md) for the product flow.

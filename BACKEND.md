# Plato backend

Real multi-tenant API for living restaurant menus.

## Stack

| Piece | Choice |
|-------|--------|
| Runtime | Node.js ≥ 22 |
| HTTP | Express 5 |
| DB | Built-in `node:sqlite` (file: `data/plato.db`) |
| Auth | JWT (`Authorization: Bearer <token>`) + bcrypt password hashes |
| Uploads | Multer → `uploads/` |
| Translate | Server proxy to MyMemory (authenticated) |

## Quick start

```bash
cp .env.example .env   # optional
npm install
npm start
```

- App: http://127.0.0.1:3847  
- Health: http://127.0.0.1:3847/api/health  

### Demo account (auto-seeded)

| Field | Value |
|-------|--------|
| Email | `demo@plato.menu` |
| Password | `demo1234` |
| Public slug | `taqueria-el-sol` |

Public menu: `GET /api/public/taqueria-el-sol`

## API overview

### Auth
- `POST /api/auth/register` `{ email, password, restaurantName, name? }`
- `POST /api/auth/login` `{ email, password }`
- `GET /api/auth/me` (Bearer)

### Owner (Bearer)
- `GET /api/me/menu` — full menu + stats  
- `PATCH /api/me/restaurant` — name, langs, tagline, etc.  
- `POST /api/me/dishes` — create dish  
- `PUT /api/me/dishes/:id` — update  
- `PATCH /api/me/dishes/:id/sold-out` `{ soldOut }`  
- `DELETE /api/me/dishes/:id`  
- `POST /api/me/upload` multipart `photo`  
- `POST /api/me/photos/:id/approve|reject`  
- `POST /api/translate/dish` `{ name, desc, fromLang, toLangs }`  

### Public
- `GET /api/public/:slug`  
- `POST /api/public/:slug/events` `{ type, dishId?, lang? }`  

## Data model

```
users 1──* restaurants 1──* categories
                 │
                 ├──* dishes
                 ├──* pending_photos
                 └──* menu_events
```

Multilingual fields stored as JSON maps: `{ "en": "...", "es": "..." }`.

## Frontend modes

1. **API mode** — page served by `npm start`; `PlatoAPI.detect()` hits `/api/health`.  
2. **Local mode** — static host / no server; falls back to `localStorage`.

Owner login in the UI uses real register/login when API is up.

## Security notes (demo)

- Default `JWT_SECRET` is for local dev only — set a strong secret in production.  
- SQLite file is fine for single-node demos; use Postgres for multi-instance production.  
- Add rate limits, HTTPS, and virus scanning on uploads before production.

## Env

See `.env.example`.

# Roadmap

## Done (v0.1–v0.3)

- [x] Guest multi-language menu (15 languages)
- [x] Dish cards, photo carousel, sold-out, popular, spice
- [x] Help me choose quiz
- [x] Owner dashboard (stats, menu, photos, QR)
- [x] Add / edit dish with image upload
- [x] Translate-to-all-languages pipeline
- [x] Enable/disable languages + primary language
- [x] Product, sales, competitive, translation docs
- [x] Express API + SQLite multi-tenant backend
- [x] JWT register/login
- [x] Public menu by slug (`/api/public/:slug`)
- [x] Server-side image upload
- [x] Translate proxy + dish CRUD over API
- [x] Frontend API client with offline fallback
- [x] **Magic-link login** (+ console/SMTP delivery)
- [x] **Google OAuth** (optional via env)
- [x] **Postgres option** (`DATABASE_URL`)
- [x] **S3 / R2 cloud storage** (`STORAGE_DRIVER=s3`)
- [x] **DeepL / Google MT + glossary** (auto fallback to MyMemory)
- [x] **Pretty `/m/:slug` public menu**
- [x] **QR PNG/SVG + print-to-PDF poster**
- [x] **Rate limiting + helmet hardening**
- [x] **Guest photo submit** (pending owner approval)

## Done (onboarding upgrades)

- [x] **Bulk add dishes** (5+ rows, optional auto-translate)
- [x] **Scan paper menu** (photo via xAI vision, or paste text)
- [x] **Multi-restaurant per account** (create/switch clients as setup agent)

## Next (v1)

- [ ] Order at counter / send to kitchen
- [ ] Payments & tips (Stripe)
- [ ] Richer analytics dashboard UI
- [ ] POS integrations (Square, Toast)
- [ ] Multi-location chains
- [ ] Magic-link email templates + branded domains

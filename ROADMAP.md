# Roadmap

**Living tracker (done / partial / next + redesign IA):** see **[CHECKLIST.md](./CHECKLIST.md)**.

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

## Next — UX redesign (priority)

See [CHECKLIST.md](./CHECKLIST.md) phases 1–4:

1. **Phase 1** — ✅ Full-page owner login (`#owner`) + landing CTAs + session chrome + scan auth redirect
2. **Phase 2** — ✅ Owner shell: Home checklist · Import · Restaurant · Menu · Go live · Profile
3. **Phase 3** — ✅ Guest site `/m/:slug` parity (sections, help, photos, clean chrome)
4. **Phase 4** — ✅ Home wizard for new restaurants (basics → import → preview/QR)

## Done (v1 product layer)

- [x] Order at counter / kitchen tickets (guest cart → owner Orders tab)
- [x] Payments & tips (Stripe Checkout when `STRIPE_SECRET_KEY` set)
- [x] Richer analytics dashboard (top dishes, languages, daily opens, order counts)
- [x] POS export (Square/Toast-friendly JSON + CSV)
- [x] Multi-location labels (`chainName` + `locationName` per restaurant)
- [x] Branded magic-link email templates
- [x] Constellation guest mode (optional per restaurant)

## Optional next

- [ ] Full Square/Toast OAuth live sync
- [ ] Stripe webhooks for paid order confirmation
- [ ] Native Constellation table-session multiplayer

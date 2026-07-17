# Plato — Living checklist & redesign plan

**Last updated:** 2026-07-17  
**Goal:** Split the product into two clear experiences so owners can manage their restaurant without hunting for login, and guests get a clean menu-only site.

### UI refresh (2026)
- [x] Design tokens: warmer dark, glass topbar, clearer contrast  
- [x] Landing: trust strip, bento feature cards, phone mock polish  
- [x] Guest menu: larger dish cards, sticky cats, sheet modal polish  
- [x] Owner login card + admin segmented tabs + session chrome  
- [x] Forms: 46px inputs, focus rings, reduced-motion support

---

## North star (two products, one backend)

```
┌─────────────────────────────────────────────────────────────┐
│  MARKETING / ENTRY                                          │
│  /  →  “I’m a guest” | “I’m a restaurant owner” | Login    │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│  GUEST SITE               │   │  OWNER APP                      │
│  /m/:slug  (QR target)    │   │  /owner  (login required)       │
│  Phone-first menu only    │   │  Profile · Restaurant · Menu    │
│  Lang · photos · help     │   │  Preview · QR · scan import     │
└───────────────────────────┘   └─────────────────────────────────┘
                │                             │
                └──────────── API ────────────┘
```

| Who | URL pattern | Auth | What they see |
|-----|-------------|------|----------------|
| Guest | `/m/:slug` | None | Restaurant menu only |
| Owner | `/owner` (or `#/owner/*`) | Login required | Profile + restaurant + dishes + preview |
| Prospect | `/` | None | Landing + clear CTAs |

**Pain today:** Owner + guest + account login share one SPA (`#admin` tabs). Login is buried under **Owner → Account**. Preview and public menu exist but feel secondary.

---

## Status legend

- `[x]` Done  
- `[~]` Partially done / works but UX is weak  
- `[ ]` Not started  

---

## A. What we already have (backend + features)

### Platform / API
- [x] Express API + SQLite (Postgres option)
- [x] JWT register / login / magic link / Google OAuth (optional)
- [x] Multi-tenant: users → restaurants by slug
- [x] Multi-restaurant per account (create / switch)
- [x] Public menu API: `/api/public/:slug`
- [x] Pretty public page: `/m/:slug` (`m.html`)
- [x] QR PNG/SVG + print poster
- [x] Image upload (local or S3/R2)
- [x] Rate limiting + helmet
- [x] Translate proxy (MyMemory / DeepL / Google + glossary)
- [x] Scan paper menu (xAI vision + paste text) — **requires owner login + valid vision model**
- [x] Bulk add dishes + optional auto-translate
- [x] Guest photo submit → owner approve/reject

### Guest features (exist; polish later)
- [x] Multi-language menu (15 languages)
- [x] Dish cards (price, spice, popular, sold-out)
- [x] Detail sheet + photo carousel
- [x] Allergens + order hint
- [x] “Help me choose” quiz
- [x] RTL (Arabic)
- [x] Theme/vibe colors applied to guest menu
- [x] **Sectioned menu** (real section titles from scan + sticky chips + scroll-spy)
- [x] **Owner section editor** (rename, reorder, move dishes, add/remove sections)
- [x] Sticky chip nav hardened (lock + chip auto-scroll only on change)

### Owner features (exist; discovery/UX weak)
- [x] Stats (opens, non-EN %, top dish)
- [x] Dish list, edit, sold-out
- [x] Add dish + translate all + photo
- [x] Photo approval queue
- [x] Languages enable + primary
- [x] QR / share link
- [x] Setup: name, vibe, scan, bulk add
- [~] Account login/register (works, **hard to find**)
- [~] Preview guest menu (exists as button / `/m/:slug`, not a first-class “live preview”)

---

## B. UX problems we are solving next

1. **Login is buried** — under Owner → Account tab; first-time owners miss it and hit “Sign in with API for scan”.
2. **One shell for two jobs** — top nav is `Menu | Owner`; guest demo and owner tooling feel mixed.
3. **No clear owner home** — no single “My profile + my restaurant” dashboard.
4. **Preview is secondary** — should be always one tap: “See what guests see”.
5. **Checklist / progress** — setup steps exist but don’t gate or guide clearly.

---

## C. Redesign — target information architecture

### C1. Landing (`/`)
- [x] Clear hero: “Menus that speak every language”
- [x] Primary/secondary CTAs: guest demo + owner sign in
- [x] Top nav: **Demo menu** · **Owner login** (becomes Dashboard when signed in)
- [ ] Optional: deep-link secondary guest CTA straight to `/m/taqueria-el-sol`

### C2. Owner app (`/owner` or `#owner`)

**Must be logged in.** If not → full-screen login (email/password, magic link), not a tab.

| Section | Purpose | Status |
|---------|---------|--------|
| **Login / Register** | Full-page gate before dashboard | [x] Phase 1 `#owner` |
| **Home / Overview** | Restaurant name, dish count, today’s stats, setup checklist, “Open guest preview” | [ ] New |
| **My profile** | Owner name, email, password/magic link, logout | [~] Exists as Account tab → promote |
| **Restaurant** | Name, emoji, address, hours, tagline, vibe/theme, enabled languages | [~] Split from Setup |
| **Menu (dishes)** | List, edit, sold-out, add one, bulk add, **scan photo** | [~] Exists in tabs |
| **Photos** | Pending guest photos approve/reject | [x] Keep |
| **Preview** | Embedded or new-tab live guest menu for *their* slug | [~] Make permanent nav item |
| **Go live / QR** | Public URL, QR image, print poster, copy link | [x] Keep, surface on Home |

**Owner profile fields (target)**
- [x] Email (auth)
- [~] Display name
- [ ] Avatar (optional later)
- [x] Owned restaurants list
- [ ] Account settings page (not a tab inside menu tools)

**Restaurant details (target)**
- [x] Name, emoji, slug, tagline, hours
- [x] Theme / vibe
- [x] Primary + enabled languages
- [~] Address (field exists; surface better)
- [ ] Logo upload (later)
- [ ] Contact / Wi‑Fi note for guests (later)

### C3. Guest site (`/m/:slug` only)

Guests should **never** see Owner, Account, or Plato marketing chrome beyond a tiny “Powered by Plato” (optional).

| Feature | Status |
|---------|--------|
| Restaurant header + vibe theme | [x] |
| Language switcher | [x] |
| Categories + dish cards | [x] |
| Dish detail + photos | [x] |
| Sold-out / popular / spice | [x] |
| Help me choose | [x] on SPA; [~] confirm parity on `m.html` |
| Guest photo upload | [x] API; [~] UX on public page |
| Offline / weak signal | [ ] Later |
| Order / pay | [ ] Later (roadmap) |

---

## D. Implementation phases (do in order)

### Phase 0 — Tracking & clarity *(this doc)*
- [x] Write living checklist (`CHECKLIST.md`)
- [ ] Keep ROADMAP.md in sync when phases complete

### Phase 1 — Navigation & login first *(unblocks scan + everything)*
**Outcome:** Owner can find login in 2 seconds; unauthenticated users cannot open owner tools.

- [x] Full-page **Owner login** at `#owner` (not buried in Account tab)
- [x] Show “API connected” / “Sign out” in owner chrome when logged in
- [x] Landing CTAs: Guest demo · Owner sign in
- [x] If scan/import requires auth → redirect to login with return path
- [x] Keep demo credentials visible on login page (tap to fill)

### Phase 2 — Owner dashboard shell
**Outcome:** Owner has a real home: profile + restaurant + menu sections.

- [x] Owner tabs — **Home · Menu · Import · Sections · Add · Photos · Restaurant · Go live · Profile**
- [x] **Home**: checklist + stats + Import / Preview / QR CTAs
- [x] **Profile**: email, logout, multi-restaurant switch/delete
- [x] **Restaurant**: basics + vibe + languages in one place
- [x] **Menu**: dishes + move section + add/clear
- [x] **Import**: scan + bulk add
- [x] **Preview**: session bar + Go live open `/m/{slug}`

### Phase 3 — Guest site polish
**Outcome:** QR experience feels like the restaurant’s site, not the Plato admin app.

- [ ] Audit `m.html` vs `#menu` SPA — feature parity
- [ ] Strip any owner/demo chrome from public routes
- [ ] Phone-frame preview component for owners matches public page
- [ ] Optional “Powered by Plato” footer only

### Phase 4 — Onboarding flow
**Outcome:** First-time owner: login → restaurant basics → scan/import → preview → print QR.

- [ ] Guided wizard (4 steps) for new restaurants
- [ ] Scan paper menu as primary import path when `XAI_API_KEY` set
- [ ] After import → review table → save → “Preview as guest”
- [ ] Celebration step: QR ready to print

### Phase 5 — Later product (from original roadmap)
- [ ] Order at counter / kitchen ticket
- [ ] Payments & tips (Stripe)
- [ ] Richer analytics UI
- [ ] POS (Square, Toast)
- [ ] Multi-location chains (beyond multi-restaurant accounts)
- [ ] Branded magic-link emails / custom domains

---

## E. Working URLs (local / WSL)

| Role | Link |
|------|------|
| Landing | http://localhost:3847/ |
| Owner (current) | http://localhost:3847/#admin |
| Owner account tab (login today) | http://localhost:3847/#admin → **Account** |
| Guest demo (SPA) | http://localhost:3847/#menu |
| Guest public (QR target) | http://localhost:3847/m/taqueria-el-sol |
| Demo login | `demo@plato.menu` / `demo1234` |

After Phase 1, prefer: **http://localhost:3847/owner** (or `#owner`) for login + dashboard.

---

## F. Definition of done (redesign)

We call the redesign “done enough” when:

1. A new owner can **log in without instructions** from the landing page.  
2. After login they land on a **Home** that shows *their* restaurant and a setup checklist.  
3. **Scan / bulk add / edit menu** work without hunting tabs.  
4. **Preview** always shows the guest menu for their slug.  
5. A guest opening `/m/:slug` never sees login or owner UI.  
6. This checklist is updated as items flip to `[x]`.

---

## G. Immediate next action (when we start building)

**Phase 1 only** — do not redesign everything at once:

1. Full-page login for owners  
2. Landing CTAs  
3. Redirect scan → login if no token  
4. Persistent owner header: restaurant name + Preview + Logout  

Then Phase 2 dashboard shell.

# Plato — Product brief

**One-liner:** The restaurant menu that switches language and shows real plates — not a PDF.

**Demo:** Open `index.html` or run a local server (see README). Guest menu: `#menu` · Owner: `#admin`.

---

## Problem

| Guest | Restaurant |
|-------|------------|
| Menu is English-only (or one language) | Reprinting paper is expensive |
| Descriptions don’t help non-native speakers | Guests ask “what’s in this?” all day |
| Yelp/Google photos are messy, not per-dish | QR links to a static PDF |
| Hard to know what food *actually* looks like | Miss orders from Spanish-speaking / tourist guests |

---

## Solution

A **mobile web menu** (scan QR, no app install):

1. **Language toggle** (EN ↔ ES first; more later) with full dish descriptions  
2. **Photos per dish** — kitchen hero + approved guest photos  
3. **Beautiful cards** — popular, spice, sold-out, allergens  
4. **Help me choose** — tiny quiz → suggestion  
5. **Owner dashboard** — sold-out, photo queue, stats, QR  

**Buyer:** restaurants, food trucks, stalls (B2B SaaS).  
**User:** guests (free).

---

## Personas

### Guest — “María”
Speaks Spanish primarily. At a food truck with an English board. Opens Plato, taps **ES**, sees photos, orders al pastor confidently.

### Owner — “Luis”
Runs Taquería El Sol. Updates prices on his phone. Approves guest photos once a day. Sees 47% of opens in Spanish — proof the menu matters.

---

## MVP feature set (this demo)

| Feature | Guest | Owner |
|---------|-------|-------|
| Multi-language menu | ✅ | — |
| Dish cards + detail sheet | ✅ | — |
| Photo carousel (kitchen + guest) | ✅ | Approve queue |
| Sold-out state | Sees badge | Toggle |
| Help me choose | ✅ | — |
| Tonight stats (mock) | — | ✅ |
| QR / share link | — | ✅ |

### Not in demo (roadmap)

- Real auth / multi-restaurant accounts  
- AI translation with owner edit  
- More languages  
- Order-to-kitchen / payments  
- Guest upload from receipt QR  
- Offline cache for weak signal  
- POS integrations (Square, Toast)  

---

## UX principles

1. **Phone-first, one hand** — big tap targets, bottom sheet details  
2. **Language is first-class** — not buried in settings  
3. **Photos belong to dishes** — never a random feed  
4. **No app required** — QR → mobile web  
5. **Owner edits in under 10 seconds** — sold-out, prices later  

---

## Information architecture

```
Landing (/)
  ├─ Guest menu (#menu)
  │    ├─ Categories
  │    ├─ Dish list
  │    ├─ Dish detail (photos + desc)
  │    └─ Help me choose
  └─ Owner (#admin)
       ├─ Stats
       ├─ Menu items (sold-out)
       ├─ Photo queue
       └─ QR / link
```

---

## Monetization

| Plan | Price | Includes |
|------|-------|----------|
| Stall / truck | $39/mo | 1 location, EN+ES, owner photos, QR |
| Restaurant | $99/mo | Guest photos, analytics, more languages |
| Setup (optional) | $99–199 once | We load first menu + photos for them |

Annual = 2 months free.

**Expansion revenue:** ordering take-rate, promoted placements, multi-location.

---

## Success metrics

| Metric | Target (early) |
|--------|----------------|
| Guest menu open → dish open | > 60% |
| % sessions in non-default language | Track; Spanish markets often 30%+ |
| Owner weekly active | > 50% toggle or edit |
| Time to first value (owner) | Menu live same day |

---

## Growth path

```
v1 Living menu (lang + photos)
  → v2 Guest UGC photos
  → v3 Analytics that sell upgrades
  → v4 Order / pay
  → v5 “Menus near me” discovery network
```

---

## Brand

- **Name:** Plato (plate / dish in Spanish; also “platonic form” of a menu)  
- **Tone:** Warm, clear, respectful — never condescending about language  
- **Visual:** Dark, food-forward, orange accent, serif display + clean sans  

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| “QR menus already exist” | Win on language UX + per-dish photos + delight |
| Bad guest photos | Approval queue; kitchen photo always first |
| Translation errors | Owner-editable copy; start EN/ES quality bar |
| Owner won’t take photos | Onboarding: “text us 10 dishes, we build it” |

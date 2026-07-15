# How translation works when a restaurant adds a dish

## The short answer

**Owner writes the dish once** (in their primary language — e.g. Spanish or English).  
**Plato machine-translates** name + description into **every language enabled** on that menu.  
**Owner can edit** any language before (or after) guests see it.

Guests never wait for a human translator. Owners stay in control of wording.

---

## Step-by-step (owner)

```
1. Owner → Add dish
2. Choose "You are writing in" (e.g. Español)
3. Type name + description + price + photo
4. Tap "Translate to all languages"
      → EN, 中文, 한국어, 日本語, … fill automatically
5. Optional: open "Review / edit translations" and fix anything weird
6. Save dish
7. Guest opens menu, picks their language, sees the right text
```

If they hit **Save** without translating, Plato still **auto-fills missing languages** so nothing is blank.

---

## What gets translated

| Field | Translated? |
|-------|-------------|
| Dish **name** | Yes (all enabled langs) |
| Dish **description** | Yes |
| **Allergens** (optional) | Yes when using “Fill missing” |
| **Price** | No (same number everywhere) |
| **Photos** | No (universal) |
| **Sold out / spicy level** | No (universal) |

Dish names that are brand/cultural (e.g. “Al Pastor”) often stay similar across languages — that’s fine.

---

## Architecture (demo vs production)

### This demo
- Free **MyMemory** translation API in the browser  
- Results stored in **localStorage** on the device  
- Rate limits may apply; failures **fall back to source text** (never empty)

### Production (recommended)

```
Owner types (primary lang)
        │
        ▼
  Translation service
  (DeepL / Google Cloud Translate)
        │
        ├─► Save draft translations (flag: machine)
        │
        ▼
  Owner review UI (optional but important for food)
        │
        ▼
  Publish → CDN / DB per restaurant
        │
        ▼
  Guest menu loads language pack
```

Extras in production:
- Glossary: never translate “al pastor”, “horchata”, brand names  
- Cache translations by hash of source text (don’t re-pay API)  
- “Source changed” → re-translate only dirty fields  
- Human review queue for multi-location chains  

---

## Enabling languages

**Owner → Languages**

- Toggle which languages appear in the guest language picker  
- Set **primary language** (the one staff write in)  
- **Fill missing languages** — bulk backfill for old dishes  

New dishes only auto-translate into **enabled** languages (saves cost and clutter).

---

## Quality tips for restaurants

1. Write a **clear, simple description** in the primary language (MT works better).  
2. Keep **official dish names** short; put flavor detail in the description.  
3. Spot-check **Chinese / Arabic / Korean** if those guests are common.  
4. Fix one language once — it stays until you change the source and re-translate.

---

## Example

Owner writes (Spanish):

> **Name:** Tacos de Birria  
> **Desc:** Tortilla de maíz, birria de res, consomé, cebolla y cilantro.

After one tap, guest in Korean might see:

> **Name:** 비리아 타코  
> **Desc:** 옥수수 또띠아, 소고기 비리아, 콘소메, 양파와 고수.

Owner can tweak the Korean line if needed, then save.

---

## FAQ

**Q: Do we need a translator on staff?**  
No. Machine translation covers the first version. Human edit is optional quality control.

**Q: What if they add a dish at lunch rush?**  
Write name + desc → Save (auto-translate in background) → photo later if needed.

**Q: Can different locations have different languages?**  
Yes in production (per-location enabled languages). Demo is one restaurant profile.

**Q: RTL languages (Arabic)?**  
Guest UI switches `dir=rtl` when Arabic is selected.

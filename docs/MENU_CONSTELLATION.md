# Secondary experiment: Plato Constellation

**Status:** concept only (not default product)  
**Default guest UX remains:** sectioned story-scroll + sticky chips  
**Purpose:** a breakthrough *optional* mode that only Plato can own

---

## The problem with “better lists”

Every QR menu competitor optimizes the same object: a **catalog**.

- Faster filters  
- Bigger photos  
- Cleaner chips  
- Smoother sticky nav  

That’s table stakes. Guests still feel: *“I’m reading a website at dinner.”*

Paper menus had one advantage catalogs forgot: **you and your table share the same physical object.** Digital menus made food more readable and language-capable — and made dining more solitary.

Plato’s unfair advantages are not “another list”:

1. **Language as first-class** (not a settings afterthought)  
2. **Per-dish truth** (photos that belong to the plate)  
3. **Restaurant vibe** (theme as identity)  
4. **Table context** (multiple people, one decision moment)

A breakthrough design must use those, not just prettier chips.

---

## Insight

**Choosing dinner is a multiplayer sense-making problem under time pressure, often across languages.**

Lists optimize *scanning*.  
Constellation optimizes *deciding together*.

---

## Concept name: **Constellation** (aka “Living table map”)

The menu is a **spatial field of dishes**, not a vertical feed.

### Core model

```
        LIGHTER
           ▲
           │
  MILD ────┼──── BOLD
           │
           ▼
        HEAVIER
```

- Each dish is a **node** (star) on a 2D map  
- Default axes: **Light ↔ Hearty** × **Mild ↔ Bold**  
  (owner can rename axes per vibe: e.g. “Bright ↔ Deep”, “Simple ↔ Complex”)  
- **Sections** become named **clusters** (constellations): Pasta, Soup & Salads, Mains  
- **Photos** bloom when a node is focused  
- **Language switch** remaps labels **in place** — the map doesn’t reshuffle (critical “speaks their language” moment)

### Opening ritual (10 seconds, not a form)

Before the map, one soft beat:

> **How are we eating tonight?**

Four tactile moods (not a long quiz):

| Mood | Effect on map |
|------|----------------|
| **Light** | Bias toward upper half; fade heavy nodes |
| **Share** | Emphasize shareable / multi-piece dishes |
| **Feast** | Bias hearty + popular |
| **Explore** | Full map, nothing faded |

This is not “Help me choose” buried at the bottom. It’s the *doorway*. Skip always available → Classic list.

### Table session (the social breakthrough)

Optional 4-character **table code** on the public menu:

- Phone A opens `/m/trattoria` → “Start table” → code `K7M2`  
- Phone B enters code → **same living map**  
- Each guest can **star** dishes (private or shared)  
- Shared tray shows: “Ana ★ Cacio e Pepe · Luis ★ Branzino”  
- No payment required for v1 — pure **coordination**

Why this matters: digital menus killed the shared paper. Constellation brings **shared attention** back without forcing a group order POS integration on day one.

### Interaction

| Gesture | Result |
|---------|--------|
| Pan / pinch | Explore the field |
| Tap node | Detail sheet (price, desc, photo, allergens, “show counter”) |
| Long-press | Star for the table |
| Drag between stars | Optional “build a path” tasting order (later) |
| Language chip | Labels morph; positions stable |

### Accessibility & trust

- **Classic list always one tap away** (same data, linear)  
- Screen-reader order = section order, not random XY  
- Reduced-motion: static clustered list with same visual grouping  
- Never block hunger behind a novelty

---

## Why this is not gimmick AR / chat-bot menus

| Trend | Failure mode | Constellation |
|-------|--------------|---------------|
| AR plates | Needs cameras, lighting, fragile | Uses photos you already have |
| AI chat menu | Slow, awkward at a noisy table | Spatial, glanceable, silent |
| Heavy filters | Feels like shopping | Mood is emotional, not SKU facets |
| 3D restaurant walkthrough | High cost, low daily use | 2D map, CSS/canvas, theme-colored |

---

## Data we need (extends steps 1–3)

Already building toward this:

- Sections + dishes ✓  
- Photos, spicy, popular, sold-out ✓  
- Languages ✓  

Add later for Constellation quality:

| Field | Source |
|-------|--------|
| `weight` 0–1 (light→hearty) | AI guess + owner tweak |
| `intensity` 0–1 (mild→bold) | AI + owner |
| `shareable` bool | owner / AI |
| `clusterId` | section |
| Table session stars | ephemeral store / SSE |

Scan can seed weight/intensity from description keywords; owner fine-tunes in step 4+.

---

## Product placement

| Mode | Role |
|------|------|
| **Classic** (default) | Sticky chips + story scroll — reliable, fast, what we ship for all restaurants |
| **Constellation** (secondary) | Experience toggle on guest menu + owner “Enable Constellation” in vibe settings |

Never force Constellation on food trucks that want speed. Make it the **wow demo** for Italian/chef-driven concepts.

---

## Success metrics (if we prototype)

- Time-to-first-dish-open (must not regress >15% vs classic)  
- % tables that enable shared session  
- Language switch rate while map open (should rise)  
- Owner enable rate after seeing demo  
- Guest “this felt different” qualitative (sales demos)

---

## Build order (only after classic is rock solid)

1. Classic chip bugs fixed (this PR cycle)  
2. Owner section editor (step 4)  
3. Weight/intensity fields + simple cluster layout (static positions)  
4. Constellation canvas read-only  
5. Table session stars  
6. Mood doorway  

---

## One-line pitch

> **Classic menus list food. Constellation lets a table find dinner together — in any language — on a map of taste.**

That is the secondary breakthrough path. Default product stays the reliable sectioned list.

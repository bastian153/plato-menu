(function () {
  function detectLang() {
    try {
      const n = (navigator.language || "en").toLowerCase();
      const code = n.split("-")[0];
      const codes =
        typeof PLATO_LANG_CODES !== "undefined" ? PLATO_LANG_CODES : ["en", "es"];
      return codes.includes(code) ? code : "en";
    } catch {
      return "en";
    }
  }

  const DEFAULT_SETTINGS = {
    enabledLangs: ["en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar"],
    primaryLang: "en",
  };

  const state = {
    lang: (typeof localStorage !== "undefined" && localStorage.getItem("plato_lang")) || detectLang(),
    view: "home",
    category: "all",
    modal: null,
    photoIndex: 0,
    adminTab: "stats",
    help: { hunger: null, spice: null, pref: null },
    menu: null,
    settings: { ...DEFAULT_SETTINGS },
    account: null,
    editDish: null,
    translateProgress: null,
    stats: { scans: 0, nonEn: 0, topDish: null },
    loading: true,
    loadError: null,
  };

  function t(key) {
    try {
      return platoT(state.lang, key);
    } catch {
      return key;
    }
  }

  function enabledLangs() {
    const list =
      (state.settings && state.settings.enabledLangs) || DEFAULT_SETTINGS.enabledLangs;
    const codes =
      typeof PLATO_LANG_CODES !== "undefined" ? PLATO_LANG_CODES : list;
    return list.filter((c) => codes.includes(c));
  }

  function primaryLang() {
    return (state.settings && state.settings.primaryLang) || "en";
  }

  function loc(map) {
    if (!map) return "";
    if (typeof map === "string") return map;
    return (
      map[state.lang] ||
      map[primaryLang()] ||
      map.en ||
      map.es ||
      Object.values(map).find(Boolean) ||
      ""
    );
  }

  function dishName(d) {
    return loc(d.name);
  }

  function dishDesc(d) {
    return loc(d.desc);
  }

  function catLabel(c) {
    return loc(c.labels || c);
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $all(sel, root = document) {
    return [...root.querySelectorAll(sel)];
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function applyMenuBundle(bundle) {
    if (!bundle || !bundle.restaurant) return;
    state.menu = {
      restaurant: bundle.restaurant,
      categories: bundle.categories || [],
      dishes: bundle.dishes || [],
      pendingPhotos: bundle.pendingPhotos || [],
    };
    if (bundle.settings) {
      state.settings = {
        enabledLangs:
          bundle.settings.enabledLangs ||
          state.settings.enabledLangs ||
          DEFAULT_SETTINGS.enabledLangs,
        primaryLang:
          bundle.settings.primaryLang ||
          state.settings.primaryLang ||
          "en",
      };
    }
  }

  function ensureMenu() {
    if (state.menu && state.menu.dishes) return state.menu;
    if (typeof PLATO_SEED !== "undefined") {
      state.menu = JSON.parse(JSON.stringify(PLATO_SEED));
      return state.menu;
    }
    state.menu = {
      restaurant: {
        id: "demo",
        name: "Plato Demo",
        emoji: "🌮",
        tagline: { en: "Demo menu", es: "Menú demo" },
        address: { en: "Local", es: "Local" },
        hours: { en: "Open", es: "Abierto" },
        slug: "demo",
      },
      categories: [{ id: "tacos", labels: { en: "Tacos", es: "Tacos" } }],
      dishes: [],
      pendingPhotos: [],
    };
    return state.menu;
  }

  function persist() {
    // Local offline mode only
    if (!PlatoAPI.isApi()) {
      PlatoStorage.saveMenu(state.menu);
      PlatoStorage.saveSettings(state.settings);
    }
  }

  async function initData() {
    state.loading = true;
    state.loadError = null;
    try {
      const loaded = PlatoStorage.loadSettings();
      state.settings = {
        enabledLangs: (loaded && loaded.enabledLangs) || DEFAULT_SETTINGS.enabledLangs,
        primaryLang: (loaded && loaded.primaryLang) || DEFAULT_SETTINGS.primaryLang,
      };
      state.account = PlatoStorage.loadAccount();

      const apiUp = await PlatoAPI.detect();
      if (apiUp) {
        try {
          if (PlatoAPI.getToken()) {
            try {
              const me = await PlatoAPI.me();
              state.account = {
                email: me.user.email,
                restaurantName: (me.restaurant && me.restaurant.name) || "",
                password: "",
              };
              if (me.menu) applyMenuBundle(me.menu);
              const full = await PlatoAPI.getMyMenu();
              applyMenuBundle(full.menu);
              if (full.stats) {
                state.stats = {
                  scans: full.stats.scans || 0,
                  nonEn: full.stats.nonEn || 0,
                  topDish: full.stats.topDish,
                };
              }
              ensureMenu();
              return;
            } catch (authErr) {
              // Bad/expired token — clear and load public demo
              console.warn("Auth failed, clearing token", authErr);
              PlatoAPI.logout();
            }
          }
          // Guest / not logged in: public demo slug
          const pub = await PlatoAPI.getPublicMenu("taqueria-el-sol", state.lang);
          applyMenuBundle(pub.menu);
          if (pub.stats) {
            state.stats = {
              scans: pub.stats.scans || 0,
              nonEn: pub.stats.nonEn || 0,
              topDish: pub.stats.topDish,
            };
          }
          ensureMenu();
          return;
        } catch (err) {
          console.warn("API load failed, using local seed", err);
          state.loadError = err.message || "API load failed";
        }
      }

      const saved = PlatoStorage.loadMenu();
      if (saved && saved.dishes) {
        state.menu = saved;
      } else if (typeof PLATO_SEED !== "undefined") {
        state.menu = JSON.parse(JSON.stringify(PLATO_SEED));
        persist();
      }
      if (state.account && state.account.restaurantName && state.menu && state.menu.restaurant) {
        state.menu.restaurant.name = state.account.restaurantName;
      }
      ensureMenu();
    } finally {
      state.loading = false;
    }
  }

  function setLang(lang) {
    state.lang = lang;
    localStorage.setItem("plato_lang", lang);
    const meta = PLATO_LANGS.find((l) => l.code === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = meta && meta.dir === "rtl" ? "rtl" : "ltr";
    render();
  }

  function setView(view) {
    state.view = view;
    location.hash = view === "home" ? "" : view;
    state.modal = null;
    render();
    window.scrollTo(0, 0);
  }

  function parseHash() {
    const h = (location.hash || "#").replace("#", "").replace(/^\//, "");
    if (h === "menu" || h === "admin") state.view = h;
    else state.view = "home";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---- image compress ---- */
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("not image"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 900;
          let w = img.width;
          let h = img.height;
          if (w > max || h > max) {
            const r = Math.min(max / w, max / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- RENDER ---------- */
  function render() {
    try {
      renderChrome();
      $all(".view").forEach((v) => v.classList.remove("active"));
      const map = { home: "#view-home", menu: "#view-menu", admin: "#view-admin" };
      const el = $(map[state.view] || map.home);
      if (el) el.classList.add("active");

      if (state.loading && !state.menu) {
        const target = el || $("#view-home");
        if (target) {
          target.innerHTML =
            '<div class="landing" style="padding:3rem 1.25rem;text-align:center;color:var(--muted)">Loading menu…</div>';
        }
        return;
      }

      ensureMenu();

      if (state.view === "home") renderHome();
      if (state.view === "menu") renderMenu();
      if (state.view === "admin") renderAdmin();

      if (state.modal === "dish") renderDishModal();
      else if (state.modal === "help") renderHelpModal();
      else if (state.modal === "edit") renderEditModal();
      else {
        const mr = $("#modal-root");
        if (mr) {
          mr.classList.remove("open");
          mr.innerHTML = "";
        }
      }
    } catch (err) {
      console.error("Render error", err);
      const home = $("#view-home");
      if (home) {
        home.classList.add("active");
        home.innerHTML =
          '<div class="landing" style="padding:2rem;text-align:center"><h1>Something went wrong</h1><p style="color:var(--muted)">' +
          escapeHtml(err.message || String(err)) +
          '</p><p><button class="btn btn-primary" onclick="location.reload()">Reload</button></p></div>';
      }
    }
  }

  function renderChrome() {
    const switchEl = $(".lang-switch");
    if (switchEl) {
      const langs = enabledLangs();
      const allLangs =
        typeof PLATO_LANGS !== "undefined" && PLATO_LANGS.length
          ? PLATO_LANGS
          : [
              { code: "en", native: "English" },
              { code: "es", native: "Español" },
            ];
      const options = allLangs.filter(
        (l) => langs.includes(l.code) || l.code === state.lang
      );
      switchEl.innerHTML = `
        <label class="lang-select-wrap">
          <span class="sr-only">Language</span>
          <select id="lang-select" class="lang-select" aria-label="Language">
            ${options
              .map(
                (l) =>
                  `<option value="${l.code}" ${l.code === state.lang ? "selected" : ""}>${escapeHtml(l.native)}</option>`
              )
              .join("")}
          </select>
        </label>
      `;
      const sel = $("#lang-select");
      if (sel) sel.onchange = () => setLang(sel.value);
    }

    $all("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === state.view);
    });
    const brandLabel = $(".brand-label");
    if (brandLabel) brandLabel.textContent = t("navHome") || "Plato";
    const navMenu = $('[data-nav="menu"]');
    if (navMenu) navMenu.textContent = t("navMenu") || "Menu";
    const navAdmin = $('[data-nav="admin"]');
    if (navAdmin) navAdmin.textContent = t("navAdmin") || "Owner";
  }

  function renderHome() {
    const root = $("#view-home");
    root.innerHTML = `
      <div class="landing">
        <section class="hero">
          <div class="hero-badge">🌮 Plato · ${enabledLangs().length} languages</div>
          <h1 id="hero-title"></h1>
          <p>${escapeHtml(t("landingSub"))}</p>
          <div class="cta-row">
            <button class="btn btn-primary" data-go="menu">${escapeHtml(t("ctaGuest"))}</button>
            <button class="btn btn-ghost" data-go="admin">${escapeHtml(t("ctaOwner"))}</button>
          </div>
          <div class="phone-mock" aria-hidden="true">
            <img src="https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80" alt="" />
          </div>
        </section>
        <section class="features">
          <article class="feature-card">
            <div class="icon">🌐</div>
            <h3>${escapeHtml(t("feature1Title"))}</h3>
            <p>${escapeHtml(t("feature1Body"))}</p>
          </article>
          <article class="feature-card">
            <div class="icon">📸</div>
            <h3>${escapeHtml(t("feature2Title"))}</h3>
            <p>${escapeHtml(t("feature2Body"))}</p>
          </article>
          <article class="feature-card">
            <div class="icon">✨</div>
            <h3>${escapeHtml(t("feature3Title"))}</h3>
            <p>${escapeHtml(t("feature3Body"))}</p>
          </article>
        </section>
        <section class="how">
          <h2 class="section-title">${escapeHtml(t("howTitle"))}</h2>
          <div class="steps">
            <div class="step">${escapeHtml(t("how1"))}</div>
            <div class="step">${escapeHtml(t("how2"))}</div>
            <div class="step">${escapeHtml(t("how3"))}</div>
            <div class="step">${escapeHtml(t("how4"))}</div>
          </div>
        </section>
        <section class="pricing">
          <h2 class="section-title">${escapeHtml(t("priceTitle"))}</h2>
          <div class="price-cards">
            <div class="price-card">
              <div>${escapeHtml(t("priceTruck"))}</div>
              <div class="amt">$39<small>/mo</small></div>
            </div>
            <div class="price-card featured">
              <div>${escapeHtml(t("priceRest"))}</div>
              <div class="amt">$99<small>/mo</small></div>
            </div>
          </div>
          <p class="price-note">${escapeHtml(t("priceNote"))}</p>
        </section>
        <div class="lang-cloud">
          ${PLATO_LANGS.map((l) => `<span class="lang-chip ${enabledLangs().includes(l.code) ? "on" : ""}">${escapeHtml(l.native)}</span>`).join("")}
        </div>
        <p class="site-footer">${escapeHtml(t("footer"))}</p>
      </div>
    `;
    const h1 = $("#hero-title");
    const raw = t("landingTitle");
    h1.innerHTML = escapeHtml(raw)
      .replace("language", "<span>language</span>")
      .replace("idioma", "<span>idioma</span>");
    root.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.go));
    });
  }

  function renderMenu() {
    const menu = ensureMenu();
    const r = menu.restaurant;
    const root = $("#view-menu");
    if (!root) return;
    const cats = menu.categories || [];
    const dishes = (menu.dishes || []).filter(
      (d) => state.category === "all" || d.category === state.category
    );

    root.innerHTML = `
      <div class="menu-wrap">
        <header class="resto-header">
          <div class="emoji">${r.emoji || "🍽️"}</div>
          <h1>${escapeHtml(r.name)}</h1>
          <p class="meta">${escapeHtml(loc(r.tagline))} · ${escapeHtml(loc(r.address))}</p>
          <div class="status">${escapeHtml(loc(r.hours))}</div>
        </header>
        <nav class="cats">
          <button class="cat-pill ${state.category === "all" ? "active" : ""}" data-cat="all">${escapeHtml(t("all"))}</button>
          ${cats
            .map(
              (c) =>
                `<button class="cat-pill ${state.category === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(catLabel(c))}</button>`
            )
            .join("")}
        </nav>
        <div class="dish-list">
          ${dishes.map((d) => dishCardHtml(d)).join("")}
        </div>
        <div class="help-bar">
          <button class="btn btn-primary" id="btn-help">${escapeHtml(t("helpBtn"))}</button>
        </div>
      </div>
    `;

    root.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.category = btn.dataset.cat;
        renderMenu();
      });
    });
    root.querySelectorAll("[data-dish]").forEach((btn) => {
      btn.addEventListener("click", () => openDish(btn.dataset.dish));
    });
    $("#btn-help").addEventListener("click", () => {
      state.help = { hunger: null, spice: null, pref: null };
      state.modal = "help";
      renderHelpModal();
    });
  }

  function dishCardHtml(d) {
    const spice = "🌶️".repeat(d.spicy || 0);
    const thumb = (d.photos && d.photos[0]) || "";
    return `
      <button type="button" class="dish-card ${d.soldOut ? "sold" : ""}" data-dish="${d.id}">
        ${
          thumb
            ? `<img class="dish-thumb" src="${thumb}" alt="" loading="lazy" />`
            : `<div class="dish-thumb placeholder-thumb">🍽️</div>`
        }
        <div class="dish-body">
          <div class="dish-top">
            <div class="dish-name">${escapeHtml(dishName(d))}</div>
            <div class="dish-price">$${Number(d.price).toFixed(2)}</div>
          </div>
          <p class="dish-desc">${escapeHtml(dishDesc(d))}</p>
          <div class="dish-meta">
            ${d.popular ? `<span class="badge popular">${escapeHtml(t("popular"))}</span>` : ""}
            ${d.soldOut ? `<span class="badge sold">${escapeHtml(t("soldOut"))}</span>` : ""}
            ${d.spicy ? `<span class="badge">${escapeHtml(t("spicy"))} ${spice}</span>` : ""}
            <span class="badge photos">📸 ${d.photoCount || (d.photos || []).length} ${escapeHtml(t("photos"))}</span>
          </div>
        </div>
      </button>
    `;
  }

  function openDish(id) {
    const d = state.menu.dishes.find((x) => x.id === id);
    if (!d) return;
    state.modal = "dish";
    state.photoIndex = 0;
    state._dish = d;
    renderDishModal();
  }

  function renderDishModal() {
    const d = state._dish;
    if (!d) return;
    const root = $("#modal-root");
    root.classList.add("open");
    const photos = d.photos && d.photos.length ? d.photos : [];
    const idx = photos.length ? state.photoIndex % photos.length : 0;
    const label =
      !photos.length
        ? t("noPhoto")
        : idx === 0
          ? t("official")
          : `${t("guestPhotos")} · ${idx}/${photos.length - 1}`;

    root.innerHTML = `
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-carousel">
          <button class="modal-close" id="modal-x" aria-label="Close">×</button>
          <span class="photo-label">${escapeHtml(label)}</span>
          ${
            photos.length
              ? `<img src="${photos[idx]}" alt="${escapeHtml(dishName(d))}" />`
              : `<div class="no-photo-lg">🍽️</div>`
          }
          ${
            photos.length > 1
              ? `<div class="carousel-nav">
                  <button type="button" id="photo-prev">‹</button>
                  <button type="button" id="photo-next">›</button>
                </div>
                <div class="carousel-dots">${photos.map((_, i) => `<span class="${i === idx ? "on" : ""}"></span>`).join("")}</div>`
              : ""
          }
        </div>
        <div class="modal-body">
          <div class="dish-meta" style="margin-bottom:0.5rem">
            ${d.popular ? `<span class="badge popular">${escapeHtml(t("popular"))}</span>` : ""}
            ${d.soldOut ? `<span class="badge sold">${escapeHtml(t("soldOut"))}</span>` : ""}
          </div>
          <h2>${escapeHtml(dishName(d))}</h2>
          <div class="modal-price">$${Number(d.price).toFixed(2)}</div>
          <p class="modal-desc">${escapeHtml(dishDesc(d))}</p>
          <div class="modal-section">
            <strong>${escapeHtml(t("allergens"))}</strong>
            <span>${escapeHtml(loc(d.allergens) || "—")}</span>
          </div>
          ${d.soldOut ? "" : `<div class="order-hint">${escapeHtml(t("orderHint"))}</div>`}
        </div>
      </div>
    `;
    $("#modal-x").onclick = closeModal;
    root.onclick = (e) => {
      if (e.target === root) closeModal();
    };
    const prev = $("#photo-prev");
    const next = $("#photo-next");
    if (prev) {
      prev.onclick = (e) => {
        e.stopPropagation();
        state.photoIndex = (state.photoIndex - 1 + photos.length) % photos.length;
        renderDishModal();
      };
    }
    if (next) {
      next.onclick = (e) => {
        e.stopPropagation();
        state.photoIndex = (state.photoIndex + 1) % photos.length;
        renderDishModal();
      };
    }
  }

  function renderHelpModal() {
    const root = $("#modal-root");
    root.classList.add("open");
    const h = state.help;
    const ready = h.hunger && h.spice && h.pref;
    let suggestion = ready ? suggestDish(h) : null;

    root.innerHTML = `
      <div class="modal-sheet" role="dialog">
        <div class="modal-body" style="padding-top:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <h2 style="font-family:var(--display);font-size:1.35rem">${escapeHtml(t("helpTitle"))}</h2>
            <button class="btn btn-ghost btn-sm" id="modal-x">${escapeHtml(t("helpClose"))}</button>
          </div>
          <div class="help-steps">
            ${helpBlock("hunger", t("helpQ1"), [
              ["light", t("helpLight")],
              ["full", t("helpFull")],
            ])}
            ${helpBlock("spice", t("helpQ2"), [
              ["mild", t("helpMild")],
              ["hot", t("helpHot")],
            ])}
            ${helpBlock("pref", t("helpQ3"), [
              ["meat", t("helpMeat")],
              ["veg", t("helpVeg")],
            ])}
            ${
              suggestion
                ? `<div class="help-result">
                    <div style="color:var(--muted);font-size:0.85rem;margin-bottom:0.35rem">${escapeHtml(t("helpResult"))}</div>
                    <strong style="font-size:1.15rem">${escapeHtml(dishName(suggestion))}</strong>
                    <p style="color:var(--muted);font-size:0.9rem;margin:0.35rem 0 0.75rem">${escapeHtml(dishDesc(suggestion))}</p>
                    <button class="btn btn-primary btn-sm" id="see-suggest">${escapeHtml(t("seeDish"))}</button>
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    `;

    function helpBlock(key, q, opts) {
      return `<div>
        <div class="help-q">${escapeHtml(q)}</div>
        <div class="help-options">
          ${opts
            .map(
              ([val, label]) =>
                `<button type="button" data-help="${key}" data-val="${val}" class="${h[key] === val ? "selected" : ""}">${escapeHtml(label)}</button>`
            )
            .join("")}
        </div>
      </div>`;
    }

    $("#modal-x").onclick = closeModal;
    root.onclick = (e) => {
      if (e.target === root) closeModal();
    };
    root.querySelectorAll("[data-help]").forEach((btn) => {
      btn.onclick = () => {
        state.help[btn.dataset.help] = btn.dataset.val;
        renderHelpModal();
      };
    });
    const see = $("#see-suggest");
    if (see && suggestion) {
      see.onclick = () => openDish(suggestion.id);
    }
  }

  function suggestDish(h) {
    let pool = state.menu.dishes.filter((d) => !d.soldOut);
    if (h.hunger === "light") pool = pool.filter((d) => d.category === "tacos" || d.category === "sides");
    if (h.hunger === "full") pool = pool.filter((d) => d.category === "bowls" || d.price >= 4.5);
    if (h.spice === "mild") pool = pool.filter((d) => (d.spicy || 0) <= 1);
    if (h.spice === "hot") pool = pool.filter((d) => (d.spicy || 0) >= 2);
    if (h.pref === "veg") {
      pool = pool.filter((d) => (d.tags && d.tags.en || []).some((x) => /veggie|drink|side/i.test(x)));
    }
    if (h.pref === "meat") {
      pool = pool.filter(
        (d) => !(d.tags && d.tags.en || []).some((x) => /veggie/i.test(x)) && d.category !== "sides"
      );
    }
    if (!pool.length) pool = state.menu.dishes.filter((d) => !d.soldOut && d.popular);
    return pool[0] || state.menu.dishes[0];
  }

  function closeModal() {
    state.modal = null;
    state._dish = null;
    state.editDish = null;
    $("#modal-root").classList.remove("open");
    $("#modal-root").innerHTML = "";
  }

  /* ---------- ADMIN ---------- */
  function renderAdmin() {
    const root = $("#view-admin");
    if (!root) return;
    ensureMenu();
    const top = (state.menu.dishes || []).find((d) => d.id === state.stats.topDish);

    root.innerHTML = `
      <div class="admin-wrap">
        <h1>${escapeHtml(t("adminTitle"))}</h1>
        <p class="admin-sub">${escapeHtml(t("adminSub"))}</p>
        <p class="admin-hint">${escapeHtml(t("saveHint"))}</p>

        <div class="admin-tabs">
          ${tabBtn("stats", t("adminStats"))}
          ${tabBtn("menu", t("adminMenu"))}
          ${tabBtn("add", t("adminAdd"))}
          ${tabBtn("photos", t("adminPhotos"))}
          ${tabBtn("langs", t("adminLangs"))}
          ${tabBtn("qr", t("adminQr"))}
          ${tabBtn("account", t("adminAccount"))}
        </div>

        <div class="admin-panel ${state.adminTab === "stats" ? "active" : ""}">
          <div class="stat-grid">
            <div class="stat"><div class="n">${state.stats.scans}</div><div class="l">${escapeHtml(t("scans"))}</div></div>
            <div class="stat"><div class="n">${state.stats.nonEn}%</div><div class="l">${escapeHtml(t("langEs"))}</div></div>
            <div class="stat"><div class="n" style="font-size:0.95rem;padding-top:0.25rem">${escapeHtml(top ? dishName(top) : "—")}</div><div class="l">${escapeHtml(t("topDish"))}</div></div>
          </div>
          <button class="btn btn-primary" data-go="menu" style="width:100%">${escapeHtml(t("backMenu"))}</button>
        </div>

        <div class="admin-panel ${state.adminTab === "menu" ? "active" : ""}">
          ${state.menu.dishes
            .map(
              (d) => `
            <div class="admin-dish">
              ${d.photos && d.photos[0] ? `<img src="${d.photos[0]}" alt="" />` : `<div class="admin-thumb-ph">🍽️</div>`}
              <div class="info">
                <strong>${escapeHtml(dishName(d))}</strong>
                <span>$${Number(d.price).toFixed(2)} · ${d.soldOut ? t("soldOut") : t("available")}</span>
              </div>
              <div class="admin-actions">
                <button class="btn btn-sm btn-ghost" data-edit="${d.id}">✎</button>
                <button class="btn btn-sm ${d.soldOut ? "btn-good" : "btn-danger"}" data-toggle-sold="${d.id}">
                  ${escapeHtml(d.soldOut ? t("toggleAvail") : t("toggleSold"))}
                </button>
              </div>
            </div>`
            )
            .join("")}
        </div>

        <div class="admin-panel ${state.adminTab === "add" ? "active" : ""}">
          ${renderAddFormHtml()}
        </div>

        <div class="admin-panel ${state.adminTab === "photos" ? "active" : ""}">
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:0.75rem">${escapeHtml(t("pending"))}</p>
          ${(state.menu.pendingPhotos || []).length
            ? (state.menu.pendingPhotos || [])
                .map((p) => {
                  const d = state.menu.dishes.find((x) => x.id === p.dishId);
                  return `<div class="photo-queue-item">
                    <img src="${p.url}" alt="" />
                    <div><strong>${escapeHtml(d ? dishName(d) : p.dishId)}</strong></div>
                    <div style="display:flex;flex-direction:column;gap:0.35rem">
                      <button class="btn btn-sm btn-good" data-approve="${p.id}">${escapeHtml(t("approve"))}</button>
                      <button class="btn btn-sm btn-danger" data-reject="${p.id}">${escapeHtml(t("reject"))}</button>
                    </div>
                  </div>`;
                })
                .join("")
            : `<p style="color:var(--muted)">✨</p>`}
        </div>

        <div class="admin-panel ${state.adminTab === "langs" ? "active" : ""}">
          <h3 style="margin-bottom:0.5rem">${escapeHtml(t("enabledLangs"))}</h3>
          <p style="color:var(--muted);font-size:0.9rem;margin-bottom:1rem">${escapeHtml(t("enabledHint"))}</p>
          <div class="lang-toggles">
            ${PLATO_LANGS.map(
              (l) => `
              <label class="lang-toggle">
                <input type="checkbox" data-enable-lang="${l.code}" ${enabledLangs().includes(l.code) ? "checked" : ""} />
                <span>${escapeHtml(l.native)} <small>${escapeHtml(l.name)}</small></span>
              </label>`
            ).join("")}
          </div>
          <label class="field" style="margin-top:1.25rem">
            <span>${escapeHtml(t("primaryLang"))}</span>
            <select id="primary-lang">
              ${PLATO_LANGS.map(
                (l) =>
                  `<option value="${l.code}" ${primaryLang() === l.code ? "selected" : ""}>${escapeHtml(l.native)}</option>`
              ).join("")}
            </select>
          </label>
          <p class="source-note">${escapeHtml(t("sourceNote"))}</p>
          <button class="btn btn-primary" id="fill-missing" style="width:100%;margin-top:1rem">${escapeHtml(t("fillMissing"))}</button>
          <div id="fill-progress" class="progress-line hidden"></div>
        </div>

        <div class="admin-panel ${state.adminTab === "qr" ? "active" : ""}">
          <div class="qr-box">
            <strong>${escapeHtml(state.menu.restaurant.name)}</strong>
            <div class="qr-fake"></div>
            <p style="color:var(--muted);font-size:0.85rem;margin-bottom:0.75rem">/m/${escapeHtml(state.menu.restaurant.slug || state.menu.restaurant.id)}</p>
            ${
              PlatoAPI.isApi() && state.menu.restaurant.slug
                ? `<img src="${PlatoAPI.qrPngUrl(state.menu.restaurant.slug)}?size=180" width="140" height="140" alt="QR" style="margin:0.5rem auto;display:block;border-radius:8px;background:#fff"/>
                   <a class="btn btn-ghost btn-sm" href="${PlatoAPI.publicMenuUrl(state.menu.restaurant.slug)}" target="_blank" style="margin:0.35rem">Open public menu</a>
                   <a class="btn btn-ghost btn-sm" href="${PlatoAPI.qrPrintUrl(state.menu.restaurant.slug)}" target="_blank" style="margin:0.35rem">Print QR</a>`
                : ""
            }
            <button class="btn btn-primary btn-sm" id="copy-link">${escapeHtml(t("copyQr"))}</button>
          </div>
        </div>

        <div class="admin-panel ${state.adminTab === "account" ? "active" : ""}">
          ${renderAccountHtml()}
        </div>
      </div>
    `;

    function tabBtn(id, label) {
      return `<button data-atab="${id}" class="${state.adminTab === id ? "active" : ""}">${escapeHtml(label)}</button>`;
    }

    bindAdminEvents(root);
  }

  function renderAddFormHtml() {
    const draft = state.editDish || emptyDraft();
    const src = draft._sourceLang || primaryLang();
    const srcName = (draft.name && draft.name[src]) || "";
    const srcDesc = (draft.desc && draft.desc[src]) || "";
    const progress = state.translateProgress;

    return `
      <form id="dish-form" class="dish-form">
        <h3 style="margin-bottom:0.75rem">${escapeHtml(draft.id ? t("editDish") : t("addDish"))}</h3>
        <p class="source-note">${escapeHtml(t("sourceNote"))}</p>

        <label class="field">
          <span>${escapeHtml(t("primaryLang"))}</span>
          <select name="sourceLang" id="source-lang">
            ${PLATO_LANGS.map(
              (l) =>
                `<option value="${l.code}" ${src === l.code ? "selected" : ""}>${escapeHtml(l.native)}</option>`
            ).join("")}
          </select>
        </label>

        <label class="field">
          <span>${escapeHtml(t("dishName"))}</span>
          <input name="name" id="f-name" required value="${escapeHtml(srcName)}" placeholder="Al Pastor" />
        </label>

        <label class="field">
          <span>${escapeHtml(t("dishDesc"))}</span>
          <textarea name="desc" id="f-desc" rows="3" required placeholder="Marinated pork, pineapple...">${escapeHtml(srcDesc)}</textarea>
        </label>

        <div class="field-row">
          <label class="field">
            <span>${escapeHtml(t("dishPrice"))}</span>
            <input name="price" id="f-price" type="number" step="0.25" min="0" value="${draft.price ?? 5}" />
          </label>
          <label class="field">
            <span>${escapeHtml(t("dishSpicy"))}</span>
            <input name="spicy" id="f-spicy" type="number" min="0" max="3" value="${draft.spicy ?? 0}" />
          </label>
        </div>

        <label class="field">
          <span>${escapeHtml(t("dishCategory"))}</span>
          <select name="category" id="f-cat">
            ${state.menu.categories
              .map(
                (c) =>
                  `<option value="${c.id}" ${draft.category === c.id ? "selected" : ""}>${escapeHtml(catLabel(c))}</option>`
              )
              .join("")}
          </select>
        </label>

        <label class="field">
          <span>${escapeHtml(t("dishPhoto"))}</span>
          <input type="file" id="f-photo" accept="image/*" capture="environment" />
          <span class="field-hint">${escapeHtml(t("uploadHint"))}</span>
        </label>
        <div id="photo-preview" class="photo-preview ${draft.photos && draft.photos[0] ? "" : "hidden"}">
          ${draft.photos && draft.photos[0] ? `<img src="${draft.photos[0]}" alt="" />` : ""}
        </div>

        <button type="button" class="btn btn-ghost" id="btn-translate" style="width:100%;margin:0.5rem 0">
          🌐 ${escapeHtml(progress ? t("translating") : t("translateAll"))}
        </button>
        <div id="translate-progress" class="progress-line ${progress ? "" : "hidden"}">
          <div class="progress-bar" style="width:${progress ? progress.pct : 0}%"></div>
          <span>${progress ? progress.label : ""}</span>
        </div>

        <details class="lang-review" id="lang-review" ${draft._translated ? "open" : ""}>
          <summary>${escapeHtml(t("reviewLangs"))}</summary>
          <div id="lang-fields">
            ${enabledLangs()
              .map((code) => {
                const L = PLATO_LANGS.find((x) => x.code === code);
                const n = (draft.name && draft.name[code]) || "";
                const d = (draft.desc && draft.desc[code]) || "";
                return `
                <div class="lang-edit-block">
                  <div class="lang-edit-title">${escapeHtml(L.native)} ${!n ? `<em class="miss">${escapeHtml(t("missingLang"))}</em>` : ""}</div>
                  <input data-lang-name="${code}" value="${escapeHtml(n)}" placeholder="Name" />
                  <textarea data-lang-desc="${code}" rows="2" placeholder="Description">${escapeHtml(d)}</textarea>
                </div>`;
              })
              .join("")}
          </div>
        </details>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${escapeHtml(t("saveDish"))}</button>
          ${
            draft.id
              ? `<button type="button" class="btn btn-danger" id="btn-delete">${escapeHtml(t("deleteDish"))}</button>`
              : ""
          }
        </div>
      </form>
    `;
  }

  function emptyDraft() {
    return {
      id: null,
      category: "tacos",
      price: 5,
      spicy: 0,
      popular: false,
      soldOut: false,
      name: {},
      desc: {},
      allergens: { en: "None common", es: "Sin alérgenos comunes" },
      tags: { en: [], es: [] },
      photos: [],
      photoCount: 0,
      _sourceLang: primaryLang(),
      _translated: false,
    };
  }

  function renderAccountHtml() {
    const a = state.account || {};
    const slug = (state.menu.restaurant && state.menu.restaurant.slug) || "taqueria-el-sol";
    const api = PlatoAPI.isApi();
    return `
      <form id="account-form" class="dish-form">
        <h3>${escapeHtml(t("loginTitle"))}</h3>
        <p class="source-note">${escapeHtml(t("loginSub"))}${api ? " · API connected" : " · offline mode"}</p>
        <label class="field">
          <span>${escapeHtml(t("restName"))}</span>
          <input name="restaurantName" value="${escapeHtml(a.restaurantName || state.menu.restaurant.name)}" required />
        </label>
        <label class="field">
          <span>${escapeHtml(t("ownerEmail"))}</span>
          <input name="email" type="email" value="${escapeHtml(a.email || "")}" placeholder="you@restaurant.com" required />
        </label>
        <label class="field">
          <span>${escapeHtml(t("password"))}</span>
          <input name="password" type="password" value="" placeholder="••••••••" />
        </label>
        <button type="submit" class="btn btn-primary" style="width:100%">${escapeHtml(t("signIn"))}</button>
        ${
          api
            ? `<button type="button" class="btn btn-ghost" id="magic-link" style="width:100%;margin-top:0.5rem">Email magic link</button>
               <a class="btn btn-ghost" id="google-oauth" href="${PlatoAPI.googleAuthUrl()}" style="width:100%;margin-top:0.5rem;display:block;text-align:center">Continue with Google</a>`
            : ""
        }
        ${
          a.email
            ? `<button type="button" class="btn btn-ghost" id="sign-out" style="width:100%;margin-top:0.5rem">${escapeHtml(t("signOut"))}</button>`
            : ""
        }
      </form>
      ${
        api
          ? `<div class="qr-box" style="margin-top:1rem">
              <strong>Public menu</strong>
              <p style="margin:0.5rem 0"><a href="${PlatoAPI.publicMenuUrl(slug)}" target="_blank" rel="noopener">/m/${escapeHtml(slug)}</a></p>
              <img src="${PlatoAPI.qrPngUrl(slug)}?size=200" alt="QR" width="160" height="160" style="border-radius:12px;background:#fff;margin:0.5rem auto;display:block"/>
              <a class="btn btn-primary btn-sm" href="${PlatoAPI.qrPrintUrl(slug)}" target="_blank" rel="noopener">Print QR / Save PDF</a>
            </div>`
          : ""
      }
    `;
  }

  function bindAdminEvents(root) {
    root.querySelectorAll("[data-atab]").forEach((b) => {
      b.onclick = () => {
        state.adminTab = b.dataset.atab;
        if (b.dataset.atab === "add" && !state.editDish) state.editDish = emptyDraft();
        if (b.dataset.atab !== "add") state.editDish = null;
        renderAdmin();
      };
    });
    root.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => setView(b.dataset.go);
    });
    root.querySelectorAll("[data-toggle-sold]").forEach((b) => {
      b.onclick = async () => {
        const d = state.menu.dishes.find((x) => x.id === b.dataset.toggleSold);
        if (!d) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.toggleSoldOut(d.id, !d.soldOut);
            applyMenuBundle(res.menu);
          } else {
            d.soldOut = !d.soldOut;
            persist();
          }
          const updated = state.menu.dishes.find((x) => x.id === d.id);
          toast(updated && updated.soldOut ? t("soldOut") : t("available"));
          renderAdmin();
        } catch (err) {
          toast(err.message || "Error");
        }
      };
    });
    root.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => {
        const d = state.menu.dishes.find((x) => x.id === b.dataset.edit);
        if (!d) return;
        state.editDish = JSON.parse(JSON.stringify(d));
        state.editDish._sourceLang = primaryLang();
        state.editDish._translated = true;
        state.adminTab = "add";
        renderAdmin();
      };
    });
    root.querySelectorAll("[data-approve]").forEach((b) => {
      b.onclick = async () => {
        const p = (state.menu.pendingPhotos || []).find((x) => x.id === b.dataset.approve);
        if (!p) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.approvePhoto(p.id);
            applyMenuBundle(res.menu);
          } else {
            const d = state.menu.dishes.find((x) => x.id === p.dishId);
            if (d) {
              d.photos = d.photos || [];
              d.photos.push(p.url);
              d.photoCount = (d.photoCount || 0) + 1;
            }
            state.menu.pendingPhotos = state.menu.pendingPhotos.filter((x) => x.id !== p.id);
            persist();
          }
          toast(t("approve"));
          renderAdmin();
        } catch (err) {
          toast(err.message || "Error");
        }
      };
    });
    root.querySelectorAll("[data-reject]").forEach((b) => {
      b.onclick = async () => {
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.rejectPhoto(b.dataset.reject);
            applyMenuBundle(res.menu);
          } else {
            state.menu.pendingPhotos = (state.menu.pendingPhotos || []).filter(
              (x) => x.id !== b.dataset.reject
            );
            persist();
          }
          toast(t("reject"));
          renderAdmin();
        } catch (err) {
          toast(err.message || "Error");
        }
      };
    });
    root.querySelectorAll("[data-enable-lang]").forEach((cb) => {
      cb.onchange = async () => {
        const code = cb.dataset.enableLang;
        let list = [...enabledLangs()];
        if (cb.checked) {
          if (!list.includes(code)) list.push(code);
        } else {
          list = list.filter((c) => c !== code);
          if (!list.length) list = ["en"];
        }
        state.settings.enabledLangs = list;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.updateRestaurant({ enabledLangs: list });
            applyMenuBundle(res.menu);
          } else {
            PlatoStorage.saveSettings(state.settings);
          }
        } catch (err) {
          toast(err.message || "Error");
        }
        renderAdmin();
      };
    });
    const prim = $("#primary-lang");
    if (prim) {
      prim.onchange = async () => {
        state.settings.primaryLang = prim.value;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.updateRestaurant({ primaryLang: prim.value });
            applyMenuBundle(res.menu);
          } else {
            PlatoStorage.saveSettings(state.settings);
          }
        } catch (err) {
          toast(err.message || "Error");
        }
      };
    }
    const fill = $("#fill-missing");
    if (fill) {
      fill.onclick = () => fillAllMissingTranslations();
    }
    const copy = $("#copy-link");
    if (copy) {
      copy.onclick = async () => {
        const slug = state.menu.restaurant.slug;
        const url =
          PlatoAPI.isApi() && slug
            ? PlatoAPI.publicMenuUrl(slug)
            : location.origin + location.pathname + "#menu";
        try {
          await navigator.clipboard.writeText(url);
          toast(t("copied"));
        } catch {
          toast(url);
        }
      };
    }

    // account form
    const accForm = $("#account-form");
    if (accForm) {
      accForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(accForm);
        const acc = {
          restaurantName: String(fd.get("restaurantName") || "").trim(),
          email: String(fd.get("email") || "").trim(),
          password: String(fd.get("password") || ""),
        };
        try {
          if (PlatoAPI.isApi()) {
            let data;
            try {
              data = await PlatoAPI.login({
                email: acc.email,
                password: acc.password,
              });
            } catch (loginErr) {
              if (loginErr.status === 401) {
                data = await PlatoAPI.register({
                  email: acc.email,
                  password: acc.password || "demo1234",
                  restaurantName: acc.restaurantName,
                  name: acc.restaurantName,
                });
              } else {
                throw loginErr;
              }
            }
            state.account = {
              email: data.user.email,
              restaurantName: (data.restaurant && data.restaurant.name) || acc.restaurantName,
              password: "",
            };
            if (data.menu) applyMenuBundle(data.menu);
            if (data.restaurant && data.restaurant.name !== acc.restaurantName && acc.restaurantName) {
              const updated = await PlatoAPI.updateRestaurant({ name: acc.restaurantName });
              applyMenuBundle(updated.menu);
              state.account.restaurantName = acc.restaurantName;
            }
            PlatoStorage.saveAccount({
              email: state.account.email,
              restaurantName: state.account.restaurantName,
            });
            toast(t("accountSaved"));
            renderAdmin();
            return;
          }
          state.account = acc;
          PlatoStorage.saveAccount(acc);
          state.menu.restaurant.name = acc.restaurantName;
          persist();
          toast(t("accountSaved"));
          renderAdmin();
        } catch (err) {
          toast(err.message || "Auth error");
        }
      };
    }
    const so = $("#sign-out");
    if (so) {
      so.onclick = async () => {
        PlatoAPI.logout();
        PlatoStorage.clearAccount();
        state.account = null;
        if (PlatoAPI.isApi()) {
          try {
            const pub = await PlatoAPI.getPublicMenu("taqueria-el-sol", state.lang);
            applyMenuBundle(pub.menu);
          } catch {
            /* ignore */
          }
        }
        toast(t("signOut"));
        renderAdmin();
      };
    }
    const magic = $("#magic-link");
    if (magic) {
      magic.onclick = async () => {
        const email = (document.querySelector('#account-form [name="email"]') || {}).value;
        if (!email) {
          toast(t("needName") === "Add a dish name" ? "Enter email" : "Email");
          return;
        }
        try {
          const res = await PlatoAPI.requestMagicLink(email);
          toast("Magic link sent");
          if (res.devLink) {
            console.info("Magic link (dev):", res.devLink);
            toast("Check server console for link");
          }
        } catch (err) {
          toast(err.message || "Magic link failed");
        }
      };
    }

    // dish form
    bindDishForm();
  }

  function bindDishForm() {
    const form = $("#dish-form");
    if (!form) return;
    const draft = state.editDish || emptyDraft();

    $("#f-photo") &&
      ($("#f-photo").onchange = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            // Compress then upload blob
            const dataUrl = await readImageFile(file);
            const blob = await (await fetch(dataUrl)).blob();
            const up = await PlatoAPI.uploadPhoto(blob);
            draft.photos = [up.url, ...(draft.photos || []).filter((p) => p !== up.url)];
          } else {
            const dataUrl = await readImageFile(file);
            draft.photos = [dataUrl, ...(draft.photos || []).filter((p) => p !== dataUrl)];
          }
          state.editDish = draft;
          const prev = $("#photo-preview");
          prev.classList.remove("hidden");
          prev.innerHTML = `<img src="${draft.photos[0]}" alt="" />`;
          toast("📷");
        } catch (err) {
          toast(err.message || "Image error");
        }
      });

    $("#source-lang") &&
      ($("#source-lang").onchange = (e) => {
        draft._sourceLang = e.target.value;
        state.editDish = draft;
      });

    $("#btn-translate") &&
      ($("#btn-translate").onclick = async () => {
        await runTranslate(draft);
      });

    $("#btn-delete") &&
      ($("#btn-delete").onclick = async () => {
        if (!draft.id) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.deleteDish(draft.id);
            applyMenuBundle(res.menu);
          } else {
            state.menu.dishes = state.menu.dishes.filter((d) => d.id !== draft.id);
            persist();
          }
          state.editDish = null;
          state.adminTab = "menu";
          toast(t("deleteDish"));
          renderAdmin();
        } catch (err) {
          toast(err.message || "Delete failed");
        }
      });

    form.onsubmit = async (e) => {
      e.preventDefault();
      await saveDishFromForm(draft);
    };
  }

  function collectLangFields(draft, sourceLang, name, desc) {
    draft.name = draft.name || {};
    draft.desc = draft.desc || {};
    draft.name[sourceLang] = name;
    draft.desc[sourceLang] = desc;
    $all("[data-lang-name]").forEach((inp) => {
      draft.name[inp.dataset.langName] = inp.value.trim();
    });
    $all("[data-lang-desc]").forEach((ta) => {
      draft.desc[ta.dataset.langDesc] = ta.value.trim();
    });
  }

  async function runTranslate(draft) {
    const sourceLang = ($("#source-lang") && $("#source-lang").value) || primaryLang();
    const name = ($("#f-name") && $("#f-name").value.trim()) || "";
    const desc = ($("#f-desc") && $("#f-desc").value.trim()) || "";
    if (!name) {
      toast(t("needName"));
      return;
    }
    if (!desc) {
      toast(t("needDesc"));
      return;
    }

    const langs = enabledLangs();
    state.translateProgress = { pct: 5, label: t("translating") };
    state.editDish = draft;
    renderAdmin();

    try {
      let nameMap;
      let descMap;
      if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
        state.translateProgress = { pct: 30, label: t("translating") };
        renderAdmin();
        const res = await PlatoAPI.translateDish({
          name,
          desc,
          fromLang: sourceLang,
          toLangs: langs,
        });
        nameMap = res.name;
        descMap = res.desc;
      } else {
        const filled = await PlatoTranslate.translateDishFields({
          name,
          desc,
          fromLang: sourceLang,
          toLangs: langs,
          onProgress: (done, total) => {
            state.translateProgress = {
              pct: Math.round((done / total) * 100),
              label: `${t("translating")} ${done}/${total}`,
            };
            const bar = $(".progress-bar");
            const lab = $("#translate-progress span");
            if (bar) bar.style.width = state.translateProgress.pct + "%";
            if (lab) lab.textContent = state.translateProgress.label;
          },
        });
        nameMap = filled.name;
        descMap = filled.desc;
      }
      draft.name = nameMap;
      draft.desc = descMap;
      draft._sourceLang = sourceLang;
      draft._translated = true;
      state.editDish = draft;
      state.translateProgress = null;
      toast(t("translated"));
      renderAdmin();
    } catch (err) {
      console.error(err);
      state.translateProgress = null;
      toast(t("translateFail"));
      renderAdmin();
    }
  }

  async function saveDishFromForm(draft) {
    const sourceLang = ($("#source-lang") && $("#source-lang").value) || primaryLang();
    const name = ($("#f-name") && $("#f-name").value.trim()) || "";
    const desc = ($("#f-desc") && $("#f-desc").value.trim()) || "";
    if (!name) {
      toast(t("needName"));
      return;
    }
    if (!desc) {
      toast(t("needDesc"));
      return;
    }

    collectLangFields(draft, sourceLang, name, desc);

    // If other langs empty, auto-translate before save
    const langs = enabledLangs();
    const missing = langs.filter((c) => !draft.name[c] || !draft.desc[c]);
    if (missing.length) {
      toast(t("translating"));
      try {
        let filled;
        if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
          filled = await PlatoAPI.translateDish({
            name,
            desc,
            fromLang: sourceLang,
            toLangs: langs,
          });
        } else {
          filled = await PlatoTranslate.translateDishFields({
            name,
            desc,
            fromLang: sourceLang,
            toLangs: langs,
          });
        }
        draft.name = { ...filled.name, ...draft.name };
        draft.desc = { ...filled.desc, ...draft.desc };
        collectLangFields(draft, sourceLang, name, desc);
      } catch (e) {
        langs.forEach((c) => {
          if (!draft.name[c]) draft.name[c] = name;
          if (!draft.desc[c]) draft.desc[c] = desc;
        });
      }
    }

    draft.price = parseFloat($("#f-price").value) || 0;
    draft.spicy = parseInt($("#f-spicy").value, 10) || 0;
    draft.category = $("#f-cat").value;
    draft.photoCount = (draft.photos || []).length;

    const payload = {
      id: draft.id || undefined,
      category: draft.category,
      price: draft.price,
      spicy: draft.spicy,
      popular: !!draft.popular,
      soldOut: !!draft.soldOut,
      name: draft.name,
      desc: draft.desc,
      tags: draft.tags || {},
      allergens: draft.allergens || {},
      photos: draft.photos || [],
      photoCount: draft.photoCount,
    };

    try {
      if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
        const res = draft.id
          ? await PlatoAPI.updateDish(draft.id, payload)
          : await PlatoAPI.createDish(payload);
        applyMenuBundle(res.menu);
      } else {
        if (!draft.id) {
          draft.id = "dish-" + Date.now();
          state.menu.dishes.push(draft);
        } else {
          const i = state.menu.dishes.findIndex((d) => d.id === draft.id);
          if (i >= 0) state.menu.dishes[i] = draft;
        }
        delete draft._sourceLang;
        delete draft._translated;
        persist();
      }
      state.editDish = null;
      state.adminTab = "menu";
      toast(t("dishSaved"));
      renderAdmin();
    } catch (err) {
      toast(err.message || "Save failed");
    }
  }

  async function fillAllMissingTranslations() {
    const langs = enabledLangs();
    const from = primaryLang();
    const prog = $("#fill-progress");
    if (prog) {
      prog.classList.remove("hidden");
      prog.innerHTML = `<div class="progress-bar" style="width:0%"></div><span>${t("translating")}</span>`;
    }
    let i = 0;
    const total = state.menu.dishes.length;
    for (const d of state.menu.dishes) {
      const srcName = (d.name && (d.name[from] || d.name.en)) || "";
      const srcDesc = (d.desc && (d.desc[from] || d.desc.en)) || "";
      try {
        if (PlatoAPI.isApi() && PlatoAPI.getToken() && srcName) {
          const filled = await PlatoAPI.translateDish({
            name: srcName,
            desc: srcDesc,
            fromLang: from,
            toLangs: langs,
          });
          d.name = { ...filled.name, ...d.name };
          d.desc = { ...filled.desc, ...d.desc };
          await PlatoAPI.updateDish(d.id, {
            name: d.name,
            desc: d.desc,
            category: d.category,
            price: d.price,
            spicy: d.spicy,
            popular: d.popular,
            soldOut: d.soldOut,
            photos: d.photos,
            allergens: d.allergens,
            tags: d.tags,
          });
        } else {
          d.name = await PlatoTranslate.fillMissing(d.name || {}, from, langs);
          d.desc = await PlatoTranslate.fillMissing(d.desc || {}, from, langs);
        }
      } catch (e) {
        console.warn(e);
      }
      i++;
      if (prog) {
        prog.innerHTML = `<div class="progress-bar" style="width:${Math.round((i / total) * 100)}%"></div><span>${i}/${total}</span>`;
      }
    }
    if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
      try {
        const full = await PlatoAPI.getMyMenu();
        applyMenuBundle(full.menu);
      } catch {
        /* ignore */
      }
    } else {
      persist();
    }
    toast(t("translated"));
    renderAdmin();
  }

  function renderEditModal() {
    /* unused — edit is inline in admin add tab */
  }

  /* ---------- INIT ---------- */
  function bindGlobal() {
    $all("[data-nav]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        setView(a.dataset.nav);
      });
    });
    window.addEventListener("hashchange", () => {
      parseHash();
      render();
    });
  }

  async function init() {
    try {
      // Capture magic / OAuth token from redirect
      const params = new URLSearchParams(location.search);
      const magicToken = params.get("magic_token");
      if (magicToken) {
        PlatoAPI.setToken(magicToken);
        params.delete("magic_token");
        const qs = params.toString();
        history.replaceState(
          {},
          "",
          location.pathname + (qs ? "?" + qs : "") + (location.hash || "#admin")
        );
      }

      parseHash();
      bindGlobal();

      // Defaults so first paint never crashes
      if (!state.settings) state.settings = { ...DEFAULT_SETTINGS };
      ensureMenu();
      render();

      await initData();
      ensureMenu();
      render();

      console.info(
        "Plato mode:",
        PlatoAPI.isApi() ? "API backend" : "localStorage offline",
        PlatoAPI.getToken() ? "(authenticated)" : "(guest)",
        "dishes:",
        state.menu && state.menu.dishes ? state.menu.dishes.length : 0
      );
    } catch (e) {
      console.error("Init failed", e);
      state.loading = false;
      try {
        ensureMenu();
        render();
      } catch (e2) {
        document.body.innerHTML =
          '<div style="font-family:system-ui;padding:2rem;background:#111;color:#fff;min-height:100vh"><h1>Plato failed to load</h1><pre style="color:#f88">' +
          String(e.message || e) +
          "</pre><button onclick=\"location.reload()\">Reload</button></div>";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

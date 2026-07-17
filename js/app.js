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
    category: "all", // kept for compatibility; guest menu uses activeSection + story mode
    activeSection: "all", // which section chip is highlighted (story scroll)
    menuNavLockUntil: 0, // ignore scroll-spy until this timestamp (ms)
    modal: null,
    photoIndex: 0,
    adminTab: "home",
    help: { hunger: null, spice: null, pref: null },
    menu: null,
    settings: { ...DEFAULT_SETTINGS },
    account: null,
    editDish: null,
    translateProgress: null,
    /** Live multi-step job (import + translate). Updated without full re-render. */
    jobProgress: null,
    stats: { scans: 0, nonEn: 0, topDish: null },
    loading: true,
    loadError: null,
    restaurants: [],
    scanDraft: null,
    authReturnTo: "admin",
    bulkRows: [
      { name: "", description: "", price: "", category: "tacos" },
      { name: "", description: "", price: "", category: "tacos" },
      { name: "", description: "", price: "", category: "tacos" },
      { name: "", description: "", price: "", category: "tacos" },
      { name: "", description: "", price: "", category: "tacos" },
    ],
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

  /**
   * Modern confirm sheet (not window.confirm).
   * options: { title, body, confirmLabel, cancelLabel, danger }
   */
  function confirmAction(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      const root = $("#modal-root");
      if (!root) {
        resolve(window.confirm(opts.body || opts.title || "OK?"));
        return;
      }
      root.classList.add("open");
      root.innerHTML = `
        <div class="modal-sheet confirm-sheet" role="dialog" aria-modal="true">
          <div class="modal-body confirm-body">
            <div class="confirm-icon ${opts.danger ? "danger" : ""}">${opts.danger ? "⚠" : "?"}</div>
            <h2 class="confirm-title">${escapeHtml(opts.title || t("confirmAction") || "Confirm")}</h2>
            <p class="confirm-text">${escapeHtml(opts.body || "")}</p>
            <div class="confirm-actions">
              <button type="button" class="btn btn-ghost" id="confirm-cancel">${escapeHtml(opts.cancelLabel || t("cancel") || "Cancel")}</button>
              <button type="button" class="btn ${opts.danger ? "btn-danger" : "btn-primary"}" id="confirm-ok">${escapeHtml(opts.confirmLabel || t("confirmAction") || "Confirm")}</button>
            </div>
          </div>
        </div>
      `;
      const finish = (val) => {
        root.classList.remove("open");
        root.innerHTML = "";
        resolve(val);
      };
      $("#confirm-cancel").onclick = () => finish(false);
      $("#confirm-ok").onclick = () => finish(true);
      root.onclick = (e) => {
        if (e.target === root) finish(false);
      };
    });
  }

  function startJobProgress({ title, dishNames, label }) {
    const names = (dishNames || []).map((n) => String(n || "").trim()).filter(Boolean);
    state.jobProgress = {
      active: true,
      title: title || "Working…",
      phase: "saving",
      current: 0,
      total: names.length || 1,
      dishName: "",
      label: label || "Saving dishes…",
      pct: 4,
      items: names.map((name) => ({ name, status: "pending" })),
    };
    renderJobOverlay();
  }

  function updateJobProgress(patch) {
    if (!state.jobProgress) return;
    state.jobProgress = { ...state.jobProgress, ...patch };
    renderJobOverlay();
  }

  function setJobItemStatus(index, status) {
    if (!state.jobProgress || !state.jobProgress.items) return;
    const items = state.jobProgress.items.map((it, i) =>
      i === index ? { ...it, status } : it
    );
    updateJobProgress({ items });
  }

  function endJobProgress() {
    state.jobProgress = null;
    renderJobOverlay();
  }

  function renderJobOverlay() {
    let el = $("#job-progress-root");
    const job = state.jobProgress;
    if (!job || !job.active) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "job-progress-root";
      el.className = "job-progress-root";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    const pct = Math.max(0, Math.min(100, Number(job.pct) || 0));
    const items = job.items || [];
    const showList = items.length > 0 && items.length <= 24;
    el.innerHTML = `
      <div class="job-progress-backdrop"></div>
      <div class="job-progress-card">
        <div class="job-progress-spinner" aria-hidden="true"></div>
        <h3 class="job-progress-title">${escapeHtml(job.title || "Working…")}</h3>
        <p class="job-progress-label">${escapeHtml(job.label || "")}</p>
        ${
          job.dishName
            ? `<p class="job-progress-dish">“${escapeHtml(job.dishName)}”</p>`
            : ""
        }
        <div class="job-progress-bar-track">
          <div class="job-progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="job-progress-meta">
          <span>${job.phase === "translating" ? escapeHtml(String(job.current || 0)) + " / " + escapeHtml(String(job.total || 0)) : escapeHtml(job.phase === "saving" ? "Saving…" : "")}</span>
          <span>${pct}%</span>
        </div>
        ${
          showList
            ? `<ul class="job-progress-list">
                ${items
                  .map((it) => {
                    const icon =
                      it.status === "done"
                        ? "✓"
                        : it.status === "active"
                          ? "…"
                          : it.status === "error"
                            ? "!"
                            : "○";
                    return `<li class="job-item job-item-${escapeHtml(it.status)}">
                      <span class="job-item-icon">${icon}</span>
                      <span class="job-item-name">${escapeHtml(it.name)}</span>
                    </li>`;
                  })
                  .join("")}
              </ul>`
            : items.length > 24
              ? `<p class="job-progress-hint">${items.filter((i) => i.status === "done").length} of ${items.length} dishes</p>`
              : ""
        }
      </div>
    `;
  }

  /**
   * Option 3: save dishes first (no server-side translate), then translate each
   * dish client-side so we can show real progress.
   */
  async function saveDishesWithTranslateProgress(dishes, { translate, fromLang, sections }) {
    const from = fromLang || primaryLang();
    const langs = enabledLangs();
    const names = dishes.map((d) => d.name);
    startJobProgress({
      title: translate ? "Importing & translating" : "Importing dishes",
      dishNames: names,
      label: "Saving dishes to your menu…",
    });

    try {
      updateJobProgress({ phase: "saving", pct: 8, label: "Saving dishes to your menu…" });

      let created = [];
      let menu = null;

      // Build section hints from payload or first-seen categories on dishes
      let sectionHints = Array.isArray(sections) ? sections.slice() : [];
      if (!sectionHints.length) {
        const seen = new Map();
        dishes.forEach((d) => {
          const id = d.category || "menu";
          if (!seen.has(id)) {
            seen.set(id, {
              id,
              title: d.categoryLabel || d.category || "Menu",
              sortOrder: seen.size,
            });
          }
        });
        sectionHints = [...seen.values()];
      }

      if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
        // Never pass translate:true — we do per-dish translation below for progress
        const res = await PlatoAPI.bulkCreateDishes(dishes, {
          fromLang: from,
          translate: false,
          sections: sectionHints,
        });
        created = res.dishes || [];
        menu = res.menu;
        if (res.menu) applyMenuBundle(res.menu);
      } else {
        // Offline: also ensure categories on local menu
        if (!state.menu.categories) state.menu.categories = [];
        sectionHints.forEach((sec) => {
          if (!state.menu.categories.find((c) => c.id === sec.id)) {
            state.menu.categories.push({
              id: sec.id,
              labels: { en: sec.title, es: sec.title },
            });
          }
        });
        for (const d of dishes) {
          const id = "dish-" + Date.now() + Math.random().toString(36).slice(2, 6);
          const row = {
            id,
            category: d.category || "menu",
            price: d.price || 0,
            spicy: 0,
            popular: false,
            soldOut: false,
            name: { [from]: d.name },
            desc: { [from]: d.description || d.name },
            photos: [],
            photoCount: 0,
          };
          state.menu.dishes.push(row);
          created.push(row);
        }
        persist();
        menu = state.menu;
      }

      updateJobProgress({
        phase: translate ? "translating" : "done",
        pct: translate ? 18 : 100,
        label: translate ? "Starting translations…" : "Done",
        total: created.length,
      });

      if (translate && created.length) {
        for (let i = 0; i < created.length; i++) {
          const d = created[i];
          const nameStr =
            (d.name && (d.name[from] || d.name.en || Object.values(d.name)[0])) ||
            names[i] ||
            "Dish";
          const descStr =
            (d.desc && (d.desc[from] || d.desc.en || Object.values(d.desc)[0])) ||
            nameStr;

          setJobItemStatus(i, "active");
          updateJobProgress({
            phase: "translating",
            current: i + 1,
            total: created.length,
            dishName: nameStr,
            pct: Math.round(18 + (i / created.length) * 80),
            label: `Translating ${i + 1} of ${created.length}`,
          });

          try {
            let filled;
            if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
              filled = await PlatoAPI.translateDish({
                name: nameStr,
                desc: descStr,
                fromLang: from,
                toLangs: langs,
              });
              await PlatoAPI.updateDish(d.id, {
                name: filled.name,
                desc: filled.desc,
                category: d.category,
                price: d.price,
                spicy: d.spicy,
                popular: d.popular,
                soldOut: d.soldOut,
                photos: d.photos || [],
                allergens: d.allergens,
                tags: d.tags,
              });
            } else {
              filled = await PlatoTranslate.translateDishFields({
                name: nameStr,
                desc: descStr,
                fromLang: from,
                toLangs: langs,
              });
              d.name = filled.name;
              d.desc = filled.desc;
              persist();
            }
            setJobItemStatus(i, "done");
          } catch (err) {
            console.warn("translate dish failed", nameStr, err);
            setJobItemStatus(i, "error");
          }

          updateJobProgress({
            pct: Math.round(18 + ((i + 1) / created.length) * 80),
          });
        }

        if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
          try {
            const full = await PlatoAPI.getMyMenu();
            applyMenuBundle(full.menu);
            menu = full.menu;
            if (full.stats) {
              state.stats = {
                scans: full.stats.scans || 0,
                nonEn: full.stats.nonEn || 0,
                topDish: full.stats.topDish,
              };
            }
          } catch {
            /* keep last menu */
          }
        }
      }

      updateJobProgress({
        phase: "done",
        pct: 100,
        label: "Complete",
        dishName: "",
      });
      // brief beat so user sees 100%
      await new Promise((r) => setTimeout(r, 350));
      endJobProgress();
      return { created: created.length, menu, dishes: created };
    } catch (err) {
      endJobProgress();
      throw err;
    }
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
    applyRestaurantTheme();
  }

  function applyRestaurantTheme() {
    if (typeof platoApplyTheme !== "function") return;
    const r = state.menu && state.menu.restaurant;
    if (!r) return;
    const theme = platoGetTheme(r.themeId || r.accent || "sunset-taco");
    // If restaurant has custom accent only, still use theme palette but override accent
    platoApplyTheme(theme);
    if (r.accent && r.accent.startsWith("#") && !r.themeId) {
      document.documentElement.style.setProperty("--accent", r.accent);
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
              if (me.restaurant && me.restaurant.id) {
                PlatoAPI.setRestaurantId(me.restaurant.id);
              }
              if (me.menu) applyMenuBundle(me.menu);
              const full = await PlatoAPI.getMyMenu();
              applyMenuBundle(full.menu);
              if (full.restaurants) state.restaurants = full.restaurants;
              if (full.activeRestaurantId) {
                PlatoAPI.setRestaurantId(full.activeRestaurantId);
              }
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

  function isOwnerAuthed() {
    if (PlatoAPI.isApi()) return !!PlatoAPI.getToken();
    return !!(state.account && state.account.email);
  }

  /** Send unauthenticated owners to full-page login; remember where to return. */
  function requireOwnerAuth(returnTo) {
    if (isOwnerAuthed()) return true;
    state.authReturnTo = returnTo || "admin";
    toast(t("needSignIn") || "Sign in to continue");
    setView("owner");
    return false;
  }

  function isAuthScreen(view) {
    return view === "owner" || view === "register";
  }

  function setView(view) {
    // Owner dashboard requires auth when API is up
    if (view === "admin" && PlatoAPI.isApi() && !PlatoAPI.getToken()) {
      state.authReturnTo = "admin";
      view = "owner";
    }
    // Already signed in → dashboard instead of login / register
    if (isAuthScreen(view) && isOwnerAuthed()) {
      view = state.authReturnTo === "admin" || !state.authReturnTo ? "admin" : state.authReturnTo;
      if (isAuthScreen(view)) view = "admin";
    }
    state.view = view;
    location.hash = view === "home" ? "" : view;
    state.modal = null;
    render();
    window.scrollTo(0, 0);
  }

  function parseHash() {
    const h = (location.hash || "#").replace("#", "").replace(/^\//, "").split("?")[0];
    // Support legacy #owner/register → register
    const normalized =
      h === "owner/register" || h === "owner-register" ? "register" : h;
    if (
      normalized === "menu" ||
      normalized === "admin" ||
      normalized === "owner" ||
      normalized === "register"
    ) {
      if (normalized === "admin" && PlatoAPI.isApi() && !PlatoAPI.getToken()) {
        state.authReturnTo = "admin";
        state.view = "owner";
      } else if (isAuthScreen(normalized) && isOwnerAuthed()) {
        state.view = "admin";
      } else {
        state.view = normalized;
      }
    } else {
      state.view = "home";
    }
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
      const map = {
        home: "#view-home",
        menu: "#view-menu",
        owner: "#view-owner",
        register: "#view-owner",
        admin: "#view-admin",
      };
      const el = $(map[state.view] || map.home);
      if (el) el.classList.add("active");

      if (state.loading && !state.menu && !isAuthScreen(state.view)) {
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
      if (state.view === "owner") renderOwnerLogin();
      if (state.view === "register") renderOwnerRegister();
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
      const nav = a.dataset.nav;
      const active =
        nav === state.view ||
        (nav === "owner" &&
          (state.view === "owner" ||
            state.view === "register" ||
            state.view === "admin"));
      a.classList.toggle("active", active);
    });
    const brandLabel = $(".brand-label");
    if (brandLabel) brandLabel.textContent = t("navHome") || "Plato";
    const navMenu = $('[data-nav="menu"]');
    if (navMenu) navMenu.textContent = t("navMenu") || "Demo menu";
    const navOwner = $('[data-nav="owner"]');
    if (navOwner) {
      navOwner.textContent = isOwnerAuthed()
        ? t("navDashboard") || "Dashboard"
        : t("navOwner") || "Owner login";
      navOwner.setAttribute("href", isOwnerAuthed() ? "#admin" : "#owner");
    }

    // Topbar session chip
    const session = $("#owner-session");
    if (session) {
      if (isOwnerAuthed()) {
        const email = (state.account && state.account.email) || "owner";
        const mode = PlatoAPI.isApi()
          ? t("apiConnected") || "API connected"
          : t("offlineMode") || "Offline";
        session.hidden = false;
        session.innerHTML = `
          <span class="session-chip" title="${escapeHtml(mode)}">
            <span class="session-dot"></span>
            <span class="session-email">${escapeHtml(email)}</span>
          </span>
          <button type="button" class="btn btn-ghost btn-sm" id="topbar-sign-out">${escapeHtml(t("signOut") || "Sign out")}</button>
        `;
        const out = $("#topbar-sign-out");
        if (out) out.onclick = () => doSignOut();
      } else {
        session.hidden = true;
        session.innerHTML = "";
      }
    }
  }

  async function doSignOut() {
    PlatoAPI.logout();
    PlatoStorage.clearAccount();
    state.account = null;
    state.restaurants = [];
    if (PlatoAPI.isApi()) {
      try {
        const pub = await PlatoAPI.getPublicMenu("taqueria-el-sol", state.lang);
        applyMenuBundle(pub.menu);
      } catch {
        /* ignore */
      }
    }
    toast(t("signOut"));
    setView("owner");
  }

  async function loadOwnerSessionAfterAuth(data, acc) {
    state.account = {
      email: (data.user && data.user.email) || acc.email,
      restaurantName:
        (data.restaurant && data.restaurant.name) ||
        acc.restaurantName ||
        "",
      password: "",
    };
    if (data.menu) applyMenuBundle(data.menu);
    if (data.restaurant && data.restaurant.id) {
      PlatoAPI.setRestaurantId(data.restaurant.id);
    }
    if (
      data.restaurant &&
      acc.restaurantName &&
      data.restaurant.name !== acc.restaurantName
    ) {
      try {
        const updated = await PlatoAPI.updateRestaurant({ name: acc.restaurantName });
        applyMenuBundle(updated.menu);
        state.account.restaurantName = acc.restaurantName;
      } catch {
        /* optional rename */
      }
    }
    try {
      const full = await PlatoAPI.getMyMenu();
      applyMenuBundle(full.menu);
      if (full.restaurants) state.restaurants = full.restaurants;
      if (full.activeRestaurantId) PlatoAPI.setRestaurantId(full.activeRestaurantId);
      if (full.stats) {
        state.stats = {
          scans: full.stats.scans || 0,
          nonEn: full.stats.nonEn || 0,
          topDish: full.stats.topDish,
        };
      }
    } catch {
      /* menu already applied */
    }
    PlatoStorage.saveAccount({
      email: state.account.email,
      restaurantName: state.account.restaurantName,
    });
  }

  async function handleOwnerAuthSubmit({ email, password, restaurantName, mode }) {
    email = String(email || "").trim();
    password = String(password || "");
    restaurantName = String(restaurantName || "").trim();
    if (!email) {
      toast("Email required");
      return false;
    }
    if (PlatoAPI.isApi()) {
      if (!password || password.length < 6) {
        toast("Password min 6 characters");
        return false;
      }
      let data;
      if (mode === "register") {
        if (!restaurantName) {
          toast((t("restName") || "Restaurant name") + " required");
          return false;
        }
        data = await PlatoAPI.register({
          email,
          password,
          restaurantName,
          name: restaurantName,
        });
      } else {
        // Login only — never auto-create on this screen
        data = await PlatoAPI.login({ email, password });
      }
      await loadOwnerSessionAfterAuth(data, { email, restaurantName });
      toast(
        mode === "register"
          ? t("accountSaved") || "Account created"
          : t("signInBtn") || "Signed in"
      );
      const next = state.authReturnTo || "admin";
      state.authReturnTo = "admin";
      setView(isAuthScreen(next) ? "admin" : next);
      return true;
    }
    // Offline / localStorage mode
    if (mode === "register" && !restaurantName) {
      toast((t("restName") || "Restaurant name") + " required");
      return false;
    }
    state.account = {
      email,
      restaurantName: restaurantName || (state.account && state.account.restaurantName) || "My Restaurant",
      password: "",
    };
    PlatoStorage.saveAccount(state.account);
    if (state.menu && state.menu.restaurant && restaurantName) {
      state.menu.restaurant.name = restaurantName;
      persist();
    }
    toast(t("accountSaved"));
    setView(state.authReturnTo || "admin");
    return true;
  }

  function bindOwnerAuthFooter(root) {
    root.querySelectorAll("[data-go]").forEach((btn) => {
      btn.onclick = () => setView(btn.dataset.go);
    });
  }

  function renderOwnerLogin() {
    const root = $("#view-owner");
    if (!root) return;
    const api = PlatoAPI.isApi();
    const demoEmail = "demo@plato.menu";
    const demoPass = "demo1234";
    root.innerHTML = `
      <div class="owner-login-page">
        <div class="owner-login-card">
          <div class="hero-badge">🌮 ${escapeHtml(t("navAdmin") || "Owner")}</div>
          <h1>${escapeHtml(t("ownerLoginTitle") || "Welcome back")}</h1>
          <p class="owner-login-sub">${escapeHtml(t("ownerLoginSub") || "")}</p>
          <p class="source-note" style="margin-top:0.25rem">
            ${api ? "● " + escapeHtml(t("apiConnected") || "API connected") : "○ " + escapeHtml(t("offlineMode") || "Offline mode")}
            · ${escapeHtml(t("ownerLoginHint") || "")}
          </p>
          ${
            api
              ? `<div class="demo-creds" id="fill-demo">
                  <strong>${escapeHtml(t("ownerDemoCreds") || "Demo")}</strong>
                  <code>${demoEmail}</code> / <code>${demoPass}</code>
                  <span class="demo-tap">Tap to fill</span>
                </div>`
              : ""
          }
          <form id="owner-login-form" class="dish-form owner-login-form">
            <label class="field">
              <span>${escapeHtml(t("ownerEmail") || "Email")}</span>
              <input name="email" type="email" autocomplete="username" required
                placeholder="you@restaurant.com"
                value="${escapeHtml((state.account && state.account.email) || "")}" />
            </label>
            <label class="field">
              <span>${escapeHtml(t("password") || "Password")}</span>
              <input name="password" type="password" autocomplete="current-password"
                placeholder="••••••••" ${api ? "required minlength=\"6\"" : ""} />
            </label>
            <button type="submit" class="btn btn-primary" style="width:100%">
              ${escapeHtml(t("signInBtn") || "Sign in")}
            </button>
            ${
              api
                ? `<button type="button" class="btn btn-ghost" id="owner-magic" style="width:100%;margin-top:0.5rem">Email magic link</button>
                   <a class="btn btn-ghost" href="${PlatoAPI.googleAuthUrl()}" style="width:100%;margin-top:0.5rem;display:block;text-align:center">Continue with Google</a>`
                : ""
            }
          </form>
          <p class="owner-login-switch">
            <button type="button" class="linkish" data-go="register">${escapeHtml(t("ownerNewAccount") || "New restaurant? Create account")}</button>
          </p>
          <p class="owner-login-foot">
            <button type="button" class="linkish" data-go="menu">${escapeHtml(t("ctaGuest") || "See demo guest menu")}</button>
            ·
            <button type="button" class="linkish" data-go="home">${escapeHtml(t("navHome") || "Plato")}</button>
          </p>
        </div>
      </div>
    `;

    const form = $("#owner-login-form");
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await handleOwnerAuthSubmit({
            email: fd.get("email"),
            password: fd.get("password"),
            restaurantName: "",
            mode: "login",
          });
        } catch (err) {
          toast(err.message || "Auth error");
        }
      };
    }
    const fillDemo = $("#fill-demo");
    if (fillDemo) {
      fillDemo.onclick = () => {
        const email = form && form.querySelector('[name="email"]');
        const pass = form && form.querySelector('[name="password"]');
        if (email) email.value = demoEmail;
        if (pass) pass.value = demoPass;
        toast("Demo credentials filled");
      };
    }
    const magic = $("#owner-magic");
    if (magic) {
      magic.onclick = async () => {
        const email = ((form && form.querySelector('[name="email"]')) || {}).value;
        if (!email) {
          toast("Enter email");
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
    bindOwnerAuthFooter(root);
  }

  function renderOwnerRegister() {
    const root = $("#view-owner");
    if (!root) return;
    const api = PlatoAPI.isApi();
    root.innerHTML = `
      <div class="owner-login-page">
        <div class="owner-login-card">
          <div class="hero-badge">🌮 ${escapeHtml(t("registerInstead") || "Create account")}</div>
          <h1>${escapeHtml(t("ownerRegisterTitle") || "Open your restaurant on Plato")}</h1>
          <p class="owner-login-sub">${escapeHtml(t("ownerRegisterSub") || "")}</p>
          <p class="source-note" style="margin-top:0.25rem">
            ${api ? "● " + escapeHtml(t("apiConnected") || "API connected") : "○ " + escapeHtml(t("offlineMode") || "Offline mode")}
            · ${escapeHtml(t("ownerRegisterHint") || "")}
          </p>
          <form id="owner-register-form" class="dish-form owner-login-form">
            <label class="field">
              <span>${escapeHtml(t("restName") || "Restaurant name")}</span>
              <input name="restaurantName" autocomplete="organization" required
                placeholder="Taquería El Sol"
                value="" />
            </label>
            <label class="field">
              <span>${escapeHtml(t("ownerEmail") || "Email")}</span>
              <input name="email" type="email" autocomplete="email" required
                placeholder="you@restaurant.com" value="" />
            </label>
            <label class="field">
              <span>${escapeHtml(t("password") || "Password")}</span>
              <input name="password" type="password" autocomplete="new-password"
                placeholder="Min 6 characters" required minlength="6" />
            </label>
            <label class="field">
              <span>${escapeHtml(t("passwordConfirm") || "Confirm password")}</span>
              <input name="passwordConfirm" type="password" autocomplete="new-password"
                placeholder="••••••••" required minlength="6" />
            </label>
            <button type="submit" class="btn btn-primary" style="width:100%">
              ${escapeHtml(t("createAccountBtn") || "Create account")}
            </button>
          </form>
          <p class="owner-login-switch">
            <button type="button" class="linkish" data-go="owner">${escapeHtml(t("ownerHaveAccount") || "Already have an account? Sign in")}</button>
          </p>
          <p class="owner-login-foot">
            <button type="button" class="linkish" data-go="home">${escapeHtml(t("navHome") || "Plato")}</button>
          </p>
        </div>
      </div>
    `;

    const form = $("#owner-register-form");
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const password = String(fd.get("password") || "");
        const confirm = String(fd.get("passwordConfirm") || "");
        if (password !== confirm) {
          toast(t("passwordMismatch") || "Passwords don’t match");
          return;
        }
        try {
          await handleOwnerAuthSubmit({
            email: fd.get("email"),
            password,
            restaurantName: fd.get("restaurantName"),
            mode: "register",
          });
        } catch (err) {
          toast(err.message || "Could not create account");
        }
      };
    }
    bindOwnerAuthFooter(root);
  }

  function renderHome() {
    const root = $("#view-home");
    const ownerCta = isOwnerAuthed()
      ? `<button class="btn btn-ghost" data-go="admin">${escapeHtml(t("ctaOwnerDashboard") || "Open dashboard")}</button>`
      : `<button class="btn btn-ghost" data-go="owner">${escapeHtml(t("ctaOwner") || "Owner sign in")}</button>`;
    const nLangs = enabledLangs().length;
    root.innerHTML = `
      <div class="landing">
        <section class="hero">
          <div class="hero-badge">🌮 Plato · live multilingual menus</div>
          <h1 id="hero-title"></h1>
          <p>${escapeHtml(t("landingSub"))}</p>
          <div class="cta-row">
            <button class="btn btn-primary" data-go="menu">${escapeHtml(t("ctaGuest") || "See demo guest menu")}</button>
            ${ownerCta}
          </div>
          <div class="trust-strip" aria-label="Highlights">
            <span><strong>${nLangs}</strong> languages</span>
            <span><strong>QR</strong> ready same day</span>
            <span><strong>AI</strong> menu scan</span>
          </div>
          <div class="phone-mock" aria-hidden="true">
            <img src="https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&q=80" alt="" loading="lazy" />
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

  /** Categories that actually have dishes, in menu order (story scroll). */
  function categoriesWithDishes(menu) {
    const dishes = menu.dishes || [];
    const used = new Set(dishes.map((d) => d.category).filter(Boolean));
    const cats = (menu.categories || []).filter((c) => used.has(c.id));
    // Orphan dishes whose category isn't in categories table
    dishes.forEach((d) => {
      if (d.category && !cats.find((c) => c.id === d.category)) {
        cats.push({
          id: d.category,
          labels: { en: d.category, es: d.category },
        });
      }
    });
    return cats;
  }

  /** Always story-scroll: all sections in order (never collapse to one section on spy). */
  function renderSectionedDishList(menu) {
    const allDishes = menu.dishes || [];
    const cats = categoriesWithDishes(menu);
    if (!cats.length) {
      return `<div class="dish-list">${allDishes.map((d) => dishCardHtml(d)).join("")}</div>`;
    }
    return `
      <div class="dish-list dish-list-sections">
        ${cats
          .map((c) => {
            const list = allDishes.filter((d) => d.category === c.id);
            if (!list.length) return "";
            return `
            <section class="menu-section" id="section-${escapeHtml(c.id)}" data-section="${escapeHtml(c.id)}">
              <h2 class="menu-section-title">${escapeHtml(catLabel(c))}</h2>
              ${list.map((d) => dishCardHtml(d)).join("")}
            </section>`;
          })
          .join("")}
      </div>`;
  }

  function lockMenuNav(ms) {
    state.menuNavLockUntil = Date.now() + (ms || 700);
  }

  function isMenuNavLocked() {
    return Date.now() < (state.menuNavLockUntil || 0);
  }

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  /** Keep the active chip visible in the horizontal sticky bar. */
  function scrollActiveChipIntoView(nav, catId) {
    if (!nav) return;
    const pill = nav.querySelector(`.cat-pill[data-cat="${cssEscape(catId)}"]`);
    if (!pill) return;
    const navRect = nav.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const pad = 24;
    // Only scroll horizontally if pill is clipped
    if (pillRect.left < navRect.left + pad) {
      nav.scrollBy({
        left: pillRect.left - navRect.left - pad,
        behavior: "smooth",
      });
    } else if (pillRect.right > navRect.right - pad) {
      nav.scrollBy({
        left: pillRect.right - navRect.right + pad,
        behavior: "smooth",
      });
    } else {
      // Prefer center when jumping far
      const delta =
        pillRect.left +
        pillRect.width / 2 -
        (navRect.left + navRect.width / 2);
      if (Math.abs(delta) > 8) {
        nav.scrollBy({ left: delta, behavior: "smooth" });
      }
    }
  }

  function setMenuSectionActive(root, id, opts) {
    const options = opts || {};
    const scrollChip = options.scrollChip !== false;
    const forceScrollChip = !!options.forceScrollChip;
    const pills = root.querySelectorAll(".cat-pill[data-cat]");
    const highlight = id || "all";
    const changed = state.activeSection !== highlight;
    state.activeSection = highlight;
    // Do NOT set state.category to a section id — that used to collapse the list on re-render
    pills.forEach((p) => {
      p.classList.toggle("active", p.dataset.cat === highlight);
    });
    // Only auto-scroll the chip bar when section changes (or forced on click)
    // — prevents horizontal jumpiness on every vertical scroll tick
    if (scrollChip && (changed || forceScrollChip)) {
      const nav = root.querySelector(".cats");
      scrollActiveChipIntoView(nav, highlight);
    }
  }

  function jumpToMenuSection(root, catId) {
    lockMenuNav(900);
    if (catId === "all") {
      setMenuSectionActive(root, "all", { forceScrollChip: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el =
      root.querySelector(`#section-${cssEscape(catId)}`) ||
      document.getElementById("section-" + catId);
    setMenuSectionActive(root, catId, { forceScrollChip: true });
    if (el) {
      // Offset handled by scroll-margin-top on .menu-section
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function bindMenuScrollSpy(root) {
    const sections = [...root.querySelectorAll(".menu-section[data-section]")];
    if (!sections.length) return;

    // Prefer the section whose top is nearest below the sticky stack
    const pickSection = () => {
      if (isMenuNavLocked()) return;
      const stickyWrap = root.querySelector(".cats-wrap") || root.querySelector(".cats");
      const topbar = document.querySelector(".topbar");
      const offset =
        (topbar ? topbar.getBoundingClientRect().height : 56) +
        (stickyWrap ? stickyWrap.getBoundingClientRect().height : 48) +
        8;
      let current = sections[0];
      for (const sec of sections) {
        const top = sec.getBoundingClientRect().top;
        if (top - offset <= 1) current = sec;
        else break;
      }
      // Near top of page → "all"
      if (window.scrollY < 48) {
        setMenuSectionActive(root, "all", { scrollChip: true });
        return;
      }
      const id = current && current.getAttribute("data-section");
      if (id) setMenuSectionActive(root, id, { scrollChip: true });
    };

    const onScroll = () => {
      if (root._spyRaf) cancelAnimationFrame(root._spyRaf);
      root._spyRaf = requestAnimationFrame(pickSection);
    };

    if (root._menuScrollHandler) {
      window.removeEventListener("scroll", root._menuScrollHandler, { passive: true });
    }
    root._menuScrollHandler = onScroll;
    window.addEventListener("scroll", onScroll, { passive: true });
    // Initial (no force scroll so we don't yank the bar on first paint)
    pickSection();
  }

  function renderMenu() {
    const menu = ensureMenu();
    const r = menu.restaurant;
    const root = $("#view-menu");
    if (!root) return;
    applyRestaurantTheme();
    const cats = categoriesWithDishes(menu);
    const theme = typeof platoGetTheme === "function" ? platoGetTheme(r.themeId) : null;
    if (!state.activeSection) state.activeSection = "all";

    root.innerHTML = `
      <div class="menu-wrap">
        <header class="resto-header">
          <div class="emoji">${r.emoji || (theme && theme.emoji) || "🍽️"}</div>
          <h1>${escapeHtml(r.name)}</h1>
          <p class="meta">${escapeHtml(loc(r.tagline))} · ${escapeHtml(loc(r.address))}</p>
          <div class="status">${escapeHtml(loc(r.hours))}</div>
          ${theme ? `<div class="vibe-chip">${escapeHtml(theme.emoji)} ${escapeHtml(theme.name)}</div>` : ""}
        </header>
        <div class="cats-wrap">
          <nav class="cats" aria-label="Menu sections">
            <button type="button" class="cat-pill ${state.activeSection === "all" ? "active" : ""}" data-cat="all">${escapeHtml(t("all"))}</button>
            ${cats
              .map(
                (c) =>
                  `<button type="button" class="cat-pill ${state.activeSection === c.id ? "active" : ""}" data-cat="${escapeHtml(c.id)}">${escapeHtml(catLabel(c))}</button>`
              )
              .join("")}
          </nav>
        </div>
        ${renderSectionedDishList(menu)}
        <div class="help-bar">
          <button class="btn btn-primary" id="btn-help">${escapeHtml(t("helpBtn"))}</button>
        </div>
      </div>
    `;

    root.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        jumpToMenuSection(root, btn.dataset.cat);
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
    bindMenuScrollSpy(root);
    // Ensure highlighted chip is in view after paint
    requestAnimationFrame(() => {
      scrollActiveChipIntoView(root.querySelector(".cats"), state.activeSection || "all");
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
  function normalizeAdminTab(tab) {
    const map = {
      setup: "import",
      stats: "home",
      langs: "restaurant",
      account: "profile",
    };
    return map[tab] || tab || "home";
  }

  function publicPreviewUrl() {
    const slug = state.menu && state.menu.restaurant && state.menu.restaurant.slug;
    if (PlatoAPI.isApi() && slug) return PlatoAPI.publicMenuUrl(slug);
    return (location.origin || "") + (location.pathname || "/") + "#menu";
  }

  function ownerChecklist() {
    const r = (state.menu && state.menu.restaurant) || {};
    const dishes = (state.menu && state.menu.dishes) || [];
    const sections = allCategoriesForEditor();
    const hasAuth = isOwnerAuthed();
    const hasName = !!(r.name && String(r.name).trim());
    const hasDishes = dishes.length > 0;
    const hasTheme = !!(r.themeId || r.accent);
    const hasLangs = enabledLangs().length >= 2;
    const hasSections = sections.length >= 1 && hasDishes;
    const hasSlug = !!r.slug;
    return [
      { id: "account", label: "Signed in", done: hasAuth, tab: "profile" },
      { id: "basics", label: "Restaurant basics", done: hasName, tab: "restaurant" },
      { id: "dishes", label: "Menu dishes (" + dishes.length + ")", done: hasDishes, tab: "import" },
      { id: "sections", label: "Sections organized", done: hasSections, tab: "sections" },
      { id: "vibe", label: "Vibe / theme", done: hasTheme, tab: "restaurant" },
      { id: "langs", label: "Languages enabled", done: hasLangs, tab: "restaurant" },
      { id: "live", label: "QR / public link", done: hasSlug && hasDishes, tab: "qr" },
    ];
  }

  function renderAdmin() {
    const root = $("#view-admin");
    if (!root) return;
    ensureMenu();
    state.adminTab = normalizeAdminTab(state.adminTab);
    const top = (state.menu.dishes || []).find((d) => d.id === state.stats.topDish);
    const previewUrl = publicPreviewUrl();

    const authed = isOwnerAuthed();
    const email = (state.account && state.account.email) || "";
    const restName = (state.menu.restaurant && state.menu.restaurant.name) || "";
    const sessionLine = authed
      ? `<div class="admin-session-bar">
          <div>
            <strong>${escapeHtml(restName || t("adminTitle"))}</strong>
            <span class="admin-session-meta">${escapeHtml(t("signedInAs") || "Signed in as")} ${escapeHtml(email || "—")}
              · ${PlatoAPI.isApi() ? escapeHtml(t("apiConnected") || "API connected") : escapeHtml(t("offlineMode") || "Offline")}</span>
          </div>
          <div class="admin-session-actions">
            <a class="btn btn-ghost btn-sm" href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener">${escapeHtml(t("previewGuest") || "Preview")}</a>
            <button type="button" class="btn btn-ghost btn-sm" id="admin-sign-out">${escapeHtml(t("signOut") || "Sign out")}</button>
          </div>
        </div>`
      : `<div class="admin-session-bar warn">
          <div>
            <strong>${escapeHtml(t("needSignIn") || "Sign in to continue")}</strong>
            <span class="admin-session-meta">Scan, save, and multi-device sync need an owner account.</span>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-go="owner">${escapeHtml(t("signInBtn") || "Sign in")}</button>
        </div>`;

    root.innerHTML = `
      <div class="admin-wrap">
        ${sessionLine}
        <h1>${escapeHtml(t("adminTitle"))}</h1>
        <p class="admin-sub">${escapeHtml(t("adminSub"))}</p>

        <div class="admin-tabs-wrap">
          <div class="admin-tabs" role="tablist" aria-label="Owner dashboard">
            ${tabBtn("home", t("adminHome") || "Home")}
            ${tabBtn("menu", t("adminMenu"))}
            ${tabBtn("import", t("adminImport") || "Import")}
            ${tabBtn("sections", t("adminSections") || "Sections")}
            ${tabBtn("add", t("adminAdd"))}
            ${tabBtn("photos", t("adminPhotos"))}
            ${tabBtn("restaurant", t("adminRestaurant") || "Restaurant")}
            ${tabBtn("qr", t("adminLive") || t("adminQr") || "Go live")}
            ${tabBtn("profile", t("adminProfile") || "Profile")}
          </div>
        </div>

        <div class="admin-panel ${state.adminTab === "home" ? "active" : ""}">
          ${renderOwnerHomeHtml(top)}
        </div>

        <div class="admin-panel ${state.adminTab === "menu" ? "active" : ""}">
          <div class="menu-panel-head">
            <div>
              <strong>${(state.menu.dishes || []).length}</strong>
              <span style="color:var(--muted);font-size:0.85rem"> dishes</span>
            </div>
            <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
              <button type="button" class="btn btn-sm btn-ghost" data-atab-jump="sections">${escapeHtml(t("adminSections") || "Sections")}</button>
              <button type="button" class="btn btn-sm btn-ghost" data-atab-jump="add">+ ${escapeHtml(t("addDish") || "Add")}</button>
            </div>
          </div>
          ${
            (state.menu.dishes || []).length
              ? state.menu.dishes
                  .map(
                    (d) => `
            <div class="admin-dish">
              ${d.photos && d.photos[0] ? `<img src="${d.photos[0]}" alt="" />` : `<div class="admin-thumb-ph">🍽️</div>`}
              <div class="info">
                <strong>${escapeHtml(dishName(d))}</strong>
                <span>$${Number(d.price).toFixed(2)} · ${d.soldOut ? t("soldOut") : t("available")} · ${escapeHtml(sectionLabelForDish(d))}</span>
              </div>
              <div class="admin-actions">
                <select class="admin-move-select" data-move-dish="${d.id}" title="${escapeHtml(t("moveDish") || "Move")}">
                  ${categoryOptionsHtml(d.category)}
                </select>
                <button class="btn btn-sm btn-ghost" data-edit="${d.id}" title="${escapeHtml(t("editDish") || "Edit")}">✎</button>
                <button class="btn btn-sm ${d.soldOut ? "btn-good" : "btn-ghost"}" data-toggle-sold="${d.id}">
                  ${escapeHtml(d.soldOut ? t("toggleAvail") : t("toggleSold"))}
                </button>
                <button class="btn btn-sm btn-danger" data-delete-dish="${d.id}" title="${escapeHtml(t("removeDish") || "Remove")}">✕</button>
              </div>
            </div>`
                  )
                  .join("")
              : `<div class="empty-menu-state">
                  <p>${escapeHtml(t("menuEmpty") || "No dishes yet.")}</p>
                  <button type="button" class="btn btn-primary btn-sm" data-atab-jump="import">Import / scan</button>
                </div>`
          }
          ${
            (state.menu.dishes || []).length
              ? `<div class="danger-zone">
                  <h4>${escapeHtml(t("dangerZone") || "Danger zone")}</h4>
                  <p>${escapeHtml(t("clearMenuSub") || "")}</p>
                  <button type="button" class="btn btn-danger" id="clear-menu" style="width:100%">
                    ${escapeHtml(t("clearMenu") || "Clear entire menu")}
                  </button>
                </div>`
              : ""
          }
        </div>

        <div class="admin-panel ${state.adminTab === "import" ? "active" : ""}">
          ${renderImportHtml()}
        </div>

        <div class="admin-panel ${state.adminTab === "sections" ? "active" : ""}">
          ${renderSectionsHtml()}
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

        <div class="admin-panel ${state.adminTab === "restaurant" ? "active" : ""}">
          ${renderRestaurantHtml()}
        </div>

        <div class="admin-panel ${state.adminTab === "qr" ? "active" : ""}">
          ${renderGoLiveHtml()}
        </div>

        <div class="admin-panel ${state.adminTab === "profile" ? "active" : ""}">
          ${renderProfileHtml()}
        </div>
      </div>
    `;

    function tabBtn(id, label) {
      return `<button type="button" role="tab" data-atab="${id}" class="${state.adminTab === id ? "active" : ""}" aria-selected="${state.adminTab === id ? "true" : "false"}">${escapeHtml(label)}</button>`;
    }

    bindAdminEvents(root);
    // Keep the active owner tab visible in the horizontal sticky bar
    requestAnimationFrame(() => scrollAdminTabIntoView(root, state.adminTab));
  }

  function scrollAdminTabIntoView(root, tabId) {
    const nav = (root || document).querySelector(".admin-tabs");
    if (!nav || !tabId) return;
    const pill =
      nav.querySelector(`[data-atab="${cssEscape(tabId)}"]`) ||
      nav.querySelector(".active");
    if (!pill) return;
    const navRect = nav.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    const pad = 20;
    if (pillRect.left < navRect.left + pad) {
      nav.scrollBy({ left: pillRect.left - navRect.left - pad, behavior: "smooth" });
    } else if (pillRect.right > navRect.right - pad) {
      nav.scrollBy({ left: pillRect.right - navRect.right + pad, behavior: "smooth" });
    } else {
      const delta =
        pillRect.left + pillRect.width / 2 - (navRect.left + navRect.width / 2);
      if (Math.abs(delta) > 12) {
        nav.scrollBy({ left: delta, behavior: "smooth" });
      }
    }
  }

  function sectionLabelForDish(d) {
    const cats = state.menu.categories || [];
    const c = cats.find((x) => x.id === d.category);
    return c ? catLabel(c) : d.category || "Menu";
  }

  function allCategoriesForEditor() {
    const menu = ensureMenu();
    const cats = [...(menu.categories || [])];
    const used = new Set(cats.map((c) => c.id));
    (menu.dishes || []).forEach((d) => {
      if (d.category && !used.has(d.category)) {
        used.add(d.category);
        cats.push({
          id: d.category,
          labels: { en: d.category, es: d.category },
          sortOrder: cats.length,
        });
      }
    });
    return cats.sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.id).localeCompare(String(b.id))
    );
  }

  function categoryOptionsHtml(selectedId) {
    return allCategoriesForEditor()
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}" ${c.id === selectedId ? "selected" : ""}>${escapeHtml(catLabel(c))}</option>`
      )
      .join("");
  }

  function renderSectionsHtml() {
    const cats = allCategoriesForEditor();
    const dishes = state.menu.dishes || [];
    return `
      <div class="sections-editor">
        <h3 style="margin-bottom:0.35rem">${escapeHtml(t("sectionsTitle") || "Menu sections")}</h3>
        <p class="source-note">${escapeHtml(t("sectionsSub") || "")}</p>
        <div id="sections-list" class="sections-list">
          ${
            cats.length
              ? cats
                  .map((c, i) => {
                    const count = dishes.filter((d) => d.category === c.id).length;
                    const title = catLabel(c);
                    return `
                  <div class="section-row" data-section-id="${escapeHtml(c.id)}" data-section-index="${i}">
                    <div class="section-row-order">
                      <button type="button" class="btn btn-sm btn-ghost" data-sec-up="${escapeHtml(c.id)}" ${i === 0 ? "disabled" : ""} title="${escapeHtml(t("moveUp") || "Up")}">↑</button>
                      <button type="button" class="btn btn-sm btn-ghost" data-sec-down="${escapeHtml(c.id)}" ${i === cats.length - 1 ? "disabled" : ""} title="${escapeHtml(t("moveDown") || "Down")}">↓</button>
                    </div>
                    <label class="field section-name-field">
                      <span>${escapeHtml(t("sectionName") || "Section name")}</span>
                      <input type="text" data-sec-title="${escapeHtml(c.id)}" value="${escapeHtml(title)}" />
                    </label>
                    <div class="section-row-meta">
                      <span class="section-count">${count} dishes</span>
                      <button type="button" class="btn btn-sm btn-danger" data-sec-delete="${escapeHtml(c.id)}" ${cats.length <= 1 ? "disabled" : ""} title="${escapeHtml(t("deleteSection") || "Remove")}">✕</button>
                    </div>
                  </div>`;
                  })
                  .join("")
              : `<p style="color:var(--muted);margin-bottom:1rem">No sections yet. Import a scan or add a section below.</p>`
          }
        </div>
        <div class="field-row" style="margin-top:0.85rem;align-items:end">
          <label class="field" style="flex:1;margin-bottom:0">
            <span>${escapeHtml(t("addSection") || "Add section")}</span>
            <input type="text" id="new-section-name" placeholder="Desserts" />
          </label>
          <button type="button" class="btn btn-ghost" id="add-section">${escapeHtml(t("addSection") || "Add")}</button>
        </div>
        <button type="button" class="btn btn-primary" id="save-sections" style="width:100%;margin-top:1rem">
          ${escapeHtml(t("saveSections") || "Save sections")}
        </button>
        <button type="button" class="btn btn-ghost" data-go="menu" style="width:100%;margin-top:0.5rem">
          ${escapeHtml(t("backMenu") || "Preview guest menu")}
        </button>
      </div>
    `;
  }

  function collectSectionsFromDom() {
    const rows = $all("[data-section-id]");
    return rows.map((row, i) => {
      const id = row.dataset.sectionId;
      const titleInp = row.querySelector(`[data-sec-title="${id}"]`);
      const title = (titleInp && titleInp.value.trim()) || id;
      return {
        id,
        title,
        labels: { en: title, es: title },
        sortOrder: i,
      };
    });
  }

  function renderOwnerHomeHtml(top) {
    const checklist = ownerChecklist();
    const doneCount = checklist.filter((c) => c.done).length;
    const pct = Math.round((doneCount / checklist.length) * 100);
    const previewUrl = publicPreviewUrl();
    const slug = (state.menu.restaurant && state.menu.restaurant.slug) || "";
    const dishCount = (state.menu.dishes || []).length;
    return `
      <div class="owner-home">
        <div class="home-hero-card">
          <p class="home-kicker">${escapeHtml(t("adminHome") || "Home")}</p>
          <h2 class="home-title">${escapeHtml((state.menu.restaurant && state.menu.restaurant.name) || "Your restaurant")}</h2>
          <p class="home-sub">Setup progress · ${doneCount}/${checklist.length} complete</p>
          <div class="home-progress-track"><div class="home-progress-fill" style="width:${pct}%"></div></div>
        </div>

        <div class="home-checklist">
          ${checklist
            .map(
              (c) => `
            <button type="button" class="home-check-item ${c.done ? "done" : ""}" data-atab-jump="${escapeHtml(c.tab)}">
              <span class="home-check-icon">${c.done ? "✓" : "○"}</span>
              <span>${escapeHtml(c.label)}</span>
              <span class="home-check-go">→</span>
            </button>`
            )
            .join("")}
        </div>

        <div class="home-actions">
          <button type="button" class="btn btn-primary" data-atab-jump="import" style="width:100%">📷 ${escapeHtml(t("adminImport") || "Import / scan menu")}</button>
          <a class="btn btn-ghost" href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener" style="width:100%;margin-top:0.5rem;display:block;text-align:center">${escapeHtml(t("previewGuest") || "Preview guest menu")}</a>
          <button type="button" class="btn btn-ghost" data-atab-jump="qr" style="width:100%;margin-top:0.5rem">${escapeHtml(t("adminLive") || "Go live / QR")}</button>
        </div>

        <div class="stat-grid" style="margin-top:1.25rem">
          <div class="stat"><div class="n">${state.stats.scans || 0}</div><div class="l">${escapeHtml(t("scans"))}</div></div>
          <div class="stat"><div class="n">${state.stats.nonEn || 0}%</div><div class="l">${escapeHtml(t("langEs"))}</div></div>
          <div class="stat"><div class="n" style="font-size:0.95rem;padding-top:0.25rem">${escapeHtml(top ? dishName(top) : "—")}</div><div class="l">${escapeHtml(t("topDish"))}</div></div>
        </div>
        <p style="color:var(--muted);font-size:0.82rem;margin-top:0.85rem;text-align:center">${dishCount} dishes · ${slug ? "/m/" + escapeHtml(slug) : "no public slug yet"}</p>
      </div>
    `;
  }

  function renderImportHtml() {
    const dishCount = (state.menu.dishes || []).length;
    const draft = state.scanDraft;
    const bulk = state.bulkRows || [];
    return `
      <div class="setup-card">
        <h3 style="margin-bottom:0.35rem">${escapeHtml(t("adminImport") || "Import menu")}</h3>
        <p class="source-note" style="margin-bottom:1rem">
          Scan a paper menu or bulk-type dishes. Review sections, then import.
        </p>

        <div class="dish-form" style="margin-top:0">
          <h3 style="margin-bottom:0.5rem">📷 Scan paper menu</h3>
          <p style="color:var(--muted);font-size:0.85rem;margin-bottom:0.65rem">
            Photo the board or menu. AI extracts dishes and sections when <code>XAI_API_KEY</code> is set.
          </p>
          <label class="field">
            <span>Menu photo</span>
            <input type="file" id="scan-photo" accept="image/*" capture="environment" />
          </label>
          <label class="field">
            <span>Or paste menu text</span>
            <textarea id="scan-text" rows="4" placeholder="Carnitas ........ $4.50&#10;Al Pastor ....... $4.50&#10;Horchata ........ $3.00"></textarea>
          </label>
          <button type="button" class="btn btn-primary" id="run-scan" style="width:100%">Extract dishes</button>
          <div id="scan-status" style="margin-top:0.5rem;font-size:0.85rem;color:var(--muted)"></div>
          ${
            draft && draft.dishes && draft.dishes.length
              ? `<div class="scan-results">
                  <p style="margin:0.75rem 0 0.35rem;font-weight:600">${draft.dishes.length} found ${draft.provider ? "· " + escapeHtml(draft.provider) : ""}</p>
                  <p style="color:var(--muted);font-size:0.8rem;margin-bottom:0.5rem">${escapeHtml(draft.notes || "Review, then import.")}</p>
                  ${
                    draft.sections && draft.sections.length
                      ? `<p class="scan-sections-note">${draft.sections.length} sections · ${escapeHtml(
                          draft.sections.map((s) => s.title || s.id).join(" · ")
                        )}</p>`
                      : ""
                  }
                  <div class="bulk-table scan-table">
                    <div class="bulk-head scan-head"><span>Section</span><span>Name</span><span>Price</span><span>Description</span></div>
                    ${draft.dishes
                      .map(
                        (d, i) => `
                      <div class="bulk-row scan-row">
                        <input data-scan-cat-label="${i}" value="${escapeHtml(d.categoryLabel || d.category || "Menu")}" title="Section" />
                        <input type="hidden" data-scan-cat="${i}" value="${escapeHtml(d.category || "menu")}" />
                        <input data-scan-name="${i}" value="${escapeHtml(d.name)}" />
                        <input data-scan-price="${i}" type="number" step="0.25" value="${d.price || ""}" placeholder="$" />
                        <input data-scan-desc="${i}" value="${escapeHtml(d.description || "")}" placeholder="desc" />
                      </div>`
                      )
                      .join("")}
                  </div>
                  <label class="lang-toggle" style="margin:0.65rem 0">
                    <input type="checkbox" id="scan-translate" checked />
                    <span>Auto-translate on import</span>
                  </label>
                  <button type="button" class="btn btn-primary" id="import-scan" style="width:100%">Import all to menu</button>
                </div>`
              : ""
          }
        </div>

        <div class="dish-form" style="margin-top:1rem">
          <h3 style="margin-bottom:0.5rem">⚡ Fast add (5 at once)</h3>
          <p style="color:var(--muted);font-size:0.85rem;margin-bottom:0.65rem">
            Type name + price. Leave blank rows empty.
          </p>
          <div class="bulk-table">
            <div class="bulk-head"><span>Name</span><span>Price</span><span>Description</span></div>
            ${bulk
              .map(
                (row, i) => `
              <div class="bulk-row">
                <input data-bulk-name="${i}" value="${escapeHtml(row.name)}" placeholder="Dish name" />
                <input data-bulk-price="${i}" type="number" step="0.25" value="${escapeHtml(row.price)}" placeholder="0.00" />
                <input data-bulk-desc="${i}" value="${escapeHtml(row.description)}" placeholder="Optional" />
              </div>`
              )
              .join("")}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="bulk-add-row" style="margin:0.5rem 0">+ More rows</button>
          <label class="lang-toggle" style="margin:0.35rem 0 0.65rem">
            <input type="checkbox" id="bulk-translate" checked />
            <span>Translate to all languages when saving</span>
          </label>
          <button type="button" class="btn btn-primary" id="bulk-save" style="width:100%">Save bulk dishes</button>
          <button type="button" class="btn btn-ghost" data-atab-jump="add" style="width:100%;margin-top:0.5rem">Or add one detailed dish</button>
          <p style="color:var(--muted);font-size:0.8rem;margin-top:0.65rem">${dishCount} dishes currently live</p>
        </div>
      </div>
    `;
  }

  function renderRestaurantHtml() {
    const r = state.menu.restaurant || {};
    const themes = typeof PLATO_THEMES !== "undefined" ? PLATO_THEMES : [];
    const currentTheme = r.themeId || "sunset-taco";
    const taglineEn = (r.tagline && (r.tagline.en || r.tagline.es)) || "";
    const hoursEn = (r.hours && (r.hours.en || r.hours.es)) || "";
    return `
      <div class="setup-card">
        <form id="setup-basics" class="dish-form" style="margin-top:0">
          <h3 style="margin-bottom:0.75rem">${escapeHtml(t("adminRestaurant") || "Restaurant")}</h3>
          <label class="field">
            <span>Name guests see</span>
            <input name="name" value="${escapeHtml(r.name || "")}" required placeholder="Taquería El Sol" />
          </label>
          <label class="field">
            <span>Emoji</span>
            <input name="emoji" value="${escapeHtml(r.emoji || "🌮")}" maxlength="4" style="font-size:1.4rem" />
          </label>
          <label class="field">
            <span>Tagline</span>
            <input name="tagline" value="${escapeHtml(taglineEn)}" placeholder="Street tacos · Made fresh" />
          </label>
          <label class="field">
            <span>Hours</span>
            <input name="hours" value="${escapeHtml(hoursEn)}" placeholder="Open · Closes 11pm" />
          </label>
          <button type="submit" class="btn btn-primary" style="width:100%">Save basics</button>
        </form>

        <div class="dish-form" style="margin-top:1rem">
          <h3 style="margin-bottom:0.5rem">Pick a vibe</h3>
          <div class="theme-grid">
            ${themes
              .map(
                (th) => `
              <button type="button" class="theme-card ${currentTheme === th.id ? "selected" : ""}" data-theme="${th.id}"
                style="--preview-a:${th.accent};--preview-b:${th.accent2};--preview-bg:${th.bg}">
                <div class="theme-swatch"></div>
                <div class="theme-meta">
                  <strong>${escapeHtml(th.emoji)} ${escapeHtml(th.name)}</strong>
                  <span>${escapeHtml(th.blurb)}</span>
                </div>
              </button>`
              )
              .join("")}
          </div>
        </div>

        <div class="dish-form" style="margin-top:1rem">
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
      </div>
    `;
  }

  function renderGoLiveHtml() {
    const r = state.menu.restaurant || {};
    const slug = r.slug || "";
    const previewUrl = publicPreviewUrl();
    return `
      <div class="qr-box">
        <h3 style="margin-bottom:0.5rem">${escapeHtml(t("adminLive") || "Go live")}</h3>
        <strong>${escapeHtml(r.name || "Restaurant")}</strong>
        <p style="color:var(--muted);font-size:0.85rem;margin:0.5rem 0 0.75rem">/m/${escapeHtml(slug || "…")}</p>
        ${
          PlatoAPI.isApi() && slug
            ? `<img src="${PlatoAPI.qrPngUrl(slug)}?size=180" width="140" height="140" alt="QR" style="margin:0.5rem auto;display:block;border-radius:8px;background:#fff"/>
               <a class="btn btn-primary" href="${PlatoAPI.qrPrintUrl(slug)}" target="_blank" rel="noopener" style="width:100%;margin-top:0.65rem;display:block;text-align:center">Print QR for tables</a>
               <a class="btn btn-ghost" href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener" style="width:100%;margin-top:0.5rem;display:block;text-align:center">${escapeHtml(t("previewGuest") || "Open public menu")}</a>`
            : `<a class="btn btn-ghost" href="${escapeHtml(previewUrl)}" target="_blank" rel="noopener" style="width:100%;display:block;text-align:center">Open menu preview</a>`
        }
        <button class="btn btn-primary btn-sm" id="copy-link" style="width:100%;margin-top:0.65rem">${escapeHtml(t("copyQr"))}</button>
      </div>
    `;
  }

  function renderRestaurantsManageHtml() {
    const r = state.menu.restaurant || {};
    const restos = state.restaurants || [];
    if (!PlatoAPI.isApi()) return "";
    return `
      <div class="dish-form" style="margin-top:1rem">
        <h3 style="margin-bottom:0.5rem">Restaurants you manage</h3>
        <p style="color:var(--muted);font-size:0.85rem;margin-bottom:0.65rem">
          One account, many spots — switch clients or locations here.
        </p>
        <div class="resto-list">
          ${
            (restos.length ? restos : r.id ? [r] : [])
              .map((x) => {
                const active = x.id === (r.id || PlatoAPI.getRestaurantId());
                return `<div class="resto-row ${active ? "active" : ""}">
                  <button type="button" class="resto-row-main" data-switch-resto="${escapeHtml(x.id)}">
                    <strong>${escapeHtml(x.name || "Restaurant")}</strong>
                    <span>/m/${escapeHtml(x.slug || "")}${active ? " · active" : ""}</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" data-delete-resto="${escapeHtml(x.id)}" data-delete-resto-name="${escapeHtml(x.name || "")}" title="${escapeHtml(t("deleteRestaurant") || "Delete")}" ${restos.length <= 1 ? "disabled" : ""}>✕</button>
                </div>`;
              })
              .join("") || `<p style="color:var(--muted);font-size:0.85rem">No restaurants yet.</p>`
          }
        </div>
        <div class="field-row" style="margin-top:0.75rem">
          <input id="new-resto-name" placeholder="New restaurant name" style="flex:1;background:var(--bg);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:0.65rem;color:var(--text)" />
          <button type="button" class="btn btn-primary btn-sm" id="create-resto">Create</button>
        </div>
        ${
          restos.length <= 1
            ? `<p class="field-hint" style="margin-top:0.5rem;color:var(--muted)">${escapeHtml(t("deleteRestaurantBlocked") || "Create another before deleting your last restaurant.")}</p>`
            : ""
        }
      </div>
    `;
  }

  function renderProfileHtml() {
    return `
      <div>
        ${renderAccountHtml()}
        ${renderRestaurantsManageHtml()}
      </div>
    `;
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
            ${categoryOptionsHtml(draft.category)}
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
    const authed = isOwnerAuthed();
    if (!authed) {
      return `
        <div class="dish-form">
          <h3>${escapeHtml(t("needSignIn") || "Sign in to continue")}</h3>
          <p class="source-note">${escapeHtml(t("ownerLoginSub") || "")}</p>
          <button type="button" class="btn btn-primary" data-go="owner" style="width:100%">
            ${escapeHtml(t("signInBtn") || "Sign in")}
          </button>
        </div>`;
    }
    return `
      <form id="account-form" class="dish-form">
        <h3>${escapeHtml(t("loginTitle"))}</h3>
        <p class="source-note">${escapeHtml(t("loginSub"))}
          · ${api ? escapeHtml(t("apiConnected") || "API connected") : escapeHtml(t("offlineMode") || "offline")}</p>
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
          <input name="password" type="password" value="" placeholder="${escapeHtml(t("password") || "Password")} (optional re-auth)" />
        </label>
        <button type="submit" class="btn btn-primary" style="width:100%">${escapeHtml(t("signIn") || "Sign in")}</button>
        <button type="button" class="btn btn-ghost" id="sign-out" style="width:100%;margin-top:0.5rem">${escapeHtml(t("signOut"))}</button>
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
        state.adminTab = normalizeAdminTab(b.dataset.atab);
        if (state.adminTab === "add" && !state.editDish) state.editDish = emptyDraft();
        if (state.adminTab !== "add") state.editDish = null;
        renderAdmin();
      };
    });
    root.querySelectorAll("[data-atab-jump]").forEach((b) => {
      b.onclick = () => {
        state.adminTab = normalizeAdminTab(b.dataset.atabJump);
        if (state.adminTab === "add" && !state.editDish) state.editDish = emptyDraft();
        renderAdmin();
      };
    });
    root.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => setView(b.dataset.go);
    });
    // Setup: basics form
    const setupForm = $("#setup-basics");
    if (setupForm) {
      setupForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(setupForm);
        const name = String(fd.get("name") || "").trim();
        const emoji = String(fd.get("emoji") || "🍽️").trim();
        const taglineText = String(fd.get("tagline") || "").trim();
        const hoursText = String(fd.get("hours") || "").trim();
        const tagline = { en: taglineText, es: taglineText };
        const hours = { en: hoursText, es: hoursText };
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.updateRestaurant({ name, emoji, tagline, hours });
            applyMenuBundle(res.menu);
          } else {
            state.menu.restaurant.name = name;
            state.menu.restaurant.emoji = emoji;
            state.menu.restaurant.tagline = tagline;
            state.menu.restaurant.hours = hours;
            persist();
          }
          toast("Saved");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Save failed");
        }
      };
    }
    root.querySelectorAll("[data-theme]").forEach((btn) => {
      btn.onclick = async () => {
        const themeId = btn.dataset.theme;
        const theme = platoGetTheme(themeId);
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.updateRestaurant({
              themeId,
              accent: theme.accent,
              emoji: state.menu.restaurant.emoji || theme.emoji,
            });
            applyMenuBundle(res.menu);
          } else {
            state.menu.restaurant.themeId = themeId;
            state.menu.restaurant.accent = theme.accent;
            persist();
            applyRestaurantTheme();
          }
          toast(theme.name + " vibe on");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Theme failed");
        }
      };
    });
    const preview = $("#preview-menu");
    if (preview) {
      preview.onclick = () => {
        applyRestaurantTheme();
        setView("menu");
      };
    }

    // Multi-restaurant switch / create / delete
    root.querySelectorAll("[data-switch-resto]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.switchResto;
        if (!id || id === PlatoAPI.getRestaurantId()) return;
        PlatoAPI.setRestaurantId(id);
        try {
          const full = await PlatoAPI.getMyMenu();
          applyMenuBundle(full.menu);
          if (full.restaurants) state.restaurants = full.restaurants;
          if (full.stats) {
            state.stats = {
              scans: full.stats.scans || 0,
              nonEn: full.stats.nonEn || 0,
              topDish: full.stats.topDish,
            };
          }
          toast("Switched restaurant");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Switch failed");
        }
      };
    });
    root.querySelectorAll("[data-delete-resto]").forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (btn.disabled) {
          toast(t("deleteRestaurantBlocked") || "Create another restaurant first");
          return;
        }
        const id = btn.dataset.deleteResto;
        const name = btn.dataset.deleteRestoName || "this restaurant";
        const ok = await confirmAction({
          title: t("deleteRestaurant") || "Delete restaurant",
          body: `${t("deleteRestaurantConfirm") || "Delete?"} (${name})`,
          confirmLabel: t("deleteRestaurantOk") || "Yes, delete",
          danger: true,
        });
        if (!ok) return;
        try {
          const res = await PlatoAPI.deleteRestaurant(id);
          if (res.activeRestaurantId) PlatoAPI.setRestaurantId(res.activeRestaurantId);
          if (res.restaurants) state.restaurants = res.restaurants;
          if (res.menu) applyMenuBundle(res.menu);
          toast("Restaurant deleted");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Delete failed");
        }
      };
    });
    const createR = $("#create-resto");
    if (createR) {
      createR.onclick = async () => {
        const name = ($("#new-resto-name") && $("#new-resto-name").value.trim()) || "New Restaurant";
        try {
          const res = await PlatoAPI.createRestaurant(name);
          if (res.restaurant) PlatoAPI.setRestaurantId(res.restaurant.id);
          if (res.menu) applyMenuBundle(res.menu);
          if (res.restaurants) state.restaurants = res.restaurants;
          toast("Created " + name);
          renderAdmin();
        } catch (err) {
          toast(err.message || "Create failed");
        }
      };
    }

    // Scan paper menu
    const runScan = $("#run-scan");
    if (runScan) {
      runScan.onclick = async () => {
        const status = $("#scan-status");
        const fileInput = $("#scan-photo");
        const text = ($("#scan-text") && $("#scan-text").value) || "";
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (!file && !text.trim()) {
          toast("Add a photo or paste text");
          return;
        }
        if (!requireOwnerAuth("admin")) return;
        if (status) status.textContent = "Extracting…";
        try {
          const result = file
            ? await PlatoAPI.scanMenuPhoto(file)
            : await PlatoAPI.scanMenuText(text);
          state.scanDraft = result;
          if (status) {
            status.textContent = result.hasAiKey
              ? `Done (${result.provider})`
              : "No XAI_API_KEY — used text/heuristic. Set key for photo AI.";
          }
          toast((result.dishes || []).length + " dishes found");
          renderAdmin();
        } catch (err) {
          if (status) status.textContent = err.message || "Scan failed";
          toast(err.message || "Scan failed");
        }
      };
    }
    const importScan = $("#import-scan");
    if (importScan) {
      importScan.onclick = async () => {
        const dishes = [];
        $all("[data-scan-name]").forEach((inp) => {
          const i = inp.dataset.scanName;
          const name = inp.value.trim();
          if (!name) return;
          const price = parseFloat(($(`[data-scan-price="${i}"]`) || {}).value) || 0;
          const description = (($(`[data-scan-desc="${i}"]`) || {}).value || "").trim();
          const categoryLabel =
            (($(`[data-scan-cat-label="${i}"]`) || {}).value || "").trim() || "Menu";
          // Re-slug from label if owner renamed the section
          const category =
            categoryLabel
              .toLowerCase()
              .replace(/&/g, " and ")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
              .slice(0, 48) || "menu";
          dishes.push({
            name,
            price,
            description,
            category,
            categoryLabel,
          });
        });
        if (!dishes.length) {
          toast("Nothing to import");
          return;
        }
        if (!requireOwnerAuth("admin")) return;
        if (state.jobProgress && state.jobProgress.active) return;
        const translate = ($("#scan-translate") || {}).checked;
        const sections = [];
        const seen = new Set();
        dishes.forEach((d) => {
          if (!seen.has(d.category)) {
            seen.add(d.category);
            sections.push({
              id: d.category,
              title: d.categoryLabel,
              sortOrder: sections.length,
            });
          }
        });
        try {
          const res = await saveDishesWithTranslateProgress(dishes, {
            translate,
            fromLang: primaryLang(),
            sections,
          });
          if (res.menu) applyMenuBundle(res.menu);
          state.scanDraft = null;
          toast(
            translate
              ? `Imported ${res.created} · translated`
              : `Imported ${res.created}`
          );
          state.adminTab = "menu";
          renderAdmin();
        } catch (err) {
          toast(err.message || "Import failed");
        }
      };
    }

    // Bulk fast add
    const bulkAddRow = $("#bulk-add-row");
    if (bulkAddRow) {
      bulkAddRow.onclick = () => {
        collectBulkRowsFromDom();
        state.bulkRows.push({ name: "", description: "", price: "", category: "tacos" });
        state.bulkRows.push({ name: "", description: "", price: "", category: "tacos" });
        renderAdmin();
      };
    }
    const bulkSave = $("#bulk-save");
    if (bulkSave) {
      bulkSave.onclick = async () => {
        collectBulkRowsFromDom();
        const dishes = state.bulkRows
          .filter((r) => r.name && r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            description: (r.description || "").trim(),
            price: parseFloat(r.price) || 0,
            category: r.category || "tacos",
          }));
        if (!dishes.length) {
          toast("Fill at least one name");
          return;
        }
        if (state.jobProgress && state.jobProgress.active) return;
        const translate = ($("#bulk-translate") || {}).checked;
        try {
          const res = await saveDishesWithTranslateProgress(dishes, {
            translate,
            fromLang: primaryLang(),
          });
          if (res.menu) applyMenuBundle(res.menu);
          toast(
            translate
              ? `Saved ${res.created} · translated`
              : `Saved ${res.created}`
          );
          state.bulkRows = [
            { name: "", description: "", price: "", category: "tacos" },
            { name: "", description: "", price: "", category: "tacos" },
            { name: "", description: "", price: "", category: "tacos" },
            { name: "", description: "", price: "", category: "tacos" },
            { name: "", description: "", price: "", category: "tacos" },
          ];
          state.adminTab = "menu";
          renderAdmin();
        } catch (err) {
          toast(err.message || "Bulk save failed");
        }
      };
    }

    function collectBulkRowsFromDom() {
      $all("[data-bulk-name]").forEach((inp) => {
        const i = Number(inp.dataset.bulkName);
        if (!state.bulkRows[i]) state.bulkRows[i] = { name: "", description: "", price: "", category: "tacos" };
        state.bulkRows[i].name = inp.value;
        const p = $(`[data-bulk-price="${i}"]`);
        const d = $(`[data-bulk-desc="${i}"]`);
        if (p) state.bulkRows[i].price = p.value;
        if (d) state.bulkRows[i].description = d.value;
      });
    }
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
    root.querySelectorAll("[data-delete-dish]").forEach((b) => {
      b.onclick = async () => {
        const d = state.menu.dishes.find((x) => x.id === b.dataset.deleteDish);
        if (!d) return;
        const ok = await confirmAction({
          title: t("removeDish") || "Remove dish",
          body: `${t("removeDishConfirm") || "Remove this dish?"} “${dishName(d)}”`,
          confirmLabel: t("removeDish") || "Remove",
          danger: true,
        });
        if (!ok) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.deleteDish(d.id);
            applyMenuBundle(res.menu);
          } else {
            state.menu.dishes = state.menu.dishes.filter((x) => x.id !== d.id);
            persist();
          }
          toast(t("removeDish") || "Removed");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Remove failed");
        }
      };
    });
    // Move dish between sections (menu list dropdown)
    root.querySelectorAll("[data-move-dish]").forEach((sel) => {
      sel.onchange = async () => {
        const dishId = sel.dataset.moveDish;
        const newCat = sel.value;
        const d = state.menu.dishes.find((x) => x.id === dishId);
        if (!d || !newCat || d.category === newCat) return;
        const cat = allCategoriesForEditor().find((c) => c.id === newCat);
        const label = cat ? catLabel(cat) : newCat;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.updateDish(dishId, {
              category: newCat,
              categoryLabel: label,
              name: d.name,
              desc: d.desc,
              price: d.price,
              spicy: d.spicy,
              popular: d.popular,
              soldOut: d.soldOut,
              photos: d.photos,
              allergens: d.allergens,
              tags: d.tags,
            });
            applyMenuBundle(res.menu);
          } else {
            d.category = newCat;
            persist();
          }
          toast(t("moveDish") || "Moved");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Move failed");
        }
      };
    });

    // Sections editor
    root.querySelectorAll("[data-sec-up]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.secUp;
        const list = $("#sections-list");
        const row = list && list.querySelector(`[data-section-id="${id}"]`);
        if (!row || !row.previousElementSibling) return;
        list.insertBefore(row, row.previousElementSibling);
      };
    });
    root.querySelectorAll("[data-sec-down]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.secDown;
        const list = $("#sections-list");
        const row = list && list.querySelector(`[data-section-id="${id}"]`);
        if (!row || !row.nextElementSibling) return;
        list.insertBefore(row.nextElementSibling, row);
      };
    });
    const addSec = $("#add-section");
    if (addSec) {
      addSec.onclick = () => {
        const inp = $("#new-section-name");
        const title = (inp && inp.value.trim()) || "";
        if (!title) {
          toast(t("sectionName") || "Name required");
          return;
        }
        const slug = title
          .toLowerCase()
          .replace(/&/g, " and ")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "section";
        if (!state.menu.categories) state.menu.categories = [];
        if (state.menu.categories.find((c) => c.id === slug)) {
          toast("Section already exists");
          return;
        }
        state.menu.categories.push({
          id: slug,
          labels: { en: title, es: title },
          sortOrder: state.menu.categories.length,
        });
        if (inp) inp.value = "";
        state.adminTab = "sections";
        renderAdmin();
      };
    }
    root.querySelectorAll("[data-sec-delete]").forEach((btn) => {
      btn.onclick = async () => {
        const slug = btn.dataset.secDelete;
        const cats = allCategoriesForEditor();
        if (cats.length <= 1) {
          toast("Keep at least one section");
          return;
        }
        const ok = await confirmAction({
          title: t("deleteSection") || "Remove section",
          body: t("deleteSectionConfirm") || "Dishes will move to another section.",
          confirmLabel: t("deleteSection") || "Remove",
          danger: true,
        });
        if (!ok) return;
        const fallback = cats.find((c) => c.id !== slug);
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.deleteCategory(slug, fallback && fallback.id);
            applyMenuBundle(res.menu);
          } else {
            (state.menu.dishes || []).forEach((d) => {
              if (d.category === slug) d.category = fallback.id;
            });
            state.menu.categories = (state.menu.categories || []).filter((c) => c.id !== slug);
            persist();
          }
          toast(t("deleteSection") || "Removed");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Delete failed");
        }
      };
    });
    const saveSec = $("#save-sections");
    if (saveSec) {
      saveSec.onclick = async () => {
        const categories = collectSectionsFromDom();
        if (!categories.length) {
          toast("Add a section first");
          return;
        }
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.syncCategories(categories);
            applyMenuBundle(res.menu);
          } else {
            state.menu.categories = categories.map((c) => ({
              id: c.id,
              labels: c.labels,
              sortOrder: c.sortOrder,
            }));
            persist();
          }
          toast(t("sectionsSaved") || "Sections saved");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Save failed");
        }
      };
    }

    const clearMenuBtn = $("#clear-menu");
    if (clearMenuBtn) {
      clearMenuBtn.onclick = async () => {
        const count = (state.menu.dishes || []).length;
        if (!count) return;
        const ok = await confirmAction({
          title: t("clearMenu") || "Clear entire menu",
          body: `${t("clearMenuConfirm") || "Clear all dishes?"} (${count} dishes)`,
          confirmLabel: t("clearMenuOk") || "Yes, clear menu",
          danger: true,
        });
        if (!ok) return;
        try {
          if (PlatoAPI.isApi() && PlatoAPI.getToken()) {
            const res = await PlatoAPI.clearMenu();
            applyMenuBundle(res.menu);
          } else {
            state.menu.dishes = [];
            state.menu.pendingPhotos = [];
            persist();
          }
          toast(t("clearMenu") || "Menu cleared");
          renderAdmin();
        } catch (err) {
          toast(err.message || "Clear failed");
        }
      };
    }
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

    // account form (profile when signed in)
    const accForm = $("#account-form");
    if (accForm) {
      accForm.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(accForm);
        const restaurantName = String(fd.get("restaurantName") || "").trim();
        const email = String(fd.get("email") || "").trim();
        const password = String(fd.get("password") || "");
        try {
          if (isOwnerAuthed() && !password) {
            if (PlatoAPI.isApi() && PlatoAPI.getToken() && restaurantName) {
              const updated = await PlatoAPI.updateRestaurant({ name: restaurantName });
              applyMenuBundle(updated.menu);
            } else if (restaurantName && state.menu && state.menu.restaurant) {
              state.menu.restaurant.name = restaurantName;
              persist();
            }
            state.account = {
              ...(state.account || {}),
              email: email || (state.account && state.account.email) || "",
              restaurantName,
            };
            PlatoStorage.saveAccount({
              email: state.account.email,
              restaurantName: state.account.restaurantName,
            });
            toast(t("accountSaved"));
            renderAdmin();
            return;
          }
          await handleOwnerAuthSubmit({
            email,
            password,
            restaurantName,
            mode: "login-only",
          });
          renderAdmin();
        } catch (err) {
          toast(err.message || "Auth error");
        }
      };
    }
    const so = $("#sign-out");
    if (so) so.onclick = () => doSignOut();
    const adminOut = $("#admin-sign-out");
    if (adminOut) adminOut.onclick = () => doSignOut();
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
        const ok = await confirmAction({
          title: t("removeDish") || "Remove dish",
          body: t("removeDishConfirm") || "Remove this dish from the menu?",
          confirmLabel: t("removeDish") || "Remove",
          danger: true,
        });
        if (!ok) return;
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
          toast(t("removeDish") || t("deleteDish"));
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
    const catMeta = allCategoriesForEditor().find((c) => c.id === draft.category);
    const categoryLabel = catMeta ? catLabel(catMeta) : draft.category;

    const payload = {
      id: draft.id || undefined,
      category: draft.category,
      categoryLabel,
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
    const list = state.menu.dishes || [];
    if (!list.length) {
      toast("No dishes");
      return;
    }
    if (state.jobProgress && state.jobProgress.active) return;

    const names = list.map(
      (d) => (d.name && (d.name[from] || d.name.en || Object.values(d.name)[0])) || d.id
    );
    startJobProgress({
      title: "Filling languages",
      dishNames: names,
      label: "Translating missing languages…",
    });
    updateJobProgress({ phase: "translating", total: list.length, pct: 5 });

    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const srcName = (d.name && (d.name[from] || d.name.en)) || "";
      const srcDesc = (d.desc && (d.desc[from] || d.desc.en)) || "";
      setJobItemStatus(i, "active");
      updateJobProgress({
        current: i + 1,
        total: list.length,
        dishName: srcName || names[i],
        pct: Math.round((i / list.length) * 100),
        label: `Translating ${i + 1} of ${list.length}`,
      });
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
        setJobItemStatus(i, "done");
      } catch (e) {
        console.warn(e);
        setJobItemStatus(i, "error");
      }
      updateJobProgress({ pct: Math.round(((i + 1) / list.length) * 100) });
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
    updateJobProgress({ pct: 100, label: "Complete", dishName: "" });
    await new Promise((r) => setTimeout(r, 350));
    endJobProgress();
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
        let target = a.dataset.nav;
        // Owner nav: login page when signed out, dashboard when signed in
        if (target === "owner" && isOwnerAuthed()) target = "admin";
        setView(target);
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
        state.authReturnTo = "admin";
      }

      parseHash();
      bindGlobal();

      // Defaults so first paint never crashes
      if (!state.settings) state.settings = { ...DEFAULT_SETTINGS };
      ensureMenu();
      render();

      await initData();
      ensureMenu();
      // After API detect: gate owner dashboard if not signed in
      if (state.view === "admin" && PlatoAPI.isApi() && !PlatoAPI.getToken()) {
        state.authReturnTo = "admin";
        state.view = "owner";
        location.hash = "owner";
      }
      if (isAuthScreen(state.view) && isOwnerAuthed()) {
        state.view = "admin";
        location.hash = "admin";
      }
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

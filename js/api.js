/**
 * Plato API client — talks to Express backend when available.
 * Falls back to localStorage-only mode if /api/health fails.
 */
window.PlatoAPI = (function () {
  const TOKEN_KEY = "plato_token_v1";
  const MODE_KEY = "plato_mode_v1"; // "api" | "local"
  const RESTO_KEY = "plato_restaurant_id_v1";

  let baseUrl = "";
  let mode = localStorage.getItem(MODE_KEY) || "unknown";
  let token = localStorage.getItem(TOKEN_KEY) || null;
  let restaurantId = localStorage.getItem(RESTO_KEY) || null;

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function getToken() {
    return token;
  }

  function setRestaurantId(id) {
    restaurantId = id || null;
    if (id) localStorage.setItem(RESTO_KEY, id);
    else localStorage.removeItem(RESTO_KEY);
  }

  function getRestaurantId() {
    return restaurantId;
  }

  function isApi() {
    return mode === "api";
  }

  async function request(path, options = {}) {
    const headers = Object.assign(
      { Accept: "application/json" },
      options.headers || {}
    );
    if (token && !headers.Authorization) {
      headers.Authorization = "Bearer " + token;
    }
    if (restaurantId && !headers["X-Restaurant-Id"]) {
      headers["X-Restaurant-Id"] = restaurantId;
    }
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(baseUrl + path, { ...options, headers });
    let data = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function detect() {
    try {
      const res = await fetch(baseUrl + "/api/health", { cache: "no-store" });
      if (res.ok) {
        mode = "api";
        localStorage.setItem(MODE_KEY, "api");
        return true;
      }
    } catch {
      /* offline / static host */
    }
    mode = "local";
    localStorage.setItem(MODE_KEY, "local");
    return false;
  }

  async function register({ email, password, restaurantName, name }) {
    const data = await request("/api/auth/register", {
      method: "POST",
      body: { email, password, restaurantName, name },
    });
    setToken(data.token);
    return data;
  }

  async function login({ email, password }) {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
    return data;
  }

  async function requestMagicLink(email) {
    return request("/api/auth/magic-link", {
      method: "POST",
      body: { email },
    });
  }

  function googleAuthUrl() {
    return baseUrl + "/api/auth/google";
  }

  function publicMenuUrl(slug) {
    return baseUrl + "/m/" + encodeURIComponent(slug);
  }

  function qrPrintUrl(slug) {
    return baseUrl + "/api/public/" + encodeURIComponent(slug) + "/qr-print";
  }

  function qrPngUrl(slug) {
    return baseUrl + "/api/public/" + encodeURIComponent(slug) + "/qr.png";
  }

  async function me() {
    return request("/api/auth/me");
  }

  async function getMyMenu() {
    return request("/api/me/menu");
  }

  async function getPublicMenu(slug, lang) {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : "";
    return request(`/api/public/${encodeURIComponent(slug)}${q}`);
  }

  async function updateRestaurant(patch) {
    return request("/api/me/restaurant", { method: "PATCH", body: patch });
  }

  async function createDish(dish) {
    return request("/api/me/dishes", { method: "POST", body: dish });
  }

  async function bulkCreateDishes(dishes, { fromLang, translate, sections } = {}) {
    return request("/api/me/dishes/bulk", {
      method: "POST",
      body: {
        dishes,
        fromLang,
        translate: !!translate,
        sections: Array.isArray(sections) ? sections : undefined,
      },
    });
  }

  async function scanMenuPhoto(file) {
    const fd = new FormData();
    fd.append("photo", file);
    return request("/api/me/menu/scan", { method: "POST", body: fd });
  }

  async function scanMenuText(text) {
    return request("/api/me/menu/scan", {
      method: "POST",
      body: { text },
    });
  }

  async function listRestaurants() {
    return request("/api/me/restaurants");
  }

  async function createRestaurant(name) {
    return request("/api/me/restaurants", {
      method: "POST",
      body: { name },
    });
  }

  async function deleteRestaurant(restaurantId) {
    return request(`/api/me/restaurants/${encodeURIComponent(restaurantId)}`, {
      method: "DELETE",
    });
  }

  async function clearMenu() {
    return request("/api/me/menu/dishes", {
      method: "DELETE",
    });
  }

  async function syncCategories(categories) {
    return request("/api/me/categories", {
      method: "PUT",
      body: { categories },
    });
  }

  async function deleteCategory(slug, moveTo) {
    const q = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : "";
    return request(`/api/me/categories/${encodeURIComponent(slug)}${q}`, {
      method: "DELETE",
    });
  }

  async function getAnalytics() {
    return request("/api/me/analytics");
  }

  async function listOrders(status) {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    return request("/api/me/orders" + q);
  }

  async function updateOrder(orderId, patch) {
    return request(`/api/me/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: patch,
    });
  }

  async function createPublicOrder(slug, body) {
    return request(`/api/public/${encodeURIComponent(slug)}/orders`, {
      method: "POST",
      body,
    });
  }

  async function createTipCheckout(slug, body) {
    return request(`/api/public/${encodeURIComponent(slug)}/pay-tip`, {
      method: "POST",
      body,
    });
  }

  async function billingStatus() {
    return request("/api/me/billing/status");
  }

  function posExportUrl(format) {
    const q = format ? `?format=${encodeURIComponent(format)}` : "";
    return baseUrl + "/api/me/pos/export" + q;
  }

  async function downloadPosExport(format) {
    const headers = { Accept: format === "csv" ? "text/csv" : "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (restaurantId) headers["X-Restaurant-Id"] = restaurantId;
    const res = await fetch(baseUrl + "/api/me/pos/export" + (format ? `?format=${format}` : ""), {
      headers,
    });
    if (!res.ok) throw new Error("Export failed");
    if (format === "csv") return res.text();
    return res.json();
  }

  async function updateDish(dishId, dish) {
    return request(`/api/me/dishes/${encodeURIComponent(dishId)}`, {
      method: "PUT",
      body: dish,
    });
  }

  async function toggleSoldOut(dishId, soldOut) {
    return request(`/api/me/dishes/${encodeURIComponent(dishId)}/sold-out`, {
      method: "PATCH",
      body: { soldOut },
    });
  }

  async function deleteDish(dishId) {
    return request(`/api/me/dishes/${encodeURIComponent(dishId)}`, {
      method: "DELETE",
    });
  }

  async function approvePhoto(photoId) {
    return request(`/api/me/photos/${encodeURIComponent(photoId)}/approve`, {
      method: "POST",
    });
  }

  async function rejectPhoto(photoId) {
    return request(`/api/me/photos/${encodeURIComponent(photoId)}/reject`, {
      method: "POST",
    });
  }

  async function uploadPhoto(fileOrBlob) {
    const fd = new FormData();
    fd.append("photo", fileOrBlob, "dish.jpg");
    return request("/api/me/upload", { method: "POST", body: fd });
  }

  async function translateDish({ name, desc, fromLang, toLangs }) {
    return request("/api/translate/dish", {
      method: "POST",
      body: { name, desc, fromLang, toLangs },
    });
  }

  async function trackEvent(slug, type, extra = {}) {
    if (!isApi() || !slug) return;
    try {
      await request(`/api/public/${encodeURIComponent(slug)}/events`, {
        method: "POST",
        body: { type, ...extra },
      });
    } catch {
      /* non-blocking */
    }
  }

  function logout() {
    setToken(null);
  }

  return {
    detect,
    isApi,
    getToken,
    setToken,
    getRestaurantId,
    setRestaurantId,
    logout,
    register,
    login,
    requestMagicLink,
    googleAuthUrl,
    publicMenuUrl,
    qrPrintUrl,
    qrPngUrl,
    me,
    getMyMenu,
    getPublicMenu,
    updateRestaurant,
    createDish,
    bulkCreateDishes,
    scanMenuPhoto,
    scanMenuText,
    listRestaurants,
    createRestaurant,
    deleteRestaurant,
    clearMenu,
    syncCategories,
    deleteCategory,
    getAnalytics,
    listOrders,
    updateOrder,
    createPublicOrder,
    createTipCheckout,
    billingStatus,
    posExportUrl,
    downloadPosExport,
    updateDish,
    toggleSoldOut,
    deleteDish,
    approvePhoto,
    rejectPhoto,
    uploadPhoto,
    translateDish,
    trackEvent,
  };
})();

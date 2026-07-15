/** Persist menu + account in localStorage */
window.PlatoStorage = (function () {
  const KEYS = {
    menu: "plato_menu_v2",
    account: "plato_account_v1",
    settings: "plato_settings_v1",
  };

  function loadMenu() {
    try {
      const raw = localStorage.getItem(KEYS.menu);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn(e);
    }
    return null;
  }

  function saveMenu(data) {
    localStorage.setItem(KEYS.menu, JSON.stringify(data));
  }

  function loadAccount() {
    try {
      const raw = localStorage.getItem(KEYS.account);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveAccount(acc) {
    localStorage.setItem(KEYS.account, JSON.stringify(acc));
  }

  function clearAccount() {
    localStorage.removeItem(KEYS.account);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEYS.settings);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      enabledLangs: ["en", "es", "zh", "ko", "ja", "vi", "pt", "fr", "ar"],
      primaryLang: "en",
    };
  }

  function saveSettings(s) {
    localStorage.setItem(KEYS.settings, JSON.stringify(s));
  }

  function resetMenu() {
    localStorage.removeItem(KEYS.menu);
  }

  return {
    loadMenu,
    saveMenu,
    loadAccount,
    saveAccount,
    clearAccount,
    loadSettings,
    saveSettings,
    resetMenu,
  };
})();

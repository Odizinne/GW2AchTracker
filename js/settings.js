const DEFAULT_SETTINGS = {
  accounts: [],
  activeAccount: 0,
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
  hideCompleted: false,
  clearCompletedFavorites: false,
  accentPalette: "orange",
  fetchMode: "account-all",
  autoUpdateInterval: 0,
  theme: "dark",
  viewMode: "list",
  lang: "en",
  fetchLang: "en",
  defaultSection: "nearly-completed",
  notificationVolume: 0.5,
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("gw2_settings") || "{}");
    const s = { ...DEFAULT_SETTINGS, ...stored };

    // Migrate: if fetchLang was not stored, inherit from lang
    if (stored.fetchLang === undefined) {
      s.fetchLang = s.lang;
    }

    // Migrate old fetchAccountOnly boolean to new fetchMode string
    if (stored.fetchAccountOnly !== undefined && stored.fetchMode === undefined) {
      s.fetchMode = stored.fetchAccountOnly ? "account-all" : "all";
      delete s.fetchAccountOnly;
      localStorage.setItem("gw2_settings", JSON.stringify(s));
    }

    if (stored.apiKey && stored.validated && (!stored.accounts || !stored.accounts.length)) {
      s.accounts = [{ name: "Main", apiKey: stored.apiKey }];
      s.activeAccount = 0;
      delete s.apiKey;
      delete s.validated;
      localStorage.setItem("gw2_settings", JSON.stringify(s));
    }
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  localStorage.setItem("gw2_settings", JSON.stringify(s));
}
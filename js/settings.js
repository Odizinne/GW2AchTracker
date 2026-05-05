const DEFAULT_SETTINGS = {
  accounts: [],
  activeAccount: 0,
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
  hideCompleted: false,
  clearCompletedFavorites: false,
  fetchMode: "account-all",
  theme: "dark",
  viewMode: "list",
  lang: "en",
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("gw2_settings") || "{}");
    const s = { ...DEFAULT_SETTINGS, ...stored };

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
const DEFAULT_SETTINGS = {
  accounts: [],
  activeAccount: 0,
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
  hideCompleted: false,
  theme: "dark",
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("gw2_settings") || "{}");
    const s = { ...DEFAULT_SETTINGS, ...stored };
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
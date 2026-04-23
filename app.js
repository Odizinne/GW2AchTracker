document.addEventListener("DOMContentLoaded", () => {
const BASE = "https://api.guildwars2.com/v2";

// ── i18n ─────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    tierNext: "Next tier", tierLast: "Final tier",
    btnSettings: "Settings", btnFetch: "Fetch", btnCancel: "Cancel",
    btnSave: "Save", btnClose: "Close",
    setupTitle: "API Key Required",
    setupDesc: 'Generate a key at <a href="https://account.arena.net/applications" target="_blank">account.arena.net/applications</a>.<br>Enable the <strong>account</strong> and <strong>progression</strong> permissions.',
    setupPlaceholder: "Paste your API key…", setupSave: "Save & Continue",
    colPct: "%", colProg: "Progress", colName: "Achievement", colReward: "Rewards",
    emptyInitial: "Press <strong>Fetch</strong> to load your achievements.",
    emptyNoMatch: "No achievements matched the current filters.",
    loadedCount: n => `Loaded ${n} achievements.`,
    footerLegal: "Legal & Credits",
    settingsTitle: "Settings", settingsApiKey: "API Key",
    settingsMax: "Max results", settingsThreshold: "Min threshold (%)", settingsLang: "Language",
    clearCache: "Clear cache", cacheCleared: "Cache cleared.",
    cacheEntries: n => `${n} entries cached`,
    legalTitle: "Legal & Credits",
    legalPrivacyTitle: "Privacy & Data",
    legalPrivacy1: "All API requests are made directly from your browser to the official Guild Wars 2 API. No data is ever sent to or stored on any third-party server.",
    legalPrivacy2: "Your API key is stored exclusively in your browser's local storage and never leaves your device.",
    legalPrivacy3: "This website is provided as-is, without any warranty of any kind. Use at your own risk.",
    legalCreditsTitle: "Icon Credits",
    legalCredits1: 'Icons made by <a href="https://www.flaticon.com/authors/dinosoftlabs" target="_blank" rel="noopener">DinosoftLabs</a> from <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalCredits2: 'Icons made by <a href="https://www.flaticon.com/authors/freepik" target="_blank" rel="noopener">Freepik</a> from <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalDisclaimerTitle: "Disclaimer",
    legalDisclaimer: "This project is not affiliated with or endorsed by ArenaNet or NCSoft. Guild Wars 2 is a trademark of ArenaNet, LLC.",
  },
  fr: {
    tierNext: "Prochain palier", tierLast: "Palier final",
    btnSettings: "Paramètres", btnFetch: "Actualiser", btnCancel: "Annuler",
    btnSave: "Enregistrer", btnClose: "Fermer",
    setupTitle: "Clé API requise",
    setupDesc: 'Générez une clé sur <a href="https://account.arena.net/applications" target="_blank">account.arena.net/applications</a>.<br>Activez les permissions <strong>account</strong> et <strong>progression</strong>.',
    setupPlaceholder: "Collez votre clé API…", setupSave: "Enregistrer & Continuer",
    colPct: "%", colProg: "Progression", colName: "Succès", colReward: "Récompenses",
    emptyInitial: "Appuyez sur <strong>Actualiser</strong> pour charger vos succès.",
    emptyNoMatch: "Aucun succès ne correspond aux filtres actuels.",
    loadedCount: n => `${n} succès chargés.`,
    footerLegal: "Mentions légales",
    settingsTitle: "Paramètres", settingsApiKey: "Clé API",
    settingsMax: "Résultats max", settingsThreshold: "Seuil min (%)", settingsLang: "Langue",
    clearCache: "Vider le cache", cacheCleared: "Cache vidé.",
    cacheEntries: n => `${n} entrées en cache`,
    legalTitle: "Mentions légales & Crédits",
    legalPrivacyTitle: "Confidentialité & Données",
    legalPrivacy1: "Toutes les requêtes API sont effectuées directement depuis votre navigateur vers l'API officielle de Guild Wars 2. Aucune donnée n'est envoyée ou stockée sur un serveur tiers.",
    legalPrivacy2: "Votre clé API est stockée uniquement dans le stockage local de votre navigateur et ne quitte jamais votre appareil.",
    legalPrivacy3: "Ce site est fourni tel quel, sans aucune garantie. Utilisation à vos risques et périls.",
    legalCreditsTitle: "Crédits des icônes",
    legalCredits1: 'Icônes par <a href="https://www.flaticon.com/authors/dinosoftlabs" target="_blank" rel="noopener">DinosoftLabs</a> depuis <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalCredits2: 'Icônes par <a href="https://www.flaticon.com/authors/freepik" target="_blank" rel="noopener">Freepik</a> depuis <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalDisclaimerTitle: "Avertissement",
    legalDisclaimer: "Ce projet n'est ni affilié ni approuvé par ArenaNet ou NCSoft. Guild Wars 2 est une marque déposée d'ArenaNet, LLC.",
  },
  de: {
    tierNext: "Nächste Stufe", tierLast: "Letzte Stufe",
    btnSettings: "Einstellungen", btnFetch: "Abrufen", btnCancel: "Abbrechen",
    btnSave: "Speichern", btnClose: "Schließen",
    setupTitle: "API-Schlüssel erforderlich",
    setupDesc: 'Erstellen Sie einen Schlüssel auf <a href="https://account.arena.net/applications" target="_blank">account.arena.net/applications</a>.<br>Aktivieren Sie die Berechtigungen <strong>account</strong> und <strong>progression</strong>.',
    setupPlaceholder: "API-Schlüssel einfügen…", setupSave: "Speichern & Fortfahren",
    colPct: "%", colProg: "Fortschritt", colName: "Erfolg", colReward: "Belohnungen",
    emptyInitial: "Klicken Sie auf <strong>Abrufen</strong>, um Ihre Erfolge zu laden.",
    emptyNoMatch: "Keine Erfolge entsprechen den aktuellen Filtern.",
    loadedCount: n => `${n} Erfolge geladen.`,
    footerLegal: "Rechtliches",
    settingsTitle: "Einstellungen", settingsApiKey: "API-Schlüssel",
    settingsMax: "Max. Ergebnisse", settingsThreshold: "Min. Schwelle (%)", settingsLang: "Sprache",
    clearCache: "Cache leeren", cacheCleared: "Cache geleert.",
    cacheEntries: n => `${n} Einträge im Cache`,
    legalTitle: "Rechtliches & Credits",
    legalPrivacyTitle: "Datenschutz & Daten",
    legalPrivacy1: "Alle API-Anfragen werden direkt von Ihrem Browser an die offizielle Guild Wars 2 API gesendet. Es werden keine Daten an Drittserver übertragen oder gespeichert.",
    legalPrivacy2: "Ihr API-Schlüssel wird ausschließlich im lokalen Speicher Ihres Browsers gespeichert und verlässt niemals Ihr Gerät.",
    legalPrivacy3: "Diese Website wird ohne jegliche Gewährleistung bereitgestellt. Nutzung auf eigene Gefahr.",
    legalCreditsTitle: "Icon-Credits",
    legalCredits1: 'Icons von <a href="https://www.flaticon.com/authors/dinosoftlabs" target="_blank" rel="noopener">DinosoftLabs</a> auf <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalCredits2: 'Icons von <a href="https://www.flaticon.com/authors/freepik" target="_blank" rel="noopener">Freepik</a> auf <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalDisclaimerTitle: "Haftungsausschluss",
    legalDisclaimer: "Dieses Projekt ist weder mit ArenaNet oder NCSoft verbunden noch von diesen genehmigt. Guild Wars 2 ist eine Marke von ArenaNet, LLC.",
  },
  es: {
    tierNext: "Siguiente nivel", tierLast: "Nivel final",
    btnSettings: "Ajustes", btnFetch: "Cargar", btnCancel: "Cancelar",
    btnSave: "Guardar", btnClose: "Cerrar",
    setupTitle: "Clave API requerida",
    setupDesc: 'Genera una clave en <a href="https://account.arena.net/applications" target="_blank">account.arena.net/applications</a>.<br>Activa los permisos <strong>account</strong> y <strong>progression</strong>.',
    setupPlaceholder: "Pega tu clave API…", setupSave: "Guardar & Continuar",
    colPct: "%", colProg: "Progreso", colName: "Logro", colReward: "Recompensas",
    emptyInitial: "Pulsa <strong>Cargar</strong> para ver tus logros.",
    emptyNoMatch: "Ningún logro coincide con los filtros actuales.",
    loadedCount: n => `${n} logros cargados.`,
    footerLegal: "Aviso legal",
    settingsTitle: "Ajustes", settingsApiKey: "Clave API",
    settingsMax: "Máx. resultados", settingsThreshold: "Umbral mín. (%)", settingsLang: "Idioma",
    clearCache: "Vaciar caché", cacheCleared: "Caché vaciada.",
    cacheEntries: n => `${n} entradas en caché`,
    legalTitle: "Aviso legal & Créditos",
    legalPrivacyTitle: "Privacidad & Datos",
    legalPrivacy1: "Todas las solicitudes a la API se realizan directamente desde tu navegador a la API oficial de Guild Wars 2. Ningún dato se envía ni almacena en servidores de terceros.",
    legalPrivacy2: "Tu clave API se almacena exclusivamente en el almacenamiento local de tu navegador y nunca abandona tu dispositivo.",
    legalPrivacy3: "Este sitio web se ofrece tal cual, sin garantía de ningún tipo. Úsalo bajo tu propia responsabilidad.",
    legalCreditsTitle: "Créditos de iconos",
    legalCredits1: 'Iconos de <a href="https://www.flaticon.com/authors/dinosoftlabs" target="_blank" rel="noopener">DinosoftLabs</a> en <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalCredits2: 'Iconos de <a href="https://www.flaticon.com/authors/freepik" target="_blank" rel="noopener">Freepik</a> en <a href="https://www.flaticon.com" target="_blank" rel="noopener">Flaticon</a>.',
    legalDisclaimerTitle: "Aviso",
    legalDisclaimer: "Este proyecto no está afiliado ni respaldado por ArenaNet o NCSoft. Guild Wars 2 es una marca registrada de ArenaNet, LLC.",
  },
};

function t(key, ...args) {
  const lang = settings?.language || "en";
  const dict = STRINGS[lang] || STRINGS.en;
  const val = dict[key] ?? STRINGS.en[key] ?? key;
  return typeof val === "function" ? val(...args) : val;
}

function applyI18n() {
  const lang = settings.language || "en";
  document.documentElement.lang = lang;

  const htmlKeys = new Set(["setupDesc", "legalPrivacy1", "legalCredits1", "legalCredits2", "emptyInitial", "setupSave"]);

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const val = t(key);
    if (htmlKeys.has(key)) {
      el.innerHTML = val;
    } else if (el.children.length > 0) {
      // Has child elements (e.g. label wrapping an input) — only update the text node
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          node.textContent = val + " ";
          break;
        }
      }
      // If no text node found yet, prepend one
      if (![...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())) {
        el.prepend(document.createTextNode(val + " "));
      }
    } else {
      el.textContent = val;
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("#tier-toggle option[data-i18n]").forEach(opt => {
    opt.textContent = t(opt.dataset.i18n);
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  apiKey: "", maxResults: 40, thresholdPct: 80,
  useFinalTier: false, language: "en",
};

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("gw2_settings") || "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { localStorage.setItem("gw2_settings", JSON.stringify(s)); }

let settings = loadSettings();

// ── Cache ─────────────────────────────────────────────────────────────────────

function cacheKey(lang) { return `gw2_ach_cache_${lang}`; }
function loadCache(lang = "en") {
  try { const r = localStorage.getItem(cacheKey(lang)); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveCache(c, lang = "en") {
  try { localStorage.setItem(cacheKey(lang), JSON.stringify(c)); }
  catch {
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(keys.slice(keys.length / 2).map(k => [k, c[k]]));
    localStorage.setItem(cacheKey(lang), JSON.stringify(trimmed));
  }
}
function clearCache() {
  ["en","fr","de","es"].forEach(l => localStorage.removeItem(cacheKey(l)));
  localStorage.removeItem("gw2_ach_cache");
}

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch(endpoint, params = {}, apiKey = "") {
  const url = new URL(BASE + endpoint);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  if (apiKey) url.searchParams.set("access_token", apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GW2 API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchInBatches(endpoint, ids, apiKey, batchSize = 150, extraParams = {}) {
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));
  const results = await Promise.all(batches.map(b => apiFetch(endpoint, { ids: b.join(","), ...extraParams }, apiKey)));
  return results.flat();
}

function getCurrentTier(tiers, progress) {
  for (let i = 0; i < tiers.length; i++) {
    if (progress < tiers[i].count) return { idx: i, tier: tiers[i] };
  }
  return { idx: tiers.length - 1, tier: tiers[tiers.length - 1] };
}

function formatRewards(rewards, itemNameMap, titleNameMap, points) {
  const parts = [];
  if (points) parts.push(`AP:${points}`);
  for (const r of rewards) {
    if (r.type === "Coins") {
      const g = Math.floor(r.count / 10000);
      const s = Math.floor((r.count % 10000) / 100);
      const c = r.count % 100;
      parts.push([g && `${g}g`, s && `${s}s`, c && `${c}c`].filter(Boolean).join(" "));
    } else if (r.type === "Item") {
      const name = itemNameMap[r.id] || `Item#${r.id}`;
      parts.push(r.count > 1 ? `${r.count}x ${name}` : name);
    } else if (r.type === "Mastery") {
      parts.push(`Mastery(${r.region || "?"})`);
    } else if (r.type === "Title") {
      const name = titleNameMap[r.id];
      parts.push(name ? `[${name}]` : `[Title]`);
    } else {
      parts.push(`[${r.type}]`);
    }
  }
  return parts.join(" | ") || "-";
}

let lastProgressMap = null;
let persistentItemNameMap = {};
let persistentTitleNameMap = {};

async function fetchAchievements(s, onStatus, reuseProgress = false) {
  const { apiKey, thresholdPct, maxResults, useFinalTier, language } = s;
  const lang = language || "en";
  const threshold = thresholdPct / 100;

  let progressMap;
  if (reuseProgress && lastProgressMap) {
    progressMap = lastProgressMap;
  } else {
    onStatus("…");
    const accountData = await apiFetch("/account/achievements", {}, apiKey);
    progressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
    lastProgressMap = progressMap;
  }

  const neededIds = Object.keys(progressMap).map(Number);
  const cache = loadCache(lang);
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const missing = neededIds.filter(id => !cachedIds.has(id));

  if (missing.length > 0) {
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang });
    for (const ach of fresh) cache[ach.id] = ach;
  }

  if (!reuseProgress) {
    const neededSet = new Set(neededIds);
    saveCache(Object.fromEntries(Object.entries(cache).filter(([k]) => neededSet.has(Number(k)))), lang);
  }

  const definitions = neededIds.map(id => cache[id]).filter(Boolean);
  const rows = [];

  for (const ach of definitions) {
    if ((ach.flags || []).includes("IgnoreNearlyComplete")) continue;
    const entry = progressMap[ach.id] || {};
    if (entry.done) continue;
    const tiers = ach.tiers || [];
    if (!tiers.length) continue;
    const progress = entry.current || 0;
    const { idx, tier: currentTier } = getCurrentTier(tiers, progress);
    const targetTier = useFinalTier ? tiers[tiers.length - 1] : currentTier;
    const isLast = idx === tiers.length - 1;
    if (!targetTier.count) continue;
    const ratio = progress / targetTier.count;
    if (ratio < threshold) continue;
    rows.push({
      id: ach.id, name: ach.name, progress,
      required: targetTier.count,
      percent: Math.round(ratio * 1000) / 10,
      rewards: (useFinalTier || isLast) ? (ach.rewards || []) : [],
      points: targetTier.points || 0,
    });
  }

  rows.sort((a, b) => b.percent - a.percent);
  const top = rows.slice(0, maxResults);

  const itemIds = [...new Set(top.flatMap(r => r.rewards.filter(x => x.type === "Item" && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }

  const titleIds = [...new Set(top.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
  }

  for (const row of top) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  return top;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const SVG_EYE     = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

const setupPanel    = document.getElementById("setup-panel");
const statusText    = document.getElementById("status-text");
const resultsBody   = document.getElementById("results-body");
const btnRefresh    = document.getElementById("btn-refresh");
const btnSettings   = document.getElementById("btn-settings");
const cacheInfo     = document.getElementById("cache-info");
const pageSpinner   = document.getElementById("page-spinner");
const tierToggle    = document.getElementById("tier-toggle");

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(overlayId) {
  document.getElementById(overlayId).classList.add("open");
}

function closeModal(overlayId) {
  document.getElementById(overlayId).classList.remove("open");
}

["settings-overlay", "legal-overlay"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target.id === id) closeModal(id);
  });
});

// ── Setup panel ───────────────────────────────────────────────────────────────

function checkSetup() {
  setupPanel.classList.toggle("hidden", !!settings.apiKey);
  btnRefresh.disabled = !settings.apiKey;
}

document.getElementById("btn-setup-save").addEventListener("click", () => {
  const key = document.getElementById("setup-key").value.trim();
  if (!key) return;
  settings.apiKey = key;
  saveSettings(settings);
  checkSetup();
});

// ── Settings modal ────────────────────────────────────────────────────────────

function updateCacheInfo() {
  const count = Object.keys(loadCache(settings.language)).length;
  cacheInfo.textContent = count ? t("cacheEntries", count) : "";
}

btnSettings.addEventListener("click", () => {
  const apikeyInput = document.getElementById("s-apikey");
  apikeyInput.value = settings.apiKey;
  apikeyInput.type = "password";
  document.querySelector('[data-target="s-apikey"]').innerHTML = SVG_EYE;
  document.getElementById("s-maxresults").value = settings.maxResults;
  document.getElementById("s-threshold").value = settings.thresholdPct;
  document.getElementById("s-language").value = settings.language;
  updateCacheInfo();
  openModal("settings-overlay");
});

document.getElementById("btn-settings-close").addEventListener("click", () => closeModal("settings-overlay"));
document.getElementById("btn-settings-cancel").addEventListener("click", () => closeModal("settings-overlay"));

document.getElementById("btn-settings-save").addEventListener("click", () => {
  const key = document.getElementById("s-apikey").value.trim();
  if (key) settings.apiKey = key;
  settings.maxResults   = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.language     = document.getElementById("s-language").value;
  saveSettings(settings);
  closeModal("settings-overlay");
  checkSetup();
  updateCacheInfo();
  applyI18n();
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  clearCache();
  updateCacheInfo();
  setStatus(t("cacheCleared"));
});

// ── Legal modal ───────────────────────────────────────────────────────────────

document.getElementById("btn-legal").addEventListener("click", () => openModal("legal-overlay"));
document.getElementById("btn-legal-close").addEventListener("click", () => closeModal("legal-overlay"));
document.getElementById("btn-legal-close-bottom").addEventListener("click", () => closeModal("legal-overlay"));

// ── Fetch ─────────────────────────────────────────────────────────────────────

function setStatus(msg) { statusText.textContent = msg; }

function pctClass(pct) {
  if (pct >= 99) return "pct-high";
  if (pct >= 90) return "pct-med";
  return "pct-low";
}

function barColor(pct, threshold) {
  const clamp = Math.max(0, Math.min(1, (pct - threshold) / (100 - threshold)));
  const hue = Math.round(185 - clamp * 55);
  const sat = Math.round(85 - clamp * 10);
  const lit = Math.round(40 + clamp * 10);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">${t("emptyNoMatch")}</td></tr>`;
    return;
  }
  resultsBody.classList.remove("fade-in");
  void resultsBody.offsetWidth;
  resultsBody.innerHTML = rows.map(row => {
    const wikiHost = settings.language === "en" ? "wiki" : `wiki-${settings.language}`;
    const wikiUrl  = `https://${wikiHost}.guildwars2.com/wiki/${encodeURIComponent(row.name.replace(/ /g, "_"))}`;
    const pct      = row.percent.toFixed(1);
    const fillPct  = Math.min(100, row.percent);
    return `<tr>
      <td class="col-pct ${pctClass(row.percent)}">${pct}%</td>
      <td class="col-prog">
        <div class="prog-wrap">
          <span>${row.progress}/${row.required}</span>
          <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent, settings.thresholdPct)}"></div></div>
        </div>
      </td>
      <td class="col-name"><a class="ach-link" href="${wikiUrl}" target="_blank" rel="noopener">${row.name}</a></td>
      <td class="col-reward" title="${row.rewardStr}">${row.rewardStr
        .replace(/AP:(\d+)/, '<img src="assets/AP.png" class="ap-icon" alt="AP"> $1')
        .replace(/\[([^\]]+)\]/g, '[<em>$1</em>]')}</td>
    </tr>`;
  }).join("");
  resultsBody.classList.add("fade-in");
}

function setFetching(active) {
  btnRefresh.disabled  = active;
  btnSettings.disabled = active;
  tierToggle.disabled  = active;
  pageSpinner.classList.toggle("hidden", !active);
}

btnRefresh.addEventListener("click", async () => {
  if (!settings.apiKey) return;
  setFetching(true);
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg));
    renderRows(rows);
    setStatus(t("loadedCount", rows.length));
    updateCacheInfo();
  } catch (e) {
    setStatus(e.message);
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Error — check your API key and try again.</td></tr>`;
  } finally {
    setFetching(false);
  }
});

// ── Tier toggle ───────────────────────────────────────────────────────────────

tierToggle.value = settings.useFinalTier ? "last" : "next";

tierToggle.addEventListener("change", async () => {
  settings.useFinalTier = tierToggle.value === "last";
  saveSettings(settings);
  if (!lastProgressMap || !settings.apiKey) return;
  setFetching(true);
  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg), true);
    renderRows(rows);
    setStatus(t("loadedCount", rows.length));
  } catch (e) {
    setStatus(e.message);
  } finally {
    setFetching(false);
  }
});

document.querySelectorAll(".number-spin button").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const step = parseFloat(input.step) || 1;
    const newVal = Math.min(max, Math.max(min, (parseFloat(input.value) || 0) + parseFloat(btn.dataset.delta) * step));
    input.value = newVal;
  });
});

// ── Eye toggles ───────────────────────────────────────────────────────────────

document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? SVG_EYE_OFF : SVG_EYE;
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

applyI18n();
checkSetup();
updateCacheInfo();
});
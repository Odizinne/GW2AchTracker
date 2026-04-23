const BASE = "https://api.guildwars2.com/v2";

const DEFAULT_SETTINGS = {
  apiKey: "",
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
  language: "en",
  theme: "dark",
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("gw2_settings") || "{}") };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  localStorage.setItem("gw2_settings", JSON.stringify(s));
}

function cacheKey(lang) {
  return `gw2_ach_cache_${lang}`;
}

function loadCache(lang = "en") {
  try {
    const raw = localStorage.getItem(cacheKey(lang));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(c, lang = "en") {
  const key = cacheKey(lang);
  try { localStorage.setItem(key, JSON.stringify(c)); }
  catch (e) {
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(keys.slice(keys.length / 2).map(k => [k, c[k]]));
    localStorage.setItem(key, JSON.stringify(trimmed));
  }
}

function clearCache() {
  ["en", "fr", "de", "es"].forEach(l => localStorage.removeItem(cacheKey(l)));
  localStorage.removeItem("gw2_ach_cache");
}

//async function apiFetch(endpoint, params = {}, apiKey = "") {
//  const url = new URL(BASE + endpoint);
//  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
//  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
//  const res = await fetch(url.toString(), { headers });
//  if (!res.ok) throw new Error(`GW2 API ${res.status}: ${res.statusText}`);
//  return res.json();
//}

async function apiFetch(endpoint, params = {}, apiKey = "") {
  const url = new URL(BASE + endpoint);

  Object.entries(params).forEach(([k,v]) =>
    url.searchParams.set(k, v)
  );

  if (apiKey) {
    url.searchParams.set("access_token", apiKey);
  }

  const res = await fetch(url);

  if (!res.ok) throw new Error(`GW2 API ${res.status}: ${res.statusText}`);

  return res.json();
}

async function fetchInBatches(endpoint, ids, apiKey, batchSize = 150, extraParams = {}) {
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize)
    batches.push(ids.slice(i, i + batchSize));
  const results = await Promise.all(
    batches.map(b => apiFetch(endpoint, { ids: b.join(","), ...extraParams }, apiKey))
  );
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

async function fetchAchievements(settings, onStatus, reuseProgress = false) {
  const { apiKey, thresholdPct, maxResults, useFinalTier, language } = settings;
  const lang = language || "en";
  const threshold = thresholdPct / 100;

  let progressMap;
  if (reuseProgress && lastProgressMap) {
    progressMap = lastProgressMap;
  } else {
    onStatus("Fetching account achievements…");
    const accountData = await apiFetch("/account/achievements", {}, apiKey);
    progressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
    lastProgressMap = progressMap;
    onStatus(`Account has ${Object.keys(progressMap).length} achievements in progress.`);
  }

  const neededIds = Object.keys(progressMap).map(Number);

  const cache = loadCache(lang);
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const missing = neededIds.filter(id => !cachedIds.has(id));

  if (missing.length > 0) {
    onStatus(`Cache has ${cachedIds.size} definitions — fetching ${missing.length} new…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang });
    for (const ach of fresh) cache[ach.id] = ach;
    onStatus(`Fetched ${fresh.length} definitions, saving cache…`);
  } else if (!reuseProgress) {
    onStatus(`All ${neededIds.length} definitions cached — skipping fetch.`);
  }

  if (!reuseProgress) {
    const neededSet = new Set(neededIds);
    const pruned = Object.fromEntries(
      Object.entries(cache).filter(([k]) => neededSet.has(Number(k)))
    );
    saveCache(pruned, lang);
  }

  const definitions = neededIds.map(id => cache[id]).filter(Boolean);
  if (!reuseProgress) onStatus(`Filtering ${definitions.length} achievements…`);

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
      id: ach.id,
      name: ach.name,
      progress,
      required: targetTier.count,
      percent: Math.round(ratio * 1000) / 10,
      rewards: (useFinalTier || isLast) ? (ach.rewards || []) : [],
      points: targetTier.points || 0,
    });
  }

  rows.sort((a, b) => b.percent - a.percent);
  const top = rows.slice(0, maxResults);

  const itemIds = [...new Set(
    top.flatMap(r => r.rewards.filter(x => x.type === "Item" && x.id).map(x => x.id))
  )];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    if (!reuseProgress) onStatus(`Fetching names for ${newItemIds.length} reward items…`);
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }

  const titleIds = [...new Set(
    top.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id))
  )];
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

// ── UI ────────────────────────────────────────────────────────────────────────

let settings = loadSettings();

const setupPanel    = document.getElementById("setup-panel");
const settingsPanel = document.getElementById("settings-panel");
const statusText    = document.getElementById("status-text");
const resultsBody   = document.getElementById("results-body");
const btnRefresh    = document.getElementById("btn-refresh");
const btnSettings   = document.getElementById("btn-settings");
const cacheInfo     = document.getElementById("cache-info");
const pageSpinner   = document.getElementById("page-spinner");
const tierToggle    = document.getElementById("tier-toggle");
const themeCheckbox = document.getElementById("theme-checkbox");
const themeIcon     = document.getElementById("theme-icon");

function setStatus(msg) {
  statusText.textContent = msg;
}

function updateCacheInfo() {
  const count = Object.keys(loadCache(settings.language)).length;
  cacheInfo.textContent = count ? `${count} cached` : "";
}

function pctClass(pct) {
  if (pct >= 99) return "pct-high";
  if (pct >= 90) return "pct-med";
  return "pct-low";
}

function barColor(pct, threshold) {
  const t = Math.max(0, Math.min(1, (pct - threshold) / (100 - threshold)));
  const hue = Math.round(185 - t * 55);
  const sat = Math.round(85 - t * 10);
  const isLight = document.body.classList.contains("light");
  const lit = isLight ? Math.round(28 + t * 8) : Math.round(40 + t * 10);
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements matched the current filters.</td></tr>`;
    return;
  }
  resultsBody.classList.remove("fade-in");
  void resultsBody.offsetWidth;
  resultsBody.innerHTML = rows.map(row => {
    const wikiHost = settings.language === "en" ? "wiki" : `wiki-${settings.language}`;
    const wikiUrl = `https://${wikiHost}.guildwars2.com/wiki/${encodeURIComponent(row.name.replace(/ /g, "_"))}`;
    const pct = row.percent.toFixed(1);
    const fillPct = Math.min(100, row.percent);
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

// ── Setup panel ───────────────────────────────────────────────────────────────

function checkSetup() {
  if (!settings.apiKey) {
    setupPanel.classList.remove("hidden");
    btnRefresh.disabled = true;
  } else {
    setupPanel.classList.add("hidden");
    btnRefresh.disabled = false;
  }
}

document.getElementById("btn-setup-save").addEventListener("click", () => {
  const key = document.getElementById("setup-key").value.trim();
  if (!key) return;
  settings.apiKey = key;
  saveSettings(settings);
  checkSetup();
});

// ── Settings panel ────────────────────────────────────────────────────────────

btnSettings.addEventListener("click", () => {
  document.getElementById("s-apikey").value = settings.apiKey;
  document.getElementById("s-maxresults").value = settings.maxResults;
  document.getElementById("s-threshold").value = settings.thresholdPct;
  document.getElementById("s-language").value = settings.language;
  settingsPanel.classList.toggle("hidden");
});

document.getElementById("btn-settings-cancel").addEventListener("click", () => {
  settingsPanel.classList.add("hidden");
});

document.getElementById("btn-settings-save").addEventListener("click", () => {
  const key = document.getElementById("s-apikey").value.trim();
  if (key) settings.apiKey = key;
  settings.maxResults = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.language = document.getElementById("s-language").value;
  saveSettings(settings);
  settingsPanel.classList.add("hidden");
  checkSetup();
  updateCacheInfo();
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  clearCache();
  updateCacheInfo();
  setStatus("Cache cleared.");
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

btnRefresh.addEventListener("click", async () => {
  if (!settings.apiKey) return;

  btnRefresh.disabled = true;
  btnSettings.disabled = true;
  pageSpinner.classList.remove("hidden");

  resultsBody.innerHTML =
    `<tr class="empty-row"><td colspan="4">Loading…</td></tr>`;

  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg));

    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
    updateCacheInfo();

  } catch (e) {
    setStatus(e.message);

    resultsBody.innerHTML =
      `<tr class="empty-row">
        <td colspan="4">
          Error — check your API key and try again.
        </td>
      </tr>`;

  } finally {
    btnRefresh.disabled = false;
    btnSettings.disabled = false;
    pageSpinner.classList.add("hidden");
  }
});

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(animate = false) {
  const isLight = settings.theme === "light";
  document.body.classList.toggle("light", isLight);
  themeCheckbox.checked = isLight;
  const newSrc = isLight ? "assets/sun.png" : "assets/moon.png";
  if (animate) {
    themeIcon.classList.add("switching");
    setTimeout(() => { themeIcon.src = newSrc; }, 175);
    themeIcon.addEventListener("animationend", () => themeIcon.classList.remove("switching"), { once: true });
  } else {
    themeIcon.src = newSrc;
  }
}

themeCheckbox.addEventListener("change", () => {
  settings.theme = themeCheckbox.checked ? "light" : "dark";
  saveSettings(settings);
  applyTheme(true);
});

// ── Tier toggle ───────────────────────────────────────────────────────────────

tierToggle.value = settings.useFinalTier ? "last" : "next";

tierToggle.addEventListener("change", async () => {
  settings.useFinalTier = tierToggle.value === "last";
  saveSettings(settings);

  if (!lastProgressMap || !settings.apiKey) return;

  btnRefresh.disabled = true;
  btnSettings.disabled = true;
  tierToggle.disabled = true;
  pageSpinner.classList.remove("hidden");

  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg), true);
    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
  } catch (e) {
    setStatus(e.message);
  } finally {
    btnRefresh.disabled = false;
    btnSettings.disabled = false;
    tierToggle.disabled = false;
    pageSpinner.classList.add("hidden");
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

applyTheme();
checkSetup();
updateCacheInfo();

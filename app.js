const BASE = "https://api.guildwars2.com/v2";

const DEFAULT_SETTINGS = {
  apiKey: "",
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("gw2_settings") || "{}") };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  localStorage.setItem("gw2_settings", JSON.stringify(s));
}

function loadCache() {
  try {
    const raw = localStorage.getItem("gw2_ach_cache");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCache(c) {
  try { localStorage.setItem("gw2_ach_cache", JSON.stringify(c)); }
  catch (e) {
    // localStorage quota hit — trim oldest half and retry
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(keys.slice(keys.length / 2).map(k => [k, c[k]]));
    localStorage.setItem("gw2_ach_cache", JSON.stringify(trimmed));
  }
}

function clearCache() {
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

async function fetchInBatches(endpoint, ids, apiKey, batchSize = 150) {
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize)
    batches.push(ids.slice(i, i + batchSize));
  const results = await Promise.all(
    batches.map(b => apiFetch(endpoint, { ids: b.join(",") }, apiKey))
  );
  return results.flat();
}

function getCurrentTier(tiers, progress) {
  for (let i = 0; i < tiers.length; i++) {
    if (progress < tiers[i].count) return { idx: i, tier: tiers[i] };
  }
  return { idx: tiers.length - 1, tier: tiers[tiers.length - 1] };
}

function formatRewards(rewards, itemNameMap, points) {
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
    } else {
      parts.push(`[${r.type}]`);
    }
  }
  return parts.join("  ") || "-";
}

async function fetchAchievements(settings, onStatus) {
  const { apiKey, thresholdPct, maxResults, useFinalTier } = settings;
  const threshold = thresholdPct / 100;

  onStatus("Fetching account achievements…");
  const accountData = await apiFetch("/account/achievements", {}, apiKey);
  const progressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
  const neededIds = Object.keys(progressMap).map(Number);
  onStatus(`Account has ${neededIds.length} achievements in progress.`);

  const cache = loadCache();
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const missing = neededIds.filter(id => !cachedIds.has(id));

  if (missing.length > 0) {
    onStatus(`Cache has ${cachedIds.size} definitions — fetching ${missing.length} new…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey);
    for (const ach of fresh) cache[ach.id] = ach;
    onStatus(`Fetched ${fresh.length} definitions, saving cache…`);
  } else {
    onStatus(`All ${neededIds.length} definitions cached — skipping fetch.`);
  }

  const neededSet = new Set(neededIds);
  const pruned = Object.fromEntries(
    Object.entries(cache).filter(([k]) => neededSet.has(Number(k)))
  );
  saveCache(pruned);

  const definitions = neededIds.map(id => pruned[id]).filter(Boolean);
  onStatus(`Filtering ${definitions.length} achievements…`);

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
  const itemNameMap = {};
  if (itemIds.length) {
    onStatus(`Fetching names for ${itemIds.length} reward items…`);
    const items = await fetchInBatches("/items", itemIds, apiKey);
    for (const item of items) itemNameMap[item.id] = item.name;
  }

  for (const row of top) {
    row.rewardStr = formatRewards(row.rewards, itemNameMap, row.points);
  }

  return top;
}

// ── UI ────────────────────────────────────────────────────────────────────────

let settings = loadSettings();

const setupPanel    = document.getElementById("setup-panel");
const settingsPanel = document.getElementById("settings-panel");
const statusBar     = document.getElementById("status-bar");
const statusText    = document.getElementById("status-text");
const resultsBody   = document.getElementById("results-body");
const btnRefresh    = document.getElementById("btn-refresh");
const btnSettings   = document.getElementById("btn-settings");
const cacheInfo     = document.getElementById("cache-info");
const fetchSpinner  = document.getElementById("fetch-spinner");
const fetchLabel    = document.getElementById("fetch-label");

function setStatus(msg, isError = false) {
  statusBar.classList.remove("hidden", "error");
  if (isError) statusBar.classList.add("error");
  statusText.textContent = msg;
}

function updateCacheInfo() {
  const count = Object.keys(loadCache()).length;
  cacheInfo.textContent = count ? `${count} cached` : "";
}

function pctClass(pct) {
  if (pct >= 99) return "pct-high";
  if (pct >= 90) return "pct-med";
  return "pct-low";
}

function barClass(pct) {
  if (pct >= 99) return "high";
  if (pct >= 90) return "med";
  return "";
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements matched the current filters.</td></tr>`;
    return;
  }
  resultsBody.innerHTML = rows.map(row => {
    const wikiUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(row.name.replace(/ /g, "_"))}`;
    const pct = row.percent.toFixed(1);
    const fillPct = Math.min(100, row.percent);
    return `<tr>
      <td class="col-pct ${pctClass(row.percent)}">${pct}%</td>
      <td class="col-prog">
        <div class="prog-wrap">
          <span>${row.progress}/${row.required}</span>
          <div class="prog-bar-bg"><div class="prog-bar-fill ${barClass(row.percent)}" style="width:${fillPct}%"></div></div>
        </div>
      </td>
      <td class="col-name"><a class="ach-link" href="${wikiUrl}" target="_blank" rel="noopener">${row.name}</a></td>
      <td class="col-reward" title="${row.rewardStr}">${row.rewardStr}</td>
    </tr>`;
  }).join("");
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
  document.getElementById("s-tier").value = settings.useFinalTier ? "last" : "next";
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
  settings.useFinalTier = document.getElementById("s-tier").value === "last";
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
  fetchSpinner.classList.remove("hidden");
  fetchLabel.textContent = "Loading";

  resultsBody.innerHTML =
    `<tr class="empty-row"><td colspan="4">Loading…</td></tr>`;

  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg));

    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
    updateCacheInfo();

  } catch (e) {
    setStatus(e.message, true);

    resultsBody.innerHTML =
      `<tr class="empty-row">
        <td colspan="4">
          Error — check your API key and try again.
        </td>
      </tr>`;

  } finally {
    btnRefresh.disabled = false;
    btnSettings.disabled = false;

    fetchSpinner.classList.add("hidden");
    fetchLabel.textContent = "Fetch";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────

checkSetup();
updateCacheInfo();
setStatus("Press Fetch to load your achievements.");
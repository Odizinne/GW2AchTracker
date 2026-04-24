document.addEventListener("DOMContentLoaded", () => {
const BASE = "https://api.guildwars2.com/v2";

const DEFAULT_SETTINGS = {
  apiKey: "", maxResults: 40, thresholdPct: 80, useFinalTier: false, validated: false,
};

function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("gw2_settings") || "{}") }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { localStorage.setItem("gw2_settings", JSON.stringify(s)); }

let settings = loadSettings();

// ── Cache ─────────────────────────────────────────────────────────────────────

function loadCache() {
  try { const r = localStorage.getItem("gw2_ach_cache"); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveCache(c) {
  try { localStorage.setItem("gw2_ach_cache", JSON.stringify(c)); }
  catch {
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(keys.slice(keys.length / 2).map(k => [k, c[k]]));
    localStorage.setItem("gw2_ach_cache", JSON.stringify(trimmed));
  }
}
function clearCache() {
  localStorage.removeItem("gw2_ach_cache");
  persistentItemNameMap = {};
  persistentTitleNameMap = {};
  lastProgressMap = null;
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

async function validateApiKey(key) {
  await apiFetch("/account", {}, key);
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
  const { apiKey, thresholdPct, maxResults, useFinalTier } = s;
  const threshold = thresholdPct / 100;

  let progressMap;
  if (reuseProgress && lastProgressMap) {
    progressMap = lastProgressMap;
  } else {
    onStatus("Fetching account progression…");
    const accountData = await apiFetch("/account/achievements", {}, apiKey);
    progressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
    lastProgressMap = progressMap;
  }

  const neededIds = Object.keys(progressMap).map(Number);
  const cache = loadCache();
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const missing = neededIds.filter(id => !cachedIds.has(id));

  if (missing.length > 0) {
    onStatus(`Fetching ${missing.length} achievement definitions…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang: "en" });
    for (const ach of fresh) cache[ach.id] = ach;
  }

  if (!reuseProgress) {
    const neededSet = new Set(neededIds);
    saveCache(Object.fromEntries(Object.entries(cache).filter(([k]) => neededSet.has(Number(k)))));
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
    onStatus(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }

  const titleIds = [...new Set(top.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    onStatus(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
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
const setupKeyError = document.getElementById("setup-key-error");
const settingsKeyError = document.getElementById("settings-key-error");

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

["settings-overlay", "legal-overlay"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target.id === id) closeModal(id);
  });
});

// ── Error helpers ─────────────────────────────────────────────────────────────

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearError(el) {
  el.textContent = "";
  el.classList.add("hidden");
}

// ── Setup panel ───────────────────────────────────────────────────────────────

function checkSetup() {
  const hasValidKey = settings.apiKey && settings.validated;
  setupPanel.classList.toggle("hidden", hasValidKey);
  btnRefresh.disabled = !hasValidKey;
}

document.getElementById("btn-setup-save").addEventListener("click", async () => {
  const key = document.getElementById("setup-key").value.trim();
  if (!key) { showError(setupKeyError, "Please enter an API key."); return; }
  clearError(setupKeyError);
  const btn = document.getElementById("btn-setup-save");
  btn.disabled = true;
  btn.textContent = "Validating…";
  try {
    await validateApiKey(key);
    settings.apiKey = key;
    settings.validated = true;
    saveSettings(settings);
    checkSetup();
    doFetch();
  } catch {
    showError(setupKeyError, "Invalid API key. Make sure account and progression permissions are enabled.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & Continue";
  }
});

// ── Settings modal ────────────────────────────────────────────────────────────

function updateCacheInfo() {
  const count = Object.keys(loadCache()).length;
  cacheInfo.textContent = count ? `${count} entries cached` : "";
}

btnSettings.addEventListener("click", () => {
  const apikeyInput = document.getElementById("s-apikey");
  apikeyInput.value = settings.apiKey;
  apikeyInput.type = "password";
  document.querySelector('[data-target="s-apikey"]').innerHTML = SVG_EYE;
  document.getElementById("s-maxresults").value = settings.maxResults;
  document.getElementById("s-threshold").value = settings.thresholdPct;
  clearError(settingsKeyError);
  updateCacheInfo();
  openModal("settings-overlay");
});

// Changing the key field invalidates the stored validation
document.getElementById("s-apikey").addEventListener("input", () => {
  clearError(settingsKeyError);
});

document.getElementById("btn-settings-close").addEventListener("click", () => closeModal("settings-overlay"));
document.getElementById("btn-settings-cancel").addEventListener("click", () => closeModal("settings-overlay"));

document.getElementById("btn-settings-save").addEventListener("click", async () => {
  const key = document.getElementById("s-apikey").value.trim();
  const saveBtn = document.getElementById("btn-settings-save");
  clearError(settingsKeyError);

  // If the key changed, validate it
  if (key && key !== settings.apiKey) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Validating…";
    try {
      await validateApiKey(key);
      settings.apiKey = key;
      settings.validated = true;
    } catch {
      showError(settingsKeyError, "Invalid API key. Make sure account and progression permissions are enabled.");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
      return;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  } else if (!key && !settings.apiKey) {
    showError(settingsKeyError, "Please enter an API key.");
    return;
  }

  settings.maxResults   = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  saveSettings(settings);
  closeModal("settings-overlay");
  checkSetup();
  updateCacheInfo();
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  clearCache();
  updateCacheInfo();
  updateFetchLabel();
  setStatus("Cache cleared.");
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

function barColor(pct) {
  if (pct < 90) return `hsl(0, 0%, 55%)`;
  const t = Math.max(0, Math.min(1, (pct - 90) / 10));
  const lit = Math.round(50 + t * 20);
  const sat = Math.round(40 + t * 35);
  return `hsl(30, ${sat}%, ${lit}%)`;
}

function renderRows(rows) {
  if (!rows.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements matched the current filters.</td></tr>`;
    return;
  }
  resultsBody.classList.remove("fade-in");
  void resultsBody.offsetWidth;
  resultsBody.innerHTML = rows.map(row => {
    const wikiUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(row.name.replace(/ /g, "_"))}`;
    const pct     = row.percent.toFixed(1);
    const fillPct = Math.min(100, row.percent);
    return `<tr>
      <td class="col-pct ${pctClass(row.percent)}">${pct}%</td>
      <td class="col-prog">
        <div class="prog-wrap">
          <span>${row.progress}/${row.required}</span>
          <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent)}"></div></div>
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
  btnRefresh.disabled  = active || !settings.validated;
  btnSettings.disabled = active;
  tierToggle.disabled  = active;
  pageSpinner.classList.toggle("hidden", !active);
}

async function doFetch() {
  if (!settings.apiKey || !settings.validated) return;
  setFetching(true);
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg));
    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
    updateCacheInfo();
    updateFetchLabel();
  } catch (e) {
    setStatus(e.message);
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Error — check your API key and try again.</td></tr>`;
  } finally {
    setFetching(false);
  }
}

btnRefresh.addEventListener("click", doFetch);

// ── Tier toggle ───────────────────────────────────────────────────────────────

tierToggle.value = settings.useFinalTier ? "last" : "next";

tierToggle.addEventListener("change", async () => {
  settings.useFinalTier = tierToggle.value === "last";
  saveSettings(settings);
  if (!lastProgressMap || !settings.apiKey || !settings.validated) return;
  setFetching(true);
  try {
    const rows = await fetchAchievements(settings, msg => setStatus(msg), true);
    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
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

function updateFetchLabel() {
  const count = Object.keys(loadCache()).length;
  btnRefresh.textContent = count ? "Update" : "Fetch";
}

// ── Scrollbar ─────────────────────────────────────────────────────────────────

const scrollTrack   = document.getElementById("custom-scrollbar");
const scrollThumb   = document.getElementById("custom-scrollbar-thumb");
const scrollTrackEl = document.getElementById("custom-scrollbar-track");
const scrollArrowUp = document.getElementById("scrollbar-arrow-up");
const scrollArrowDn = document.getElementById("scrollbar-arrow-down");

const SCROLL_STEP = 120;
let sbScrollTimer;
let sbDragging = false;
let sbDragStartY, sbDragStartTop;
let sbArrowInterval;

function updateScrollThumb() {
  const scrollTop    = window.scrollY;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  const trackH       = scrollTrackEl.clientHeight;
  const canScroll    = scrollHeight > clientHeight;

  scrollTrack.classList.toggle("active", canScroll);
  scrollArrowUp.disabled = !canScroll || scrollTop <= 0;
  scrollArrowDn.disabled = !canScroll || scrollTop >= scrollHeight - clientHeight;

  if (!canScroll) {
    scrollThumb.style.height = "0px";
    scrollThumb.style.top    = "0px";
    return;
  }

  const thumbH = Math.max(24, (clientHeight / scrollHeight) * trackH);
  const maxTop = trackH - thumbH;
  const top    = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
  scrollThumb.style.height = thumbH + "px";
  scrollThumb.style.top    = top + "px";
}

window.addEventListener("scroll", () => {
  updateScrollThumb();
  scrollTrack.classList.add("scrolling");
  clearTimeout(sbScrollTimer);
  sbScrollTimer = setTimeout(() => scrollTrack.classList.remove("scrolling"), 800);
});

function startArrowScroll(delta) {
  window.scrollBy({ top: delta, behavior: "smooth" });
  sbArrowInterval = setInterval(() => window.scrollBy({ top: delta, behavior: "smooth" }), 150);
}

function stopArrowScroll() { clearInterval(sbArrowInterval); }

scrollArrowUp.addEventListener("mousedown", e => { e.preventDefault(); startArrowScroll(-SCROLL_STEP); });
scrollArrowDn.addEventListener("mousedown", e => { e.preventDefault(); startArrowScroll(SCROLL_STEP); });
document.addEventListener("mouseup", stopArrowScroll);

scrollThumb.addEventListener("mousedown", e => {
  if (!scrollTrack.classList.contains("active")) return;
  sbDragging     = true;
  sbDragStartY   = e.clientY;
  sbDragStartTop = parseFloat(scrollThumb.style.top) || 0;
  e.preventDefault();
});

document.addEventListener("mousemove", e => {
  if (!sbDragging) return;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  const trackH       = scrollTrackEl.clientHeight;
  const thumbH       = parseFloat(scrollThumb.style.height) || 0;
  const maxTop       = trackH - thumbH;
  const newTop       = Math.max(0, Math.min(maxTop, sbDragStartTop + (e.clientY - sbDragStartY)));
  window.scrollTo(0, (newTop / maxTop) * (scrollHeight - clientHeight));
});

document.addEventListener("mousemove", e => { if (!sbDragging) return; });
document.addEventListener("mouseup", () => { sbDragging = false; });

new ResizeObserver(updateScrollThumb).observe(document.body);
window.addEventListener("resize", updateScrollThumb);

updateScrollThumb();

// ── Init ──────────────────────────────────────────────────────────────────────

checkSetup();
updateCacheInfo();
updateFetchLabel();

if (settings.apiKey && settings.validated) doFetch();
});
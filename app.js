document.addEventListener("DOMContentLoaded", () => {
const BASE = "https://api.guildwars2.com/v2";

const SVG_EYE     = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const SVG_TRASH   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  accounts: [],
  activeAccount: 0,
  maxResults: 40,
  thresholdPct: 80,
  useFinalTier: false,
};

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem("gw2_settings") || "{}");
    const s = { ...DEFAULT_SETTINGS, ...stored };
    // Migrate from old single-key format
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

function saveSettings(s) {
  localStorage.setItem("gw2_settings", JSON.stringify(s));
}

let settings = loadSettings();

function activeApiKey() {
  const acc = settings.accounts[settings.activeAccount];
  return acc ? acc.apiKey : "";
}

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
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (apiKey) url.searchParams.set("access_token", apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GW2 API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchInBatches(endpoint, ids, apiKey, batchSize = 150, extraParams = {}) {
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));
  const results = await Promise.all(
    batches.map(b => apiFetch(endpoint, { ids: b.join(","), ...extraParams }, apiKey))
  );
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

async function fetchAchievements(apiKey, s, onStatus, reuseProgress = false) {
  const { thresholdPct, maxResults, useFinalTier } = s;
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

const accountSelect   = document.getElementById("account-select");
const btnRefresh      = document.getElementById("btn-refresh");
const btnSettings     = document.getElementById("btn-settings");
const btnGithub       = document.getElementById("btn-github");
const btnLegal        = document.getElementById("btn-legal");
const resultsBody     = document.getElementById("results-body");
const statusText      = document.getElementById("status-text");
const pageSpinner     = document.getElementById("page-spinner");
const viewSetup       = document.getElementById("view-setup");
const viewNearlyDone  = document.getElementById("view-nearly-completed");
const viewSubtitle    = document.getElementById("view-subtitle");
const cacheInfo       = document.getElementById("cache-info");
const setupError      = document.getElementById("setup-error");
const accountsList    = document.getElementById("accounts-list");
const addAccountForm  = document.getElementById("add-account-form");
const newAccountError = document.getElementById("new-account-error");

// ── View routing ──────────────────────────────────────────────────────────────

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.dataset.view === name);
  });
  if (name === "setup")             viewSetup.classList.add("active-view");
  if (name === "nearly-completed")  viewNearlyDone.classList.add("active-view");
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    if (!settings.accounts.length) return;
    showView(item.dataset.view);
  });
});

// ── Account select ────────────────────────────────────────────────────────────

function rebuildAccountSelect() {
  accountSelect.innerHTML = "";
  if (!settings.accounts.length) {
    const opt = document.createElement("option");
    opt.textContent = "No accounts";
    opt.disabled = true;
    accountSelect.appendChild(opt);
    btnRefresh.disabled = true;
    return;
  }
  settings.accounts.forEach((acc, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = acc.name;
    accountSelect.appendChild(opt);
  });
  accountSelect.value = settings.activeAccount;
  btnRefresh.disabled = false;
}

accountSelect.addEventListener("change", () => {
  settings.activeAccount = parseInt(accountSelect.value);
  lastProgressMap = null;
  saveSettings(settings);
  doFetch();
});

// ── Setup ─────────────────────────────────────────────────────────────────────

function checkSetup() {
  rebuildAccountSelect();
  if (!settings.accounts.length) {
    showView("setup");
  } else {
    showView("nearly-completed");
  }
}

document.getElementById("btn-setup-save").addEventListener("click", async () => {
  const name = document.getElementById("setup-name").value.trim();
  const key  = document.getElementById("setup-key").value.trim();
  if (!name) { showError(setupError, "Please enter a name for this account."); return; }
  if (!key)  { showError(setupError, "Please enter an API key."); return; }
  clearError(setupError);

  const btn = document.getElementById("btn-setup-save");
  btn.disabled = true;
  btn.textContent = "Validating…";
  try {
    await validateApiKey(key);
    settings.accounts.push({ name, apiKey: key });
    settings.activeAccount = settings.accounts.length - 1;
    saveSettings(settings);
    rebuildAccountSelect();
    showView("nearly-completed");
    doFetch();
  } catch {
    showError(setupError, "Invalid API key. Make sure account and progression permissions are enabled.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & continue";
  }
});

// ── Settings modal ────────────────────────────────────────────────────────────

function updateCacheInfo() {
  const count = Object.keys(loadCache()).length;
  cacheInfo.textContent = count ? `${count} entries cached` : "Cache is empty";
}

function renderAccountsList() {
  accountsList.innerHTML = "";
  if (!settings.accounts.length) {
    accountsList.innerHTML = `<p style="font-size:12px;color:var(--muted);padding:4px 0">No accounts added yet.</p>`;
    return;
  }
  settings.accounts.forEach((acc, i) => {
    const masked = acc.apiKey.length > 12
      ? acc.apiKey.slice(0, 8) + "••••••••" + acc.apiKey.slice(-4)
      : "••••••••";
    const row = document.createElement("div");
    row.className = "account-row";
    row.innerHTML = `
      <div class="account-row-info">
        <div class="account-row-name">${acc.name}</div>
        <div class="account-row-key">${masked}</div>
      </div>
      <button class="account-row-delete" title="Remove account">${SVG_TRASH}</button>
    `;
    row.querySelector(".account-row-delete").addEventListener("click", () => {
      settings.accounts.splice(i, 1);
      if (settings.activeAccount >= settings.accounts.length) {
        settings.activeAccount = Math.max(0, settings.accounts.length - 1);
      }
      saveSettings(settings);
      renderAccountsList();
      rebuildAccountSelect();
      if (!settings.accounts.length) {
        showView("setup");
        closeModal("settings-overlay");
      }
    });
    accountsList.appendChild(row);
  });
}

btnSettings.addEventListener("click", () => {
  document.getElementById("s-maxresults").value = settings.maxResults;
  document.getElementById("s-threshold").value  = settings.thresholdPct;
  document.getElementById("s-tier").value = settings.useFinalTier ? "last" : "next";
  addAccountForm.classList.add("hidden");
  clearError(newAccountError);
  document.getElementById("new-account-name").value = "";
  document.getElementById("new-account-key").value  = "";
  document.getElementById("new-account-key").type   = "password";
  document.querySelector('[data-target="new-account-key"]').innerHTML = SVG_EYE;
  renderAccountsList();
  updateCacheInfo();
  openModal("settings-overlay");
});

document.getElementById("btn-add-account").addEventListener("click", () => {
  addAccountForm.classList.toggle("hidden");
});

document.getElementById("btn-add-account-cancel").addEventListener("click", () => {
  addAccountForm.classList.add("hidden");
  clearError(newAccountError);
});

document.getElementById("btn-add-account-save").addEventListener("click", async () => {
  const name = document.getElementById("new-account-name").value.trim();
  const key  = document.getElementById("new-account-key").value.trim();
  if (!name) { showError(newAccountError, "Please enter a name."); return; }
  if (!key)  { showError(newAccountError, "Please enter an API key."); return; }
  clearError(newAccountError);

  const btn = document.getElementById("btn-add-account-save");
  btn.disabled = true;
  btn.textContent = "Validating…";
  try {
    await validateApiKey(key);
    settings.accounts.push({ name, apiKey: key });
    saveSettings(settings);
    renderAccountsList();
    rebuildAccountSelect();
    addAccountForm.classList.add("hidden");
    document.getElementById("new-account-name").value = "";
    document.getElementById("new-account-key").value  = "";
  } catch {
    showError(newAccountError, "Invalid API key. Make sure account and progression permissions are enabled.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save account";
  }
});

document.getElementById("btn-settings-close").addEventListener("click",  () => closeModal("settings-overlay"));
document.getElementById("btn-settings-cancel").addEventListener("click", () => closeModal("settings-overlay"));

document.getElementById("btn-settings-save").addEventListener("click", () => {
  settings.maxResults   = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.useFinalTier = document.getElementById("s-tier").value === "last";
  saveSettings(settings);
  closeModal("settings-overlay");
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  clearCache();
  updateCacheInfo();
  setStatus("Cache cleared.");
});

// ── Legal & GitHub ────────────────────────────────────────────────────────────

btnLegal.addEventListener("click", () => openModal("legal-overlay"));
btnGithub.addEventListener("click", () => window.open("https://github.com/odizinne/GW2AchTracker", "_blank", "noopener"));
document.getElementById("btn-legal-close").addEventListener("click",        () => closeModal("legal-overlay"));
document.getElementById("btn-legal-close-bottom").addEventListener("click", () => closeModal("legal-overlay"));

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

["settings-overlay", "legal-overlay"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target.id === id) closeModal(id);
  });
});

// ── Error helpers ─────────────────────────────────────────────────────────────

function showError(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }
function clearError(el)     { el.textContent = ""; el.classList.add("hidden"); }

// ── Eye toggles ───────────────────────────────────────────────────────────────

document.querySelectorAll(".eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const show  = input.type === "password";
    input.type  = show ? "text" : "password";
    btn.innerHTML = show ? SVG_EYE_OFF : SVG_EYE;
  });
});

// ── Number spinners ───────────────────────────────────────────────────────────

document.querySelectorAll(".number-spin button").forEach(btn => {
  btn.addEventListener("click", () => {
    const input  = document.getElementById(btn.dataset.target);
    const min    = parseFloat(input.min);
    const max    = parseFloat(input.max);
    const newVal = Math.min(max, Math.max(min, (parseFloat(input.value) || 0) + parseFloat(btn.dataset.delta)));
    input.value  = newVal;
  });
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

function setStatus(msg) { statusText.textContent = msg; }

function pctClass(pct) {
  if (pct >= 99) return "pct-high";
  if (pct >= 90) return "pct-med";
  return "pct-low";
}

function barColor(pct) {
  if (pct < 90) return "hsl(0,0%,50%)";
  const t   = Math.max(0, Math.min(1, (pct - 90) / 10));
  const lit = Math.round(50 + t * 20);
  const sat = Math.round(40 + t * 35);
  return `hsl(30,${sat}%,${lit}%)`;
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
  btnRefresh.disabled = active || !settings.accounts.length;
  pageSpinner.classList.toggle("hidden", !active);
}

function updateSubtitle(count) {
  const acc  = settings.accounts[settings.activeAccount];
  const name = acc ? acc.name : "";
  viewSubtitle.textContent = count != null
    ? `${count} achievement${count !== 1 ? "s" : ""} · ${name}`
    : name;
}

async function doFetch() {
  const key = activeApiKey();
  if (!key) return;
  setFetching(true);
  updateSubtitle(null);
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Loading…</td></tr>`;
  try {
    const rows = await fetchAchievements(key, settings, msg => setStatus(msg));
    renderRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
    updateSubtitle(rows.length);
    updateCacheInfo();
  } catch (e) {
    setStatus(e.message);
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Error — check your API key and try again.</td></tr>`;
  } finally {
    setFetching(false);
  }
}

btnRefresh.addEventListener("click", () => {
  lastProgressMap = null;
  doFetch();
});

// ── Init ──────────────────────────────────────────────────────────────────────

checkSetup();
updateCacheInfo();
if (settings.accounts.length) doFetch();

});
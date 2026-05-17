import { validateApiKey, formatRewards, apiFetch }          from "./api.js";
import { clearCache, loadCache, favoritesSet, hiddenSet, getItemNameMap, getTitleNameMap,
         toggleFavorite, toggleHidden, setCacheLang, reloadNameMaps,
         ensureStaticCache, getStaticVersion,
         } from "./cache.js";
import { loadSettings, saveSettings }                      from "./settings.js";
import { PALETTES, applyPalette }                          from "./palettes.js";
import { ensureDefinitionCache, ensureRewardNames, fetchProgress, computeNearlyDone,
         resolveRewardNames, resetProgress, getProgressMap, loadProgressCache } from "./nearly-done.js";
import { ensureBrowserData, getCategoryRows, renderBrowserTree, setProgressMap,
         resetBrowserState, resetBrowserCache, recomputeCatDoneStates,
         showBrowserSkeleton, getCategoryForAchievement, prepareTreeForCategory,
         getCategoryById, ensureDailyData, ensureActiveDailyCache,
         initBrowserDataFromCache } from "./browser.js";
import { SVG_EYE, SVG_EYE_OFF, SVG_TRASH, openModal, closeModal,
         showError, clearError, showView, pctClass, barColor, rewardHtml, stripGw2Markup } from "./ui.js";
import { openAchievementModal, initAchModal, setModalProgressMap,
         setModalStateCallback, setModalBackCallback } from "./ach-modal.js";
import { initSearch } from "./search.js";
import { setLang, getLang, t, applyI18n, achCountStr, resolveWikiUrl, LANGS } from "./i18n.js";
import { renderDailyView, openDailyFilterModal } from "./daily.js";
import { renderWeeklyView, weeklyResetCountdown } from "./weekly.js";
import { startClock } from "./tyrian-clock.js";
import { computeAccountAp, renderApFrise, stopApParticles } from "./ap-frise.js";
import { renderEventTimerView, openETFilterModal, initEventTimer, stopETTimer, enableETAutoScroll, openEventModalForReminder } from "./event-timer.js";
import { initNotifications, setVolume, playNotificationSound, removeReminder } from "./notifications.js";

document.addEventListener("DOMContentLoaded", () => {

startClock(document.getElementById("tyrian-clock"));

// ── State ─────────────────────────────────────────────────────────────────────

let settings           = loadSettings();
applyTheme(settings.theme);
// Bootstrap language
setCacheLang(settings.fetchLang ?? "en");
reloadNameMaps();
setLang(settings.lang ?? "en");
applyI18n();

let currentView        = "favorites";
let browserInitialized = false;
let accountDailyAp     = 0;
let activeCat          = null;
let lastNearlyDoneRows = [];
let nearlyDoneFirstRender = true;
let lastResultCount = null;
let showHidden           = false;
let showDailyCompleted   = false;
let viewMode = settings.viewMode ?? "list";
let sortMode = "default"; // "default" | "alpha" | "progress"
let sortDir  = 1;         // 1 = asc, -1 = desc

// EN-name cache: id -> English name, populated during fetch so wiki links work
const enNameCache = {};

function activeApiKey() {
  const acc = settings.accounts[settings.activeAccount];
  return acc ? acc.apiKey : "";
}

function currentLang()      { return settings.lang      ?? "en"; }
function currentFetchLang() { return settings.fetchLang ?? "en"; }

// ── DOM refs ──────────────────────────────────────────────────────────────────

const accountSelect     = document.getElementById("account-select");
const btnRefresh        = document.getElementById("btn-refresh");
const btnSettings       = document.getElementById("btn-settings");
const btnGithub         = document.getElementById("btn-github");
const btnLegal          = document.getElementById("btn-legal");
const resultsBody       = document.getElementById("results-body");
const viewSubtitle      = document.getElementById("view-subtitle");
const cacheInfo         = document.getElementById("cache-info");
const setupError        = document.getElementById("setup-error");
const accountsList      = document.getElementById("accounts-list");
const addAccountForm    = document.getElementById("add-account-form");
const newAccountError   = document.getElementById("new-account-error");
const browserTree       = document.getElementById("browser-tree");
const btnBrowseToggle   = document.getElementById("btn-browse-toggle");
const browserBody       = document.getElementById("browser-body");
const viewTitle         = document.getElementById("view-title");
const btnShowHidden           = document.getElementById("btn-show-hidden");
const btnShowCompletedDaily   = document.getElementById("btn-show-completed-daily");
const btnShowCompletedWeekly  = document.getElementById("btn-show-completed-weekly");
const btnDailyFilter          = document.getElementById("btn-daily-filter");
const btnEtFilter             = document.getElementById("btn-et-filter");
const btnEtAutoScroll         = document.getElementById("btn-et-autoscroll");
const favoritesBody     = document.getElementById("favorites-body");
const btnViewList       = document.getElementById("btn-view-list");
const btnViewTile       = document.getElementById("btn-view-tile");
const sortControls      = document.getElementById("sort-controls");
const btnSortDefault    = document.getElementById("btn-sort-default");
const btnSortAlpha      = document.getElementById("btn-sort-alpha");
const btnSortProgress   = document.getElementById("btn-sort-progress");

btnViewList.classList.toggle("active", viewMode === "list");
btnViewTile.classList.toggle("active", viewMode === "tile");
updateSortUI();

// ── i18n helpers ──────────────────────────────────────────────────────────────

function buildLangOptions(selectEl, currentLangVal) {
  selectEl.innerHTML = "";
  for (const [code, label] of Object.entries(LANGS)) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label;
    opt.selected = code === currentLangVal;
    selectEl.appendChild(opt);
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function setLoadingProgress() {}

function setStatus(key, vars = {}, fetched, total) {
  if (currentView === "nearly-completed" || currentView === "favorites") {
    viewSubtitle.textContent = t(key, vars);
  }
  setLoadingProgress(fetched, total);
}

function setBrowserStatus(key, vars = {}) {
  if (currentView === "browser") {
    viewSubtitle.textContent = key ? t(key, vars) : "";
  }
}

function setFetching(active) {
  btnRefresh.disabled = active || !settings.accounts.length;
  accountSelect.disabled = active;
  btnRefresh.classList.toggle("updating", active);
  const span = btnRefresh.querySelector("span");
  if (span) span.textContent = active ? t("btnUpdating") : t("btnUpdate");
}

function setBrowserFetching(_active) {}

function formatDateTime(iso) {
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function updateCacheInfo() {
  const version    = getStaticVersion();
  const lastSynced = localStorage.getItem("gw2_last_synced");
  const versionLine = version
    ? t("cacheVersion",    { v: version })
    : t("cacheNone");
  const syncLine   = lastSynced
    ? t("cacheLastSynced", { t: formatDateTime(lastSynced) })
    : t("cacheNeverSynced");
  cacheInfo.innerHTML = `${versionLine}<br>${syncLine}`;
}

function updateSubtitle(count) {
  viewSubtitle.textContent = count != null ? achCountStr(count) : "";
}

function _saveAccountDailyAp(apiKey, val) {
  try { localStorage.setItem(`gw2_daily_ap_${apiKey.slice(-8)}`, String(val)); } catch {}
}
function _loadAccountDailyAp(apiKey) {
  try { return parseInt(localStorage.getItem(`gw2_daily_ap_${apiKey.slice(-8)}`), 10) || 0; } catch { return 0; }
}

// ── AP Frise ──────────────────────────────────────────────────────────────────

const _friseEl       = document.getElementById("ap-frise");
const _friseScroll   = document.getElementById("ap-frise-scroll");
const _friseCanvas   = document.getElementById("ap-frise-canvas");
const _friseTooltip  = document.getElementById("ap-frise-tooltip");
const _apTopbarLabel = document.getElementById("ap-topbar-label");
const _btnFriseToggle = document.getElementById("btn-frise-toggle");
const _friseChevron   = document.getElementById("frise-chevron");

let friseExpanded      = localStorage.getItem("gw2_frise_expanded") !== "false";
let _apDataReady       = false;
let _lastFriseAp       = 0;
let _lastRenderedFriseAp = -1;

function _updateFriseToggle() {
  _friseChevron.setAttribute("points", friseExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9");
}

function _updateFriseVisibility(viewName = currentView) {
  const show = _apDataReady && viewName === "nearly-completed";
  _apTopbarLabel.classList.toggle("hidden", !show);
  _btnFriseToggle.classList.toggle("hidden", !show);
  if (!show) { _friseEl.classList.add("hidden"); return; }
  if (_friseCanvas.children.length === 0 || _lastFriseAp !== _lastRenderedFriseAp) {
    renderApFrise(_friseCanvas, _friseScroll, _friseTooltip, _lastFriseAp);
    _lastRenderedFriseAp = _lastFriseAp;
  }
  _friseEl.classList.toggle("hidden", !friseExpanded);
}

_btnFriseToggle.addEventListener("click", () => {
  friseExpanded = !friseExpanded;
  localStorage.setItem("gw2_frise_expanded", friseExpanded);
  _friseEl.classList.toggle("hidden", !friseExpanded);
  _updateFriseToggle();
});

const _AP_IMG = `<img src="assets/AP.png" style="width:16px;height:16px;vertical-align:middle;opacity:0.8;margin-left:2px;">`;
const _MAX_AP = 60000;

function refreshApFrise(progressMap) {
  if (!progressMap) return;
  const cache = loadCache();
  const computed = computeAccountAp(progressMap, cache);
  const correction = accountDailyAp > 10 ? 10 : 0;
  const ap = computed + accountDailyAp - correction;
  _apTopbarLabel.innerHTML = ap > _MAX_AP
    ? ap.toLocaleString() + _AP_IMG
    : ap.toLocaleString() + " / " + _MAX_AP.toLocaleString() + _AP_IMG;
  _lastFriseAp = ap;
  _apDataReady = true;
  _updateFriseToggle();
  _updateFriseVisibility();
}

// ── EN name tracking (needed for non-EN wiki URLs) ────────────────────────────

async function populateEnNameCache(ids) {
  if (currentFetchLang() === "en") return; // not needed
  const missing = ids.filter(id => !(id in enNameCache));
  if (missing.length) {
    // fetch EN names in background, batched
    try {
      const { fetchInBatches } = await import("./api.js");
      const items = await fetchInBatches("/achievements", missing, null, 150, { lang: "en" });
      for (const a of items) enNameCache[a.id] = a.name;
    } catch { /* best effort */ }
  }
}

function getEnName(id, localName) {
  if (currentFetchLang() === "en") return localName;
  return enNameCache[id] || localName;
}

// ── Open achievement (with EN name for wiki) ──────────────────────────────────

function openAchFromCache(id, cat = null) {
  const cache = loadCache();
  const ach = cache[id];
  if (ach) openAchievementModal(ach, null, getEnName(id, ach.name), cat ?? getCategoryForAchievement(id));
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  applyPalette(settings.accentPalette ?? "orange", theme);
}

// ── Progress cell helper ──────────────────────────────────────────────────────

function buildProgCell(row) {
  const hasProgress = row.percent !== null && row.percent !== undefined;
  const fillPct     = hasProgress ? Math.min(100, row.percent) : 0;

  if (row.done) {
    return `<div class="prog-wrap">
      <span>${t("progCompleted")}</span>
      <div class="prog-bar-bg invisible"></div>
    </div>`;
  }
  if (hasProgress && row.required) {
    return `<div class="prog-wrap">
      <span>${row.progress}/${row.required}</span>
      <div class="prog-bar-bg">
        <div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent)}"></div>
      </div>
    </div>`;
  }
  return `<div class="prog-wrap">
    <span class="muted">—</span>
    <div class="prog-bar-bg invisible"></div>
  </div>`;
}

// ── Cache reset helper ────────────────────────────────────────────────────────

function resetAllCachedState() {
  clearCache();
  resetProgress();
  setProgressMap(null);
  setModalProgressMap(null);
  resetBrowserCache();
  browserInitialized = false;
  activeCat = null;
  lastNearlyDoneRows = [];
  lastResultCount = null;
  nearlyDoneFirstRender = true;
  _apDataReady = false;
  stopApParticles();
  _friseEl.classList.add("hidden");
  _apTopbarLabel.classList.add("hidden");
  _btnFriseToggle.classList.add("hidden");
  resetBrowserState();
  browserTree.innerHTML = "";
  document.querySelectorAll(".tile-grid").forEach(g => g.remove());
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyNearly")}</td></tr>`;
  favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyFavorites")}</td></tr>`;
  document.getElementById("view-nearly-completed").querySelector(".table-wrap").style.display = "";
  document.getElementById("view-favorites").querySelector(".table-wrap").style.display = "";
  document.getElementById("view-browser").querySelector(".table-wrap").style.display = "";
  document.getElementById("view-daily").innerHTML = "";
  updateCacheInfo();
}

// ── Row action buttons ────────────────────────────────────────────────────────

const SVG_STAR = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SVG_HIDE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const SVG_WIKI = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function buildActionButtons(id, achName) {
  const isFav  = favoritesSet.has(id);
  const isHid  = hiddenSet.has(id);
  return `
    <button class="row-action-btn row-fav-btn ${isFav ? "active" : ""}" data-id="${id}" title="Favorite">${SVG_STAR}</button>
    <button class="row-action-btn row-hide-btn ${isHid ? "active" : ""}" data-id="${id}" title="Hide">${SVG_HIDE}</button>
    <button class="row-action-btn row-wiki-btn" data-id="${id}" data-name="${achName.replace(/"/g, '&quot;')}" title="${t("btnWiki")}">${SVG_WIKI}</button>`;
}

function attachActionListeners(tbody, onStateChange) {
  tbody.querySelectorAll(".row-fav-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      toggleFavorite(id);
      btn.classList.toggle("active", favoritesSet.has(id));
      onStateChange?.(id, "favorite");
    });
  });
  tbody.querySelectorAll(".row-hide-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      toggleHidden(id);
      btn.classList.toggle("active", hiddenSet.has(id));
      onStateChange?.(id, "hidden");
    });
  });
  tbody.querySelectorAll(".row-wiki-btn").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id       = Number(btn.dataset.id);
      const localName = btn.dataset.name;
      const enName   = getEnName(id, localName);
      const url      = await resolveWikiUrl(enName, localName, currentLang());
      window.open(url, "_blank", "noopener");
    });
  });
}

// ── View mode toggle ──────────────────────────────────────────────────────────

function setViewMode(mode) {
  viewMode = mode;
  settings.viewMode = mode;
  saveSettings(settings);
  btnViewList.classList.toggle("active", mode === "list");
  btnViewTile.classList.toggle("active", mode === "tile");
  if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  else if (currentView === "browser" && activeCat) selectCategory(activeCat);
  else if (currentView === "favorites") renderFavoritesView();
}

btnViewList.addEventListener("click", () => setViewMode("list"));
btnViewTile.addEventListener("click", () => setViewMode("tile"));

// ── Sort ──────────────────────────────────────────────────────────────────────

function applySortToRows(rows) {
  if (sortMode === "default") return rows;
  const sorted = [...rows];
  if (sortMode === "alpha") {
    sorted.sort((a, b) => sortDir * a.name.localeCompare(b.name));
  } else if (sortMode === "progress") {
    sorted.sort((a, b) => sortDir * ((a.percent ?? -1) - (b.percent ?? -1)));
  }
  return sorted;
}

function updateSortUI() {
  btnSortDefault.classList.toggle("active",  sortMode === "default");
  btnSortAlpha.classList.toggle("active",    sortMode === "alpha");
  btnSortProgress.classList.toggle("active", sortMode === "progress");
  const arrow = sortDir === 1 ? "↑" : "↓";
  btnSortAlpha.innerHTML    = `A Z <span class="sort-arrow">${arrow}</span>`;
  btnSortProgress.innerHTML = `% <span class="sort-arrow">${arrow}</span>`;
}

btnSortDefault.addEventListener("click", () => {
  sortMode = "default";
  sortDir  = 1;
  updateSortUI();
  if (activeCat) selectCategory(activeCat);
});

btnSortAlpha.addEventListener("click", () => {
  sortDir  = sortMode === "alpha" ? -sortDir : 1;
  sortMode = "alpha";
  updateSortUI();
  if (activeCat) selectCategory(activeCat);
});

btnSortProgress.addEventListener("click", () => {
  sortDir  = sortMode === "progress" ? -sortDir : 1;
  sortMode = "progress";
  updateSortUI();
  if (activeCat) selectCategory(activeCat);
});

// ── Tile rendering ────────────────────────────────────────────────────────────

function buildTileHtml(rows) {
  if (!rows.length) return "";
  const cache = loadCache();
  return rows.map(row => {
    const isHid      = hiddenSet.has(row.id);
    const isDone     = row.done || (row.percent !== null && row.percent >= 100);
    const hasProgress = row.percent !== null && row.percent !== undefined;
    const fillPct    = hasProgress ? Math.min(100, row.percent) : 0;

    const pctLabel = isDone
      ? `<span class="tile-pct pct-done">✓</span>`
      : hasProgress
        ? `<span class="tile-pct ${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
        : `<span class="tile-pct pct-na">—</span>`;

    const progBar = hasProgress && row.required
      ? `<div class="prog-bar-bg" style="flex:1;height:3px;border-radius:99px;overflow:hidden;background:var(--bg4)">
           <div class="prog-bar-fill" style="width:${fillPct}%;height:100%;border-radius:99px;background:${isDone ? "var(--green)" : barColor(row.percent)}"></div>
         </div>
         <span class="tile-prog-nums">${row.progress}/${row.required}</span>`
      : `<div style="flex:1;height:3px;border-radius:99px;background:var(--bg4);visibility:hidden"></div>`;

    const ach  = cache[row.id];
    const desc = stripGw2Markup(ach?.requirement || ach?.description || "");

    const rewardParts = row.rewardStr
      ? row.rewardStr.split(" · ").map(part =>
          `<span class="tile-reward-chip">${rewardHtml(part)}</span>`
        ).join("")
      : "";

    const classes = ["ach-tile", isDone ? "tile-done" : "", isHid ? "tile-hidden" : ""].filter(Boolean).join(" ");

    return `<div class="${classes}">
      <div class="tile-body">
        <button class="tile-name ach-row-btn" data-id="${row.id}">${row.name}</button>
        <div class="tile-desc">${desc}</div>
        <div class="tile-prog-row">
          ${progBar}
          ${pctLabel}
        </div>
      </div>
      <div class="tile-sep"></div>
      <div class="tile-rewards">${rewardParts}</div>
    </div>`;
  }).join("");
}

function attachTileListeners(grid, cat = null) {
  grid.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id), cat));
  });
}

function renderTileView(viewEl, rows, opts = {}) {
  const { hideCompleted = false, cat = null } = opts;
  const visible = hideCompleted ? rows.filter(r => !r.done || r.repeatable) : rows;
  viewEl.querySelector(".table-wrap").style.display = "none";
  let grid = viewEl.querySelector(".tile-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "tile-grid";
    viewEl.appendChild(grid);
  }
  grid.innerHTML = buildTileHtml(visible) || `<div class="tile-empty">${t("emptyNearlyFilter")}</div>`;
  attachTileListeners(grid, cat);
  return visible.length;
}

function renderListView(viewEl) {
  viewEl.querySelector(".table-wrap").style.display = "";
  viewEl.querySelector(".tile-grid")?.remove();
}

// ── Auto-update ───────────────────────────────────────────────────────────────

let _autoUpdateTimer = null;

function applyAutoUpdate(intervalMin) {
  if (_autoUpdateTimer) { clearInterval(_autoUpdateTimer); _autoUpdateTimer = null; }
  if (intervalMin > 0) {
    _autoUpdateTimer = setInterval(() => doFetch(), intervalMin * 60_000);
  }
}

// ── View routing ──────────────────────────────────────────────────────────────

function navigateTo(name) {
  if (name !== "daily" && _dailyResetInterval) {
    clearInterval(_dailyResetInterval);
    _dailyResetInterval = null;
  }
  if (name !== "weekly" && _weeklyResetInterval) {
    clearInterval(_weeklyResetInterval);
    _weeklyResetInterval = null;
  }
  if (name !== "event-timer") stopETTimer();
  currentView = name;
  localStorage.setItem("gw2_last_section", name);
  showView(name);
  btnShowHidden.classList.toggle("hidden", name !== "nearly-completed");
  btnShowCompletedDaily.classList.toggle("hidden", name !== "daily");
  btnShowCompletedWeekly.classList.add("hidden");
  _updateFriseVisibility(name);
  btnDailyFilter.classList.toggle("hidden", name !== "daily");
  btnEtFilter.classList.toggle("hidden", name !== "event-timer");
  btnEtAutoScroll.classList.toggle("hidden", name !== "event-timer");
  btnSplitView.disabled = name === "event-timer";
  sortControls.classList.toggle("hidden", name !== "browser");
  const hideViewToggle = name === "daily" || name === "weekly" || name === "event-timer";
  btnViewList.classList.toggle("hidden", hideViewToggle);
  btnViewTile.classList.toggle("hidden", hideViewToggle);
  if (name === "nearly-completed") {
    viewTitle.textContent = t("titleNearly");
    updateSubtitle(lastResultCount);
  } else if (name === "browser") {
    viewTitle.textContent = t("titleBrowse");
    viewSubtitle.textContent = "";
    browserTree.classList.remove("hidden");
    btnBrowseToggle.classList.add("open");
    initBrowser();
  } else if (name === "favorites") {
    viewTitle.textContent = t("titleFavorites");
    renderFavoritesView();
  } else if (name === "daily") {
    viewTitle.textContent = t("titleDaily");
    renderDailyViewWrapper();
  } else if (name === "weekly") {
    viewTitle.textContent = t("titleWeekly");
    renderWeeklyViewWrapper();
  } else if (name === "event-timer") {
    viewTitle.textContent = t("titleEventTimer");
    viewSubtitle.textContent = "";
    enableETAutoScroll();
    renderEventTimerView(document.getElementById("view-event-timer"));
  }
  updateSplitConflicts();
}

document.querySelectorAll(".nav-item[data-view]").forEach(item => {
  item.addEventListener("click", () => {
    if (item.dataset.view === splitViewName) return;
    if (!settings.accounts.length && item.dataset.view !== "event-timer" && item.dataset.view !== "weekly") return;
    navigateTo(item.dataset.view);
  });
});

btnBrowseToggle.addEventListener("click", () => {
  if (!settings.accounts.length) return;
  const opening = browserTree.classList.contains("hidden");
  if (opening) {
    browserTree.classList.remove("tree-anim-out", "tree-anim", "hidden");
    btnBrowseToggle.classList.add("open");
    requestAnimationFrame(() => browserTree.classList.add("tree-anim"));
    initBrowser();
  } else {
    browserTree.classList.remove("tree-anim");
    browserTree.classList.add("tree-anim-out");
    btnBrowseToggle.classList.remove("open");
    browserTree.addEventListener("animationend", () => {
      browserTree.classList.add("hidden");
      browserTree.classList.remove("tree-anim-out");
    }, { once: true });
  }
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
  saveSettings(settings);
  resetProgress();
  setProgressMap(null);
  accountDailyAp = _loadAccountDailyAp(activeApiKey());
  activeCat = null;
  browserInitialized = false;
  nearlyDoneFirstRender = true;
  resetBrowserState();
  if (currentView === "nearly-completed") {
    doFetch();
  } else if (currentView === "browser") {
    initBrowser(true);
  }
});

// ── Setup ─────────────────────────────────────────────────────────────────────

function checkSetup() {
  rebuildAccountSelect();
  // Populate setup language select
  const setupLangSelect = document.getElementById("setup-lang-select");
  if (setupLangSelect) buildLangOptions(setupLangSelect, currentLang());

  if (!settings.accounts.length) {
    showView("setup");
    browserTree.classList.add("hidden");
  } else {
    let startView = settings.defaultSection ?? "nearly-completed";
    if (startView === "last-visited") {
      startView = localStorage.getItem("gw2_last_section") || "nearly-completed";
    }
    navigateTo(startView);
  }
}

// Setup language change (before account is saved)
document.getElementById("setup-lang-select")?.addEventListener("change", e => {
  const lang = e.target.value;
  settings.lang = lang;
  settings.fetchLang = lang;
  saveSettings(settings);
  setCacheLang(lang);
  reloadNameMaps();
  setLang(lang);
  applyI18n();
});

document.getElementById("btn-setup-save").addEventListener("click", async () => {
  const name = document.getElementById("setup-name").value.trim();
  const key  = document.getElementById("setup-key").value.trim();
  if (!name) { showError(setupError, t("setupErrName")); return; }
  if (!key)  { showError(setupError, t("setupErrKey")); return; }
  clearError(setupError);
  const btn = document.getElementById("btn-setup-save");
  btn.disabled = true;
  btn.textContent = t("validating");
  try {
    await validateApiKey(key);
    settings.accounts.push({ name, apiKey: key });
    settings.activeAccount = settings.accounts.length - 1;
    saveSettings(settings);
    rebuildAccountSelect();
    navigateTo("nearly-completed");
    doFetch();
  } catch {
    showError(setupError, t("setupErrInvalid"));
  } finally {
    btn.disabled = false;
    btn.textContent = t("setupSave");
  }
});

// ── Favorites ─────────────────────────────────────────────────────────────────

function renderFavoritesView() {
  const viewEl       = document.getElementById("view-favorites");
  const cache        = loadCache();
  const pm           = getProgressMap();
  const itemNameMap  = getItemNameMap();
  const titleNameMap = getTitleNameMap();
  const ids          = [...favoritesSet];

  if (!ids.length) {
    renderListView(viewEl);
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyFavorites")}</td></tr>`;
    viewSubtitle.textContent = "";
    return;
  }

  const rows = ids.flatMap(id => {
    const ach = cache[id];
    if (!ach) return [];
    const entry    = pm?.[id] || {};
    const tiers    = ach.tiers || [];
    const progress = entry.current || 0;
    const done     = entry.done    || false;
    const maxTier  = tiers[tiers.length - 1];
    const required = maxTier?.count ?? null;
    const pct      = done ? 100
      : required ? Math.min(100, Math.round((progress / required) * 1000) / 10)
      : null;
    const totalPts = ach.point_cap ?? tiers.reduce((s, tier) => s + (tier.points || 0), 0);
    return [{ id, name: ach.name, progress, required, percent: pct, done,
      rewardStr: formatRewards(ach.rewards || [], itemNameMap, titleNameMap, totalPts) }];
  });

  if (!rows.length) {
    renderListView(viewEl);
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyFavNoData")}</td></tr>`;
    return;
  }

  if (viewMode === "tile") {
    const visibleCount = renderTileView(viewEl, rows, { hideCompleted: settings.hideCompleted });
    viewSubtitle.textContent = achCountStr(visibleCount);
    return;
  }

  renderListView(viewEl);

  const visible = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
  viewSubtitle.textContent = achCountStr(visible.length);

  favoritesBody.innerHTML = visible.map(row => {
    const hasProgress = row.percent !== null;
    const pctCell = row.done
      ? `<span class="pct-done">✓</span>`
      : hasProgress
        ? `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
        : `<span class="pct-na">—</span>`;
    return `<tr class="${row.done ? "row-done" : ""}">
      <td class="col-pct">${pctCell}</td>
      <td class="col-prog">${buildProgCell(row)}</td>
      <td class="col-name"><button class="ach-row-btn" data-id="${row.id}">${row.name}</button></td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
      <td class="col-actions">${buildActionButtons(row.id, row.name)}</td>
    </tr>`;
  }).join("");

  favoritesBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id)));
  });
  attachActionListeners(favoritesBody, (_id, _type) => renderFavoritesView());
}

// ── Nearly completed ──────────────────────────────────────────────────────────

function renderNearlyDoneRows(rows) {
  const viewEl = document.getElementById("view-nearly-completed");

  let visible = settings.hideCompleted ? rows.filter(r => r.percent < 100) : rows;
  if (!showHidden) visible = visible.filter(r => !hiddenSet.has(r.id));

  if (!visible.length) {
    renderListView(viewEl);
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyNearlyFilter")}</td></tr>`;
    if (currentView === "nearly-completed") updateSubtitle(0);
    return;
  }

  if (currentView === "nearly-completed") updateSubtitle(visible.length);

  if (viewMode === "tile") {
    renderTileView(viewEl, visible, { hideCompleted: false });
    return;
  }

  renderListView(viewEl);

  if (nearlyDoneFirstRender) {
    resultsBody.classList.remove("fade-in");
    void resultsBody.offsetWidth;
    resultsBody.classList.add("fade-in");
    nearlyDoneFirstRender = false;
  }

  resultsBody.innerHTML = visible.map(row => {
    const pctCell = `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`;
    return `<tr class="${hiddenSet.has(row.id) ? "row-hidden" : ""}">
      <td class="col-pct">${pctCell}</td>
      <td class="col-prog">${buildProgCell(row)}</td>
      <td class="col-name"><button class="ach-row-btn" data-id="${row.id}">${row.name}</button></td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
      <td class="col-actions">${buildActionButtons(row.id, row.name)}</td>
    </tr>`;
  }).join("");

  resultsBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id)));
  });
  attachActionListeners(resultsBody, (_id, type) => {
    if (type === "hidden") renderNearlyDoneRows(lastNearlyDoneRows);
    else if (type === "favorite") renderFavoritesView();
  });
}

async function doFetch() {
  const key  = activeApiKey();
  const lang = currentFetchLang();
  if (!key) return;
  setFetching(true);
  if (currentView === "nearly-completed") setStatus("statusLoading");

  let definitionsFailed = false;
  try {
    const staticUpdated = await ensureStaticCache(lang, (...args) => setStatus(...args));
    if (staticUpdated) resetBrowserCache();
    await Promise.all([
      ensureActiveDailyCache(),
      ensureDefinitionCache(
        (...args) => setStatus(...args),
        key,
        settings.fetchMode ?? "account-all",
        lang,
      ),
      ensureBrowserData((...args) => setStatus(...args), lang),
    ]);
    await ensureDailyData((...args) => setStatus(...args), lang);
    await ensureRewardNames((...args) => setStatus(...args), lang);
  } catch (e) {
    console.warn("Definition/browser data update failed, continuing with cache:", e);
    definitionsFailed = true;
  }

  // Populate EN name cache for non-EN fetch languages (needed for wiki URLs)
  if (currentFetchLang() !== "en") {
    const allIds = Object.keys(loadCache()).map(Number);
    try {
      const { fetchInBatches } = await import("./api.js");
      const enItems = await fetchInBatches("/achievements", allIds, null, 150, { lang: "en" });
      for (const a of enItems) enNameCache[a.id] = a.name;
    } catch { /* best effort */ }
  }

  let progressFailed = false;
  const [progressResult, accountResult] = await Promise.allSettled([
    fetchProgress(key),
    apiFetch("/account", {}, key),
  ]);
  if (progressResult.status === "rejected") {
    console.warn("Progress fetch failed:", progressResult.reason);
    progressFailed = true;
  } else {
    localStorage.setItem("gw2_last_synced", new Date().toISOString());
  }
  if (accountResult.status === "fulfilled") {
    accountDailyAp = accountResult.value.daily_ap ?? 0;
    _saveAccountDailyAp(key, accountDailyAp);
  }

  if (progressFailed) {
    if (currentView === "nearly-completed") {
      resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("statusErrProgress")}</td></tr>`;
    }
    setFetching(false);
    updateCacheInfo();
    return;
  }

  const rows = computeNearlyDone(getProgressMap(), settings);
  lastNearlyDoneRows = rows;
  lastResultCount = rows.length;

  try {
    await resolveRewardNames(rows, key, lang);
  } catch (e) {
    console.warn("Reward name resolution failed:", e);
  }

  if (settings.clearCompletedFavorites) {
    const progressMap = getProgressMap();
    for (const id of [...favoritesSet]) {
      if (progressMap[id]?.done) toggleFavorite(id);
    }
  }

  setProgressMap(getProgressMap());
  setModalProgressMap(getProgressMap());
  recomputeCatDoneStates(settings.hideCompleted, settings.fetchMode ?? "account-all");

  if (browserInitialized) {
    browserTree.innerHTML = "";
    renderBrowserTree(browserTree, cat => selectCategory(cat));
    recomputeCatDoneStates(settings.hideCompleted, settings.fetchMode ?? "account-all");
  }

  refreshApFrise(getProgressMap());
  renderNearlyDoneRows(rows);
  if (currentView === "favorites") renderFavoritesView();
  if (currentView === "browser" && activeCat) selectCategory(activeCat);
  if (currentView === "daily")  renderDailyViewWrapper();
  if (currentView === "weekly") renderWeeklyViewWrapper();

  updateCacheInfo();
  setFetching(false);
  if (splitViewActive) renderSplitContent();
}

btnRefresh.addEventListener("click", () => { doFetch(); });

// ── Browser ───────────────────────────────────────────────────────────────────

async function initBrowser(forceRefresh = false) {
  if (browserInitialized && !forceRefresh) return;

  setBrowserFetching(true);
  setBrowserStatus("statusLoading");

  try {
    await ensureBrowserData((key, vars) => setBrowserStatus(key, vars), currentLang());

    if (!getProgressMap()) {
      const key = activeApiKey();
      if (key) {
        const map = await fetchProgress(key);
        setProgressMap(map);
        setModalProgressMap(map);
      }
    }

    if (!activeCat) {
      const savedCatId = Number(localStorage.getItem("gw2_last_cat"));
      if (savedCatId) {
        const savedCat = getCategoryById(savedCatId);
        if (savedCat) {
          activeCat = savedCat;
          prepareTreeForCategory(savedCatId);
        }
      }
    }

    browserTree.innerHTML = "";
    renderBrowserTree(browserTree, cat => selectCategory(cat));
    recomputeCatDoneStates(settings.hideCompleted, settings.fetchMode ?? "account-all");
    browserInitialized = true;
    setBrowserStatus("");

    if (activeCat) {
      selectCategory(activeCat);
    } else {
      viewTitle.textContent    = t("titleBrowse");
      viewSubtitle.textContent = t("subtitleBrowseHint");
      browserBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyBrowser")}</td></tr>`;
    }
  } catch (e) {
    setBrowserStatus("statusLoading"); // fallback
    console.error(e);
  } finally {
    setBrowserFetching(false);
  }
}

function selectCategory(cat) {
  const changed = activeCat !== cat;
  activeCat = cat;
  localStorage.setItem("gw2_last_cat", cat.id);

  if (currentView !== "browser") {
    currentView = "browser";
    localStorage.setItem("gw2_last_section", "browser");
    showView("browser");
    btnShowHidden.classList.add("hidden");
    sortControls.classList.remove("hidden");
    _updateFriseVisibility("browser");
  }

  viewTitle.textContent = cat.name;

  const rows   = getCategoryRows(cat.id);
  const viewEl = document.getElementById("view-browser");

  if (!rows.length) {
    renderListView(viewEl);
    showBrowserSkeleton(browserBody);
    viewSubtitle.textContent = t("statusLoading");
    return;
  }

  if (viewMode === "tile") {
    const sorted       = applySortToRows(rows);
    const browseRows   = settings.hideCompleted ? sorted.filter(r => !r.done) : sorted;
    const visibleCount = renderTileView(viewEl, browseRows, { hideCompleted: false, cat: activeCat });
    viewSubtitle.textContent = achCountStr(visibleCount);
    if (changed) {
      const grid = viewEl.querySelector(".tile-grid");
      if (grid) { grid.style.opacity = "0"; requestAnimationFrame(() => { grid.style.opacity = ""; }); }
    }
  } else {
    renderListView(viewEl);
    const visibleCount = renderBrowserRows(rows);
    viewSubtitle.textContent = achCountStr(visibleCount);
    if (changed) {
      const wrap = viewEl.querySelector(".table-wrap");
      if (wrap) { wrap.style.opacity = "0"; requestAnimationFrame(() => { wrap.style.opacity = ""; }); }
    }
  }

  updateCacheInfo();
}

function renderBrowserRows(rows) {
  const sorted  = applySortToRows(rows);
  const visible = settings.hideCompleted
    ? sorted.filter(r => !r.done)
    : sorted;

  if (!visible.length) {
    browserBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyBrowserCat")}</td></tr>`;
    return 0;
  }

  browserBody.innerHTML = visible.map(row => {
    const hasProgress = row.percent !== null;
    const pctCell = row.done
      ? `<span class="pct-done">✓</span>`
      : hasProgress
        ? `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
        : `<span class="pct-na">—</span>`;

    return `<tr class="${row.done ? "row-done" : ""}">
      <td class="col-pct">${pctCell}</td>
      <td class="col-prog">${buildProgCell(row)}</td>
      <td class="col-name"><button class="ach-row-btn" data-id="${row.id}">${row.name}</button></td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
      <td class="col-actions">${buildActionButtons(row.id, row.name)}</td>
    </tr>`;
  }).join("");

  browserBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id), activeCat));
  });
  attachActionListeners(browserBody, () => {
    if (activeCat) selectCategory(activeCat);
  });

  return visible.length;
}

// ── Daily view ────────────────────────────────────────────────────────────────

function _resetCountdown() {
  const now  = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const diff = next - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

let _dailyResetInterval = null;

function renderDailyViewWrapper() {
  const container = document.getElementById("view-daily");
  const pm = getProgressMap();
  if (!pm) {
    container.innerHTML = `<div class="daily-empty">${t("emptyDaily")}</div>`;
    viewSubtitle.textContent = "";
    return;
  }
  renderDailyView(container, pm, showDailyCompleted, (id, cat) => openAchFromCache(id, cat));

  const tick = () => {
    if (currentView !== "daily") { clearInterval(_dailyResetInterval); _dailyResetInterval = null; return; }
    viewSubtitle.textContent = `Reset in ${_resetCountdown()}`;
  };
  tick();
  if (_dailyResetInterval) clearInterval(_dailyResetInterval);
  _dailyResetInterval = setInterval(tick, 1000);
}

btnShowCompletedDaily.addEventListener("click", () => {
  showDailyCompleted = !showDailyCompleted;
  btnShowCompletedDaily.classList.toggle("active", showDailyCompleted);
  renderDailyViewWrapper();
});

btnDailyFilter.addEventListener("click", () => {
  openDailyFilterModal(renderDailyViewWrapper);
});

// ── Weekly view ───────────────────────────────────────────────────────────────

let _weeklyResetInterval = null;

function renderWeeklyViewWrapper() {
  const container = document.getElementById("view-weekly");
  const pm = getProgressMap();
  renderWeeklyView(container, pm, (id, cat) => openAchFromCache(id, cat));

  const tick = () => {
    if (currentView !== "weekly") { clearInterval(_weeklyResetInterval); _weeklyResetInterval = null; return; }
    viewSubtitle.textContent = `Reset in ${weeklyResetCountdown()}`;
  };
  tick();
  if (_weeklyResetInterval) clearInterval(_weeklyResetInterval);
  _weeklyResetInterval = setInterval(tick, 1000);
}


// ── Settings modal ────────────────────────────────────────────────────────────

function renderAccountsList() {
  accountsList.innerHTML = "";
  if (!settings.accounts.length) {
    accountsList.innerHTML = `<p style="font-size:12px;color:var(--muted);padding:4px 0">${t("noAccounts")}</p>`;
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
      if (settings.activeAccount >= settings.accounts.length)
        settings.activeAccount = Math.max(0, settings.accounts.length - 1);
      saveSettings(settings);
      renderAccountsList();
      rebuildAccountSelect();
      if (!settings.accounts.length) {
        showView("setup");
        browserTree.classList.add("hidden");
        closeModal("settings-overlay");
      }
    });
    accountsList.appendChild(row);
  });
}

// ── Palette select ───────────────────────────────────────────────────────────

const paletteSelect = document.getElementById("s-palette");
for (const p of PALETTES) {
  const opt = document.createElement("option");
  opt.value = p.id;
  opt.textContent = p.label;
  paletteSelect.appendChild(opt);
}

// ── Settings tab switching ───────────────────────────────────────────────────

const SETTINGS_TAB_ORDER = ['api', 'ui', 'view', 'notifications'];
let settingsTabIdx = 0;
let settingsTabAnimating = false;

document.querySelectorAll(".settings-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (settingsTabAnimating) return;
    const newTab = btn.dataset.tab;
    const newIdx = SETTINGS_TAB_ORDER.indexOf(newTab);
    if (newIdx === settingsTabIdx) return;

    const goingRight = newIdx > settingsTabIdx;
    const exitClass  = goingRight ? 'tab-exit-left'  : 'tab-exit-right';
    const enterClass = goingRight ? 'tab-enter-right' : 'tab-enter-left';

    const prevPanel = document.querySelector('.settings-tab-panel.active');
    const nextPanel = document.getElementById(`stab-${newTab}`);

    document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    prevPanel.classList.add(exitClass);
    nextPanel.classList.add(enterClass, 'active');
    settingsTabIdx = newIdx;
    settingsTabAnimating = true;

    prevPanel.addEventListener('animationend', () => {
      prevPanel.classList.remove('active', exitClass);
      nextPanel.classList.remove(enterClass);
      settingsTabAnimating = false;
    }, { once: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

btnSettings.addEventListener("click", () => {
  document.getElementById("s-maxresults").value       = settings.maxResults;
  document.getElementById("s-threshold").value        = settings.thresholdPct;
  document.getElementById("s-tier").value             = settings.useFinalTier ? "last" : "next";
  document.getElementById("s-fetch-mode").value       = settings.fetchMode ?? "account-all";
  document.getElementById("s-auto-update").value      = settings.autoUpdateInterval ?? 0;
  document.getElementById("s-hide-completed").checked        = settings.hideCompleted;
  document.getElementById("s-clear-fav-completed").checked   = settings.clearCompletedFavorites ?? false;
  paletteSelect.value = settings.accentPalette ?? "orange";
  document.getElementById("s-default-section").value         = settings.defaultSection ?? "nearly-completed";
  document.getElementById("s-light-mode").checked            = settings.theme === "light";
  buildLangOptions(document.getElementById("s-lang"), currentLang());
  buildLangOptions(document.getElementById("s-fetch-lang"), currentFetchLang());
  addAccountForm.classList.add("hidden");
  clearError(newAccountError);
  document.getElementById("new-account-name").value = "";
  document.getElementById("new-account-key").value  = "";
  document.getElementById("new-account-key").type   = "password";
  document.querySelector('[data-target="new-account-key"]').innerHTML = SVG_EYE;
  renderAccountsList();
  updateCacheInfo();
  const _vol = settings.notificationVolume ?? 0.5;
  const _volEl = document.getElementById("s-notif-volume");
  _volEl.value = _vol;
  document.getElementById("s-notif-volume-label").textContent = Math.round(_vol * 100) + "%";
  updateRangeFill(_volEl);
  document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".settings-tab-panel").forEach(p => p.classList.remove("active", "tab-exit-left", "tab-exit-right", "tab-enter-right", "tab-enter-left"));
  document.querySelector('.settings-tab-btn[data-tab="api"]').classList.add("active");
  document.getElementById("stab-api").classList.add("active");
  settingsTabIdx = 0;
  settingsTabAnimating = false;
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
  if (!name) { showError(newAccountError, t("errName")); return; }
  if (!key)  { showError(newAccountError, t("errKey")); return; }
  clearError(newAccountError);
  const btn = document.getElementById("btn-add-account-save");
  btn.disabled = true; btn.textContent = t("validating");
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
    showError(newAccountError, t("errInvalid"));
  } finally {
    btn.disabled = false; btn.textContent = t("btnSaveAccount");
  }
});

document.getElementById("btn-settings-close").addEventListener("click",  () => closeModal("settings-overlay"));
document.getElementById("btn-settings-cancel").addEventListener("click", () => closeModal("settings-overlay"));

function doSaveSettings() {
  const prevFetchMode    = settings.fetchMode  ?? "account-all";
  const prevLang         = settings.lang       ?? "en";
  const prevFetchLang    = settings.fetchLang  ?? "en";
  const prevUseFinalTier = settings.useFinalTier;
  const prevThresholdPct = settings.thresholdPct;
  const prevMaxResults   = settings.maxResults;

  settings.maxResults    = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct  = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.useFinalTier  = document.getElementById("s-tier").value === "last";
  settings.fetchMode          = document.getElementById("s-fetch-mode").value;
  settings.autoUpdateInterval = parseInt(document.getElementById("s-auto-update").value) || 0;
  applyAutoUpdate(settings.autoUpdateInterval);
  settings.hideCompleted           = document.getElementById("s-hide-completed").checked;
  settings.clearCompletedFavorites = document.getElementById("s-clear-fav-completed").checked;
  settings.accentPalette           = paletteSelect.value;
  settings.defaultSection          = document.getElementById("s-default-section").value;
  settings.theme                   = document.getElementById("s-light-mode").checked ? "light" : "dark";
  settings.lang                    = document.getElementById("s-lang").value;
  settings.fetchLang               = document.getElementById("s-fetch-lang").value;
  settings.notificationVolume      = parseFloat(document.getElementById("s-notif-volume").value) || 0.7;
  setVolume(settings.notificationVolume);
  applyTheme(settings.theme);
  saveSettings(settings);

  const fetchModeChanged  = settings.fetchMode  !== prevFetchMode;
  const uiLangChanged     = settings.lang       !== prevLang;
  const fetchLangChanged  = settings.fetchLang  !== prevFetchLang;

  if (uiLangChanged) {
    setLang(settings.lang);
    applyI18n();
    if (currentView === "nearly-completed") viewTitle.textContent = t("titleNearly");
    else if (currentView === "favorites")   viewTitle.textContent = t("titleFavorites");
    else if (currentView === "browser")     viewTitle.textContent = t("titleBrowse");
    else if (currentView === "daily")       viewTitle.textContent = t("titleDaily");
  }

  if (fetchLangChanged || fetchModeChanged) {
    setCacheLang(settings.fetchLang);
    reloadNameMaps();
    resetAllCachedState();
    doFetch();
  } else if (!uiLangChanged) {
    recomputeCatDoneStates(settings.hideCompleted, settings.fetchMode);
    if (currentView === "browser" && activeCat) selectCategory(activeCat);
    if (currentView === "nearly-completed") {
      const nearlySettingsChanged = settings.useFinalTier !== prevUseFinalTier
        || settings.thresholdPct !== prevThresholdPct
        || settings.maxResults   !== prevMaxResults;
      if (nearlySettingsChanged) {
        lastNearlyDoneRows = computeNearlyDone(getProgressMap(), settings);
        const key = activeApiKey();
        resolveRewardNames(lastNearlyDoneRows, key, currentFetchLang())
          .catch(e => console.warn("Reward name resolution failed:", e))
          .finally(() => renderNearlyDoneRows(lastNearlyDoneRows));
      } else {
        renderNearlyDoneRows(lastNearlyDoneRows);
      }
    }
  }
}

document.getElementById("btn-settings-save").addEventListener("click", () => {
  doSaveSettings();
  closeModal("settings-overlay");
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  resetAllCachedState();
});

// ── Legal & GitHub ────────────────────────────────────────────────────────────

document.getElementById("btn-donate").addEventListener("click", () => window.open("https://ko-fi.com/odizinne", "_blank", "noopener"));
btnLegal.addEventListener("click", () => openModal("legal-overlay"));
btnGithub.addEventListener("click", () => window.open("https://github.com/odizinne/GW2AchTracker", "_blank", "noopener"));
document.getElementById("btn-legal-close").addEventListener("click",        () => closeModal("legal-overlay"));
document.getElementById("btn-legal-close-bottom").addEventListener("click", () => closeModal("legal-overlay"));

document.getElementById("settings-overlay").addEventListener("click", e => {
  if (e.target.id === "settings-overlay") { doSaveSettings(); closeModal("settings-overlay"); }
});
document.getElementById("legal-overlay").addEventListener("click", e => {
  if (e.target.id === "legal-overlay") closeModal("legal-overlay");
});

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

// ── Range input fill helper ───────────────────────────────────────────────────

function updateRangeFill(input) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 1;
  const pct = (parseFloat(input.value) - min) / (max - min) * 100;
  input.style.setProperty("--range-pct", pct + "%");
}

// ── Notification volume preview ───────────────────────────────────────────────

document.getElementById("s-notif-volume").addEventListener("input", e => {
  const vol = parseFloat(e.target.value);
  document.getElementById("s-notif-volume-label").textContent = Math.round(vol * 100) + "%";
  setVolume(vol);
  updateRangeFill(e.target);
});

document.getElementById("s-notif-volume").addEventListener("change", e => {
  setVolume(parseFloat(e.target.value));
  playNotificationSound();
});

// ── Show hidden toggle ────────────────────────────────────────────────────────

btnShowHidden.addEventListener("click", () => {
  showHidden = !showHidden;
  btnShowHidden.classList.toggle("active", showHidden);
  renderNearlyDoneRows(lastNearlyDoneRows);
});

// ── Event Timer filter button ─────────────────────────────────────────────────

btnEtFilter.addEventListener("click", () => openETFilterModal());

// ── Split view ────────────────────────────────────────────────────────────────

let splitViewActive = false;
let splitViewName   = null;

const btnSplitView    = document.getElementById("btn-split-view");
const splitPanel      = document.getElementById("split-panel");
const splitPanelBody  = document.getElementById("split-panel-body");
const viewScaleSlider = document.getElementById("view-scale-slider");
const scaleLabel      = document.getElementById("scale-label");

btnSplitView.addEventListener("click", () => {
  if (splitViewActive) deactivateSplitPanel();
  else { splitViewName = "event-timer"; activateSplitPanel(); }
});


function activateSplitPanel() {
  splitViewActive = true;
  splitPanel.classList.remove("hidden");
  btnSplitView.classList.add("active");
localStorage.setItem("gw2_split_view", splitViewName);
  updateSplitConflicts();
  renderSplitContent();
}

function deactivateSplitPanel() {
  if (currentView !== "event-timer") stopETTimer();
  splitViewActive = false;
  splitViewName   = null;
  splitPanel.classList.add("hidden");
  btnSplitView.classList.remove("active");
  splitPanelBody.innerHTML = "";
  localStorage.removeItem("gw2_split_view");
  updateSplitConflicts();
}

function updateSplitConflicts() {
  document.querySelectorAll(".nav-item[data-view]").forEach(item => {
    item.disabled = item.dataset.view === splitViewName;
  });
}

function renderSplitContent() {
  if (!splitViewActive) return;
  splitPanelBody.innerHTML = "";
  renderEventTimerView(splitPanelBody);
}

function _buildFavRows() {
  const cache = loadCache(), pm = getProgressMap();
  const itemNameMap = getItemNameMap(), titleNameMap = getTitleNameMap();
  return [...favoritesSet].flatMap(id => {
    const ach = cache[id];
    if (!ach) return [];
    const entry = pm?.[id] || {};
    const tiers = ach.tiers || [];
    const progress = entry.current || 0;
    const done     = entry.done    || false;
    const maxTier  = tiers[tiers.length - 1];
    const required = maxTier?.count ?? null;
    const pct = done ? 100 : required ? Math.min(100, Math.round((progress / required) * 1000) / 10) : null;
    const totalPts = ach.point_cap ?? tiers.reduce((s, tier) => s + (tier.points || 0), 0);
    return [{ id, name: ach.name, progress, required, percent: pct, done,
      rewardStr: formatRewards(ach.rewards || [], itemNameMap, titleNameMap, totalPts) }];
  });
}

function renderSplitNearlyCompleted(container) {
  let rows = lastNearlyDoneRows;
  if (!showHidden) rows = rows.filter(r => !hiddenSet.has(r.id));
  renderSplitTable(container, rows);
}

function renderSplitTable(container, rows) {
  if (!rows.length) {
    container.innerHTML = `<div class="daily-empty" style="padding:24px 16px;color:var(--muted);font-size:13px;text-align:center">No items</div>`;
    return;
  }
  const visible = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-pct">${t("thPct")}</th>
            <th class="col-prog">${t("thProgress")}</th>
            <th class="col-name">${t("thAchievement")}</th>
          </tr>
        </thead>
        <tbody>${visible.map(row => {
          const hasProgress = row.percent !== null && row.percent !== undefined;
          const pctCell = row.done
            ? `<span class="pct-done">✓</span>`
            : hasProgress
              ? `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
              : `<span class="pct-na">—</span>`;
          return `<tr class="${row.done ? "row-done" : ""}">
            <td class="col-pct">${pctCell}</td>
            <td class="col-prog">${buildProgCell(row)}</td>
            <td class="col-name"><button class="ach-row-btn" data-id="${row.id}">${row.name}</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
  container.querySelectorAll(".ach-row-btn").forEach(btn =>
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id))));
}

// ── Scale slider ──────────────────────────────────────────────────────────────

updateRangeFill(viewScaleSlider);

viewScaleSlider.addEventListener("input", () => {
  const pct = parseInt(viewScaleSlider.value);
  scaleLabel.textContent = pct + "%";
  document.documentElement.style.setProperty("--view-scale", pct / 100);
  localStorage.setItem("gw2_view_scale", pct);
  updateRangeFill(viewScaleSlider);
});

// ── Init ──────────────────────────────────────────────────────────────────────

initAchModal();
initEventTimer();

// ── Event soon modal ──────────────────────────────────────────────────────────

function openEventSoonModal(reminder) {
  document.getElementById("et-soon-header").textContent =
    "Event starting in ~" + reminder.minutesBefore + " min";
  document.getElementById("et-soon-name").textContent = reminder.eventName;
  document.getElementById("et-soon-row").textContent  = reminder.rowName ?? "";

  const copyBtn = document.getElementById("et-soon-copy");
  if (reminder.chatlink) {
    copyBtn.classList.remove("hidden");
    copyBtn.dataset.chatlink = reminder.chatlink;
  } else {
    copyBtn.classList.add("hidden");
  }

  openModal("et-soon-overlay");
}

document.getElementById("btn-et-soon-close-footer").addEventListener("click", () => closeModal("et-soon-overlay"));
document.getElementById("et-soon-overlay").addEventListener("click", e => {
  if (e.target.id === "et-soon-overlay") closeModal("et-soon-overlay");
});
document.getElementById("et-soon-copy").addEventListener("click", e => {
  const chatlink = e.currentTarget.dataset.chatlink;
  if (!chatlink) return;
  const span = e.currentTarget.querySelector("span");
  navigator.clipboard.writeText(chatlink).then(() => {
    span.textContent = "Copied!";
    setTimeout(() => { span.textContent = "Copy Location"; }, 2000);
  }).catch(() => {});
});

let _sidebarReminder = null;

function updateSidebarReminder(reminders) {
  const section = document.getElementById("sb-reminder");
  if (!reminders.length) {
    _sidebarReminder = null;
    section.classList.add("hidden");
    return;
  }

  const now = Date.now();
  const r = reminders.reduce((a, b) =>
    ((a.fireAt ?? Infinity) - now) < ((b.fireAt ?? Infinity) - now) ? a : b
  );

  _sidebarReminder = r;
  section.classList.remove("hidden");
  document.getElementById("sb-reminder-name").textContent = r.eventName;
  document.getElementById("sb-reminder-time").textContent = r.localFireTimeStr ?? "";
  document.getElementById("btn-sb-reminder-cancel").dataset.reminderId = r.id ?? "";

  const bar = document.getElementById("sb-reminder-bar");
  if (r.createdAt && r.fireAt && r.fireAt > r.createdAt) {
    const pct = Math.max(0, Math.min(100, (r.fireAt - now) / (r.fireAt - r.createdAt) * 100));
    bar.style.width = pct + "%";
  } else {
    bar.style.width = "100%";
  }
}

document.getElementById("btn-sb-reminder-cancel").addEventListener("click", () => {
  const id = document.getElementById("btn-sb-reminder-cancel").dataset.reminderId;
  if (id) removeReminder(id);
  _sidebarReminder = null;
  document.getElementById("sb-reminder").classList.add("hidden");
});

document.getElementById("sb-reminder-name").addEventListener("click", () => {
  if (_sidebarReminder) openEventModalForReminder(_sidebarReminder);
});

initNotifications(settings.notificationVolume ?? 0.5, openEventSoonModal, updateSidebarReminder);
setModalStateCallback((_achId, type) => {
  if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  if (currentView === "favorites")        renderFavoritesView();
  if (currentView === "browser" && activeCat) selectCategory(activeCat);
  if (currentView === "daily")            renderDailyViewWrapper();
  if (currentView === "weekly")           renderWeeklyViewWrapper();
});
setModalBackCallback(targetCat => {
  activeCat = targetCat;
  prepareTreeForCategory(targetCat.id);
  navigateTo("browser");
  if (browserInitialized) {
    browserTree.innerHTML = "";
    renderBrowserTree(browserTree, c => selectCategory(c));
    selectCategory(targetCat);
  }
});
initSearch(ach => openAchievementModal(ach, null, getEnName(ach.id, ach.name), getCategoryForAchievement(ach.id)));
checkSetup();
updateCacheInfo();

// ── Restore split view & scale ────────────────────────────────────────────────
const _savedScale = parseInt(localStorage.getItem("gw2_view_scale"));
if (_savedScale >= 50 && _savedScale <= 100) {
  viewScaleSlider.value = _savedScale;
  scaleLabel.textContent = _savedScale + "%";
  document.documentElement.style.setProperty("--view-scale", _savedScale / 100);
  updateRangeFill(viewScaleSlider);
}
if (localStorage.getItem("gw2_split_view") && currentView !== "event-timer") {
  splitViewName = "event-timer";
  activateSplitPanel();
}
if (settings.accounts.length) {
  accountDailyAp = _loadAccountDailyAp(activeApiKey());
  const cachedProgress = loadProgressCache(activeApiKey());
  if (cachedProgress) {
    initBrowserDataFromCache();
    setProgressMap(cachedProgress);
    setModalProgressMap(cachedProgress);
    const cachedRows = computeNearlyDone(cachedProgress, settings);
    lastNearlyDoneRows = cachedRows;
    lastResultCount = cachedRows.length;
    renderNearlyDoneRows(cachedRows);
    refreshApFrise(cachedProgress);
    if (currentView === "favorites") renderFavoritesView();
    if (currentView === "daily")     renderDailyViewWrapper();
    if (currentView === "weekly")    renderWeeklyViewWrapper();
  }
  applyAutoUpdate(settings.autoUpdateInterval ?? 0);
  doFetch();
}

}); // end DOMContentLoaded
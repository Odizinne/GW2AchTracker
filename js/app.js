import { validateApiKey, formatRewards }                   from "./api.js";
import { clearCache, loadCache, favoritesSet, hiddenSet, getItemNameMap, getTitleNameMap,
         toggleFavorite, toggleHidden, setCacheLang, reloadNameMaps,
         ensureStaticCache } from "./cache.js";
import { loadSettings, saveSettings }                      from "./settings.js";
import { PALETTES, applyPalette }                          from "./palettes.js";
import { ensureDefinitionCache, ensureRewardNames, fetchProgress, computeNearlyDone,
         resolveRewardNames, resetProgress, getProgressMap } from "./nearly-done.js";
import { ensureBrowserData, getCategoryRows, renderBrowserTree, setProgressMap,
         resetBrowserState, resetBrowserCache, recomputeCatDoneStates,
         showBrowserSkeleton } from "./browser.js";
import { SVG_EYE, SVG_EYE_OFF, SVG_TRASH, openModal, closeModal,
         showError, clearError, showView, pctClass, barColor, rewardHtml } from "./ui.js";
import { openAchievementModal, initAchModal, setModalProgressMap,
         setModalStateCallback } from "./ach-modal.js";
import { initSearch } from "./search.js";
import { setLang, getLang, t, applyI18n, achCountStr, resolveWikiUrl, LANGS } from "./i18n.js";

document.addEventListener("DOMContentLoaded", () => {

// ── State ─────────────────────────────────────────────────────────────────────

let settings           = loadSettings();
applyTheme(settings.theme);
// Bootstrap language
setCacheLang(settings.lang ?? "en");
reloadNameMaps();
setLang(settings.lang ?? "en");
applyI18n();

let currentView        = "favorites";
let browserInitialized = false;
let activeCat          = null;
let lastNearlyDoneRows = [];
let nearlyDoneFirstRender = true;
let lastResultCount = null;
let showHidden      = false;
let viewMode = settings.viewMode ?? "list";

// EN-name cache: id -> English name, populated during fetch so wiki links work
const enNameCache = {};

function activeApiKey() {
  const acc = settings.accounts[settings.activeAccount];
  return acc ? acc.apiKey : "";
}

function currentLang() { return settings.lang ?? "en"; }

// ── DOM refs ──────────────────────────────────────────────────────────────────

const accountSelect     = document.getElementById("account-select");
const btnRefresh        = document.getElementById("btn-refresh");
const btnSettings       = document.getElementById("btn-settings");
const btnGithub         = document.getElementById("btn-github");
const btnLegal          = document.getElementById("btn-legal");
const resultsBody       = document.getElementById("results-body");
const loadingBar        = document.getElementById("loading-bar");
const loadingBarFill    = document.getElementById("loading-bar-fill");
const viewSubtitle      = document.getElementById("view-subtitle");
const cacheInfo         = document.getElementById("cache-info");
const setupError        = document.getElementById("setup-error");
const accountsList      = document.getElementById("accounts-list");
const addAccountForm    = document.getElementById("add-account-form");
const newAccountError   = document.getElementById("new-account-error");
const browserTree       = document.getElementById("browser-tree");
const browserBody       = document.getElementById("browser-body");
const viewTitle         = document.getElementById("view-title");
const btnShowHidden     = document.getElementById("btn-show-hidden");
const favoritesBody     = document.getElementById("favorites-body");
const btnViewList       = document.getElementById("btn-view-list");
const btnViewTile       = document.getElementById("btn-view-tile");

btnViewList.classList.toggle("active", viewMode === "list");
btnViewTile.classList.toggle("active", viewMode === "tile");

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

function setLoadingProgress(fetched, total) {
  if (fetched === undefined || total === undefined || total === 0) {
    loadingBar.classList.remove("determinate");
    loadingBarFill.style.width = "";
    return;
  }
  const newPct = Math.round((fetched / total) * 100);
  const wasDeterminate = loadingBar.classList.contains("determinate");
  const currentPct = wasDeterminate ? (parseFloat(loadingBarFill.style.width) || 0) : 0;
  const goingUp = wasDeterminate && newPct > currentPct;

  if (!goingUp) {
    // Snap: override CSS transition, apply value, force reflow, then restore
    loadingBarFill.style.transition = "none";
    loadingBar.classList.add("determinate");
    loadingBarFill.style.width = newPct + "%";
    loadingBarFill.offsetWidth; // force reflow so the snap is committed
    loadingBarFill.style.transition = "";
  } else {
    loadingBar.classList.add("determinate");
    loadingBarFill.style.width = newPct + "%";
  }
}

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
  btnShowHidden.disabled = active;
  btnViewList.disabled = active;
  btnViewTile.disabled = active;
  document.getElementById("global-search-input").disabled = active;
  document.querySelectorAll(".nav-item").forEach(el => { el.disabled = active; });
  document.querySelectorAll(".sb-link").forEach(el => { el.disabled = active; });
  loadingBar.classList.toggle("hidden", !active);
  if (!active) setLoadingProgress();
  document.getElementById("sidebar").classList.toggle("fetching", active);
  document.getElementById("main-topbar").classList.toggle("fetching", active);
}

function setBrowserFetching(active) {
  loadingBar.classList.toggle("hidden", !active);
}

function updateCacheInfo() {
  const count = Object.keys(loadCache()).length;
  cacheInfo.textContent = count
    ? t("cacheEntries", { n: count })
    : t("cacheEmpty");
}

function updateSubtitle(count) {
  const acc  = settings.accounts[settings.activeAccount];
  const name = acc ? acc.name : "";
  viewSubtitle.textContent = count != null
    ? `${achCountStr(count)} · ${name}`
    : name;
}

// ── EN name tracking (needed for non-EN wiki URLs) ────────────────────────────

async function populateEnNameCache(ids) {
  if (currentLang() === "en") return; // not needed
  const missing = ids.filter(id => !(id in enNameCache));
  if (!missing.missing) {
    // fetch EN names in background, batched
    try {
      const { fetchInBatches } = await import("./api.js");
      const items = await fetchInBatches("/achievements", missing, null, 150, { lang: "en" });
      for (const a of items) enNameCache[a.id] = a.name;
    } catch { /* best effort */ }
  }
}

function getEnName(id, localName) {
  if (currentLang() === "en") return localName;
  return enNameCache[id] || localName;
}

// ── Open achievement (with EN name for wiki) ──────────────────────────────────

function openAchFromCache(id) {
  const cache = loadCache();
  const ach = cache[id];
  if (ach) openAchievementModal(ach, null, getEnName(id, ach.name));
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
  resetBrowserState();
  browserTree.innerHTML = "";
  document.querySelectorAll(".tile-grid").forEach(g => g.remove());
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyNearly")}</td></tr>`;
  favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">${t("emptyFavorites")}</td></tr>`;
  document.getElementById("view-nearly-completed").querySelector(".table-wrap").style.display = "";
  document.getElementById("view-favorites").querySelector(".table-wrap").style.display = "";
  document.getElementById("view-browser").querySelector(".table-wrap").style.display = "";
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
    const desc = ach?.description || ach?.requirement || "";

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

function attachTileListeners(grid) {
  grid.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id)));
  });
}

function renderTileView(viewEl, rows, opts = {}) {
  const { hideCompleted = false } = opts;
  const visible = hideCompleted ? rows.filter(r => !r.done || r.repeatable) : rows;
  viewEl.querySelector(".table-wrap").style.display = "none";
  let grid = viewEl.querySelector(".tile-grid");
  if (!grid) {
    grid = document.createElement("div");
    grid.className = "tile-grid";
    viewEl.appendChild(grid);
  }
  grid.innerHTML = buildTileHtml(visible) || `<div class="tile-empty">${t("emptyNearlyFilter")}</div>`;
  attachTileListeners(grid);
  return visible.length;
}

function renderListView(viewEl) {
  viewEl.querySelector(".table-wrap").style.display = "";
  viewEl.querySelector(".tile-grid")?.remove();
}

// ── View routing ──────────────────────────────────────────────────────────────

function navigateTo(name) {
  currentView = name;
  showView(name);
  browserTree.classList.toggle("hidden", name !== "browser");
  btnShowHidden.classList.toggle("hidden", name !== "nearly-completed");
  if (name === "nearly-completed") {
    viewTitle.textContent = t("titleNearly");
    updateSubtitle(lastResultCount);
  } else if (name === "browser") {
    viewTitle.textContent = t("titleBrowse");
    viewSubtitle.textContent = "";
    initBrowser();
  } else if (name === "favorites") {
    viewTitle.textContent = t("titleFavorites");
    renderFavoritesView();
  }
}

document.querySelectorAll(".nav-item[data-view]").forEach(item => {
  item.addEventListener("click", () => {
    if (!settings.accounts.length) return;
    navigateTo(item.dataset.view);
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
  saveSettings(settings);
  resetProgress();
  setProgressMap(null);
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
    navigateTo("favorites");
  }
}

// Setup language change (before account is saved)
document.getElementById("setup-lang-select")?.addEventListener("change", e => {
  const lang = e.target.value;
  settings.lang = lang;
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
    updateSubtitle(0);
    return;
  }

  updateSubtitle(visible.length);

  if (viewMode === "tile") {
    renderTileView(viewEl, visible, { isHiddenVisible: showHidden, hideCompleted: false });
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
  const lang = currentLang();
  if (!key) return;
  setFetching(true);
  if (currentView === "nearly-completed") setStatus("statusLoading");

  let definitionsFailed = false;
  try {
    const staticUpdated = await ensureStaticCache(lang, (...args) => setStatus(...args));
    if (staticUpdated) resetBrowserCache();
    await Promise.all([
      ensureDefinitionCache(
        (...args) => setStatus(...args),
        key,
        settings.fetchMode ?? "account-all",
        lang,
      ),
      ensureBrowserData((...args) => setStatus(...args), lang),
    ]);
    await ensureRewardNames((...args) => setStatus(...args), lang);
  } catch (e) {
    console.warn("Definition/browser data update failed, continuing with cache:", e);
    definitionsFailed = true;
  }

  // Populate EN name cache for non-EN languages
  if (lang !== "en") {
    const allIds = Object.keys(loadCache()).map(Number);
    try {
      const { fetchInBatches } = await import("./api.js");
      const enItems = await fetchInBatches("/achievements", allIds, null, 150, { lang: "en" });
      for (const a of enItems) enNameCache[a.id] = a.name;
    } catch { /* best effort */ }
  }

  let progressFailed = false;
  try {
    await fetchProgress(key);
  } catch (e) {
    console.warn("Progress fetch failed:", e);
    progressFailed = true;
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

  renderNearlyDoneRows(rows);
  if (currentView === "favorites") renderFavoritesView();
  if (currentView === "browser" && activeCat) selectCategory(activeCat);

  if (definitionsFailed && currentView === "nearly-completed") {
    viewSubtitle.textContent += " " + t("statusStale");
  }

  updateCacheInfo();
  setFetching(false);
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
    const browseRows   = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
    const visibleCount = renderTileView(viewEl, browseRows, { hideCompleted: false });
    viewSubtitle.textContent = achCountStr(visibleCount);
  } else {
    if (changed) {
      browserBody.classList.remove("fade-in");
      void browserBody.offsetWidth;
    }
    renderListView(viewEl);
    const visibleCount = renderBrowserRows(rows);
    viewSubtitle.textContent = achCountStr(visibleCount);
    if (changed) browserBody.classList.add("fade-in");
  }

  updateCacheInfo();
}

function renderBrowserRows(rows) {
  const visible = settings.hideCompleted
    ? rows.filter(r => !r.done)
    : rows;

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
    btn.addEventListener("click", () => openAchFromCache(Number(btn.dataset.id)));
  });
  attachActionListeners(browserBody, () => {
    if (activeCat) selectCategory(activeCat);
  });

  return visible.length;
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

const SETTINGS_TAB_ORDER = ['api', 'ui', 'view'];
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
  document.getElementById("s-hide-completed").checked        = settings.hideCompleted;
  document.getElementById("s-clear-fav-completed").checked   = settings.clearCompletedFavorites ?? false;
  paletteSelect.value = settings.accentPalette ?? "orange";
  document.getElementById("s-light-mode").checked            = settings.theme === "light";
  buildLangOptions(document.getElementById("s-lang"), currentLang());
  addAccountForm.classList.add("hidden");
  clearError(newAccountError);
  document.getElementById("new-account-name").value = "";
  document.getElementById("new-account-key").value  = "";
  document.getElementById("new-account-key").type   = "password";
  document.querySelector('[data-target="new-account-key"]').innerHTML = SVG_EYE;
  renderAccountsList();
  updateCacheInfo();
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

document.getElementById("btn-settings-save").addEventListener("click", () => {
  const prevFetchMode = settings.fetchMode ?? "account-all";
  const prevLang      = settings.lang ?? "en";

  settings.maxResults    = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct  = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.useFinalTier  = document.getElementById("s-tier").value === "last";
  settings.fetchMode     = document.getElementById("s-fetch-mode").value;
  settings.hideCompleted           = document.getElementById("s-hide-completed").checked;
  settings.clearCompletedFavorites = document.getElementById("s-clear-fav-completed").checked;
  settings.accentPalette           = paletteSelect.value;
  settings.theme                   = document.getElementById("s-light-mode").checked ? "light" : "dark";
  settings.lang                    = document.getElementById("s-lang").value;
  applyTheme(settings.theme);
  saveSettings(settings);

  const fetchModeChanged = settings.fetchMode !== prevFetchMode;
  const langChanged      = settings.lang !== prevLang;

  closeModal("settings-overlay");

  if (langChanged || fetchModeChanged) {
    // Apply new language immediately
    setCacheLang(settings.lang);
    reloadNameMaps();
    setLang(settings.lang);
    applyI18n();
    // Rebuild dynamic UI text
    if (currentView === "nearly-completed") viewTitle.textContent = t("titleNearly");
    else if (currentView === "favorites")   viewTitle.textContent = t("titleFavorites");
    else if (currentView === "browser")     viewTitle.textContent = t("titleBrowse");
    // Clear all cached data and refetch in new language
    resetAllCachedState();
    doFetch();
  } else {
    recomputeCatDoneStates(settings.hideCompleted, settings.fetchMode);
    if (currentView === "browser" && activeCat) selectCategory(activeCat);
    if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  }
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

["settings-overlay", "legal-overlay"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target.id === id) closeModal(id);
  });
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

// ── Show hidden toggle ────────────────────────────────────────────────────────

btnShowHidden.addEventListener("click", () => {
  showHidden = !showHidden;
  btnShowHidden.classList.toggle("active", showHidden);
  renderNearlyDoneRows(lastNearlyDoneRows);
});

// ── Init ──────────────────────────────────────────────────────────────────────

initAchModal();
setModalStateCallback((_achId, type) => {
  if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  if (currentView === "favorites")        renderFavoritesView();
  if (currentView === "browser" && activeCat) selectCategory(activeCat);
});
initSearch(ach => openAchievementModal(ach, null, getEnName(ach.id, ach.name)));
checkSetup();
updateCacheInfo();
if (settings.accounts.length) doFetch();

}); // end DOMContentLoaded
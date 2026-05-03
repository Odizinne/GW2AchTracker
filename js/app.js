import { validateApiKey, formatRewards }                   from "./api.js";
import { clearCache, loadCache, favoritesSet, hiddenSet, getItemNameMap, getTitleNameMap, toggleFavorite, toggleHidden } from "./cache.js";
import { loadSettings, saveSettings }                      from "./settings.js";
import { ensureDefinitionCache, ensureRewardNames, fetchProgress, computeNearlyDone, resolveRewardNames, resetProgress, getProgressMap } from "./nearly-done.js";
import {
  ensureBrowserData,
  getCategoryRows,
  renderBrowserTree,
  setProgressMap,
  resetBrowserState,
  resetBrowserCache,
  recomputeCatDoneStates,
  showBrowserSkeleton,
} from "./browser.js";
import {
  SVG_EYE, SVG_EYE_OFF, SVG_TRASH,
  openModal, closeModal,
  showError, clearError,
  showView, pctClass, barColor, rewardHtml,
} from "./ui.js";
import { openAchievementModal, initAchModal, setModalProgressMap, setModalStateCallback } from "./ach-modal.js";
import { initSearch } from "./search.js";

document.addEventListener("DOMContentLoaded", () => {

// ── State ─────────────────────────────────────────────────────────────────────

let settings           = loadSettings();
applyTheme(settings.theme);
let currentView        = "favorites";
let browserInitialized = false;
let activeCat          = null;
let lastNearlyDoneRows = [];
let nearlyDoneFirstRender = true;
let lastResultCount = null;
let showHidden      = false;
let viewMode = settings.viewMode ?? "list";

function activeApiKey() {
  const acc = settings.accounts[settings.activeAccount];
  return acc ? acc.apiKey : "";
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const accountSelect     = document.getElementById("account-select");
const btnRefresh        = document.getElementById("btn-refresh");
const btnSettings       = document.getElementById("btn-settings");
const btnGithub         = document.getElementById("btn-github");
const btnLegal          = document.getElementById("btn-legal");
const resultsBody       = document.getElementById("results-body");
const loadingBar        = document.getElementById("loading-bar");
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg) {
  if (currentView === "nearly-completed" || currentView === "favorites") {
    viewSubtitle.textContent = msg || "";
  }
}

function setBrowserStatus(msg) {
  if (currentView === "browser") {
    viewSubtitle.textContent = msg || "";
  }
}

function setFetching(active) {
  btnRefresh.disabled = active || !settings.accounts.length;
  accountSelect.disabled = active;
  document.querySelectorAll(".nav-item").forEach(el => { el.disabled = active; });
  loadingBar.classList.toggle("hidden", !active);
}

function setBrowserFetching(active) {
  loadingBar.classList.toggle("hidden", !active);
}

function updateCacheInfo() {
  const count = Object.keys(loadCache()).length;
  cacheInfo.textContent = count ? `${count} entries cached` : "Cache is empty";
}

function updateSubtitle(count) {
  const acc  = settings.accounts[settings.activeAccount];
  const name = acc ? acc.name : "";
  viewSubtitle.textContent = count != null
    ? `${count} achievement${count !== 1 ? "s" : ""} · ${name}`
    : name;
}

function openAchFromCache(id) {
  const cache = loadCache();
  const ach = cache[id];
  if (ach) openAchievementModal(ach, null);
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// ── Progress cell helper ──────────────────────────────────────────────────────
// Always renders a .prog-wrap so every row is the same height.
// When there is no bar to show it renders one with visibility:hidden.

function buildProgCell(row) {
  const hasProgress = row.percent !== null && row.percent !== undefined;
  const fillPct     = hasProgress ? Math.min(100, row.percent) : 0;

  if (row.done) {
    return `<div class="prog-wrap">
      <span>Completed</span>
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
  resetBrowserCache();
  browserInitialized = false;
  activeCat = null;
  lastNearlyDoneRows = [];
  lastResultCount = null;
  nearlyDoneFirstRender = true;
  resetBrowserState();
  browserTree.innerHTML = "";
  document.querySelectorAll(".tile-grid").forEach(g => g.remove());
  resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">Press <strong>Update</strong> to load your achievements.</td></tr>`;
  favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">No favorites yet — open an achievement and click ★ to pin it here.</td></tr>`;
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
  const wikiUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(achName.replace(/ /g, "_"))}`;
  return `
    <button class="row-action-btn row-fav-btn ${isFav ? "active" : ""}" data-id="${id}" title="Favorite">${SVG_STAR}</button>
    <button class="row-action-btn row-hide-btn ${isHid ? "active" : ""}" data-id="${id}" title="Hide">${SVG_HIDE}</button>
    <a class="row-action-btn" href="${wikiUrl}" target="_blank" rel="noopener" title="Wiki">${SVG_WIKI}</a>`;
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
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
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
  grid.innerHTML = buildTileHtml(visible) || `<div class="tile-empty">No achievements matched the current filters.</div>`;
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
    viewTitle.textContent = "Nearly completed";
    updateSubtitle(lastResultCount);
  } else if (name === "browser") {
    viewTitle.textContent = "Browse";
    viewSubtitle.textContent = "";
    initBrowser();
  } else if (name === "favorites") {
    viewTitle.textContent = "Favorites";
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
  if (!settings.accounts.length) {
    showView("setup");
    browserTree.classList.add("hidden");
  } else {
    navigateTo("favorites");
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
    navigateTo("nearly-completed");
    doFetch();
  } catch {
    showError(setupError, "Invalid API key. Make sure account and progression permissions are enabled.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & continue";
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
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">No favorites yet — open an achievement and click ★ to pin it here.</td></tr>`;
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
    const totalPts = ach.point_cap ?? tiers.reduce((s, t) => s + (t.points || 0), 0);
    return [{ id, name: ach.name, progress, required, percent: pct, done,
      rewardStr: formatRewards(ach.rewards || [], itemNameMap, titleNameMap, totalPts) }];
  });

  if (!rows.length) {
    renderListView(viewEl);
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="5">Achievement data not loaded — press Update first.</td></tr>`;
    return;
  }

  if (viewMode === "tile") {
    const visibleCount = renderTileView(viewEl, rows, { hideCompleted: settings.hideCompleted });
    viewSubtitle.textContent = `${visibleCount} achievement${visibleCount !== 1 ? "s" : ""}`;
    return;
  }

  renderListView(viewEl);

  const visible = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
  viewSubtitle.textContent = `${visible.length} achievement${visible.length !== 1 ? "s" : ""}`;

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
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
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
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">No achievements matched the current filters.</td></tr>`;
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
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
  });
  attachActionListeners(resultsBody, (_id, type) => {
    if (type === "hidden") renderNearlyDoneRows(lastNearlyDoneRows);
    else if (type === "favorite") renderFavoritesView();
  });
}

async function doFetch() {
  const key = activeApiKey();
  if (!key) return;
  setFetching(true);
  if (currentView === "nearly-completed") setStatus("Loading…");

  let definitionsFailed = false;
  try {
    await Promise.all([
      ensureDefinitionCache(msg => setStatus(msg), key, settings.fetchAccountOnly !== false),
      ensureBrowserData(msg => setStatus(msg)),
    ]);
    await ensureRewardNames(msg => setStatus(msg));
  } catch (e) {
    console.warn("Definition/browser data update failed, continuing with cache:", e);
    definitionsFailed = true;
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
      resultsBody.innerHTML = `<tr class="empty-row"><td colspan="5">Could not fetch progress — check your API key and connection, then try again.</td></tr>`;
    }
    setFetching(false);
    updateCacheInfo();
    return;
  }

  const rows = computeNearlyDone(getProgressMap(), settings);
  lastNearlyDoneRows = rows;
  lastResultCount = rows.length;

  try {
    await resolveRewardNames(rows, key);
  } catch (e) {
    console.warn("Reward name resolution failed (reward labels may be incomplete):", e);
  }

  setProgressMap(getProgressMap());
  setModalProgressMap(getProgressMap());
  recomputeCatDoneStates(settings.hideCompleted);

  if (browserInitialized) {
    browserTree.innerHTML = "";
    renderBrowserTree(browserTree, cat => selectCategory(cat));
    recomputeCatDoneStates(settings.hideCompleted);
  }

  renderNearlyDoneRows(rows);
  if (currentView === "favorites") renderFavoritesView();
  if (currentView === "browser" && activeCat) selectCategory(activeCat);

  if (definitionsFailed && currentView === "nearly-completed") {
    viewSubtitle.textContent += " · definitions may be stale";
  }

  updateCacheInfo();
  setFetching(false);
}

btnRefresh.addEventListener("click", () => { doFetch(); });

// ── Browser ───────────────────────────────────────────────────────────────────

async function initBrowser(forceRefresh = false) {
  if (browserInitialized && !forceRefresh) return;

  setBrowserFetching(true);
  setBrowserStatus("Loading achievement tree…");

  try {
    await ensureBrowserData(msg => setBrowserStatus(msg));

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
    recomputeCatDoneStates(settings.hideCompleted);
    browserInitialized = true;
    setBrowserStatus("");

    if (activeCat) {
      selectCategory(activeCat);
    } else {
      viewTitle.textContent    = "Browse achievements";
      viewSubtitle.textContent = "Select a category from the sidebar";
      browserBody.innerHTML = `<tr class="empty-row"><td colspan="5">Select a category from the sidebar to browse.</td></tr>`;
    }
  } catch (e) {
    setBrowserStatus("Failed to load: " + e.message);
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
    viewSubtitle.textContent = "Loading…";
    return;
  }

  if (viewMode === "tile") {
    const visibleCount = renderTileView(viewEl, rows, { hideCompleted: settings.hideCompleted });
    viewSubtitle.textContent = `${visibleCount} achievement${visibleCount !== 1 ? "s" : ""}`;
  } else {
    if (changed) {
      browserBody.classList.remove("fade-in");
      void browserBody.offsetWidth;
    }
    renderListView(viewEl);
    const visibleCount = renderBrowserRows(rows);
    viewSubtitle.textContent = `${visibleCount} achievement${visibleCount !== 1 ? "s" : ""}`;
    if (changed) browserBody.classList.add("fade-in");
  }

  updateCacheInfo();
}

function renderBrowserRows(rows) {
  const visible = settings.hideCompleted
    ? rows.filter(r => !r.done || r.repeatable)
    : rows;

  if (!visible.length) {
    browserBody.innerHTML = `<tr class="empty-row"><td colspan="5">No achievements in this category.</td></tr>`;
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
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
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

btnSettings.addEventListener("click", () => {
  document.getElementById("s-maxresults").value           = settings.maxResults;
  document.getElementById("s-threshold").value            = settings.thresholdPct;
  document.getElementById("s-tier").value                 = settings.useFinalTier ? "last" : "next";
  document.getElementById("s-hide-completed").checked     = settings.hideCompleted;
  document.getElementById("s-fetch-account-only").checked = settings.fetchAccountOnly !== false;
  document.getElementById("s-light-mode").checked         = settings.theme === "light";
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
  btn.disabled = true; btn.textContent = "Validating…";
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
    btn.disabled = false; btn.textContent = "Save account";
  }
});

document.getElementById("btn-settings-close").addEventListener("click",  () => closeModal("settings-overlay"));
document.getElementById("btn-settings-cancel").addEventListener("click", () => closeModal("settings-overlay"));

document.getElementById("btn-settings-save").addEventListener("click", () => {
  const prevFetchAccountOnly = settings.fetchAccountOnly;

  settings.maxResults       = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct     = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.useFinalTier     = document.getElementById("s-tier").value === "last";
  settings.hideCompleted    = document.getElementById("s-hide-completed").checked;
  settings.fetchAccountOnly = document.getElementById("s-fetch-account-only").checked;
  settings.theme            = document.getElementById("s-light-mode").checked ? "light" : "dark";
  applyTheme(settings.theme);
  saveSettings(settings);

  const fetchModeChanged = settings.fetchAccountOnly !== prevFetchAccountOnly;

  recomputeCatDoneStates(settings.hideCompleted);
  if (!fetchModeChanged) {
    if (currentView === "browser" && activeCat) selectCategory(activeCat);
    if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  }
  closeModal("settings-overlay");

  if (fetchModeChanged) {
    resetAllCachedState();
    doFetch();
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
initSearch(ach => openAchievementModal(ach, null));
checkSetup();
updateCacheInfo();
if (settings.accounts.length) doFetch();

}); // end DOMContentLoaded
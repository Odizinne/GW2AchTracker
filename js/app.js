import { validateApiKey, formatRewards }                   from "./api.js";
import { clearCache, loadCache, favoritesSet, hiddenSet, persistentItemNameMap, persistentTitleNameMap } from "./cache.js";
import { loadSettings, saveSettings }                      from "./settings.js";
import { ensureDefinitionCache, ensureRewardNames, fetchProgress, computeNearlyDone, resolveRewardNames, resetProgress, getProgressMap } from "./nearly-done.js";
import {
  ensureBrowserData,
  getCategoryRows,
  renderBrowserTree,
  setProgressMap,
  resetBrowserState,
  recomputeCatDoneStates,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg)        {}
function setBrowserStatus(msg) {}

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
  const cache = loadCache();
  const pm    = getProgressMap();
  const ids   = [...favoritesSet];

  if (!ids.length) {
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="4">No favorites yet — open an achievement and click ★ to pin it here.</td></tr>`;
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
      rewardStr: formatRewards(ach.rewards || [], persistentItemNameMap, persistentTitleNameMap, totalPts) }];
  });

  if (!rows.length) {
    favoritesBody.innerHTML = `<tr class="empty-row"><td colspan="4">Achievement data not loaded — press Update first.</td></tr>`;
    return;
  }

  favoritesBody.innerHTML = rows.map(row => {
    const hasProgress = row.percent !== null;
    const fillPct     = hasProgress ? Math.min(100, row.percent) : 0;
    const pctCell  = row.done
      ? `<span class="pct-done">✓</span>`
      : hasProgress ? `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
      : `<span class="pct-na">—</span>`;
    const progCell = row.done
      ? `<span class="muted">Completed</span>`
      : hasProgress && row.required
        ? `<div class="prog-wrap"><span>${row.progress}/${row.required}</span>
             <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent)}"></div></div>
           </div>`
        : `<span class="muted">—</span>`;
    return `<tr class="${row.done ? "row-done" : ""}">
      <td class="col-pct">${pctCell}</td>
      <td class="col-prog">${progCell}</td>
      <td class="col-name"><button class="ach-row-btn" data-id="${row.id}">${row.name}</button></td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
    </tr>`;
  }).join("");

  viewSubtitle.textContent = `${rows.length} achievement${rows.length !== 1 ? "s" : ""}`;
  favoritesBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
  });
}

// ── Nearly completed ──────────────────────────────────────────────────────────

function renderNearlyDoneRows(rows) {
  let visible = settings.hideCompleted ? rows.filter(r => r.percent < 100) : rows;
  if (!showHidden) visible = visible.filter(r => !hiddenSet.has(r.id));
  if (!visible.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements matched the current filters.</td></tr>`;
    return;
  }
  if (nearlyDoneFirstRender) {
    resultsBody.classList.remove("fade-in");
    void resultsBody.offsetWidth;
    resultsBody.classList.add("fade-in");
    nearlyDoneFirstRender = false;
  }
  resultsBody.innerHTML = visible.map(row => {
    const pct     = row.percent.toFixed(1);
    const fillPct = Math.min(100, row.percent);
    return `<tr class="${hiddenSet.has(row.id) ? "row-hidden" : ""}">
      <td class="col-pct ${pctClass(row.percent)}">${pct}%</td>
      <td class="col-prog">
        <div class="prog-wrap">
          <span>${row.progress}/${row.required}</span>
          <div class="prog-bar-bg">
            <div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent)}"></div>
          </div>
        </div>
      </td>
      <td class="col-name">
        <button class="ach-row-btn" data-id="${row.id}">${row.name}</button>
      </td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
    </tr>`;
  }).join("");
  resultsBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
  });
}

async function doFetch() {
  const key = activeApiKey();
  if (!key) return;
  setFetching(true);
  if (currentView === "nearly-completed") updateSubtitle(null);
  try {
    try {
      await ensureDefinitionCache(msg => setStatus(msg));
      await ensureRewardNames(msg => setStatus(msg));
    } catch (e) {
      console.warn("Cache update failed, proceeding with existing data:", e);
    }
    await fetchProgress(key);
    const rows = computeNearlyDone(getProgressMap(), settings);
    lastNearlyDoneRows = rows;
    lastResultCount = rows.length;
    await resolveRewardNames(rows, key);
    setProgressMap(getProgressMap());
    setModalProgressMap(getProgressMap());
    recomputeCatDoneStates(settings.hideCompleted);
    renderNearlyDoneRows(rows);
    if (currentView === "nearly-completed") updateSubtitle(rows.length);
    if (currentView === "favorites")        renderFavoritesView();
    updateCacheInfo();
    if (currentView === "browser" && activeCat) selectCategory(activeCat);
  } catch (e) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Error — check your API key and try again.</td></tr>`;
  } finally {
    setFetching(false);
  }
}

btnRefresh.addEventListener("click", () => {
  doFetch();
});

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
      browserBody.innerHTML = `<tr class="empty-row"><td colspan="4">Select a category from the sidebar to browse.</td></tr>`;
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
  viewTitle.textContent    = cat.name;
  viewSubtitle.textContent = "";

  const rows = getCategoryRows(cat.id);
  if (changed) {
    browserBody.classList.remove("fade-in");
    void browserBody.offsetWidth;
  }
  browserBody.innerHTML = "";
  renderBrowserRows(rows);
  if (changed) browserBody.classList.add("fade-in");
  viewSubtitle.textContent = `${rows.length} achievement${rows.length !== 1 ? "s" : ""}`;
  updateCacheInfo();
}

function renderBrowserRows(rows) {
  const visible = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
  if (!visible.length) {
    browserBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements in this category.</td></tr>`;
    return;
  }

  browserBody.innerHTML = visible.map(row => {
    const hasProgress = row.percent !== null;
    const fillPct     = hasProgress ? Math.min(100, row.percent) : 0;

    const pctCell = row.done
      ? `<span class="pct-done">✓</span>`
      : hasProgress
        ? `<span class="${pctClass(row.percent)}">${row.percent.toFixed(1)}%</span>`
        : `<span class="pct-na">—</span>`;

    const progCell = row.done
      ? `<span class="muted">Completed</span>`
      : hasProgress && row.required
        ? `<div class="prog-wrap">
             <span>${row.progress}/${row.required}</span>
             <div class="prog-bar-bg">
               <div class="prog-bar-fill" style="width:${fillPct}%;background:${barColor(row.percent)}"></div>
             </div>
           </div>`
        : `<span class="muted">—</span>`;

    return `<tr class="${row.done ? "row-done" : ""}">
      <td class="col-pct">${pctCell}</td>
      <td class="col-prog">${progCell}</td>
      <td class="col-name">
        <button class="ach-row-btn" data-id="${row.id}">${row.name}</button>
      </td>
      <td class="col-reward" title="${row.rewardStr}">${rewardHtml(row.rewardStr)}</td>
    </tr>`;
  }).join("");

  browserBody.querySelectorAll(".ach-row-btn").forEach(btn => {
    btn.addEventListener("click", () => openAchFromCache(btn.dataset.id));
  });
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
  document.getElementById("s-maxresults").value    = settings.maxResults;
  document.getElementById("s-threshold").value     = settings.thresholdPct;
  document.getElementById("s-tier").value          = settings.useFinalTier ? "last" : "next";
  document.getElementById("s-hide-completed").checked = settings.hideCompleted;
  document.getElementById("s-light-mode").checked = settings.theme === "light";
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
  settings.maxResults    = Math.max(1, parseInt(document.getElementById("s-maxresults").value) || 40);
  settings.thresholdPct  = Math.min(100, Math.max(1, parseInt(document.getElementById("s-threshold").value) || 80));
  settings.useFinalTier  = document.getElementById("s-tier").value === "last";
  settings.hideCompleted = document.getElementById("s-hide-completed").checked;
  settings.theme = document.getElementById("s-light-mode").checked ? "light" : "dark";
  applyTheme(settings.theme);
  saveSettings(settings);
  recomputeCatDoneStates(settings.hideCompleted);
  if (currentView === "browser" && activeCat) selectCategory(activeCat);
  if (currentView === "nearly-completed") renderNearlyDoneRows(lastNearlyDoneRows);
  closeModal("settings-overlay");
});

document.getElementById("btn-cache-clear").addEventListener("click", () => {
  clearCache();
  browserInitialized = false;
  activeCat = null;
  resetBrowserState();
  browserTree.innerHTML = "";
  updateCacheInfo();
  setStatus("Cache cleared.");
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
});
initSearch(ach => openAchievementModal(ach, null));
checkSetup();
updateCacheInfo();
if (settings.accounts.length) doFetch();

}); // end DOMContentLoaded
import { validateApiKey }                                  from "./api.js";
import { clearCache, loadCache }                           from "./cache.js";
import { loadSettings, saveSettings }                      from "./settings.js";
import { fetchNearlyDone, resetProgress, getProgressMap }  from "./nearly-done.js";
import {
  ensureBrowserData,
  loadCategoryAchievements,
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
import { openAchievementModal, initAchModal, setModalProgressMap } from "./ach-modal.js";
import { initSearch } from "./search.js";

document.addEventListener("DOMContentLoaded", () => {

// ── State ─────────────────────────────────────────────────────────────────────

let settings           = loadSettings();
let currentView        = "nearly-completed";
let browserInitialized = false;
let activeCat          = null;
let lastNearlyDoneRows = [];

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
const statusText        = document.getElementById("status-text");
const pageSpinner       = document.getElementById("page-spinner");
const viewSubtitle      = document.getElementById("view-subtitle");
const cacheInfo         = document.getElementById("cache-info");
const setupError        = document.getElementById("setup-error");
const accountsList      = document.getElementById("accounts-list");
const addAccountForm    = document.getElementById("add-account-form");
const newAccountError   = document.getElementById("new-account-error");
const browserTree       = document.getElementById("browser-tree");
const browserBody       = document.getElementById("browser-body");
const browserTitle      = document.getElementById("browser-cat-title");
const browserSubtitle   = document.getElementById("browser-cat-subtitle");
const browserSpinner    = document.getElementById("browser-spinner");
const browserStatusText = document.getElementById("browser-status-text");
const viewTitle         = document.getElementById("view-title");

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg)        { statusText.textContent = msg; }
function setBrowserStatus(msg) { browserStatusText.textContent = msg; }

function setFetching(active) {
  btnRefresh.disabled = active || !settings.accounts.length;
  pageSpinner.classList.toggle("hidden", !active);
}

function setBrowserFetching(active) {
  browserSpinner.classList.toggle("hidden", !active);
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

// ── View routing ──────────────────────────────────────────────────────────────

function navigateTo(name) {
  currentView = name;
  showView(name);
  browserTree.classList.toggle("hidden", name !== "browser");
  // Update topbar title for nearly-completed; browser has its own sub-header
  if (name === "nearly-completed") {
    viewTitle.textContent = "Nearly completed";
  } else if (name === "browser") {
    viewTitle.textContent = "Browse";
    viewSubtitle.textContent = "";
    initBrowser();
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
    navigateTo("nearly-completed");
    doFetch();
  } catch {
    showError(setupError, "Invalid API key. Make sure account and progression permissions are enabled.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & continue";
  }
});

// ── Nearly completed ──────────────────────────────────────────────────────────

function renderNearlyDoneRows(rows) {
  const visible = settings.hideCompleted ? rows.filter(r => r.percent < 100) : rows;
  if (!visible.length) {
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements matched the current filters.</td></tr>`;
    return;
  }
  resultsBody.classList.remove("fade-in");
  void resultsBody.offsetWidth;
  resultsBody.innerHTML = visible.map(row => {
    const pct     = row.percent.toFixed(1);
    const fillPct = Math.min(100, row.percent);
    return `<tr>
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
  resultsBody.classList.add("fade-in");
}

async function doFetch() {
  const key = activeApiKey();
  if (!key) return;
  setFetching(true);
  updateSubtitle(null);
  resultsBody.innerHTML = "";
  try {
    const rows = await fetchNearlyDone(key, settings, msg => setStatus(msg));
    lastNearlyDoneRows = rows;
    setProgressMap(getProgressMap());
    setModalProgressMap(getProgressMap());
    recomputeCatDoneStates(settings.hideCompleted);
    renderNearlyDoneRows(rows);
    setStatus(`Loaded ${rows.length} achievements.`);
    updateSubtitle(rows.length);
    updateCacheInfo();

    if (currentView === "browser" && activeCat) {
      selectCategory(activeCat);
    }
  } catch (e) {
    setStatus(e.message);
    resultsBody.innerHTML = `<tr class="empty-row"><td colspan="4">Error — check your API key and try again.</td></tr>`;
  } finally {
    setFetching(false);
  }
}

btnRefresh.addEventListener("click", () => {
  resetProgress();
  setProgressMap(null);
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
        setBrowserStatus("Fetching account progression…");
        await fetchNearlyDone(key, settings, () => {});
        setProgressMap(getProgressMap());
        setModalProgressMap(getProgressMap());
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
      browserTitle.textContent    = "Browse achievements";
      browserSubtitle.textContent = "Select a category from the sidebar";
      browserBody.innerHTML = `<tr class="empty-row"><td colspan="4">Select a category from the sidebar to browse.</td></tr>`;
    }
  } catch (e) {
    setBrowserStatus("Failed to load: " + e.message);
  } finally {
    setBrowserFetching(false);
  }
}

async function selectCategory(cat) {
  activeCat = cat;
  browserTitle.textContent    = cat.name;
  browserSubtitle.textContent = "";
  browserBody.innerHTML       = "";
  setBrowserFetching(true);
  setBrowserStatus("Loading achievements…");

  try {
    const key  = activeApiKey();
    const rows = await loadCategoryAchievements(cat.id, key, msg => setBrowserStatus(msg));
    renderBrowserRows(rows);
    browserSubtitle.textContent = `${rows.length} achievement${rows.length !== 1 ? "s" : ""}`;
    setBrowserStatus("");
    updateCacheInfo();
  } catch (e) {
    setBrowserStatus("Error: " + e.message);
  } finally {
    setBrowserFetching(false);
  }
}

function renderBrowserRows(rows) {
  const visible = settings.hideCompleted ? rows.filter(r => !r.done) : rows;
  if (!visible.length) {
    browserBody.innerHTML = `<tr class="empty-row"><td colspan="4">No achievements in this category.</td></tr>`;
    return;
  }

  browserBody.classList.remove("fade-in");
  void browserBody.offsetWidth;

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

  browserBody.classList.add("fade-in");
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

// ── Init ──────────────────────────────────────────────────────────────────────

initAchModal();
initSearch(ach => openAchievementModal(ach, null));
checkSetup();
updateCacheInfo();
if (settings.accounts.length) doFetch();

}); // end DOMContentLoaded
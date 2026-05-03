import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import {
  loadCache, saveCache,
  loadGroupsCache, saveGroupsCache,
  loadCategoriesCache, saveCategoriesCache,
  persistentItemNameMap, persistentTitleNameMap,
  saveItemNamesCache, saveTitleNamesCache,
} from "./cache.js";

// ── State ─────────────────────────────────────────────────────────────────────

let groups         = null;
let categories     = null;
let expandedGroups = new Set();
let activeCatId    = null;
let progressMap    = null;

const catDoneMap = {};

export function setProgressMap(map) { progressMap = map; }

// ── Data loading ──────────────────────────────────────────────────────────────

export async function ensureBrowserData(onStatus) {
  if (groups && categories) return;

  const cg = loadGroupsCache();
  const cc = loadCategoriesCache();

  if (cg && cc) {
    groups     = cg;
    categories = cc;
  } else {
    onStatus("Fetching achievement categories…");
    const [rawGroups, rawCats] = await Promise.all([
      apiFetch("/achievements/groups",     { ids: "all", lang: "en" }),
      apiFetch("/achievements/categories", { ids: "all", lang: "en" }),
    ]);

    categories = {};
    for (const c of rawCats) categories[c.id] = c;

    groups = rawGroups
      .filter(g => g.categories && g.categories.length)
      .sort((a, b) => a.order - b.order);

    saveGroupsCache(groups);
    saveCategoriesCache(categories);
  }

  const missingIds = [...new Set(
    groups.flatMap(g => g.categories || []).filter(id => !categories[id])
  )];
  if (missingIds.length) {
    const extra = await fetchInBatches("/achievements/categories", missingIds, null, 150, { lang: "en" });
    for (const c of extra) categories[c.id] = c;
    saveCategoriesCache(categories);
  }
}

function _isRepeatable(ach) {
  return (ach?.flags || []).some(f => f === "Daily" || f === "Weekly" || f === "Repeatable");
}

function _isPermanentlyDone(ach, progressEntry) {
  if (!ach) return false;
  if (_isRepeatable(ach)) return false;
  return progressEntry?.done === true;
}

function _buildRows(categoryId) {
  const cat = categories?.[categoryId];
  if (!cat || !cat.achievements?.length) return [];

  const cache = loadCache();
  const rows  = [];

  for (const id of cat.achievements) {
    const ach = cache[id];
    if (!ach) continue;

    const repeatable = _isRepeatable(ach);
    const entry      = progressMap?.[id] || {};
    const tiers      = ach.tiers || [];
    const progress   = entry.current || 0;
    const done       = entry.done    || false;
    const maxTier    = tiers[tiers.length - 1];
    const required   = maxTier?.count ?? null;
    const percent    = done
      ? 100
      : required
        ? Math.min(100, Math.round((progress / required) * 1000) / 10)
        : null;

    rows.push({
      id, name: ach.name,
      progress, required, percent, done,
      repeatable,
      rewards:   ach.rewards || [],
      points:    ach.point_cap ?? ach.tiers?.reduce((s, t) => s + (t.points || 0), 0) ?? 0,
      rewardStr: "",
    });
  }

  for (const row of rows) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  if (progressMap) {
    const nonRepeatables = cat.achievements.filter(id => {
      const ach = cache[id];
      return ach && !_isRepeatable(ach);
    });

    const allDone = nonRepeatables.length > 0 && nonRepeatables.every(id => {
      return progressMap[id]?.done === true;
    });

    catDoneMap[categoryId] = allDone;

    const btn = document.querySelector(`.browser-cat-item[data-cat-id="${categoryId}"]`);
    if (btn) {
      btn.classList.toggle("done-cat", allDone);
      const groupEl = btn.closest(".browser-group");
      if (groupEl) _updateGroupDoneClass(groupEl);
    }
  }

  return rows;
}

export function getCategoryRows(categoryId) {
  return _buildRows(categoryId);
}

// Returns true if a category has at least one achievement present in the cache.
function _categoryHasCachedAchievements(categoryId) {
  const cat = categories?.[categoryId];
  if (!cat || !cat.achievements?.length) return false;
  const cache = loadCache();
  return cat.achievements.some(id => cache[id]);
}

export async function fetchMissingCategoryNames(rows, apiKey) {
  const itemIds     = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item"  && x.id).map(x => x.id)))];
  const newItemIds  = itemIds.filter(id => !(id in persistentItemNameMap));
  const titleIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));

  if (!newItemIds.length && !newTitleIds.length) return false;

  if (newItemIds.length) {
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
    saveItemNamesCache();
  }
  if (newTitleIds.length) {
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
    saveTitleNamesCache();
  }
  return true;
}

export async function loadCategoryAchievements(categoryId, apiKey, onStatus) {
  const cat = categories?.[categoryId];
  if (!cat || !cat.achievements?.length) return [];

  const cache   = loadCache();
  const missing = cat.achievements.filter(id => !cache[id]);

  if (missing.length) {
    onStatus?.(`Fetching ${missing.length} achievement definitions…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang: "en" });
    for (const a of fresh) cache[a.id] = a;
    saveCache(cache);
  }

  const rows = _buildRows(categoryId);

  const itemIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item"  && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    onStatus?.(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
    saveItemNamesCache();
    for (const row of rows) row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  const titleIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    onStatus?.(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
    saveTitleNamesCache();
    for (const row of rows) row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  return rows;
}

// ── Completion helpers ────────────────────────────────────────────────────────

function _updateGroupDoneClass(groupEl) {
  const catBtns = [...groupEl.querySelectorAll(".browser-cat-item")];
  const allDone = catBtns.length > 0 && catBtns.every(b => b.classList.contains("done-cat"));
  groupEl.querySelector(".browser-group-header")
    ?.classList.toggle("done-group", allDone);
}

export function recomputeCatDoneStates(hideCompleted = false) {
  if (!progressMap || !groups || !categories) return;

  const cache = loadCache();

  for (const group of groups) {
    const catNodes = group.categories.map(id => categories[id]).filter(Boolean);

    for (const cat of catNodes) {
      if (!cat.achievements?.length) continue;

      const nonRepeatables = cat.achievements.filter(id => {
        const ach = cache[id];
        return ach && !_isRepeatable(ach);
      });

      if (!nonRepeatables.length) continue;

      const hasAnyProgress = nonRepeatables.some(id => progressMap[id]);
      if (!hasAnyProgress) continue;

      const allDone = nonRepeatables.every(id => progressMap[id]?.done === true);
      catDoneMap[cat.id] = allDone;

      const btn = document.querySelector(`.browser-cat-item[data-cat-id="${cat.id}"]`);
      if (btn) {
        btn.classList.toggle("done-cat", allDone);
        btn.classList.toggle("hidden", hideCompleted && allDone);
      }
    }

    const header = document.querySelector(`.browser-group-header[data-group-id="${group.id}"]`);
    if (header) {
      const allCatsDone = catNodes.length > 0 && catNodes.every(c => catDoneMap[c.id] === true);
      header.classList.toggle("done-group", allCatsDone);
    }
  }
}

// ── Sidebar tree ──────────────────────────────────────────────────────────────

export function renderBrowserTree(container, onSelectCategory) {
  if (!groups || !categories) {
    container.innerHTML = `<span class="browser-empty">No data yet.</span>`;
    return;
  }

  const HIDDEN_KEYWORDS = ["bonus event", "adventure guide", "story journal"];
  const isHidden = name => HIDDEN_KEYWORDS.some(kw => name.toLowerCase().includes(kw));

  container.innerHTML = "";

  for (const group of groups) {
    if (isHidden(group.name)) continue;

    const catNodes = group.categories
      .map(id => categories[id])
      .filter(c => c && !isHidden(c.name))
      .filter(c => _categoryHasCachedAchievements(c.id))  // hide empty categories
      .sort((a, b) => a.order - b.order);

    if (!catNodes.length) continue;

    const isExpanded = expandedGroups.has(group.id);
    const groupDone  = catNodes.length > 0 && catNodes.every(c => catDoneMap[c.id] === true);

    const groupEl = document.createElement("div");
    groupEl.className = "browser-group";

    const header = document.createElement("button");
    header.className       = "browser-group-header" + (isExpanded ? " expanded" : "") + (groupDone ? " done-group" : "");
    header.dataset.groupId = group.id;
    header.innerHTML = `
      <svg class="browser-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span class="browser-group-name">${group.name}</span>
    `;

    const catList = document.createElement("div");
    catList.className = "browser-cat-list" + (isExpanded ? " open" : "");

    header.addEventListener("click", () => {
      const expanding = !expandedGroups.has(group.id);
      expanding ? expandedGroups.add(group.id) : expandedGroups.delete(group.id);
      header.classList.toggle("expanded", expanding);
      catList.classList.toggle("open", expanding);
    });

    for (const cat of catNodes) {
      const isDone = catDoneMap[cat.id] === true;

      const btn = document.createElement("button");
      btn.className     = "browser-cat-item" + (cat.id === activeCatId ? " active" : "") + (isDone ? " done-cat" : "");
      btn.dataset.catId = cat.id;

      const label = document.createElement("span");
      label.className   = "browser-cat-item-label";
      label.textContent = cat.name;
      btn.appendChild(label);

      btn.addEventListener("click", () => {
        container.querySelectorAll(".browser-cat-item.active")
          .forEach(el => el.classList.remove("active"));
        btn.classList.add("active");
        activeCatId = cat.id;
        onSelectCategory(cat);
      });

      catList.appendChild(btn);
    }

    groupEl.appendChild(header);
    groupEl.appendChild(catList);
    container.appendChild(groupEl);
  }
}

export function resetBrowserState() {
  expandedGroups.clear();
  activeCatId = null;
}

export function resetBrowserCache() {
  groups     = null;
  categories = null;
}
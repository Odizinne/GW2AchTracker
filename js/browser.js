import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import {
  loadCache, saveCache,
  loadGroupsCache, saveGroupsCache,
  loadCategoriesCache, saveCategoriesCache,
  persistentItemNameMap, persistentTitleNameMap,
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
    return;
  }

  onStatus("Fetching achievement categories…");
  const [rawGroups, rawCats] = await Promise.all([
    apiFetch("/achievements/groups", { ids: "all" }),
    apiFetch("/achievements/categories", { ids: "all" }),
  ]);

  groups = rawGroups
    .filter(g => g.categories && g.categories.length)
    .sort((a, b) => a.order - b.order);

  categories = {};
  for (const c of rawCats) categories[c.id] = c;

  saveGroupsCache(groups);
  saveCategoriesCache(categories);
}

export async function loadCategoryAchievements(categoryId, apiKey, onStatus) {
  const cat = categories?.[categoryId];
  if (!cat || !cat.achievements?.length) return [];

  const ids   = cat.achievements;
  const cache = loadCache();
  const missing = ids.filter(id => !cache[id]);

  if (missing.length) {
    onStatus?.(`Fetching ${missing.length} achievement definitions…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang: "en" });
    for (const a of fresh) cache[a.id] = a;
    saveCache(cache);
  }

  const rows = [];
  for (const id of ids) {
    const ach = cache[id];
    if (!ach) continue;

    const entry    = progressMap?.[id] || {};
    const tiers    = ach.tiers || [];
    const progress = entry.current || 0;
    const done     = entry.done    || false;
    const maxTier  = tiers[tiers.length - 1];
    const required = maxTier?.count ?? null;
    const percent  = done
      ? 100
      : required
        ? Math.min(100, Math.round((progress / required) * 1000) / 10)
        : null;

    rows.push({
      id, name: ach.name,
      progress, required, percent, done,
      rewards:   ach.rewards || [],
      points:    ach.point_cap ?? ach.tiers?.reduce((s, t) => s + (t.points || 0), 0) ?? 0,
      rewardStr: "",
    });
  }

  // Resolve item names
  const itemIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item" && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    onStatus?.(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }

  // Resolve title names
  const titleIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    onStatus?.(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
  }

  for (const row of rows) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  // Update catDoneMap and live sidebar button
  if (progressMap) {
    const hasAnyProgress = rows.some(r => progressMap[r.id]);
    const allDone = hasAnyProgress && rows.every(r => !r.required || r.done);
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

// ── Completion helpers ────────────────────────────────────────────────────────

function _updateGroupDoneClass(groupEl) {
  const catBtns = [...groupEl.querySelectorAll(".browser-cat-item")];
  const allDone = catBtns.length > 0 && catBtns.every(b => b.classList.contains("done-cat"));
  groupEl.querySelector(".browser-group-header")
    ?.classList.toggle("done-group", allDone);
}

// Walk all categories against the current progressMap and update catDoneMap
// + live sidebar buttons. Call this after every fetch so tints appear without
// requiring the user to click each category first.
export function recomputeCatDoneStates(hideCompleted = false) {
  if (!progressMap || !groups || !categories) return;

  for (const group of groups) {
    const catNodes = group.categories.map(id => categories[id]).filter(Boolean);

    for (const cat of catNodes) {
      if (!cat.achievements?.length) continue;

      const hasAnyProgress = cat.achievements.some(id => progressMap[id]);
      if (!hasAnyProgress) continue;

      const allDone = cat.achievements.every(id => progressMap[id]?.done === true);
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

  container.innerHTML = "";

  for (const group of groups) {
    const catNodes = group.categories
      .map(id => categories[id])
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);

    if (!catNodes.length) continue;

    const isExpanded = expandedGroups.has(group.id);
    const groupDone  = catNodes.length > 0 && catNodes.every(c => catDoneMap[c.id] === true);

    const groupEl = document.createElement("div");
    groupEl.className = "browser-group";

    const header = document.createElement("button");
    header.className      = "browser-group-header" + (isExpanded ? " expanded" : "") + (groupDone ? " done-group" : "");
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
      btn.className      = "browser-cat-item" + (cat.id === activeCatId ? " active" : "") + (isDone ? " done-cat" : "");
      btn.dataset.catId  = cat.id;

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
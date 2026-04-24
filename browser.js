import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import {
  loadCache, saveCache,
  loadGroupsCache, saveGroupsCache,
  loadCategoriesCache, saveCategoriesCache,
  persistentItemNameMap, persistentTitleNameMap,
} from "./cache.js";

// ── State ─────────────────────────────────────────────────────────────────────

let groups = null;       // [{id, name, order, categories:[id,…]}, …]
let categories = null;   // {id: {id, name, order, achievements:[id,…]}}
let expandedGroups = new Set();
let activeCategoryId = null;
let progressMap = null;  // shared reference, set externally

export function setProgressMap(map) { progressMap = map; }

// ── Data loading ──────────────────────────────────────────────────────────────

export async function ensureBrowserData(onStatus) {
  if (groups && categories) return;

  const cachedGroups = loadGroupsCache();
  const cachedCats   = loadCategoriesCache();

  if (cachedGroups && cachedCats) {
    groups     = cachedGroups;
    categories = cachedCats;
    return;
  }

  onStatus("Fetching achievement categories…");
  const [rawGroups, rawCats] = await Promise.all([
    apiFetch("/achievements/groups", {
      ids: "all",
      lang: "en"
    }),
    apiFetch("/achievements/categories", {
      ids: "all",
      lang: "en"
    }),
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

  const ids = cat.achievements;
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

    const entry       = progressMap?.[id] || {};
    const tiers       = ach.tiers || [];
    const progress    = entry.current  || 0;
    const done        = entry.done     || false;
    const maxTier     = tiers[tiers.length - 1];
    const required    = maxTier?.count ?? null;
    const percent     = done
      ? 100
      : required
        ? Math.min(100, Math.round((progress / required) * 1000) / 10)
        : null;
    const totalPoints = tiers.reduce((s, t) => s + (t.points || 0), 0);

    rows.push({
      id: ach.id,
      name: ach.name,
      description: ach.description || "",
      progress,
      required,
      percent,
      done,
      rewards: ach.rewards || [],
      points: totalPoints,
      rewardStr: "",
    });
  }

  // Resolve item/title names
  const itemIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item"  && x.id).map(x => x.id)))];
  const titleIds   = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newItemIds  = itemIds .filter(id => !(id in persistentItemNameMap));
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));

  if (newItemIds.length) {
    onStatus?.(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items",  newItemIds,  apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }
  if (newTitleIds.length) {
    onStatus?.(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
  }

  for (const row of rows) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  return rows;
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

    // Group header (collapsible)
    const groupEl = document.createElement("div");
    groupEl.className = "browser-group";

    const header = document.createElement("button");
    header.className = "browser-group-header" + (isExpanded ? " expanded" : "");
    header.innerHTML = `
      <svg class="browser-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span>${group.name}</span>
    `;

    const catList = document.createElement("div");
    catList.className = "browser-cat-list" + (isExpanded ? " open" : "");

    header.addEventListener("click", () => {
      const expanding = !expandedGroups.has(group.id);
      if (expanding) {
        expandedGroups.add(group.id);
      } else {
        expandedGroups.delete(group.id);
      }
      header.classList.toggle("expanded", expanding);
      catList.classList.toggle("open", expanding);
    });

    for (const cat of catNodes) {
      const catBtn = document.createElement("button");
      catBtn.className = "browser-cat-item";
      catBtn.dataset.catId = cat.id;
      catBtn.textContent = cat.name;
      if (cat.id === activeCategoryId) catBtn.classList.add("active");

      catBtn.addEventListener("click", () => {
        // Deactivate previous
        container.querySelectorAll(".browser-cat-item.active")
          .forEach(el => el.classList.remove("active"));
        catBtn.classList.add("active");
        activeCategoryId = cat.id;
        onSelectCategory(cat);
      });

      catList.appendChild(catBtn);
    }

    groupEl.appendChild(header);
    groupEl.appendChild(catList);
    container.appendChild(groupEl);
  }
}
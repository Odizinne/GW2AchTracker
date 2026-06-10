// Cache keys are language-scoped so switching language invalidates data correctly.
let _langSuffix = "";

const _ICON_BASE = "https://render.guildwars2.com/file/";

// Expand compact icon path (HASH/ID) to full render URL.
// Passes full https:// URLs through unchanged for backwards compatibility.
function _expandIcon(v) {
  if (!v || v.startsWith("https://")) return v;
  return `${_ICON_BASE}${v}.png`;
}

export function setCacheLang(lang) {
  _langSuffix = lang === "en" ? "" : `_${lang}`;
}

function _key(base) { return base + _langSuffix; }

// Item/title/skin names — language-scoped
let _itemNameMap  = {};
let _titleNameMap = {};
let _skinNameMap  = {};

// Item/skin descriptions and mini names — language-scoped
let _itemDescMap  = {};
let _skinDescMap  = {};
let _miniNameMap  = {};

// Icon URLs and rarities — language-neutral (same key regardless of lang)
let _itemIconMap    = {};
let _miniIconMap    = {};
let _skinIconMap    = {};
let _itemRarityMap  = {};

// In-memory stores — large data is no longer persisted to localStorage
let _memCache   = null;
let _groups     = null;
let _categories = null;
let _loadedLang = null;

// One-time migration: evict old large keys that are no longer written
(function _migrateLargeKeys() {
  if (localStorage.getItem("gw2_ls_migrated_v1")) return;
  const langScoped = [
    "gw2_ach_cache", "gw2_groups_cache", "gw2_categories_cache",
    "gw2_item_names", "gw2_title_names", "gw2_skin_names",
    "gw2_item_descs", "gw2_skin_descs", "gw2_mini_names",
  ];
  const neutral = ["gw2_item_icons", "gw2_mini_icons", "gw2_skin_icons", "gw2_item_rarities"];
  const langs = ["", "_fr", "_de", "_es"];
  for (const key of langScoped) for (const sfx of langs) localStorage.removeItem(`${key}${sfx}`);
  for (const key of neutral) localStorage.removeItem(key);
  localStorage.setItem("gw2_ls_migrated_v1", "1");
})();

// Clear name/desc maps. Called when fetch language changes; ensureStaticCache will re-populate.
export function reloadNameMaps() {
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
  for (const k of Object.keys(_itemDescMap))  delete _itemDescMap[k];
  for (const k of Object.keys(_skinDescMap))  delete _skinDescMap[k];
  for (const k of Object.keys(_miniNameMap))  delete _miniNameMap[k];
}

export function reloadIconMaps() {
  // Icon maps are populated by ensureStaticCache — no-op kept for API compatibility
}

export function getItemNameMap()  { return _itemNameMap;  }
export function getTitleNameMap() { return _titleNameMap; }
export function getSkinNameMap()  { return _skinNameMap;  }
export function getItemDescMap()  { return _itemDescMap;  }
export function getSkinDescMap()  { return _skinDescMap;  }
export function getMiniNameMap()  { return _miniNameMap;  }
export function getItemIconMap()    { return _itemIconMap;    }
export function getMiniIconMap()    { return _miniIconMap;    }
export function getSkinIconMap()    { return _skinIconMap;    }
export function getItemRarityMap()  { return _itemRarityMap;  }

// No-ops: name data lives in memory only, populated by ensureStaticCache / live API fetches
export function saveItemNamesCache()  {}
export function saveTitleNamesCache() {}
export function saveSkinNamesCache()  {}
export function saveItemDescsCache()  {}
export function saveSkinDescsCache()  {}
export function saveMiniNamesCache()  {}

export function loadCache() {
  return _memCache ?? {};
}

export function saveCache(c) {
  _memCache = c;
}

export function clearCache() {
  _memCache   = null;
  _groups     = null;
  _categories = null;
  _loadedLang = null;
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
  for (const k of Object.keys(_itemDescMap))  delete _itemDescMap[k];
  for (const k of Object.keys(_skinDescMap))  delete _skinDescMap[k];
  for (const k of Object.keys(_miniNameMap))  delete _miniNameMap[k];
  for (const k of Object.keys(_itemIconMap))   delete _itemIconMap[k];
  for (const k of Object.keys(_miniIconMap))   delete _miniIconMap[k];
  for (const k of Object.keys(_skinIconMap))   delete _skinIconMap[k];
  for (const k of Object.keys(_itemRarityMap)) delete _itemRarityMap[k];
  // Clear version strings so next load re-fetches fresh data
  const langs = ["", "_fr", "_de", "_es"];
  for (const sfx of langs) localStorage.removeItem(`gw2_static_version${sfx}`);
  localStorage.removeItem("gw2_static_icons_version");
  localStorage.removeItem("gw2_daily_schedule");
}

export function isStaticCacheLoaded() {
  return _memCache !== null;
}

export function getStaticVersion() {
  return localStorage.getItem(_key("gw2_static_version"));
}

export async function ensureStaticCache(lang, onStatus) {
  try {
    const vr = await fetch("./data/version.json", { cache: "no-store" });
    if (!vr.ok) return false;
    const versions = await vr.json();

    let updated = false;

    // ── Icons (language-neutral) ────────────────────────────────────────────
    const serverIconsVersion = versions["icons"];
    const localIconsVersion  = localStorage.getItem("gw2_static_icons_version");
    const iconsOutdated      = serverIconsVersion && localIconsVersion !== serverIconsVersion;
    const iconsNotLoaded     = Object.keys(_itemIconMap).length === 0;

    if (iconsOutdated || iconsNotLoaded) {
      const [ir, mr, sr, rr] = await Promise.all([
        fetch("./data/items/icons.json"),
        fetch("./data/minis/icons.json"),
        fetch("./data/skins/icons.json"),
        fetch("./data/items/rarities.json"),
      ]);
      if (ir.ok && mr.ok && sr.ok && rr.ok) {
        const [rawItem, rawMini, rawSkin, itemRarities] = await Promise.all([
          ir.json(), mr.json(), sr.json(), rr.json(),
        ]);
        for (const k of Object.keys(_itemIconMap))   delete _itemIconMap[k];
        for (const k of Object.keys(_miniIconMap))   delete _miniIconMap[k];
        for (const k of Object.keys(_skinIconMap))   delete _skinIconMap[k];
        for (const k of Object.keys(_itemRarityMap)) delete _itemRarityMap[k];
        for (const [k, v] of Object.entries(rawItem)) _itemIconMap[k] = _expandIcon(v);
        for (const [k, v] of Object.entries(rawMini)) _miniIconMap[k] = _expandIcon(v);
        for (const [k, v] of Object.entries(rawSkin)) _skinIconMap[k] = _expandIcon(v);
        Object.assign(_itemRarityMap, itemRarities);
        if (iconsOutdated) {
          localStorage.setItem("gw2_static_icons_version", serverIconsVersion);
          updated = true;
        }
      }
    }

    // ── Main cache (base + language strings) ────────────────────────────────
    const serverVersion = versions[lang];
    if (!serverVersion) return updated;

    const localVersion   = localStorage.getItem(_key("gw2_static_version"));
    const versionChanged = localVersion !== serverVersion;
    const notInMemory    = _memCache === null || _loadedLang !== lang;

    if (!versionChanged && !notInMemory) return updated;

    if (versionChanged) onStatus?.("statusDownloadingCache");

    // Fetch base (language-neutral structure) and lang strings in parallel.
    // Stream the lang file to report download progress; base is parsed directly.
    const [brResponse, crResponse] = await Promise.all([
      fetch("./data/cache-base.json"),
      fetch(`./data/cache-${lang}.json`),
    ]);
    if (!brResponse.ok || !crResponse.ok) return updated;

    const basePromise = brResponse.json();

    // Stream lang response for progress reporting.
    // content-length is the compressed size; clamp received to avoid going past 100%.
    const contentLength = parseInt(crResponse.headers.get("content-length") || "0", 10);
    const reader  = crResponse.body.getReader();
    const chunks  = [];
    let received  = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0) {
        onStatus?.("statusDownloadingCache", {}, Math.min(received, contentLength), contentLength);
      }
    }
    const allBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { allBytes.set(chunk, offset); offset += chunk.length; }
    const langData = JSON.parse(new TextDecoder().decode(allBytes));
    const baseData = await basePromise;

    // Merge language-neutral base with language-specific strings
    const mergedAch = {};
    for (const [id, base] of Object.entries(baseData.achievements)) {
      mergedAch[id] = { ...base, ...(langData.ach_strings?.[id] || {}) };
    }
    saveCache(mergedAch);

    const mergedGroups = baseData.groups.map(g => ({
      ...g, ...(langData.group_strings?.[String(g.id)] || {}),
    }));
    saveGroupsCache(mergedGroups);

    const mergedCats = {};
    for (const [id, base] of Object.entries(baseData.categories)) {
      const cat = { ...base, ...(langData.cat_strings?.[id] || {}) };
      if (cat.icon) cat.icon = _expandIcon(cat.icon);
      mergedCats[id] = cat;
    }
    saveCategoriesCache(mergedCats);

    for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
    for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
    for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
    for (const k of Object.keys(_itemDescMap))  delete _itemDescMap[k];
    for (const k of Object.keys(_skinDescMap))  delete _skinDescMap[k];
    for (const k of Object.keys(_miniNameMap))  delete _miniNameMap[k];
    Object.assign(_itemNameMap,  langData.items);
    Object.assign(_titleNameMap, langData.titles);
    Object.assign(_skinNameMap,  langData.skins);
    Object.assign(_itemDescMap,  langData.item_descs || {});
    Object.assign(_skinDescMap,  langData.skin_descs || {});
    Object.assign(_miniNameMap,  langData.mini_names || {});

    _loadedLang = lang;

    if (versionChanged) {
      localStorage.setItem(_key("gw2_static_version"), serverVersion);
      updated = true;
    }
    return updated;
  } catch {
    return false;
  }
}

export function loadGroupsCache() {
  return _groups;
}

export function saveGroupsCache(data) {
  _groups = data;
}

export function loadCategoriesCache() {
  return _categories;
}

export function saveCategoriesCache(data) {
  _categories = data;
}

// Daily schedule cache — stores the last fetched daily-today.json (festival_cat_ids + date).
// Not language-scoped.
export function loadDailySchedule() {
  try {
    const r = localStorage.getItem("gw2_daily_schedule");
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveDailySchedule(data) {
  try { localStorage.setItem("gw2_daily_schedule", JSON.stringify(data)); } catch {}
}

export function loadDailyFilter() {
  try {
    const r = localStorage.getItem("gw2_daily_filter");
    return r ? JSON.parse(r) : { hiddenCatIds: [], hideFestival: false };
  } catch { return { hiddenCatIds: [], hideFestival: false }; }
}

export function saveDailyFilter(data) {
  try { localStorage.setItem("gw2_daily_filter", JSON.stringify(data)); } catch {}
}

function _loadSet(key) {
  try { const r = localStorage.getItem(key); return new Set(r ? JSON.parse(r) : []); } catch { return new Set(); }
}

let _favKey = "gw2_favorites";
export let favoritesSet = _loadSet(_favKey);
export let hiddenSet    = _loadSet("gw2_hidden");

export function reloadFavorites(apiKey) {
  _favKey = apiKey ? `gw2_favorites_${apiKey.slice(-8)}` : "gw2_favorites";
  favoritesSet = _loadSet(_favKey);
}

export function toggleFavorite(id) {
  if (favoritesSet.has(id)) favoritesSet.delete(id); else favoritesSet.add(id);
  try { localStorage.setItem(_favKey, JSON.stringify([...favoritesSet])); } catch {}
}

export function toggleHidden(id) {
  if (hiddenSet.has(id)) hiddenSet.delete(id); else hiddenSet.add(id);
  try { localStorage.setItem("gw2_hidden", JSON.stringify([...hiddenSet])); } catch {}
}

export function loadDailyCollapsed() {
  return _loadSet("gw2_daily_collapsed");
}

export function toggleDailyCollapsed(catId) {
  const s = loadDailyCollapsed();
  if (s.has(catId)) s.delete(catId); else s.add(catId);
  try { localStorage.setItem("gw2_daily_collapsed", JSON.stringify([...s])); } catch {}
}

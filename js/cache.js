// Cache keys are language-scoped so switching language invalidates data correctly.
let _langSuffix = "";

export function setCacheLang(lang) {
  _langSuffix = lang === "en" ? "" : `_${lang}`;
}

function _key(base) { return base + _langSuffix; }

function _loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

// Item/title/skin names are language-scoped
let _itemNameMap  = {};
let _titleNameMap = {};
let _skinNameMap  = {};

export function reloadNameMaps() {
  const im = _loadJson(_key("gw2_item_names"));
  const tm = _loadJson(_key("gw2_title_names"));
  const sm = _loadJson(_key("gw2_skin_names"));
  // Clear and repopulate in-place so existing references stay valid
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
  Object.assign(_itemNameMap,  im);
  Object.assign(_titleNameMap, tm);
  Object.assign(_skinNameMap,  sm);
}

// Call once on boot (before setCacheLang, so uses "" suffix = "en")
reloadNameMaps();

export function getItemNameMap()  { return _itemNameMap;  }
export function getTitleNameMap() { return _titleNameMap; }
export function getSkinNameMap()  { return _skinNameMap;  }

export function saveItemNamesCache()  {
  try { localStorage.setItem(_key("gw2_item_names"),  JSON.stringify(_itemNameMap));  } catch {}
}
export function saveTitleNamesCache() {
  try { localStorage.setItem(_key("gw2_title_names"), JSON.stringify(_titleNameMap)); } catch {}
}
export function saveSkinNamesCache()  {
  try { localStorage.setItem(_key("gw2_skin_names"),  JSON.stringify(_skinNameMap));  } catch {}
}

let _memCache = null;

export function loadCache() {
  if (_memCache !== null) return _memCache;
  try {
    const r = localStorage.getItem(_key("gw2_ach_cache"));
    _memCache = r ? JSON.parse(r) : {};
  } catch { _memCache = {}; }
  return _memCache;
}

export function saveCache(c) {
  _memCache = c;
  try {
    localStorage.setItem(_key("gw2_ach_cache"), JSON.stringify(c));
  } catch {
    const keys = Object.keys(c).sort((a, b) => Number(a) - Number(b));
    const trimmed = Object.fromEntries(
      keys.slice(Math.ceil(keys.length / 2)).map(k => [k, c[k]])
    );
    _memCache = trimmed;
    try { localStorage.setItem(_key("gw2_ach_cache"), JSON.stringify(trimmed)); } catch {}
  }
}

export function clearCache() {
  _memCache = null;
  // Clear all language variants
  const langs = ["", "_fr", "_de", "_es"];
  for (const sfx of langs) {
    localStorage.removeItem(`gw2_ach_cache${sfx}`);
    localStorage.removeItem(`gw2_groups_cache${sfx}`);
    localStorage.removeItem(`gw2_categories_cache${sfx}`);
    localStorage.removeItem(`gw2_item_names${sfx}`);
    localStorage.removeItem(`gw2_title_names${sfx}`);
    localStorage.removeItem(`gw2_skin_names${sfx}`);
  }
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
}

export function loadGroupsCache() {
  try {
    const r = localStorage.getItem(_key("gw2_groups_cache"));
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveGroupsCache(data) {
  try { localStorage.setItem(_key("gw2_groups_cache"), JSON.stringify(data)); } catch {}
}

export function loadCategoriesCache() {
  try {
    const r = localStorage.getItem(_key("gw2_categories_cache"));
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveCategoriesCache(data) {
  try { localStorage.setItem(_key("gw2_categories_cache"), JSON.stringify(data)); } catch {}
}

function _loadSet(key) {
  try { const r = localStorage.getItem(key); return new Set(r ? JSON.parse(r) : []); } catch { return new Set(); }
}

export let favoritesSet = _loadSet("gw2_favorites");
export let hiddenSet    = _loadSet("gw2_hidden");

export function toggleFavorite(id) {
  if (favoritesSet.has(id)) favoritesSet.delete(id); else favoritesSet.add(id);
  try { localStorage.setItem("gw2_favorites", JSON.stringify([...favoritesSet])); } catch {}
}

export function toggleHidden(id) {
  if (hiddenSet.has(id)) hiddenSet.delete(id); else hiddenSet.add(id);
  try { localStorage.setItem("gw2_hidden", JSON.stringify([...hiddenSet])); } catch {}
}
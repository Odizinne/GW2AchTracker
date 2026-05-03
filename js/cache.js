function _loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

const _itemNameMap  = _loadJson("gw2_item_names");
const _titleNameMap = _loadJson("gw2_title_names");
const _skinNameMap  = _loadJson("gw2_skin_names");

export function getItemNameMap()  { return _itemNameMap;  }
export function getTitleNameMap() { return _titleNameMap; }
export function getSkinNameMap()  { return _skinNameMap;  }

export const persistentItemNameMap  = _itemNameMap;
export const persistentTitleNameMap = _titleNameMap;
export const persistentSkinNameMap  = _skinNameMap;

export function saveItemNamesCache()  {
  try { localStorage.setItem("gw2_item_names",  JSON.stringify(_itemNameMap));  } catch {}
}
export function saveTitleNamesCache() {
  try { localStorage.setItem("gw2_title_names", JSON.stringify(_titleNameMap)); } catch {}
}
export function saveSkinNamesCache()  {
  try { localStorage.setItem("gw2_skin_names",  JSON.stringify(_skinNameMap));  } catch {}
}

let _memCache = null;

export function loadCache() {
  if (_memCache !== null) return _memCache;
  try {
    const r = localStorage.getItem("gw2_ach_cache");
    _memCache = r ? JSON.parse(r) : {};
  } catch { _memCache = {}; }
  return _memCache;
}

export function saveCache(c) {
  _memCache = c;
  try {
    localStorage.setItem("gw2_ach_cache", JSON.stringify(c));
  } catch {
    const keys = Object.keys(c).sort((a, b) => Number(a) - Number(b));
    const trimmed = Object.fromEntries(
      keys.slice(Math.ceil(keys.length / 2)).map(k => [k, c[k]])
    );
    _memCache = trimmed;
    try { localStorage.setItem("gw2_ach_cache", JSON.stringify(trimmed)); } catch {}
  }
}

export function clearCache() {
  _memCache = null;
  localStorage.removeItem("gw2_ach_cache");
  localStorage.removeItem("gw2_groups_cache");
  localStorage.removeItem("gw2_categories_cache");
  localStorage.removeItem("gw2_item_names");
  localStorage.removeItem("gw2_title_names");
  localStorage.removeItem("gw2_skin_names");
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
}

export function loadGroupsCache() {
  try {
    const r = localStorage.getItem("gw2_groups_cache");
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveGroupsCache(data) {
  try { localStorage.setItem("gw2_groups_cache", JSON.stringify(data)); } catch {}
}

export function loadCategoriesCache() {
  try {
    const r = localStorage.getItem("gw2_categories_cache");
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

export function saveCategoriesCache(data) {
  try { localStorage.setItem("gw2_categories_cache", JSON.stringify(data)); } catch {}
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
function _loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

export let persistentItemNameMap  = _loadJson("gw2_item_names");
export let persistentTitleNameMap = _loadJson("gw2_title_names");
export let persistentSkinNameMap  = _loadJson("gw2_skin_names");

export function saveItemNamesCache()  {
  try { localStorage.setItem("gw2_item_names",  JSON.stringify(persistentItemNameMap));  } catch {}
}
export function saveTitleNamesCache() {
  try { localStorage.setItem("gw2_title_names", JSON.stringify(persistentTitleNameMap)); } catch {}
}
export function saveSkinNamesCache()  {
  try { localStorage.setItem("gw2_skin_names",  JSON.stringify(persistentSkinNameMap));  } catch {}
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
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(
      keys.slice(keys.length / 2).map(k => [k, c[k]])
    );
    _memCache = trimmed;
    localStorage.setItem("gw2_ach_cache", JSON.stringify(trimmed));
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
  persistentItemNameMap  = {};
  persistentTitleNameMap = {};
  persistentSkinNameMap  = {};
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
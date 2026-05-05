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
    localStorage.removeItem(`gw2_static_version${sfx}`);
  }
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
}

export function isStaticCacheLoaded() {
  return !!localStorage.getItem(_key("gw2_static_version"));
}

export function getStaticVersion() {
  return localStorage.getItem(_key("gw2_static_version"));
}

export async function ensureStaticCache(lang, onStatus) {
  try {
    const vr = await fetch("./data/version.json", { cache: "no-store" });
    if (!vr.ok) return false;
    const versions      = await vr.json();
    const serverVersion = versions[lang];
    if (!serverVersion) return false;

    const localVersion = localStorage.getItem(_key("gw2_static_version"));
    if (localVersion === serverVersion) return false;

    onStatus?.("statusDownloadingCache");

    const cr = await fetch(`./data/cache-${lang}.json`);
    if (!cr.ok) return false;

    // Stream response to report download progress via the loading bar.
    // content-length is the compressed size; received tracks decompressed bytes,
    // so we clamp to avoid going past 100% when gzip ratio exceeds 1.
    const contentLength = parseInt(cr.headers.get("content-length") || "0", 10);
    const reader  = cr.body.getReader();
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
    const data = JSON.parse(new TextDecoder().decode(allBytes));

    saveCache(data.achievements);
    saveGroupsCache(data.groups);
    saveCategoriesCache(data.categories);

    for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
    for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
    for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
    Object.assign(_itemNameMap,  data.items);
    Object.assign(_titleNameMap, data.titles);
    Object.assign(_skinNameMap,  data.skins);
    saveItemNamesCache();
    saveTitleNamesCache();
    saveSkinNamesCache();

    localStorage.setItem(_key("gw2_static_version"), serverVersion);
    return true;
  } catch {
    return false;
  }
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
// Cache keys are language-scoped so switching language invalidates data correctly.
let _langSuffix = "";

export function setCacheLang(lang) {
  _langSuffix = lang === "en" ? "" : `_${lang}`;
}

function _key(base) { return base + _langSuffix; }

function _loadJson(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : {}; } catch { return {}; }
}

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

export function reloadNameMaps() {
  const im = _loadJson(_key("gw2_item_names"));
  const tm = _loadJson(_key("gw2_title_names"));
  const sm = _loadJson(_key("gw2_skin_names"));
  const id = _loadJson(_key("gw2_item_descs"));
  const sd = _loadJson(_key("gw2_skin_descs"));
  const mn = _loadJson(_key("gw2_mini_names"));
  // Clear and repopulate in-place so existing references stay valid
  for (const k of Object.keys(_itemNameMap))  delete _itemNameMap[k];
  for (const k of Object.keys(_titleNameMap)) delete _titleNameMap[k];
  for (const k of Object.keys(_skinNameMap))  delete _skinNameMap[k];
  for (const k of Object.keys(_itemDescMap))  delete _itemDescMap[k];
  for (const k of Object.keys(_skinDescMap))  delete _skinDescMap[k];
  for (const k of Object.keys(_miniNameMap))  delete _miniNameMap[k];
  Object.assign(_itemNameMap,  im);
  Object.assign(_titleNameMap, tm);
  Object.assign(_skinNameMap,  sm);
  Object.assign(_itemDescMap,  id);
  Object.assign(_skinDescMap,  sd);
  Object.assign(_miniNameMap,  mn);
}

export function reloadIconMaps() {
  const ii = _loadJson("gw2_item_icons");
  const mi = _loadJson("gw2_mini_icons");
  const si = _loadJson("gw2_skin_icons");
  const ri = _loadJson("gw2_item_rarities");
  for (const k of Object.keys(_itemIconMap))   delete _itemIconMap[k];
  for (const k of Object.keys(_miniIconMap))   delete _miniIconMap[k];
  for (const k of Object.keys(_skinIconMap))   delete _skinIconMap[k];
  for (const k of Object.keys(_itemRarityMap)) delete _itemRarityMap[k];
  Object.assign(_itemIconMap,   ii);
  Object.assign(_miniIconMap,   mi);
  Object.assign(_skinIconMap,   si);
  Object.assign(_itemRarityMap, ri);
}

// Call once on boot (before setCacheLang, so uses "" suffix = "en")
reloadNameMaps();
reloadIconMaps();

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

export function saveItemNamesCache()  {
  try { localStorage.setItem(_key("gw2_item_names"),  JSON.stringify(_itemNameMap));  } catch {}
}
export function saveTitleNamesCache() {
  try { localStorage.setItem(_key("gw2_title_names"), JSON.stringify(_titleNameMap)); } catch {}
}
export function saveSkinNamesCache()  {
  try { localStorage.setItem(_key("gw2_skin_names"),  JSON.stringify(_skinNameMap));  } catch {}
}
export function saveItemDescsCache()  {
  try { localStorage.setItem(_key("gw2_item_descs"),  JSON.stringify(_itemDescMap));  } catch {}
}
export function saveSkinDescsCache()  {
  try { localStorage.setItem(_key("gw2_skin_descs"),  JSON.stringify(_skinDescMap));  } catch {}
}
export function saveMiniNamesCache()  {
  try { localStorage.setItem(_key("gw2_mini_names"),  JSON.stringify(_miniNameMap));  } catch {}
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
  const langs = ["", "_fr", "_de", "_es"];
  for (const sfx of langs) {
    localStorage.removeItem(`gw2_ach_cache${sfx}`);
    localStorage.removeItem(`gw2_groups_cache${sfx}`);
    localStorage.removeItem(`gw2_categories_cache${sfx}`);
    localStorage.removeItem(`gw2_item_names${sfx}`);
    localStorage.removeItem(`gw2_title_names${sfx}`);
    localStorage.removeItem(`gw2_skin_names${sfx}`);
    localStorage.removeItem(`gw2_item_descs${sfx}`);
    localStorage.removeItem(`gw2_skin_descs${sfx}`);
    localStorage.removeItem(`gw2_mini_names${sfx}`);
    localStorage.removeItem(`gw2_static_version${sfx}`);
  }
  localStorage.removeItem("gw2_item_icons");
  localStorage.removeItem("gw2_mini_icons");
  localStorage.removeItem("gw2_skin_icons");
  localStorage.removeItem("gw2_item_rarities");
  localStorage.removeItem("gw2_static_icons_version");
  localStorage.removeItem("gw2_daily_schedule");
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
    const versions = await vr.json();

    let updated = false;

    // Icon files are language-neutral — check independently of lang cache version.
    const serverIconsVersion = versions["icons"];
    const localIconsVersion  = localStorage.getItem("gw2_static_icons_version");
    if (serverIconsVersion && localIconsVersion !== serverIconsVersion) {
      const [ir, mr, sr, rr] = await Promise.all([
        fetch("./data/items/icons.json"),
        fetch("./data/minis/icons.json"),
        fetch("./data/skins/icons.json"),
        fetch("./data/items/rarities.json"),
      ]);
      if (ir.ok && mr.ok && sr.ok && rr.ok) {
        const [itemIcons, miniIcons, skinIcons, itemRarities] = await Promise.all([
          ir.json(), mr.json(), sr.json(), rr.json(),
        ]);
        for (const k of Object.keys(_itemIconMap))   delete _itemIconMap[k];
        for (const k of Object.keys(_miniIconMap))   delete _miniIconMap[k];
        for (const k of Object.keys(_skinIconMap))   delete _skinIconMap[k];
        for (const k of Object.keys(_itemRarityMap)) delete _itemRarityMap[k];
        Object.assign(_itemIconMap,   itemIcons);
        Object.assign(_miniIconMap,   miniIcons);
        Object.assign(_skinIconMap,   skinIcons);
        Object.assign(_itemRarityMap, itemRarities);
        try { localStorage.setItem("gw2_item_icons",    JSON.stringify(itemIcons));    } catch {}
        try { localStorage.setItem("gw2_mini_icons",    JSON.stringify(miniIcons));    } catch {}
        try { localStorage.setItem("gw2_skin_icons",    JSON.stringify(skinIcons));    } catch {}
        try { localStorage.setItem("gw2_item_rarities", JSON.stringify(itemRarities)); } catch {}
        localStorage.setItem("gw2_static_icons_version", serverIconsVersion);
        updated = true;
      }
    }

    const serverVersion = versions[lang];
    if (!serverVersion) return updated;

    const localVersion = localStorage.getItem(_key("gw2_static_version"));
    if (localVersion === serverVersion) return updated;

    onStatus?.("statusDownloadingCache");

    const cr = await fetch(`./data/cache-${lang}.json`);
    if (!cr.ok) return updated;

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
    for (const k of Object.keys(_itemDescMap))  delete _itemDescMap[k];
    for (const k of Object.keys(_skinDescMap))  delete _skinDescMap[k];
    for (const k of Object.keys(_miniNameMap))  delete _miniNameMap[k];
    Object.assign(_itemNameMap,  data.items);
    Object.assign(_titleNameMap, data.titles);
    Object.assign(_skinNameMap,  data.skins);
    Object.assign(_itemDescMap,  data.item_descs || {});
    Object.assign(_skinDescMap,  data.skin_descs || {});
    Object.assign(_miniNameMap,  data.mini_names || {});
    saveItemNamesCache();
    saveTitleNamesCache();
    saveSkinNamesCache();
    saveItemDescsCache();
    saveSkinDescsCache();
    saveMiniNamesCache();

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

export function loadDailyCollapsed() {
  return _loadSet("gw2_daily_collapsed");
}

export function toggleDailyCollapsed(catId) {
  const s = loadDailyCollapsed();
  if (s.has(catId)) s.delete(catId); else s.add(catId);
  try { localStorage.setItem("gw2_daily_collapsed", JSON.stringify([...s])); } catch {}
}

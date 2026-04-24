export let persistentItemNameMap = {};
export let persistentTitleNameMap = {};

export function loadCache() {
  try {
    const r = localStorage.getItem("gw2_ach_cache");
    return r ? JSON.parse(r) : {};
  } catch { return {}; }
}

export function saveCache(c) {
  try {
    localStorage.setItem("gw2_ach_cache", JSON.stringify(c));
  } catch {
    const keys = Object.keys(c);
    const trimmed = Object.fromEntries(
      keys.slice(keys.length / 2).map(k => [k, c[k]])
    );
    localStorage.setItem("gw2_ach_cache", JSON.stringify(trimmed));
  }
}

export function clearCache() {
  localStorage.removeItem("gw2_ach_cache");
  localStorage.removeItem("gw2_groups_cache");
  localStorage.removeItem("gw2_categories_cache");
  persistentItemNameMap = {};
  persistentTitleNameMap = {};
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
import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import {
  loadCache, saveCache,
  getItemNameMap, getTitleNameMap, getSkinNameMap,
  saveItemNamesCache, saveTitleNamesCache, saveSkinNamesCache,
  loadCategoriesCache, isStaticCacheLoaded,
} from "./cache.js";

let lastProgressMap = null;

export function resetProgress() { lastProgressMap = null; }
export function getProgressMap() { return lastProgressMap; }

function getCurrentTier(tiers, progress) {
  for (let i = 0; i < tiers.length; i++) {
    if (progress < tiers[i].count) return { idx: i, tier: tiers[i] };
  }
  return { idx: tiers.length - 1, tier: tiers[tiers.length - 1] };
}

export async function ensureDefinitionCache(onStatus, apiKey = "", fetchMode = "account-all", lang = "en") {
  if (isStaticCacheLoaded()) return;

  const cache     = loadCache();
  const cachedIds = new Set(Object.keys(cache).map(Number));

  let candidateIds;

  if (fetchMode === "all") {
    candidateIds = await apiFetch("/achievements", { lang });
  } else {
    onStatus("statusFetchingAccount");
    const accountData = await apiFetch("/account/achievements", {}, apiKey);
    const accountIds  = accountData.map(e => e.id);
    const accountSet  = new Set(accountIds);

    if (fetchMode === "account-all") {
      const categories = loadCategoriesCache();
      if (categories) {
        const expandedSet = new Set(accountIds);
        for (const cat of Object.values(categories)) {
          if (!cat.achievements?.length) continue;
          const catHasAccountAch = cat.achievements.some(id => accountSet.has(id));
          if (catHasAccountAch) {
            for (const id of cat.achievements) expandedSet.add(id);
          }
        }
        candidateIds = [...expandedSet];
      } else {
        candidateIds = accountIds;
      }
    } else {
      candidateIds = accountIds;
    }

    let pruned = false;
    for (const id of cachedIds) {
      if (!accountSet.has(id)) {
        delete cache[id];
        pruned = true;
      }
    }
    if (pruned) saveCache(cache);
  }

  const currentCachedIds = new Set(Object.keys(cache).map(Number));
  const missing = candidateIds.filter(id => !currentCachedIds.has(id));

  const repeatableIds = candidateIds.filter(id => {
    const ach = cache[id];
    return ach && (ach.flags || []).some(f => f === "Daily" || f === "Weekly" || f === "Repeatable");
  });

  const toFetch = [...new Set([...missing, ...repeatableIds])];

  if (toFetch.length) {
    onStatus("statusFetchingDefs", { n: `0 / ${toFetch.length}` }, 0, toFetch.length);
    const fresh = await fetchInBatches("/achievements", toFetch, null, 150, { lang },
      (f, t) => onStatus("statusFetchingDefs", { n: `${f} / ${t}` }, f, t)
    );
    for (const ach of fresh) cache[ach.id] = ach;
    saveCache(cache);
  }
}

export async function ensureRewardNames(onStatus, lang = "en") {
  const cache   = loadCache();
  const achs    = Object.values(cache);
  const rewards = achs.flatMap(ach => ach.rewards || []);
  const bits    = achs.flatMap(ach => ach.bits    || []);

  const itemNameMap  = getItemNameMap();
  const titleNameMap = getTitleNameMap();
  const skinNameMap  = getSkinNameMap();

  const itemIds = [...new Set([
    ...rewards.filter(r => r.type === "Item" && r.id).map(r => r.id),
    ...bits.filter(b => (b.type === "Item" || b.type === "Minipet") && b.id).map(b => b.id),
  ])];
  const newItemIds = itemIds.filter(id => !(id in itemNameMap));
  if (newItemIds.length) {
    onStatus("statusFetchingItems", { n: `0 / ${newItemIds.length}` }, 0, newItemIds.length);
    const items = await fetchInBatches("/items", newItemIds, null, 150, { lang },
      (f, t) => onStatus("statusFetchingItems", { n: `${f} / ${t}` }, f, t)
    );
    for (const item of items) itemNameMap[item.id] = item.name;
    saveItemNamesCache();
  }

  const titleIds    = [...new Set(rewards.filter(r => r.type === "Title" && r.id).map(r => r.id))];
  const newTitleIds = titleIds.filter(id => !(id in titleNameMap));
  if (newTitleIds.length) {
    onStatus("statusFetchingTitles", { n: `0 / ${newTitleIds.length}` }, 0, newTitleIds.length);
    const titles = await fetchInBatches("/titles", newTitleIds, null, 150, { lang },
      (f, t) => onStatus("statusFetchingTitles", { n: `${f} / ${t}` }, f, t)
    );
    for (const title of titles) titleNameMap[title.id] = title.name;
    saveTitleNamesCache();
  }

  const skinIds    = [...new Set(bits.filter(b => b.type === "Skin" && b.id).map(b => b.id))];
  const newSkinIds = skinIds.filter(id => !(id in skinNameMap));
  if (newSkinIds.length) {
    onStatus("statusFetchingSkins", { n: `0 / ${newSkinIds.length}` }, 0, newSkinIds.length);
    try {
      const skins = await fetchInBatches("/skins", newSkinIds, null, 150, { lang },
        (f, t) => onStatus("statusFetchingSkins", { n: `${f} / ${t}` }, f, t)
      );
      const found = new Set(skins.map(s => s.id));
      for (const skin of skins) skinNameMap[skin.id] = skin.name;
      for (const id of newSkinIds) if (!found.has(id)) skinNameMap[id] = null;
    } catch {
      for (const id of newSkinIds) skinNameMap[id] = null;
    }
    saveSkinNamesCache();
  }
}

export async function fetchProgress(apiKey) {
  const accountData = await apiFetch("/account/achievements", {}, apiKey);
  lastProgressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
  return lastProgressMap;
}

export function computeNearlyDone(progressMap, settings) {
  const { thresholdPct, maxResults, useFinalTier } = settings;
  const threshold = thresholdPct / 100;
  const cache = loadCache();
  const rows  = [];

  for (const [idStr, entry] of Object.entries(progressMap)) {
    const ach = cache[Number(idStr)];
    if (!ach) continue;
    const isRepeatable = (ach.flags || []).some(f => f === "Daily" || f === "Weekly" || f === "Repeatable");
    // IgnoreNearlyComplete is a game-HUD flag; still honour it for one-shot achievements,
    // but infinite/repeatable ones should always be trackable.
    if (!isRepeatable && (ach.flags || []).includes("IgnoreNearlyComplete")) continue;
    if (entry.done && !isRepeatable) continue;

    const tiers = ach.tiers || [];
    if (!tiers.length) continue;
    const rawProgress = entry.current || 0;
    const { idx, tier: currentTier } = getCurrentTier(tiers, rawProgress);
    const targetTier = useFinalTier ? tiers[tiers.length - 1] : currentTier;
    const isLast = idx === tiers.length - 1;
    if (!targetTier.count) continue;
    // For repeatables, progress wraps around each lap so ratio stays in [0, 1)
    const progress = isRepeatable ? rawProgress % targetTier.count : rawProgress;
    const ratio = progress / targetTier.count;
    if (ratio < threshold) continue;
    if (ratio >= 1.0) continue;
    rows.push({
      id: ach.id,
      name: ach.name,
      progress,
      required: targetTier.count,
      percent:  Math.round(ratio * 1000) / 10,
      rewards:  (useFinalTier || isLast) ? (ach.rewards || []) : [],
      points:   targetTier.points || 0,
      rewardStr: "",
    });
  }

  rows.sort((a, b) => b.percent - a.percent);
  return rows.slice(0, maxResults);
}

export async function resolveRewardNames(rows, apiKey, lang = "en") {
  const itemNameMap  = getItemNameMap();
  const titleNameMap = getTitleNameMap();

  const itemIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item"  && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in itemNameMap));
  if (newItemIds.length) {
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang });
    for (const item of items) itemNameMap[item.id] = item.name;
    saveItemNamesCache();
  }

  const titleIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in titleNameMap));
  if (newTitleIds.length) {
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang });
    for (const title of titles) titleNameMap[title.id] = title.name;
    saveTitleNamesCache();
  }

  for (const row of rows) {
    row.rewardStr = formatRewards(row.rewards, itemNameMap, titleNameMap, row.points);
  }
}
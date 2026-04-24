import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import { loadCache, saveCache, persistentItemNameMap, persistentTitleNameMap } from "./cache.js";

let lastProgressMap = null;

export function resetProgress() { lastProgressMap = null; }
export function getProgressMap() { return lastProgressMap; }

function getCurrentTier(tiers, progress) {
  for (let i = 0; i < tiers.length; i++) {
    if (progress < tiers[i].count) return { idx: i, tier: tiers[i] };
  }
  return { idx: tiers.length - 1, tier: tiers[tiers.length - 1] };
}

export async function fetchNearlyDone(apiKey, settings, onStatus, reuseProgress = false) {
  const { thresholdPct, maxResults, useFinalTier } = settings;
  const threshold = thresholdPct / 100;

  if (reuseProgress && lastProgressMap) {
    // use cached
  } else {
    onStatus("Fetching account progression…");
    const accountData = await apiFetch("/account/achievements", {}, apiKey);
    lastProgressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
  }

  const progressMap = lastProgressMap;
  const neededIds = Object.keys(progressMap).map(Number);
  const cache = loadCache();
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const missing = neededIds.filter(id => !cachedIds.has(id));

  if (missing.length) {
    onStatus(`Fetching ${missing.length} achievement definitions…`);
    const fresh = await fetchInBatches("/achievements", missing, apiKey, 150, { lang: "en" });
    for (const ach of fresh) cache[ach.id] = ach;
  }

  if (!reuseProgress) {
    const neededSet = new Set(neededIds);
    saveCache(Object.fromEntries(Object.entries(cache).filter(([k]) => neededSet.has(Number(k)))));
  }

  const definitions = neededIds.map(id => cache[id]).filter(Boolean);
  const rows = [];

  for (const ach of definitions) {
    if ((ach.flags || []).includes("IgnoreNearlyComplete")) continue;
    const entry = progressMap[ach.id] || {};
    if (entry.done) continue;
    const tiers = ach.tiers || [];
    if (!tiers.length) continue;
    const progress = entry.current || 0;
    const { idx, tier: currentTier } = getCurrentTier(tiers, progress);
    const targetTier = useFinalTier ? tiers[tiers.length - 1] : currentTier;
    const isLast = idx === tiers.length - 1;
    if (!targetTier.count) continue;
    const ratio = progress / targetTier.count;
    if (ratio < threshold) continue;
    rows.push({
      id: ach.id,
      name: ach.name,
      progress,
      required: targetTier.count,
      percent: Math.round(ratio * 1000) / 10,
      rewards: (useFinalTier || isLast) ? (ach.rewards || []) : [],
      points: targetTier.points || 0,
    });
  }

  rows.sort((a, b) => b.percent - a.percent);
  const top = rows.slice(0, maxResults);

  const itemIds = [...new Set(top.flatMap(r => r.rewards.filter(x => x.type === "Item" && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    onStatus(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
  }

  const titleIds = [...new Set(top.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    onStatus(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
  }

  for (const row of top) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }

  return top;
}
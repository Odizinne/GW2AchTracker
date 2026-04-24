import { apiFetch, fetchInBatches, formatRewards } from "./api.js";
import {
  loadCache, saveCache,
  persistentItemNameMap, persistentTitleNameMap,
  saveItemNamesCache, saveTitleNamesCache,
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

// Step 1a — fetch all definitions (public, no key). Only downloads what's missing.
export async function ensureDefinitionCache(onStatus) {
  const cache     = loadCache();
  const cachedIds = new Set(Object.keys(cache).map(Number));
  const allIds    = await apiFetch("/achievements", { lang: "en" });
  const missing   = allIds.filter(id => !cachedIds.has(id));
  if (missing.length) {
    onStatus(`Fetching ${missing.length} achievement definitions…`);
    const fresh = await fetchInBatches("/achievements", missing, null, 150, { lang: "en" });
    for (const ach of fresh) cache[ach.id] = ach;
    saveCache(cache);
  }
}

// Step 1b — pre-fetch all reward item/title names across every cached achievement.
export async function ensureRewardNames(onStatus) {
  const cache   = loadCache();
  const rewards = Object.values(cache).flatMap(ach => ach.rewards || []);

  const itemIds    = [...new Set(rewards.filter(r => r.type === "Item"  && r.id).map(r => r.id))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    onStatus(`Fetching names for ${newItemIds.length} items…`);
    const items = await fetchInBatches("/items", newItemIds, null, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
    saveItemNamesCache();
  }

  const titleIds    = [...new Set(rewards.filter(r => r.type === "Title" && r.id).map(r => r.id))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    onStatus(`Fetching names for ${newTitleIds.length} titles…`);
    const titles = await fetchInBatches("/titles", newTitleIds, null, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
    saveTitleNamesCache();
  }
}

// Step 2 — fetch user progress (always fresh, needs API key).
export async function fetchProgress(apiKey) {
  const accountData = await apiFetch("/account/achievements", {}, apiKey);
  lastProgressMap = Object.fromEntries(accountData.map(e => [e.id, e]));
  return lastProgressMap;
}

// Step 3 — pure sync computation from in-memory state.
export function computeNearlyDone(progressMap, settings) {
  const { thresholdPct, maxResults, useFinalTier } = settings;
  const threshold = thresholdPct / 100;
  const cache = loadCache();
  const rows  = [];

  for (const [idStr, entry] of Object.entries(progressMap)) {
    const ach = cache[Number(idStr)];
    if (!ach) continue;
    if ((ach.flags || []).includes("IgnoreNearlyComplete")) continue;
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
      percent:  Math.round(ratio * 1000) / 10,
      rewards:  (useFinalTier || isLast) ? (ach.rewards || []) : [],
      points:   targetTier.points || 0,
      rewardStr: "",
    });
  }

  rows.sort((a, b) => b.percent - a.percent);
  return rows.slice(0, maxResults);
}

// Resolves item/title reward names for a row list, persists new names to localStorage.
export async function resolveRewardNames(rows, apiKey) {
  const itemIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Item"  && x.id).map(x => x.id)))];
  const newItemIds = itemIds.filter(id => !(id in persistentItemNameMap));
  if (newItemIds.length) {
    const items = await fetchInBatches("/items", newItemIds, apiKey, 150, { lang: "en" });
    for (const item of items) persistentItemNameMap[item.id] = item.name;
    saveItemNamesCache();
  }

  const titleIds    = [...new Set(rows.flatMap(r => r.rewards.filter(x => x.type === "Title" && x.id).map(x => x.id)))];
  const newTitleIds = titleIds.filter(id => !(id in persistentTitleNameMap));
  if (newTitleIds.length) {
    const titles = await fetchInBatches("/titles", newTitleIds, apiKey, 150, { lang: "en" });
    for (const title of titles) persistentTitleNameMap[title.id] = title.name;
    saveTitleNamesCache();
  }

  for (const row of rows) {
    row.rewardStr = formatRewards(row.rewards, persistentItemNameMap, persistentTitleNameMap, row.points);
  }
}

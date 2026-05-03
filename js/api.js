const BASE = "https://api.guildwars2.com/v2";

const MASTERY_REGION_MAP = {
  Tyria:   "Tyria",
  Maguuma: "Heart_of_Thorns",
  Desert:  "Path_of_Fire",
  Tundra:  "Icebrood_Saga",
  Jade:    "End_of_Dragons",
  Sky:     "Secrets_of_the_Obscure",
  Wild:    "Janthir_Wilds",
  Magic:   "Visions_of_Eternity",
};

export async function apiFetch(endpoint, params = {}, apiKey = "") {
  const url = new URL(BASE + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  if (apiKey) url.searchParams.set("access_token", apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GW2 API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchInBatches(endpoint, ids, apiKey = "", batchSize = 150, extraParams = {}) {
  if (!ids.length) return [];
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) batches.push(ids.slice(i, i + batchSize));
  const results = await Promise.all(
    batches.map(b => apiFetch(endpoint, { ids: b.join(","), ...extraParams }, apiKey))
  );
  return results.flat();
}

export async function validateApiKey(key) {
  await apiFetch("/account", {}, key);
}

// Returns one formatted string per reward line (AP on its own line, then each reward).
export function formatRewardsArray(rewards, itemNameMap, titleNameMap, points) {
  const parts = [];
  if (points) parts.push(`AP:${points}`);
  for (const r of rewards) {
    if (r.type === "Coins") {
      const g = Math.floor(r.count / 10000);
      const s = Math.floor((r.count % 10000) / 100);
      const c = r.count % 100;
      parts.push([g && `${g}g`, s && `${s}s`, c && `${c}c`].filter(Boolean).join(" "));
    } else if (r.type === "Item") {
      const name = itemNameMap[r.id] || `Item#${r.id}`;
      parts.push(r.count > 1 ? `${r.count}x ${name}` : name);
    } else if (r.type === "Mastery") {
      const file = MASTERY_REGION_MAP[r.region] || "Tyria";
      parts.push(`MASTERY:${file}`);
    } else if (r.type === "Title") {
      const name = titleNameMap[r.id];
      parts.push(name ? `[${name}]` : `[Title#${r.id}]`);
    }
  }
  return parts;
}

// Convenience wrapper that joins the array for use in table cells / tile chips.
export function formatRewards(rewards, itemNameMap, titleNameMap, points) {
  return formatRewardsArray(rewards, itemNameMap, titleNameMap, points).join(" · ");
}
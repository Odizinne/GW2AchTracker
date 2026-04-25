import { rewardHtml } from "./ui.js";
import {
  persistentItemNameMap, persistentTitleNameMap, persistentSkinNameMap,
  favoritesSet, hiddenSet, toggleFavorite, toggleHidden,
} from "./cache.js";

let _progressMap   = null;
let _currentAchId  = null;
let _onStateChange = null;

export function setModalProgressMap(map) { _progressMap = map; }
export function setModalStateCallback(fn) { _onStateChange = fn; }

export function openAchievementModal(ach, progressEntry) {
  const entry = progressEntry || _progressMap?.[ach.id] || {};

  _currentAchId = ach.id;

  // ── Header ────────────────────────────────────────────────────────────────
  document.getElementById("ach-modal-title").textContent = ach.name;
  document.getElementById("ach-modal-fav-btn").classList.toggle("active",  favoritesSet.has(ach.id));
  document.getElementById("ach-modal-hide-btn").classList.toggle("active", hiddenSet.has(ach.id));

  const wikiUrl = `https://wiki.guildwars2.com/wiki/${encodeURIComponent(ach.name.replace(/ /g, "_"))}`;
  document.getElementById("ach-modal-wiki-btn").onclick = () => window.open(wikiUrl, "_blank", "noopener");

  // ── Description / requirement ─────────────────────────────────────────────
  const descEl = document.getElementById("ach-modal-desc");
  const reqEl  = document.getElementById("ach-modal-req");
  descEl.textContent = ach.description || "";
  descEl.classList.toggle("hidden", !ach.description);
  reqEl.textContent = ach.requirement || "";
  reqEl.classList.toggle("hidden", !ach.requirement);

  document.getElementById("ach-modal-flags").classList.add("hidden");

  // ── Progress ──────────────────────────────────────────────────────────────
  const progressSection = document.getElementById("ach-modal-progress-section");
  if (entry.done !== undefined || entry.current !== undefined) {
    const tiers    = ach.tiers || [];
    const progress = entry.current || 0;
    const done     = entry.done || false;
    const maxTier  = tiers[tiers.length - 1];
    const required = maxTier?.count ?? null;
    const pct      = done ? 100 : required
      ? Math.min(100, Math.round((progress / required) * 1000) / 10)
      : null;

    const tiersHtml = tiers.length ? `
      <div class="ach-modal-tiers">
        ${tiers.map(t => {
          const reached = done || progress >= t.count;
          return `<div class="ach-tier ${reached ? "tier-reached" : ""}">
            <span class="tier-count">${t.count}</span>
            <span class="tier-pts">${t.points} AP</span>
          </div>`;
        }).join("")}
      </div>` : "";

    const barHtml = required ? `
      <div class="ach-modal-bar-wrap">
        <div class="prog-bar-bg">
          <div class="prog-bar-fill" style="width:${pct ?? 0}%;background:${done ? "var(--green)" : "var(--accent)"}"></div>
        </div>
        <span class="ach-modal-bar-label">${done ? "Completed" : `${progress} / ${required}${pct !== null ? ` (${pct}%)` : ""}`}</span>
      </div>` : "";

    progressSection.innerHTML = `
      <div class="ach-modal-section-label">Progress</div>
      ${barHtml}
      ${tiersHtml}
    `;
    progressSection.classList.remove("hidden");
  } else {
    progressSection.classList.add("hidden");
  }

  // ── Bits (steps) ──────────────────────────────────────────────────────────
  const bitsSection = document.getElementById("ach-modal-bits-section");
  const bits = ach.bits || [];
  if (bits.length) {
    const completedBits = new Set(entry.bits || []);
    const bitsHtml = bits.map((bit, i) => {
      const done = entry.done || completedBits.has(i);
      let label = "";
      if      (bit.type === "Text")    label = bit.text || `Step ${i + 1}`;
      else if (bit.type === "Item")    label = persistentItemNameMap[bit.id] || `Item #${bit.id}`;
      else if (bit.type === "Minipet") label = persistentItemNameMap[bit.id] || `Minipet #${bit.id}`;
      else if (bit.type === "Skin")    label = persistentSkinNameMap[bit.id]  || `Skin #${bit.id}`;
      else                             label = `Step ${i + 1}`;
      return `<div class="ach-bit ${done ? "bit-done" : ""}">
        <span class="bit-checkbox" aria-hidden="true"></span>
        <span class="bit-label">${label}</span>
      </div>`;
    }).join("");
    bitsSection.innerHTML = `
      <div class="ach-modal-section-label">Steps</div>
      <div class="ach-bits-list">${bitsHtml}</div>
    `;
    bitsSection.classList.remove("hidden");
  } else {
    bitsSection.classList.add("hidden");
  }

  // ── Rewards ───────────────────────────────────────────────────────────────
  const rewardsSection = document.getElementById("ach-modal-rewards-section");
  const totalPoints = ach.point_cap ?? (ach.tiers || []).reduce((s, t) => s + (t.points || 0), 0);
  const rewardLines = buildRewardLines(ach.rewards || [], totalPoints);
  if (rewardLines.length) {
    const linesHtml = rewardLines.map(line =>
      `<div class="ach-modal-reward-row">${rewardHtml(line)}</div>`
    ).join("");
    rewardsSection.innerHTML = `
      <div class="ach-modal-section-label">Rewards</div>
      <div class="ach-modal-rewards">${linesHtml}</div>
    `;
    rewardsSection.classList.remove("hidden");
  } else {
    rewardsSection.classList.add("hidden");
  }

  document.getElementById("ach-modal-overlay").classList.add("open");
}

// Returns one formatted string per reward line (AP on its own line, then each reward)
function buildRewardLines(rewards, points) {
  const MASTERY_MAP = {
    Tyria:   "Tyria",
    Maguuma: "Heart_of_Thorns",
    Desert:  "Path_of_Fire",
    Tundra:  "Icebrood_Saga",
    Jade:    "End_of_Dragons",
    Sky:     "Secrets_of_the_Obscure",
    Wild:    "Janthir_Wilds",
    Magic:   "Visions_of_Eternity",
  };

  const lines = [];

  if (points) lines.push(`AP:${points}`);

  for (const r of rewards) {
    if (r.type === "Coins") {
      const g = Math.floor(r.count / 10000);
      const s = Math.floor((r.count % 10000) / 100);
      const c = r.count % 100;
      lines.push([g && `${g}g`, s && `${s}s`, c && `${c}c`].filter(Boolean).join(" "));
    } else if (r.type === "Item") {
      const name = persistentItemNameMap[r.id] || `Item#${r.id}`;
      lines.push(r.count > 1 ? `${r.count}x ${name}` : name);
    } else if (r.type === "Mastery") {
      lines.push(`MASTERY:${MASTERY_MAP[r.region] || "Tyria"}`);
    } else if (r.type === "Title") {
      const name = persistentTitleNameMap[r.id];
      lines.push(name ? `[${name}]` : `[Title#${r.id}]`);
    }
  }

  return lines;
}

export function initAchModal() {
  document.getElementById("ach-modal-close").addEventListener("click", () =>
    document.getElementById("ach-modal-overlay").classList.remove("open")
  );
  document.getElementById("ach-modal-overlay").addEventListener("click", e => {
    if (e.target.id === "ach-modal-overlay")
      document.getElementById("ach-modal-overlay").classList.remove("open");
  });

  document.getElementById("ach-modal-fav-btn").addEventListener("click", () => {
    if (_currentAchId == null) return;
    toggleFavorite(_currentAchId);
    document.getElementById("ach-modal-fav-btn").classList.toggle("active", favoritesSet.has(_currentAchId));
    _onStateChange?.(_currentAchId, "favorite");
  });

  document.getElementById("ach-modal-hide-btn").addEventListener("click", () => {
    if (_currentAchId == null) return;
    toggleHidden(_currentAchId);
    document.getElementById("ach-modal-hide-btn").classList.toggle("active", hiddenSet.has(_currentAchId));
    _onStateChange?.(_currentAchId, "hidden");
  });
}
import { formatRewardsArray } from "./api.js";
import {
  getItemNameMap, getTitleNameMap, getSkinNameMap,
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
  const itemNameMap = getItemNameMap();
  const skinNameMap = getSkinNameMap();
  if (bits.length) {
    const completedBits = new Set(entry.bits || []);
    const bitsHtml = bits.map((bit, i) => {
      const done = entry.done || completedBits.has(i);
      let label = "";
      if      (bit.type === "Text")    label = bit.text || `Step ${i + 1}`;
      else if (bit.type === "Item")    label = itemNameMap[bit.id] || `Item #${bit.id}`;
      else if (bit.type === "Minipet") label = itemNameMap[bit.id] || `Minipet #${bit.id}`;
      else if (bit.type === "Skin")    label = skinNameMap[bit.id]  || `Skin #${bit.id}`;
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
  const rewardLines = formatRewardsArray(
    ach.rewards || [],
    getItemNameMap(),
    getTitleNameMap(),
    totalPoints,
  );
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

function rewardHtml(str) {
  return str
    .replace(/AP:(\d+)/g, '<img src="assets/AP.png" class="ap-icon" alt="AP"> $1')
    .replace(/MASTERY:([A-Za-z_]+)/g, (_, file) =>
      `<img src="assets/mastery/${file}.png" class="mastery-icon" alt="${file.replace(/_/g, " ")}">`
    )
    .replace(/\[([^\]]+)\]/g, '[<em>$1</em>]');
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
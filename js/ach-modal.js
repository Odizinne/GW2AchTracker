import { formatRewardsArray } from "./api.js";
import {
  getItemNameMap, getTitleNameMap, getSkinNameMap,
  favoritesSet, hiddenSet, toggleFavorite, toggleHidden,
} from "./cache.js";
import { closeModal } from "./ui.js";
import { resolveWikiUrl, getLang, t } from "./i18n.js";

let _progressMap   = null;
let _currentAchId  = null;
let _onStateChange = null;
// We also store the EN name so we can resolve the wiki URL correctly
let _currentEnName = null;

export function setModalProgressMap(map) { _progressMap = map; }
export function setModalStateCallback(fn) { _onStateChange = fn; }

export function openAchievementModal(ach, progressEntry, enName = null) {
  const entry = progressEntry || _progressMap?.[ach.id] || {};

  _currentAchId  = ach.id;
  _currentEnName = enName || ach.name; // fallback to ach.name if EN not provided

  document.getElementById("ach-modal-title").textContent = ach.name;
  document.getElementById("ach-modal-fav-btn").classList.toggle("active",  favoritesSet.has(ach.id));
  document.getElementById("ach-modal-hide-btn").classList.toggle("active", hiddenSet.has(ach.id));

  // Wiki button — resolve async, open when ready
  const wikiBtn = document.getElementById("ach-modal-wiki-btn");
  wikiBtn.onclick = async () => {
    const lang = getLang();
    const url  = await resolveWikiUrl(_currentEnName, ach.name, lang);
    window.open(url, "_blank", "noopener");
  };

  const descEl = document.getElementById("ach-modal-desc");
  const reqEl  = document.getElementById("ach-modal-req");
  descEl.textContent = ach.description || "";
  descEl.classList.toggle("hidden", !ach.description);
  reqEl.textContent = ach.requirement || "";
  reqEl.classList.toggle("hidden", !ach.requirement);

  document.getElementById("ach-modal-flags").classList.add("hidden");

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
        ${tiers.map(tier => {
          const reached = done || progress >= tier.count;
          return `<div class="ach-tier ${reached ? "tier-reached" : ""}">
            <span class="tier-count">${tier.count}</span>
            <span class="tier-pts">${tier.points} AP</span>
          </div>`;
        }).join("")}
      </div>` : "";

    const barHtml = required ? `
      <div class="ach-modal-bar-wrap">
        <div class="prog-bar-bg">
          <div class="prog-bar-fill" style="width:${pct ?? 0}%;background:${done ? "var(--green)" : "var(--accent)"}"></div>
        </div>
        <span class="ach-modal-bar-label">${done ? t("progCompleted") : `${progress} / ${required}${pct !== null ? ` (${pct}%)` : ""}`}</span>
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

  const rewardsSection = document.getElementById("ach-modal-rewards-section");
  const totalPoints = ach.point_cap ?? (ach.tiers || []).reduce((s, tier) => s + (tier.points || 0), 0);
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
    closeModal("ach-modal-overlay")
  );
  document.getElementById("ach-modal-overlay").addEventListener("click", e => {
    if (e.target.id === "ach-modal-overlay")
      closeModal("ach-modal-overlay");
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
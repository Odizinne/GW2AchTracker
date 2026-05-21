import { formatRewardsArray } from "./api.js";
import {
  getItemNameMap, getTitleNameMap, getSkinNameMap,
  getItemDescMap, getSkinDescMap, getMiniNameMap,
  getItemIconMap, getMiniIconMap, getSkinIconMap, getItemRarityMap,
  favoritesSet, hiddenSet, toggleFavorite, toggleHidden,
} from "./cache.js";
import { closeModal, stripGw2Markup, rewardHtml } from "./ui.js";
import { resolveWikiUrl, getLang, t } from "./i18n.js";

let _progressMap   = null;
let _currentAchId  = null;
let _onStateChange = null;
let _currentEnName = null;
let _currentCat    = null;
let _onBackCategory = null;

export function setModalProgressMap(map) { _progressMap = map; }
export function setModalStateCallback(fn) { _onStateChange = fn; }
export function setModalBackCallback(fn)  { _onBackCategory = fn; }

// ── Tooltip ──────────────────────────────────────────────────────────────────

let _tooltip = null;

function _getTooltip() {
  if (!_tooltip) {
    _tooltip = document.createElement("div");
    _tooltip.className = "ach-item-tooltip hidden";
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function _showTip(cell) {
  const tip    = _getTooltip();
  const name   = cell.dataset.tipName   || "";
  const desc   = cell.dataset.tipDesc   || "";
  const rarity = cell.dataset.tipRarity || "";
  if (!name && !desc) return;

  tip.innerHTML = "";
  if (name) {
    const nameEl = document.createElement("div");
    nameEl.className = "tip-name";
    if (rarity) nameEl.dataset.rarity = rarity;
    nameEl.textContent = name;
    tip.appendChild(nameEl);
  }
  if (desc) {
    const descEl = document.createElement("div");
    descEl.className = "tip-desc";
    descEl.textContent = desc;
    tip.appendChild(descEl);
  }

  tip.classList.remove("hidden");
  const rect = cell.getBoundingClientRect();
  const tw   = tip.offsetWidth;
  const th   = tip.offsetHeight;
  let left   = rect.left + (rect.width - tw) / 2;
  let top    = rect.top - th - 6;
  if (left < 4) left = 4;
  if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
  if (top < 4) top = rect.bottom + 6;
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

function _hideTip() {
  _getTooltip().classList.add("hidden");
}

// ── ItemSet grid ─────────────────────────────────────────────────────────────

function _renderItemSetGrid(bits, entry, ach) {
  const itemNameMap = getItemNameMap();
  const skinNameMap = getSkinNameMap();
  const itemDescMap = getItemDescMap();
  const skinDescMap = getSkinDescMap();
  const miniNameMap = getMiniNameMap();
  const itemIconMap   = getItemIconMap();
  const miniIconMap   = getMiniIconMap();
  const skinIconMap   = getSkinIconMap();
  const itemRarityMap = getItemRarityMap();

  const isRepeatable = (ach.flags || []).some(f =>
    ["Repeatable", "Daily", "Weekly", "Monthly"].includes(f)
  );
  // For repeatables, entry.bits reflects current-cycle progress.
  const completedBits = new Set(entry.bits || []);

  const cells = bits.map((bit, i) => {
    const done = entry.done || completedBits.has(i);
    let icon   = "";
    let name   = "";
    let desc   = "";
    let rarity = "";

    if (bit.type === "Minipet") {
      icon = miniIconMap[bit.id] || "";
      name = miniNameMap[bit.id] || `Mini #${bit.id}`;
      desc = _bitDesc(bit, "");
    } else if (bit.type === "Item") {
      icon   = itemIconMap[bit.id]   || "";
      name   = itemNameMap[bit.id]   || `Item #${bit.id}`;
      rarity = itemRarityMap[bit.id] || "";
      desc   = _bitDesc(bit, itemDescMap[bit.id] || "");
    } else if (bit.type === "Skin") {
      icon = skinIconMap[bit.id] || "";
      name = skinNameMap[bit.id] || `Skin #${bit.id}`;
      desc = _bitDesc(bit, skinDescMap[bit.id] || "");
    }

    return `<div class="ach-itemset-cell ${done ? "bit-done" : ""}"
      data-tip-name="${_esc(name)}" data-tip-desc="${_esc(desc)}" data-tip-rarity="${rarity}">
      ${icon ? `<img src="${icon}" alt="" loading="lazy">` : ""}
    </div>`;
  });

  // Pad the last row to always fill 7 columns
  const rem = bits.length % 7;
  if (rem !== 0) {
    for (let i = 0; i < 7 - rem; i++) {
      cells.push(`<div class="ach-itemset-cell empty"></div>`);
    }
  }

  return `<div class="ach-itemset-grid">${cells.join("")}</div>`;
}

function _bitDesc(bit, fallback) {
  const raw = bit.text || fallback;
  if (!raw) return "";
  return stripGw2Markup(raw.replace(/<br\s*\/?>/gi, "\n"));
}

function _esc(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function openAchievementModal(ach, progressEntry, enName = null, cat = null) {
  const entry = progressEntry || _progressMap?.[ach.id] || {};

  _currentAchId  = ach.id;
  _currentEnName = enName || ach.name;
  _currentCat    = cat;

  document.getElementById("ach-modal-back-btn").classList.toggle("hidden", !cat);
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
  descEl.textContent = ach.description ? stripGw2Markup(ach.description) : "";
  descEl.classList.toggle("hidden", !ach.description);
  reqEl.textContent = ach.requirement ? stripGw2Markup(ach.requirement) : "";
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
  if (bits.length) {
    if (ach.type === "ItemSet") {
      bitsSection.innerHTML = `
        <div class="ach-modal-section-label">Collection</div>
        ${_renderItemSetGrid(bits, entry, ach)}
      `;
      // Attach tooltip via event delegation on the grid
      const grid = bitsSection.querySelector(".ach-itemset-grid");
      let _activeCell = null;
      grid.addEventListener("mouseover", e => {
        const cell = e.target.closest(".ach-itemset-cell:not(.empty)");
        if (cell === _activeCell) return;
        _activeCell = cell;
        if (cell) _showTip(cell); else _hideTip();
      });
      grid.addEventListener("mouseleave", () => { _activeCell = null; _hideTip(); });
    } else {
      const itemNameMap = getItemNameMap();
      const skinNameMap = getSkinNameMap();
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
    }
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
    const rwMaps = { itemIconMap: getItemIconMap(), itemDescMap: getItemDescMap(), itemRarityMap: getItemRarityMap() };
    const linesHtml = rewardLines.map(line =>
      `<div class="ach-modal-reward-row">${rewardHtml(line, rwMaps)}</div>`
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


export function initAchModal() {
  document.getElementById("ach-modal-close").addEventListener("click", () => {
    _hideTip();
    closeModal("ach-modal-overlay");
  });

  document.getElementById("ach-modal-back-btn").addEventListener("click", () => {
    if (!_currentCat) return;
    _hideTip();
    closeModal("ach-modal-overlay");
    _onBackCategory?.(_currentCat);
  });
  document.getElementById("ach-modal-overlay").addEventListener("click", e => {
    if (e.target.id === "ach-modal-overlay") {
      _hideTip();
      closeModal("ach-modal-overlay");
    }
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

const MAX_AP        = 60000;
const CHEST_SPACING = 120;   // px between consecutive chest centers
const CHEST_PAD     = 20;    // px from canvas edge to first/last chest center
const CHEST_SIZE    = 44;    // px

// Y coordinates inside the 160px canvas
const FRISE_H  = 160;
const BAR_CY   = 80;   // bar vertical center
const BAR_H    = 4;
const TOP_CY   = 42;   // top-row chest center
const BOT_CY   = 118;  // bottom-row chest center

const CT = ["", "Achievement Chest", "Large Achievement Chest", "Heavy Achievement Chest", "Massive Achievement Chest"];

// [ap, chestType, bonuses[], laurels, gold, gems, title, choice]
const _RAW = [
  [100,   1, [],                                                              1,  1,   0, null,                    null],
  [500,   1, ["Magic Find +1%"],                                             1,  1,   0, null,                    null],
  [1000,  2, ["Gold Find +1%"],                                              2,  1,   0, null,                    "Zenith weapon skins"],
  [1500,  1, ["Karma Gain +1%"],                                             1,  1,   0, null,                    null],
  [2000,  2, ["XP Gain +1%"],                                                2,  1,   0, null,                    "Zenith weapon skins"],
  [2500,  3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [3000,  2, ["Magic Find +1%"],                                             2,  1,   0, null,                    "Radiant/Hellfire Vambraces Skin"],
  [3500,  1, ["Gold Find +1%"],                                              1,  1,   0, null,                    null],
  [4000,  2, ["Karma Gain +1%"],                                             2,  1,   0, null,                    "Zenith weapon skins"],
  [4500,  1, ["XP Gain +1%"],                                                1,  1,   0, null,                    null],
  [5000,  4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 15, 400, "Respected Achiever",   "Zenith weapon skins"],
  [5500,  1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [6000,  2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Radiant/Hellfire Mantle Skin"],
  [6500,  1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [7000,  2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Zenith weapon skins"],
  [7500,  3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [8000,  2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [8500,  1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [9000,  2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Radiant/Hellfire Warhelm Skin"],
  [9500,  1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [10000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Acclaimed Achiever",   "Zenith weapon skins"],
  [10500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [11000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Zenith weapon skins"],
  [11500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [12000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Radiant/Hellfire Vambraces Skin"],
  [12500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [13000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [13500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [14000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [14500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [15000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Heralded Achiever",    "Radiant/Hellfire Mantle Skin"],
  [15500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [16000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Zenith weapon skins"],
  [16500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [17000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Zenith weapon skins"],
  [17500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [18000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Radiant/Hellfire Warhelm Skin"],
  [18500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [19000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [19500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [20000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Masterful Achiever",   "Zenith weapon skins"],
  [20500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [21000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Radiant/Hellfire Greaves Skin"],
  [21500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [22000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Zenith weapon skins"],
  [22500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [23000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [23500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [24000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Radiant/Hellfire Greaves Skin"],
  [24500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [25000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Illustrious Achiever", "Zenith weapon skins"],
  [25500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [26000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Zenith weapon skins"],
  [26500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [27000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Radiant/Hellfire Legs Skin"],
  [27500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [28000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Zenith weapon skins"],
  [28500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [29000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [29500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [30000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Wondrous Achiever",    "Radiant/Hellfire Chestpiece Skin"],
  [30500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [31000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Pinnacle weapon skins"],
  [31500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [32000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Pinnacle weapon skins"],
  [32500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [33000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Radiant/Hellfire Legs Skin"],
  [33500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [34000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [34500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [35000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Exalted Achiever",     "Pinnacle weapon skins"],
  [35500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [36000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Radiant/Hellfire Chestpiece Skin"],
  [36500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [37000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Pinnacle weapon skins"],
  [37500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [38000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [38500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [39000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Radiant/Hellfire Backguard Skin"],
  [39500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [40000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Furious Achiever",     "Pinnacle weapon skins"],
  [40500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [41000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Pinnacle weapon skins"],
  [41500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [42000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Radiant/Hellfire Backguard Skin"],
  [42500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [43000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [43500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [44000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [44500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [45000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Unstoppable Achiever", null],
  [45500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [46000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Pinnacle weapon skins"],
  [46500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [47000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Pinnacle weapon skins"],
  [47500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [48000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    null],
  [48500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [49000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [49500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [50000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Ascended Achiever",    "Pinnacle weapon skins"],
  [50500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [51000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    null],
  [51500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [52000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    "Pinnacle weapon skins"],
  [52500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [53000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    "Pinnacle weapon skins"],
  [53500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [54000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    null],
  [54500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [55000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Insatiable Achiever",  "Pinnacle weapon skins"],
  [55500, 1, ["Magic Find +1%"],                                             1,  2,   0, null,                    null],
  [56000, 2, ["Gold Find +1%"],                                              2,  2,   0, null,                    "Pinnacle weapon skins"],
  [56500, 1, ["Karma Gain +1%"],                                             1,  2,   0, null,                    null],
  [57000, 2, ["XP Gain +1%"],                                                2,  2,   0, null,                    null],
  [57500, 3, ["Gold Find +1%","Karma Gain +1%","XP Gain +2%"],              5,  5,   0, null,                    null],
  [58000, 2, ["Magic Find +1%"],                                             2,  2,   0, null,                    null],
  [58500, 1, ["Gold Find +1%"],                                              1,  2,   0, null,                    null],
  [59000, 2, ["Karma Gain +1%"],                                             2,  2,   0, null,                    null],
  [59500, 1, ["XP Gain +1%"],                                                1,  2,   0, null,                    null],
  [60000, 4, ["Magic Find +1%","Karma Gain +1%","XP Gain +2%"],             10, 30, 400, "Uncontrollable Achiever", null],
];

export const AP_REWARDS = _RAW.map(([ap, ct, bonuses, laurels, gold, gems, title, choice]) => ({
  ap, chest: CT[ct], bonuses, laurels, gold, gems, title, choice,
}));

// Compute total account AP from raw progress map + achievement definition cache.
export function computeAccountAp(progressMap, achCache) {
  let total = 0;
  for (const [idStr, entry] of Object.entries(progressMap)) {
    const ach = achCache[Number(idStr)];
    if (!ach?.tiers?.length) continue;
    const isRep = (ach.flags || []).some(f => f === "Daily" || f === "Weekly" || f === "Repeatable");
    const prog  = entry.current  || 0;
    const done  = entry.done     || false;
    const reps  = entry.repeated || 0;
    if (isRep) {
      const lapPts = ach.tiers.reduce((s, t) => s + (t.points || 0), 0);
      total += lapPts * reps;
      for (const t of ach.tiers) if (prog >= t.count) total += t.points || 0;
    } else {
      for (const t of ach.tiers) if (done || prog >= t.count) total += t.points || 0;
    }
  }
  return total;
}

// Render the frise into the canvas element and set up all interactions.
export function renderApFrise(canvasEl, scrollEl, tooltipEl, currentAp) {
  const n    = AP_REWARDS.length;                   // 122
  const barW = (n - 1) * CHEST_SPACING;             // first chest ↔ last chest
  const totalW = CHEST_PAD + barW + CHEST_PAD;

  canvasEl.style.width  = totalW + "px";
  canvasEl.style.height = FRISE_H + "px";

  const ap       = Math.max(0, currentAp);
  const capped   = Math.min(ap, MAX_AP);
  const fillW    = Math.round((capped / MAX_AP) * barW);

  const barTop  = BAR_CY - BAR_H / 2;
  const barBot  = BAR_CY + BAR_H / 2;
  const barLeft = CHEST_PAD;

  let html = "";

  // Progress bar background + fill
  html += `<div class="ap-bar-bg" style="left:${barLeft}px;top:${barTop}px;width:${barW}px;height:${BAR_H}px;">`;
  html += `<div class="ap-bar-fill" style="width:${fillW}px;"></div>`;
  html += `</div>`;

  // Chests and connector lines
  for (let i = 0; i < n; i++) {
    const r        = AP_REWARDS[i];
    const cx       = CHEST_PAD + i * CHEST_SPACING;
    const isTop    = i % 2 === 0;
    const cy       = isTop ? TOP_CY : BOT_CY;
    const unlocked = ap >= r.ap;

    // Connector line — from bar center to chest center
    const lineX   = cx - 1;
    const lineTop = isTop ? cy  : BAR_CY;
    const lineH   = Math.abs(BAR_CY - cy);
    const lineClr = unlocked ? "var(--accent)" : "var(--bg4)";
    html += `<div class="ap-chest-line" style="left:${lineX}px;top:${lineTop}px;height:${lineH}px;background:${lineClr};"></div>`;

    // Chest image
    const src      = unlocked ? "assets/Bonus_chest_open.png" : "assets/Bonus_chest.png";
    const imgLeft  = cx - CHEST_SIZE / 2;
    const imgTop   = cy - CHEST_SIZE / 2;
    html += `<img class="ap-chest" data-idx="${i}" data-unlocked="${unlocked}" src="${src}"
      style="left:${imgLeft}px;top:${imgTop}px;width:${CHEST_SIZE}px;height:${CHEST_SIZE}px;" draggable="false">`;

    // AP label next to chest
    const labelTxt = r.ap.toLocaleString();
    if (isTop) {
      const lx = cx + CHEST_SIZE / 2 + 4;
      html += `<div class="ap-chest-label" style="left:${lx}px;top:${cy}px;">${labelTxt}</div>`;
    } else {
      const rightEdge = cx - CHEST_SIZE / 2 - 4;
      const rightVal  = totalW - rightEdge;
      html += `<div class="ap-chest-label" style="right:${rightVal}px;top:${cy}px;">${labelTxt}</div>`;
    }
  }

  canvasEl.innerHTML = html;

  // Auto-scroll: centre current AP position at ~40% from left of viewport
  requestAnimationFrame(() => {
    const fillRight = CHEST_PAD + fillW;
    scrollEl.scrollLeft = Math.max(0, fillRight - scrollEl.clientWidth * 0.4);
  });

  // Drag-to-scroll
  let dragX = 0, dragging = false;
  scrollEl.addEventListener("mousedown", e => {
    dragging = true;
    dragX = e.clientX + scrollEl.scrollLeft;
    scrollEl.style.cursor = "grabbing";
    e.preventDefault();
  });
  window.addEventListener("mousemove", e => {
    if (!dragging) return;
    scrollEl.scrollLeft = dragX - e.clientX;
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    scrollEl.style.cursor = "";
  });

  // Hover interactions
  canvasEl.querySelectorAll(".ap-chest").forEach(el => {
    const unlocked = el.dataset.unlocked === "true";

    el.addEventListener("mouseenter", e => {
      el.src = "assets/Bonus_chest_open.png";
      const r = AP_REWARDS[+el.dataset.idx];
      tooltipEl.innerHTML = _buildTooltip(r, unlocked);
      tooltipEl.classList.add("visible");
      _posTooltip(e, tooltipEl);
    });

    el.addEventListener("mousemove", e => _posTooltip(e, tooltipEl));

    el.addEventListener("mouseleave", () => {
      el.src = unlocked ? "assets/Bonus_chest_open.png" : "assets/Bonus_chest.png";
      tooltipEl.classList.remove("visible");
    });
  });
}

function _posTooltip(e, el) {
  const margin = 12;
  let x = e.clientX + margin;
  let y = e.clientY - 8;
  const w = el.offsetWidth  || 240;
  const h = el.offsetHeight || 80;
  if (x + w + margin > window.innerWidth)  x = e.clientX - w - margin;
  if (y + h + margin > window.innerHeight) y = window.innerHeight - h - margin;
  el.style.left = x + "px";
  el.style.top  = y + "px";
}

const _BONUS_ICON = {
  "Magic Find": "luck_gain.png",
  "Gold Find":  "gold_gain.png",
  "Karma Gain": "karma_gain.png",
  "XP Gain":    "xp_gain.png",
};

function _tipIcon(file) {
  return `<img src="assets/${file}" class="ap-tip-icon">`;
}

function _buildTooltip(r, unlocked) {
  let h = `<div class="ap-tip-ap">${r.ap.toLocaleString()} AP</div>`;
  h += `<div class="ap-tip-chest">${r.chest}</div>`;
  if (r.bonuses.length) {
    const bonusHtml = r.bonuses.map(b => {
      const key  = Object.keys(_BONUS_ICON).find(k => b.startsWith(k));
      const icon = key ? _tipIcon(_BONUS_ICON[key]) : "";
      return icon + b;
    }).join(" · ");
    h += `<div class="ap-tip-bonus">${bonusHtml}</div>`;
  }
  const loot = [];
  if (r.laurels) loot.push(_tipIcon("laurel.png") + r.laurels + " Laurel" + (r.laurels > 1 ? "s" : ""));
  if (r.gold)    loot.push(_tipIcon("gold.png")   + r.gold    + " Gold");
  if (r.gems)    loot.push(_tipIcon("gems.png")   + r.gems    + " Gems");
  if (loot.length) h += `<div class="ap-tip-loot">${loot.join(" · ")}</div>`;
  if (r.title)  h += `<div class="ap-tip-title">${_tipIcon("title.png")}${r.title}</div>`;
  if (r.choice) h += `<div class="ap-tip-choice">+ ${r.choice}</div>`;
  return h;
}

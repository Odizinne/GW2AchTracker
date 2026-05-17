import { loadCache, loadDailyCollapsed, toggleDailyCollapsed } from "./cache.js";
import { getCategories } from "./browser.js";
import { FRACTAL_SCALES, TIER_NAMES, scaleTier } from "./fractal-scales.js";

const WEEKLY_CAT_ID = 261;

// T1 Initiate, T2 Adept, T3 Expert, T4 Master
const FIGHTER_IDS = [5453, 5441, 5448, 5452];

function normName(s) {
  return s.replace(/ Fractal$/, "").trim().toLowerCase().replace(/[''']/g, "");
}

function buildBitMap(bits) {
  const map = {};
  bits.forEach((bit, i) => { map[normName(bit.text)] = i; });
  return map;
}

// All 25 scales for the tier in ascending order.
// bitIndex may be undefined for fractals not tracked by the achievement (Kinfall, Lonely Tower).
function getTierRows(tier, bitMap) {
  const rows = [];
  for (const [scale, name] of FRACTAL_SCALES) {
    if (scaleTier(scale) !== tier) continue;
    rows.push({ scale, name, bitIndex: bitMap[normName(name)] });
  }
  return rows;
}

export function weeklyResetCountdown() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(7, 30, 0, 0);
  const dow = next.getUTCDay();
  let daysUntilMonday = (1 - dow + 7) % 7;
  if (daysUntilMonday === 0 && next <= now) daysUntilMonday = 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  const diff = next - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function renderWeeklyView(container, progressMap, onOpenAch) {
  container.innerHTML = "";

  if (!progressMap) {
    container.innerHTML = `<div class="daily-empty">Press Update to load your achievements.</div>`;
    return;
  }

  const cache = loadCache();
  const refAch = cache[FIGHTER_IDS[0]];
  if (!refAch?.bits?.length) {
    container.innerHTML = `<div class="daily-empty">Achievement data not loaded — press Update.</div>`;
    return;
  }

  const cats = getCategories();
  const weeklyCat = cats ? Object.values(cats).find(c => c.name === "Weekly Fractals") ?? null : null;

  const bitMap = buildBitMap(refAch.bits);
  const collapsed = loadDailyCollapsed();
  const isCollapsed = collapsed.has(WEEKLY_CAT_ID);

  const wrap = document.createElement("div");
  wrap.className = "fractal-table-wrap weekly-wrap" + (isCollapsed ? " daily-col-collapsed" : "");

  const sectionHeader = document.createElement("div");
  sectionHeader.className = "daily-col-header";
  sectionHeader.textContent = "Weekly Fractals";
  sectionHeader.addEventListener("click", () => {
    toggleDailyCollapsed(WEEKLY_CAT_ID);
    wrap.classList.toggle("daily-col-collapsed");
  });
  wrap.appendChild(sectionHeader);

  const body = document.createElement("div");
  body.className = "daily-col-body";
  const bodyInner = document.createElement("div");
  bodyInner.className = "daily-col-body-inner";
  body.appendChild(bodyInner);
  wrap.appendChild(body);

  const grid = document.createElement("div");
  grid.className = "weekly-grid";

  for (let t = 0; t < 4; t++) {
    const achId = FIGHTER_IDS[t];
    const ach = cache[achId];
    const required = ach?.tiers?.[0]?.count ?? 0;
    const entry = progressMap[achId] || {};
    const isDone = entry.done || false;
    const completedBits = new Set(entry.bits || []);
    const current = isDone ? required : Math.min(required, entry.current || 0);
    const pct = required ? Math.min(100, (current / required) * 100) : 0;
    const rows = getTierRows(t + 1, bitMap);

    const col = document.createElement("div");
    col.className = "weekly-tier-col";

    const header = document.createElement("div");
    header.className = "weekly-tier-header";

    const headerTop = document.createElement("div");
    headerTop.className = "weekly-tier-header-top";

    const nameEl = document.createElement("span");
    nameEl.className = "weekly-tier-name";
    nameEl.textContent = `T${t + 1} – ${TIER_NAMES[t]}`;

    const countEl = document.createElement("span");
    countEl.className = "weekly-tier-count";
    countEl.textContent = `${current} / ${required}`;

    headerTop.appendChild(nameEl);
    headerTop.appendChild(countEl);
    header.appendChild(headerTop);

    const progWrap = document.createElement("div");
    progWrap.className = "weekly-tier-progress-wrap";
    const progFill = document.createElement("div");
    progFill.className = "weekly-tier-progress-fill" + (isDone ? " weekly-tier-progress-done" : "");
    progFill.style.width = `${pct}%`;
    progWrap.appendChild(progFill);
    header.appendChild(progWrap);

    col.appendChild(header);

    for (const { scale, name, bitIndex } of rows) {
      const done = isDone || (bitIndex !== undefined && completedBits.has(bitIndex));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "weekly-fractal-row" + (done ? " weekly-fractal-done" : "");

      const numEl = document.createElement("span");
      numEl.className = "weekly-fractal-num";
      numEl.textContent = scale;

      const nameSpan = document.createElement("span");
      nameSpan.className = "weekly-fractal-name";
      nameSpan.textContent = name;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "daily-item-cb";
      cb.checked = done;
      cb.tabIndex = -1;

      btn.appendChild(numEl);
      btn.appendChild(nameSpan);
      btn.appendChild(cb);
      btn.addEventListener("click", () => onOpenAch(achId, weeklyCat));
      col.appendChild(btn);
    }

    grid.appendChild(col);
  }

  bodyInner.appendChild(grid);
  container.appendChild(wrap);
}

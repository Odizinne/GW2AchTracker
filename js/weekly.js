import { loadCache, loadDailyCollapsed, toggleDailyCollapsed } from "./cache.js";
import { getCategories } from "./browser.js";
import { FRACTAL_SCALES, TIER_NAMES, scaleTier } from "./fractal-scales.js";
import { getRaidCompletions } from "./nearly-done.js";

const WEEKLY_CAT_ID = 261;
const WEEKLY_RAIDS_CAT_ID = 90001;

const RAID_WINGS = [
  { id: "spirit_vale", name: "W1 – Spirit Vale",
    events: [
      { id: "vale_guardian",             name: "Vale Guardian", type: "Boss" },
      { id: "spirit_woods",              name: "Spirit Woods",  type: "Checkpoint" },
      { id: "gorseval_the_multifarious", name: "Gorseval",      type: "Boss" },
      { id: "sabetha_the_saboteur",      name: "Sabetha",       type: "Boss" },
    ]
  },
  { id: "salvation_pass", name: "W2 – Salvation Pass",
    events: [
      { id: "slothasor",       name: "Slothasor",   type: "Boss" },
      { id: "bandit_trio",     name: "Bandit Trio", type: "Boss" },
      { id: "matthias_gabrel", name: "Matthias",    type: "Boss" },
    ]
  },
  { id: "stronghold_of_the_faithful", name: "W3 – Stronghold",
    events: [
      { id: "escort",         name: "Escort",         type: "Checkpoint" },
      { id: "keep_construct", name: "Keep Construct", type: "Boss" },
      { id: "twisted_castle", name: "Twisted Castle", type: "Checkpoint" },
      { id: "xera",           name: "Xera",           type: "Boss" },
    ]
  },
  { id: "bastion_of_the_penitent", name: "W4 – Bastion",
    events: [
      { id: "cairn_the_indomitable", name: "Cairn",            type: "Boss" },
      { id: "mursaat_overseer",      name: "Mursaat Overseer", type: "Boss" },
      { id: "samarog",               name: "Samarog",          type: "Boss" },
      { id: "deimos",                name: "Deimos",           type: "Boss" },
    ]
  },
  { id: "hall_of_chains", name: "W5 – Hall of Chains",
    events: [
      { id: "soulless_horror",   name: "Soulless Horror",   type: "Boss" },
      { id: "river_of_souls",    name: "River of Souls",    type: "Checkpoint" },
      { id: "statues_of_grenth", name: "Statues of Grenth", type: "Checkpoint" },
      { id: "voice_in_the_void", name: "Dhuum",             type: "Boss" },
    ]
  },
  { id: "mythwright_gambit", name: "W6 – Mythwright Gambit",
    events: [
      { id: "conjured_amalgamate", name: "Conjured Amalgamate", type: "Boss" },
      { id: "twin_largos",         name: "Twin Largos",         type: "Boss" },
      { id: "qadim",               name: "Qadim",               type: "Boss" },
    ]
  },
  { id: "the_key_of_ahdashim", name: "W7 – Key of Ahdashim",
    events: [
      { id: "gate",              name: "Gate",                type: "Checkpoint" },
      { id: "adina",             name: "Cardinal Adina",      type: "Boss" },
      { id: "sabir",             name: "Cardinal Sabir",      type: "Boss" },
      { id: "qadim_the_peerless",name: "Qadim the Peerless",  type: "Boss" },
    ]
  },
];

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

function renderRaidsSection(container, completedSet) {
  const collapsed = loadDailyCollapsed();
  const isCollapsed = collapsed.has(WEEKLY_RAIDS_CAT_ID);

  const wrap = document.createElement("div");
  wrap.className = "fractal-table-wrap weekly-wrap" + (isCollapsed ? " daily-col-collapsed" : "");

  const sectionHeader = document.createElement("div");
  sectionHeader.className = "daily-col-header";
  sectionHeader.textContent = "Weekly Raids";
  sectionHeader.addEventListener("click", () => {
    toggleDailyCollapsed(WEEKLY_RAIDS_CAT_ID);
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
  grid.className = "weekly-raids-grid";

  for (const wing of RAID_WINGS) {
    const completed = wing.events.filter(e => completedSet?.has(e.id)).length;
    const total = wing.events.length;
    const isDone = completed === total && completedSet !== null;
    const pct = total ? (completed / total) * 100 : 0;

    const col = document.createElement("div");
    col.className = "weekly-tier-col";

    const header = document.createElement("div");
    header.className = "weekly-tier-header";

    const headerTop = document.createElement("div");
    headerTop.className = "weekly-tier-header-top";

    const nameEl = document.createElement("span");
    nameEl.className = "weekly-tier-name";
    nameEl.textContent = wing.name;

    const countEl = document.createElement("span");
    countEl.className = "weekly-tier-count";
    countEl.textContent = completedSet !== null ? `${completed} / ${total}` : `— / ${total}`;

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

    for (const event of wing.events) {
      const done = completedSet?.has(event.id) ?? false;

      const row = document.createElement("div");
      row.className = "weekly-raid-row" + (done ? " weekly-fractal-done" : "") + (event.type === "Checkpoint" ? " weekly-raid-checkpoint" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "daily-item-cb";
      cb.checked = done;
      cb.tabIndex = -1;

      const nameSpan = document.createElement("span");
      nameSpan.className = "weekly-raid-name";
      nameSpan.textContent = event.name;

      row.appendChild(cb);
      row.appendChild(nameSpan);
      col.appendChild(row);
    }

    grid.appendChild(col);
  }

  bodyInner.appendChild(grid);
  container.appendChild(wrap);
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
    renderRaidsSection(container, getRaidCompletions());
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

  renderRaidsSection(container, getRaidCompletions());
}

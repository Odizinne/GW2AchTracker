import { openModal, closeModal } from "./ui.js";
import { getProgressMap, getRaidCompletions } from "./nearly-done.js";

// ── Raid wing daily rotation data ────────────────────────────────────────────
// The GW2 raid wing schedule follows a fixed 12-day repeating cycle, anchored
// to EPOCH. Each day exposes 4 boss dailies (2 from a 6-entry alternating set,
// 2 from a 12-entry set), and each boss belongs to a wing (or, for EoD/SotO and
// Icebrood Saga strikes, an optional pseudo-wing group).

const LS_KEY = "gw2_rp_settings";

const EPOCH = new Date(Date.UTC(2026, 0, 2));
const OFFSET_DAYS = 2;

const set1 = ["Shiverpeaks Pass", "Voice of the Fallen and Claw of the Fallen", "Fraenir of Jormag", "Gorseval the Multifarious", "Cairn the Indomitable", "Mursaat Overseer"];
const set2 = ["Aetherblade Hideout", "Cardinal Sabir", "Whisper of Jormag", "Vale Guardian", "Cosmic Observatory", "Cold War", "Boneskinner", "Sabetha the Saboteur", "Xunlai Jade Junkyard", "Temple of Febe", "Keep Construct", "Kela"];
const set3 = ["Slothasor", "Matthias Gabrel", "Xera", "Samarog", "Conjured Amalgamate", "Twin Largos", "Decima", "Cardinal Adina", "Old Lion's Court", "Ura", "Kaineng Overlook", "Deimos"];
const set4 = ["Qadim", "Qadim the Peerless", "Soulless Horror", "Harvest Temple", "Dhuum", "Greer"];

const baseWingOf = {
  "Vale Guardian": 1, "Gorseval the Multifarious": 1, "Sabetha the Saboteur": 1,
  "Slothasor": 2, "Matthias Gabrel": 2,
  "Xera": 3, "Keep Construct": 3,
  "Cairn the Indomitable": 4, "Mursaat Overseer": 4, "Samarog": 4, "Deimos": 4,
  "Soulless Horror": 5, "Dhuum": 5,
  "Conjured Amalgamate": 6, "Twin Largos": 6, "Qadim": 6,
  "Cardinal Sabir": 7, "Cardinal Adina": 7, "Qadim the Peerless": 7,
  "Decima": 8, "Ura": 8, "Greer": 8,
};

const eodMembers = ["Aetherblade Hideout", "Xunlai Jade Junkyard", "Harvest Temple", "Kaineng Overlook", "Temple of Febe", "Cosmic Observatory", "Old Lion's Court"];
const ibsMembers = ["Fraenir of Jormag", "Whisper of Jormag", "Voice of the Fallen and Claw of the Fallen", "Shiverpeaks Pass", "Boneskinner", "Cold War"];

const wingNames = {
  1: "Spirit Vale", 2: "Salvation Pass", 3: "Stronghold of the Faithful", 4: "Bastion of the Penitent",
  5: "Hall of Chains", 6: "Mythwright Gambit", 7: "The Key of Ahdashim", 8: "Mount Balrior",
  EOD: "EoD + SotO", IBS: "IBS",
};

const colorHex = {
  1: ["#408532", "#FFFFFF"], 2: ["#328537", "#FFFFFF"], 3: ["#32854A", "#FFFFFF"], 4: ["#32855C", "#FFFFFF"],
  5: ["#853247", "#FFFFFF"], 6: ["#853239", "#FFFFFF"], 7: ["#853932", "#FFFFFF"], 8: ["#854732", "#FFFFFF"],
  EOD: ["#0F766E", "#FFFFFF"], IBS: ["#0284C7", "#FFFFFF"],
};

const allIds = [1, 2, 3, 4, 5, 6, 7, 8, "EOD", "IBS"];
const DEFAULT_WINGS = Object.fromEntries(allIds.map(id => [id, true]));

// ── Weekly-clear detection ───────────────────────────────────────────────────
// Core wings: GW2's /account/raids endpoint lists completed encounter ids since
// weekly reset, and updates within seconds of a kill — far more reliable than
// achievement progress (which can lag well behind). A wing's chest isn't just
// its loot bosses though — the official /v2/raids definitions include extra
// non-boss checkpoint/escort events per wing (e.g. Spirit Woods in Spirit Vale,
// Bandit Trio in Salvation Pass) that also gate the weekly clear, so the full
// per-wing checklist below is the complete /v2/raids event list, not baseWingOf
// (which only tracks loot-bearing bosses, for the daily rotation above).
// Strike missions aren't covered by /account/raids at all, so EoD/IBS group
// clears are still derived from achievement 9125 ("Weekly Raid Encounters"),
// which has one progress bit per strike, in a fixed order.
const wingEncounters = {
  1: [
    { name: "Vale Guardian", id: "vale_guardian" },
    { name: "Spirit Woods", id: "spirit_woods" },
    { name: "Gorseval the Multifarious", id: "gorseval" },
    { name: "Sabetha the Saboteur", id: "sabetha" },
  ],
  2: [
    { name: "Slothasor", id: "slothasor" },
    { name: "Bandit Trio", id: "bandit_trio" },
    { name: "Matthias Gabrel", id: "matthias" },
  ],
  3: [
    { name: "Escort", id: "escort" },
    { name: "Keep Construct", id: "keep_construct" },
    { name: "Twisted Castle", id: "twisted_castle" },
    { name: "Xera", id: "xera" },
  ],
  4: [
    { name: "Cairn the Indomitable", id: "cairn" },
    { name: "Mursaat Overseer", id: "mursaat_overseer" },
    { name: "Samarog", id: "samarog" },
    { name: "Deimos", id: "deimos" },
  ],
  5: [
    { name: "Soulless Horror", id: "soulless_horror" },
    { name: "River of Souls", id: "river_of_souls" },
    { name: "Statues of Grenth", id: "statues_of_grenth" },
    { name: "Dhuum", id: "voice_in_the_void" },
  ],
  6: [
    { name: "Conjured Amalgamate", id: "conjured_amalgamate" },
    { name: "Twin Largos", id: "twin_largos" },
    { name: "Qadim", id: "qadim" },
  ],
  7: [
    { name: "Gate", id: "gate" },
    { name: "Cardinal Adina", id: "adina" },
    { name: "Cardinal Sabir", id: "sabir" },
    { name: "Qadim the Peerless", id: "qadim_the_peerless" },
  ],
  8: [
    { name: "Camp", id: "camp" },
    { name: "Greer", id: "greer" },
    { name: "Decima", id: "decima" },
    { name: "Ura", id: "ura" },
  ],
};

const STRIKE_BITS_ACH_ID = 9125;
const strikeBitNames = [
  "Shiverpeaks Pass", "Fraenir of Jormag", "Voice of the Fallen and Claw of the Fallen",
  "Whisper of Jormag", "Boneskinner", "Cold War", "Aetherblade Hideout",
  "Xunlai Jade Junkyard", "Kaineng Overlook", "Harvest Temple", "Cosmic Observatory",
  "Temple of Febe", "Old Lion's Court", "Guardian's Glade",
];

// Single source of truth for weekly-clear checklists: per-id row lists (with
// done flags) plus the resulting set of fully-cleared ids. Both the "hide
// cleared" schedule filter and the weekly-clears panel read from this so they
// can never disagree about what counts as cleared.
function computeWeeklyClearState() {
  const completions = getRaidCompletions() || new Set();

  const progress = getProgressMap();
  const strikeEntry = progress?.[STRIKE_BITS_ACH_ID];
  const doneStrikeNames = strikeEntry
    ? new Set(strikeEntry.done ? strikeBitNames : (strikeEntry.bits || []).map(i => strikeBitNames[i]))
    : new Set();

  const rowsById = {};
  const clearedIds = new Set();

  for (let wing = 1; wing <= 8; wing++) {
    const rows = wingEncounters[wing].map(e => ({ name: e.name, done: completions.has(e.id) }));
    rowsById[wing] = rows;
    if (rows.every(r => r.done)) clearedIds.add(wing);
  }

  const ibsRows = ibsMembers.map(name => ({ name, done: doneStrikeNames.has(name) }));
  rowsById.IBS = ibsRows;
  if (ibsRows.every(r => r.done)) clearedIds.add("IBS");

  const eodRows = eodMembers.map(name => ({ name, done: doneStrikeNames.has(name) }));
  rowsById.EOD = eodRows;
  if (eodRows.every(r => r.done)) clearedIds.add("EOD");

  return { rowsById, clearedIds };
}

function computeFullyClearedWings() {
  return computeWeeklyClearState().clearedIds;
}

// ── Settings ──────────────────────────────────────────────────────────────────

function loadRPSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

function saveRPSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function getSelectedWings() {
  const saved = loadRPSettings().wings;
  return saved ? { ...DEFAULT_WINGS, ...saved } : { ...DEFAULT_WINGS };
}

function getHideCleared() {
  return !!loadRPSettings().hideCleared;
}

// Collapse state for the weekly-clears cards. `clearsCollapsed` is the actual
// displayed state (toggled by clicking a card header); `clearsAutoApplied`
// tracks which ids we've already auto-collapsed for being cleared, so a wing
// that the user re-expands stays expanded until it cycles cleared -> not -> cleared again.
function getClearsCollapsed() {
  return new Set(loadRPSettings().clearsCollapsed || []);
}

function setClearsCollapsed(set) {
  const s = loadRPSettings();
  s.clearsCollapsed = [...set];
  saveRPSettings(s);
}

function getClearsAutoApplied() {
  return new Set(loadRPSettings().clearsAutoApplied || []);
}

function setClearsAutoApplied(set) {
  const s = loadRPSettings();
  s.clearsAutoApplied = [...set];
  saveRPSettings(s);
}

// ── Schedule computation ─────────────────────────────────────────────────────

function dailiesForDate(date) {
  const days = Math.round((date - EPOCH) / 86400000) + OFFSET_DAYS;
  const k = ((days % 12) + 12) % 12;
  const i6 = k % 6;
  return { bosses: [set1[i6], set2[k], set3[k], set4[i6]] };
}

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// Resolve which pseudo-group (if any) currently owns a shared boss (e.g. Voice & Claw)
function buildEffectiveWingOf(selectedWings) {
  const w = Object.assign({}, baseWingOf);
  if (selectedWings.IBS) ibsMembers.forEach(b => { w[b] = "IBS"; });
  if (selectedWings.EOD) eodMembers.forEach(b => { w[b] = "EOD"; });
  return w;
}

function computeSchedule(weekDates, selectedWings, clearedWings) {
  const dayInfo = weekDates.map(d => dailiesForDate(d));
  const wingOf = buildEffectiveWingOf(selectedWings);
  const activeWings = allIds.filter(id => selectedWings[id] && !clearedWings.has(id));

  const occ = {};
  activeWings.forEach(id => { occ[id] = dayInfo.map(di => di.bosses.filter(b => wingOf[b] === id)); });

  const totalOcc = {};
  activeWings.forEach(id => { totalOcc[id] = occ[id].filter(b => b.length > 0).length; });

  let candidates = [];
  activeWings.forEach(id => {
    occ[id].forEach((bosses, day) => { if (bosses.length > 0) candidates.push({ wing: id, day, count: bosses.length, bosses }); });
  });
  candidates.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (totalOcc[a.wing] !== totalOcc[b.wing]) return totalOcc[a.wing] - totalOcc[b.wing];
    return a.day - b.day;
  });

  const dayAssignments = weekDates.map(() => ({ wings: [] }));
  const dayUsed = new Array(7).fill(false);
  const wingDone = new Set();

  candidates.forEach(c => {
    if (wingDone.has(c.wing)) return;
    if (dayUsed[c.day]) return;
    dayAssignments[c.day].wings.push({ wing: c.wing, bosses: c.bosses });
    dayUsed[c.day] = true;
    wingDone.add(c.wing);
  });

  const stillPending = activeWings.filter(id => !wingDone.has(id));
  stillPending.forEach(id => {
    const opts = candidates.filter(c => c.wing === id);
    if (opts.length === 0) return;
    opts.sort((a, b) => {
      const aUsed = dayUsed[a.day] ? 1 : 0, bUsed = dayUsed[b.day] ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      if (b.count !== a.count) return b.count - a.count;
      return a.day - b.day;
    });
    const pick = opts[0];
    dayAssignments[pick.day].wings.push({ wing: id, bosses: pick.bosses });
    dayUsed[pick.day] = true;
    wingDone.add(id);
  });

  const pending = activeWings.filter(id => !wingDone.has(id));
  return { dayInfo, dayAssignments, pending };
}

// ── Module state (persists across re-renders while the app stays open) ───────

let weekOffset = 0;

// ── Render ────────────────────────────────────────────────────────────────────

export function renderRaidPlannerView(container) {
  const selectedWings = getSelectedWings();

  container.innerHTML = `
    <div class="rp-outer">
      <div class="rp-weeknav">
        <button id="rp-prev" class="btn small" aria-label="Previous week">&larr; Previous</button>
        <div class="rp-week-mid">
          <span id="rp-week-label" class="rp-week-label"></span>
          <button id="rp-today" class="rp-today-btn">Today</button>
        </div>
        <button id="rp-next" class="btn small" aria-label="Next week">Next &rarr;</button>
      </div>
      <div id="rp-days" class="rp-days"></div>
      <div id="rp-cleared" class="rp-carry"></div>
      <div id="rp-carry" class="rp-carry"></div>
    </div>
  `;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function draw() {
    const monday = getMonday(today);
    monday.setDate(monday.getDate() + weekOffset * 7);
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(d);
    }

    container.querySelector("#rp-week-label").textContent =
      monday.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " – " +
      weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const isCurrentWeek = weekOffset === 0;
    const clearedWings = (isCurrentWeek && getHideCleared())
      ? computeFullyClearedWings()
      : new Set();

    const { dayInfo, dayAssignments, pending } = computeSchedule(weekDates, selectedWings, clearedWings);

    const daysEl = container.querySelector("#rp-days");
    daysEl.innerHTML = "";

    weekDates.forEach((d, i) => {
      const isPast = d.getTime() < today.getTime();
      const isToday = d.getTime() === today.getTime();
      const row = document.createElement("div");
      row.className = "rp-day" + (isPast ? " rp-day-past" : "") + (isToday ? " rp-day-today" : "");

      const wd = d.toLocaleDateString("en-US", { weekday: "short" });
      const dm = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const header = document.createElement("div");
      header.className = "rp-day-header";
      header.innerHTML = `<span class="rp-day-header-wd">${wd}</span><span class="rp-day-header-date">${dm}</span>`;
      row.appendChild(header);

      const da = dayAssignments[i];
      const assignedBossToWing = {};
      da.wings.forEach(wa => wa.bosses.forEach(b => { assignedBossToWing[b] = wa.wing; }));

      const body = document.createElement("div");
      body.className = "rp-day-body";

      const chips = document.createElement("div");
      chips.className = "rp-chips";
      dayInfo[i].bosses.forEach(b => {
        const chip = document.createElement("div");
        const assignedId = assignedBossToWing[b];
        if (assignedId !== undefined) {
          const c = colorHex[assignedId];
          chip.className = "rp-chip rp-chip-assigned";
          chip.style.background = c[0];
          chip.style.color = c[1];
        } else {
          chip.className = "rp-chip rp-chip-gray";
        }
        chip.textContent = b;
        chips.appendChild(chip);
      });
      body.appendChild(chips);

      if (da.wings.length > 0) {
        da.wings.forEach(wa => {
          const c = colorHex[wa.wing];
          const p = document.createElement("p");
          p.className = "rp-reco";
          p.style.color = c[0];
          p.textContent = (typeof wa.wing === "number" ? "W" + wa.wing + " – " : "") + wingNames[wa.wing];
          body.appendChild(p);
        });
      } else if (!isPast) {
        const p = document.createElement("p");
        p.className = "rp-note";
        p.textContent = "Nothing scheduled";
        body.appendChild(p);
      }

      row.appendChild(body);
      daysEl.appendChild(row);
    });

    const clearedSelected = allIds.filter(id => selectedWings[id] && clearedWings.has(id));
    container.querySelector("#rp-cleared").textContent = clearedSelected.length
      ? "Already cleared this week: " + clearedSelected.map(id => wingNames[id]).join(", ")
      : "";

    container.querySelector("#rp-carry").textContent = pending.length
      ? "No day this week for: " + pending.map(id => wingNames[id]).join(", ")
      : "";
  }

  container.querySelector("#rp-prev").addEventListener("click", () => { weekOffset--; draw(); });
  container.querySelector("#rp-next").addEventListener("click", () => { weekOffset++; draw(); });
  container.querySelector("#rp-today").addEventListener("click", () => { weekOffset = 0; draw(); });

  draw();
  renderClearsPanel(document.getElementById("rp-clears"));
}

// ── Weekly clears panel ──────────────────────────────────────────────────────

function renderClearsPanel(clearsEl) {
  const { rowsById, clearedIds: clearedWings } = computeWeeklyClearState();

  // Auto-collapse a wing the moment it becomes fully cleared, but only once —
  // if the user re-expands it, leave it alone until it cycles cleared -> not -> cleared.
  const collapsedSet = getClearsCollapsed();
  const autoApplied = getClearsAutoApplied();
  let collapsedChanged = false, autoChanged = false;
  allIds.forEach(id => {
    const isCleared = clearedWings.has(id);
    if (isCleared && !autoApplied.has(id)) {
      collapsedSet.add(id); autoApplied.add(id);
      collapsedChanged = true; autoChanged = true;
    } else if (!isCleared && autoApplied.has(id)) {
      collapsedSet.delete(id); autoApplied.delete(id);
      collapsedChanged = true; autoChanged = true;
    }
  });
  if (collapsedChanged) setClearsCollapsed(collapsedSet);
  if (autoChanged) setClearsAutoApplied(autoApplied);

  clearsEl.innerHTML = "";

  // Two independently-stacking flex columns rather than a CSS grid — a grid
  // shares row height across both columns, so expanding one card would leave
  // a matching gap in the other column. Plain flex columns don't have that coupling.
  const col1 = document.createElement("div");
  col1.className = "rp-clears-col";
  const col2 = document.createElement("div");
  col2.className = "rp-clears-col";
  clearsEl.appendChild(col1);
  clearsEl.appendChild(col2);

  allIds.forEach((id, idx) => {
    const rows = rowsById[id];
    const c = colorHex[id];
    const isCleared = clearedWings.has(id);
    const isCollapsed = collapsedSet.has(id);

    const card = document.createElement("div");
    card.className = "rp-clear-card" + (isCollapsed ? " rp-clear-card-collapsed" : "") + (isCleared ? " rp-clear-card-done" : "");
    card.style.setProperty("--rp-wing-color", c[0]);

    const header = document.createElement("div");
    header.className = "rp-clear-card-header";

    const headerCb = document.createElement("input");
    headerCb.type = "checkbox";
    headerCb.className = "daily-item-cb";
    headerCb.checked = isCleared;
    headerCb.tabIndex = -1;
    header.appendChild(headerCb);

    const title = document.createElement("span");
    title.className = "rp-clear-card-title";
    title.textContent = (typeof id === "number" ? "W" + id + " – " : "") + wingNames[id];
    header.appendChild(title);

    header.addEventListener("click", () => {
      const s = getClearsCollapsed();
      if (s.has(id)) s.delete(id); else s.add(id);
      setClearsCollapsed(s);
      card.classList.toggle("rp-clear-card-collapsed");
    });
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "rp-clear-card-body";
    const bodyInner = document.createElement("div");
    bodyInner.className = "rp-clear-card-body-inner";
    body.appendChild(bodyInner);
    card.appendChild(body);

    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "rp-clear-row" + (r.done ? " rp-clear-row-done" : "");

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "daily-item-cb";
      cb.checked = r.done;
      cb.tabIndex = -1;
      row.appendChild(cb);

      const name = document.createElement("span");
      name.className = "rp-clear-row-name";
      name.textContent = r.name;
      row.appendChild(name);

      bodyInner.appendChild(row);
    });

    (idx % 2 === 0 ? col1 : col2).appendChild(card);
  });
}

// ── Filter modal ──────────────────────────────────────────────────────────────

export function openRaidPlannerFilterModal(onApply) {
  const selectedWings = getSelectedWings();
  const body = document.getElementById("rp-filter-body");
  body.innerHTML = "";

  const hideClearedRow = document.createElement("div");
  hideClearedRow.className = "et-filter-row rp-hide-cleared-row";
  hideClearedRow.innerHTML = `
    <label class="checkbox-label et-filter-check">
      <input type="checkbox" id="rp-hide-cleared-check" ${getHideCleared() ? "checked" : ""}>
      <span>Hide wings already cleared this week</span>
    </label>
  `;
  body.appendChild(hideClearedRow);

  allIds.forEach(id => {
    const c = colorHex[id];
    const row = document.createElement("div");
    row.className = "et-filter-row";
    row.innerHTML = `
      <label class="checkbox-label et-filter-check">
        <input type="checkbox" data-id="${id}" ${selectedWings[id] ? "checked" : ""}>
        <span class="et-filter-dot" style="background:${c[0]}"></span>
        <span>${typeof id === "number" ? "W" + id + " – " : ""}${wingNames[id]}</span>
      </label>
    `;
    body.appendChild(row);
  });

  const doApply = () => {
    const wings = {};
    body.querySelectorAll("input[type='checkbox'][data-id]").forEach(cb => {
      wings[cb.dataset.id] = cb.checked;
    });
    const s = loadRPSettings();
    s.wings = wings;
    s.hideCleared = document.getElementById("rp-hide-cleared-check").checked;
    saveRPSettings(s);
    closeModal("rp-filter-overlay");
    onApply?.();
  };

  document.getElementById("btn-rp-filter-done").onclick = doApply;

  document.getElementById("btn-rp-filter-reset").onclick = () => {
    const s = loadRPSettings();
    delete s.wings;
    delete s.hideCleared;
    saveRPSettings(s);
    closeModal("rp-filter-overlay");
    onApply?.();
  };

  openModal("rp-filter-overlay");
}

// ── Init (wire modal close buttons) ───────────────────────────────────────────

export function initRaidPlanner() {
  document.getElementById("btn-rp-filter-close").addEventListener("click", () => closeModal("rp-filter-overlay"));
  document.getElementById("rp-filter-overlay").addEventListener("click", e => {
    if (e.target.id === "rp-filter-overlay") closeModal("rp-filter-overlay");
  });
}

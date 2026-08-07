import { openModal, closeModal } from "./ui.js";

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

function computeSchedule(weekDates, selectedWings) {
  const dayInfo = weekDates.map(d => dailiesForDate(d));
  const wingOf = buildEffectiveWingOf(selectedWings);
  const activeWings = allIds.filter(id => selectedWings[id]);

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

    const { dayInfo, dayAssignments, pending } = computeSchedule(weekDates, selectedWings);

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

    container.querySelector("#rp-carry").textContent = pending.length
      ? "No day this week for: " + pending.map(id => wingNames[id]).join(", ")
      : "";
  }

  container.querySelector("#rp-prev").addEventListener("click", () => { weekOffset--; draw(); });
  container.querySelector("#rp-next").addEventListener("click", () => { weekOffset++; draw(); });
  container.querySelector("#rp-today").addEventListener("click", () => { weekOffset = 0; draw(); });

  draw();
}

// ── Filter modal ──────────────────────────────────────────────────────────────

export function openRaidPlannerFilterModal(onApply) {
  const selectedWings = getSelectedWings();
  const body = document.getElementById("rp-filter-body");
  body.innerHTML = "";

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
    body.querySelectorAll("input[type='checkbox']").forEach(cb => {
      wings[cb.dataset.id] = cb.checked;
    });
    const s = loadRPSettings();
    s.wings = wings;
    saveRPSettings(s);
    closeModal("rp-filter-overlay");
    onApply?.();
  };

  document.getElementById("btn-rp-filter-done").onclick = doApply;

  document.getElementById("btn-rp-filter-reset").onclick = () => {
    const s = loadRPSettings();
    delete s.wings;
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

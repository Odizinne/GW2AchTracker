// GW2 day/night cycle: 2 real hours = 24 Tyrian hours.
// Cycle epoch: even UTC hours (00:00, 02:00, 04:00 …).
// 1 Tyrian minute = 5 real seconds.

const CYCLE_MS   = 2 * 60 * 60 * 1000;
const TYRIAN_MIN =           5 * 1000; // 1 Tyrian minute in real ms

const TYRIA_PHASES = [
  // ordered by elapsed real minutes from cycle start
  { phase: "night", endMin:  25 }, // Tyrian 00:00–05:00
  { phase: "dawn",  endMin:  30 }, // Tyrian 05:00–06:00
  { phase: "day",   endMin: 100 }, // Tyrian 06:00–20:00
  { phase: "dusk",  endMin: 105 }, // Tyrian 20:00–21:00
  { phase: "night", endMin: 120 }, // Tyrian 21:00–24:00
];

const CANTHA_PHASES = [
  { phase: "night", endMin:  35 }, // Tyrian 00:00–07:00
  { phase: "dawn",  endMin:  40 }, // Tyrian 07:00–08:00
  { phase: "day",   endMin:  95 }, // Tyrian 08:00–19:00
  { phase: "dusk",  endMin: 100 }, // Tyrian 19:00–20:00
  { phase: "night", endMin: 120 }, // Tyrian 20:00–24:00
];

const PHASE_LABELS = { day: "Day", dawn: "Dawn", dusk: "Dusk", night: "Night" };
const NEXT_PHASE   = { day: "Dusk", dusk: "Night", night: "Dawn", dawn: "Day" };

function getElapsed() {
  return Date.now() % CYCLE_MS;
}

function tyrianTime(e) {
  const min = Math.floor(e / TYRIAN_MIN);
  return { h: Math.floor(min / 60) % 24, m: min % 60 };
}

function getPhase(e, phases) {
  const elMin = e / 60000;
  for (let i = 0; i < phases.length; i++) {
    const { phase, endMin } = phases[i];
    if (elMin < endMin) {
      // Last segment is the tail of a night that wraps into the next cycle;
      // count through to when the first segment ends (= when dawn actually starts).
      const remMs = (i === phases.length - 1)
        ? (CYCLE_MS - e) + phases[0].endMin * 60000
        : endMin * 60000 - e;
      return { phase, remMs };
    }
  }
  return { phase: "night", remMs: 0 };
}

function pad(n) { return String(n).padStart(2, "0"); }

function fmtTimer(ms) {
  const totalSec = Math.ceil(ms / 1000);
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}`;
}

function updateRow(rowEl, { phase, remMs }) {
  const right = rowEl.querySelector(".phase-right");
  right.className        = `phase-right phase-${phase}`;
  right.dataset.tooltip  = `Until ${NEXT_PHASE[phase]}`;
  const label = PHASE_LABELS[phase];
  const nameEl = rowEl.querySelector(".phase-name");
  nameEl.textContent  = label;
  rowEl.querySelector(".phase-timer").textContent = fmtTimer(remMs);
}

export function startClock(el) {
  const timeEl   = el.querySelector("#tyrian-time-val");
  const tyriaRow = el.querySelector("#tyria-phase-row");
  const canthaRow= el.querySelector("#cantha-phase-row");

  function tick() {
    const e  = getElapsed();
    const tt = tyrianTime(e);
    timeEl.textContent = `${pad(tt.h)}:${pad(tt.m)}`;
    updateRow(tyriaRow,  getPhase(e, TYRIA_PHASES));
    updateRow(canthaRow, getPhase(e, CANTHA_PHASES));
    const n1 = tyriaRow.querySelector(".phase-name");
    const n2 = canthaRow.querySelector(".phase-name");
    n1.style.minWidth = n2.style.minWidth = '';
    const w = Math.max(n1.getBoundingClientRect().width, n2.getBoundingClientRect().width);
    n1.style.minWidth = n2.style.minWidth = w + 'px';
  }

  tick();
  setInterval(tick, 1000);
}

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

function getElapsed() {
  return Date.now() % CYCLE_MS;
}

function tyrianTime(e) {
  const min = Math.floor(e / TYRIAN_MIN);
  return { h: Math.floor(min / 60) % 24, m: min % 60 };
}

function getPhase(e, phases) {
  const elMin = e / 60000;
  for (const { phase, endMin } of phases) {
    if (elMin < endMin) {
      return { phase, remMin: Math.ceil(endMin - elMin) };
    }
  }
  return { phase: "night", remMin: 0 };
}

function pad(n) { return String(n).padStart(2, "0"); }

function updateRow(rowEl, { phase }) {
  rowEl.querySelector(".phase-right").className  = `phase-right phase-${phase}`;
  rowEl.querySelector(".phase-name").textContent = PHASE_LABELS[phase];
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
  }

  tick();
  setInterval(tick, 1000);
}

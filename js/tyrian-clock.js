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

const ICONS = {
  day: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
    <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
  </svg>`,
  dawn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2v3"/><path d="M4.22 8.22l2.12 2.12"/><path d="M2 16h3"/><path d="M19 16h3"/>
    <path d="M17.66 10.34l2.12-2.12"/>
    <path d="M2 20h20"/><path d="M7 20a5 5 0 0 1 10 0"/>
  </svg>`,
  dusk: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 9v3"/><path d="M4.22 7.22l2.12 2.12"/><path d="M2 14h3"/><path d="M19 14h3"/>
    <path d="M17.66 9.34l2.12-2.12"/>
    <path d="M2 20h20"/><path d="M7 20a5 5 0 0 1 10 0"/>
  </svg>`,
  night: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`,
};

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
  rowEl.querySelector(".phase-icon").innerHTML   = ICONS[phase];
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

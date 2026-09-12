// ── WvW Pip Calculator ───────────────────────────────────────────────────────
// Ported from the PimpMyPip desktop app (github.com/Odizinne/PimpMyPip): tracks
// WvW skirmish chest progress (rank/tier/pip) and estimates time-to-target from
// pips-per-5-minute-tick, plus reward-track ticket counts.

const LS_KEY = "gw2_wvw_pips";

const CHEST_RANKS = [
  { name: "Wood",     tiers: 4, pipsPerTier: 25, totalPips: 100 },
  { name: "Bronze",   tiers: 4, pipsPerTier: 30, totalPips: 120 },
  { name: "Silver",   tiers: 5, pipsPerTier: 35, totalPips: 175 },
  { name: "Gold",     tiers: 5, pipsPerTier: 40, totalPips: 200 },
  { name: "Platinum", tiers: 5, pipsPerTier: 45, totalPips: 225 },
  { name: "Mithril",  tiers: 6, pipsPerTier: 50, totalPips: 300 },
  { name: "Diamond",  tiers: 6, pipsPerTier: 55, totalPips: 330 },
];

const TICKET_DATA = [
  { minor: 3,  final: 8  },
  { minor: 5,  final: 10 },
  { minor: 7,  final: 12 },
  { minor: 9,  final: 14 },
  { minor: 11, final: 16 },
  { minor: 13, final: 18 },
  { minor: 14, final: 20 },
];

const WAR_SCORE_PIPS   = [4, 5, 6];
const RANK_PIPS_TABLE  = [1, 2, 3, 4, 5, 6, 7, 8];
const RANK_LABELS = [
  "Initiate (+1)", "Bronze (+2)", "Silver (+3)", "Gold (+4)",
  "Platinum (+5)", "Mithril (+6)", "Diamond (+7)", "Max Rank (+8)",
];

const DEFAULT_STATE = {
  wvwRankIndex: 0,
  placement: 0,
  commander: false,
  publicCommander: false,
  commitment: false,
  splitOver: 7,
  current: { chestIndex: 0, tierIndex: 0, pipInTier: 0 },
  target:  { chestIndex: 5, tierIndex: 0, pipInTier: 0 },
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return {
      ...DEFAULT_STATE,
      ...stored,
      current: { ...DEFAULT_STATE.current, ...(stored.current || {}) },
      target:  { ...DEFAULT_STATE.target,  ...(stored.target  || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

// ── Chest / ticket math ──────────────────────────────────────────────────────

function tierCountFor(chestIndex)    { return CHEST_RANKS[chestIndex].tiers; }
function pipsPerTierFor(chestIndex)  { return CHEST_RANKS[chestIndex].pipsPerTier; }

function cumulativePipsBefore(chestIndex) {
  let sum = 0;
  for (let i = 0; i < chestIndex; i++) sum += CHEST_RANKS[i].totalPips;
  return sum;
}

function absolutePips(chestIndex, tierIndex, pipInTier) {
  return cumulativePipsBefore(chestIndex) + tierIndex * pipsPerTierFor(chestIndex) + pipInTier;
}

function ticketsForRank(chestIndex) {
  const chest = CHEST_RANKS[chestIndex];
  const td    = TICKET_DATA[chestIndex];
  return (chest.tiers - 1) * td.minor + td.final;
}

// tierNumber is 1-based; only the final tier of a rank grants the "final" value.
function ticketValueForTier(chestIndex, tierNumber) {
  const chest = CHEST_RANKS[chestIndex];
  const td    = TICKET_DATA[chestIndex];
  return tierNumber === chest.tiers ? td.final : td.minor;
}

function ticketsInRank(chestIndex, tierIndex, pipInTier) {
  const chest = CHEST_RANKS[chestIndex];
  let sum = 0;
  for (let t = 1; t <= tierIndex; t++) sum += ticketValueForTier(chestIndex, t);
  if (pipInTier >= chest.pipsPerTier) sum += ticketValueForTier(chestIndex, tierIndex + 1);
  return sum;
}

function cumulativeTicketsBefore(chestIndex) {
  let sum = 0;
  for (let i = 0; i < chestIndex; i++) sum += ticketsForRank(i);
  return sum;
}

function absoluteTickets(chestIndex, tierIndex, pipInTier) {
  return cumulativeTicketsBefore(chestIndex) + ticketsInRank(chestIndex, tierIndex, pipInTier);
}

function totalTickets() {
  return cumulativeTicketsBefore(CHEST_RANKS.length);
}

function pipsPerTick(state) {
  return WAR_SCORE_PIPS[state.placement] + RANK_PIPS_TABLE[state.wvwRankIndex]
    + (state.commander ? 1 : 0) + (state.publicCommander ? 3 : 0) + (state.commitment ? 1 : 0);
}

function formattedTimeForPips(pips, perTick) {
  if (pips <= 0) return "0m";
  if (perTick <= 0) return "--";
  const ticks = Math.ceil(pips / perTick);
  const totalMinutes = ticks * 5;
  const days    = Math.floor(totalMinutes / (60 * 24));
  const hours   = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  let result = "";
  if (days > 0) result += days + "d ";
  if (days > 0 || hours > 0) result += hours + "h ";
  result += minutes + "m";
  return result;
}

// ── Pip line (draggable chest bar) ───────────────────────────────────────────

let _wpDragging = false;
window.addEventListener("mouseup", () => { _wpDragging = false; });

function renderPipline(piplineEl, colState, onChange) {
  piplineEl.innerHTML = "";
  const totalPips = pipsPerTierFor(colState.chestIndex);

  const groups = [];
  let remaining = totalPips;
  while (remaining > 10) { groups.push(10); remaining -= 10; }
  if (remaining > 0) groups.push(remaining);

  const pipEls = [];
  function applyFill() {
    pipEls.forEach(({ el, n }) => el.classList.toggle("wp-pip-filled", n <= colState.pipInTier));
  }
  function setPip(n) {
    if (n === colState.pipInTier) return;
    colState.pipInTier = n;
    applyFill();
    onChange();
  }

  let pipCounter = 0;
  groups.forEach(groupSize => {
    const groupEl = document.createElement("div");
    groupEl.className = "wp-pip-group";
    for (let i = 0; i < groupSize; i++) {
      pipCounter++;
      const n = pipCounter;
      const rect = document.createElement("div");
      rect.className = "wp-pip";
      rect.addEventListener("mousedown", (e) => {
        e.preventDefault();
        _wpDragging = true;
        setPip(n === 1 && colState.pipInTier === 1 ? 0 : n);
      });
      rect.addEventListener("mouseenter", () => { if (_wpDragging) setPip(n); });
      pipEls.push({ el: rect, n });
      groupEl.appendChild(rect);
    }
    piplineEl.appendChild(groupEl);
  });

  applyFill();
}

// ── Column (Current / Target) ────────────────────────────────────────────────

function createColumn(el, title, colState, onChange) {
  el.innerHTML = `
    <div class="wp-col-header">
      <span class="wp-col-title">${title}</span>
      <div class="sb-select-wrap wp-col-select"><select class="wp-chest-select"></select></div>
    </div>
    <div class="wp-tier-dots"></div>
    <div class="wp-pipline"></div>
    <div class="wp-col-sub"></div>
  `;

  const chestSelect = el.querySelector(".wp-chest-select");
  CHEST_RANKS.forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = c.name;
    chestSelect.appendChild(opt);
  });
  chestSelect.value = colState.chestIndex;

  const tierDotsEl = el.querySelector(".wp-tier-dots");
  const piplineEl  = el.querySelector(".wp-pipline");
  const subEl      = el.querySelector(".wp-col-sub");

  function updateSub() {
    const chest = CHEST_RANKS[colState.chestIndex];
    subEl.textContent = `${chest.name} — Tier ${colState.tierIndex + 1}/${chest.tiers} — ${colState.pipInTier}/${chest.pipsPerTier} pips`;
  }

  function renderTierDots() {
    tierDotsEl.innerHTML = "";
    const tierCount = tierCountFor(colState.chestIndex);
    for (let i = 0; i < 6; i++) {
      const dot = document.createElement("div");
      const enabled = i < tierCount;
      dot.className = "wp-tier-dot"
        + (!enabled ? " wp-tier-dot-disabled" : "")
        + (enabled && i <= colState.tierIndex ? " wp-tier-dot-active" : "");
      dot.textContent = i + 1;
      if (enabled) {
        dot.addEventListener("click", () => {
          colState.tierIndex = i;
          renderTierDots();
          updateSub();
          onChange();
        });
      }
      tierDotsEl.appendChild(dot);
    }
  }

  chestSelect.addEventListener("change", () => {
    colState.chestIndex = Number(chestSelect.value);
    const tc = tierCountFor(colState.chestIndex);
    if (colState.tierIndex >= tc) colState.tierIndex = tc - 1;
    colState.pipInTier = Math.min(colState.pipInTier, pipsPerTierFor(colState.chestIndex));
    renderTierDots();
    renderPipline(piplineEl, colState, () => { updateSub(); onChange(); });
    updateSub();
    onChange();
  });

  renderTierDots();
  renderPipline(piplineEl, colState, () => { updateSub(); onChange(); });
  updateSub();
}

// ── Main view ────────────────────────────────────────────────────────────────

export function renderWvwPipsView(container) {
  const state = loadState();

  container.innerHTML = `
    <div class="wp-outer">
      <div class="wp-card">
        <div class="wp-card-header wp-card-header-row">
          <h3 class="wp-card-title">WvW Settings</h3>
          <span class="wp-rate" id="wp-rate"></span>
        </div>
        <div class="wp-card-body">
          <div class="wp-settings-row">
            <label class="field-label wp-field">
              <span>WvW Rank</span>
              <div class="sb-select-wrap"><select id="wp-rank"></select></div>
            </label>
            <label class="field-label wp-field">
              <span>War Score Placement</span>
              <div class="sb-select-wrap">
                <select id="wp-placement">
                  <option value="0">Lowest (+4)</option>
                  <option value="1">Second (+5)</option>
                  <option value="2">Highest (+6)</option>
                </select>
              </div>
            </label>
            <label class="field-label checkbox-label wp-bonus-field"><input type="checkbox" id="wp-cmdr" /><span>Commander (+1)</span></label>
            <label class="field-label checkbox-label wp-bonus-field"><input type="checkbox" id="wp-pubcmdr" /><span>Public Commander (+3)</span></label>
            <label class="field-label checkbox-label wp-bonus-field"><input type="checkbox" id="wp-commit" /><span>Commitment (+1)</span></label>
          </div>
        </div>
      </div>

      <div class="wp-card">
        <div class="wp-card-header"><h3 class="wp-card-title">Match overview</h3></div>
        <div class="wp-card-body">
          <div class="wp-columns">
            <div class="wp-column" data-role="current"></div>
            <div class="wp-column" data-role="target"></div>
          </div>
        </div>
      </div>

      <div class="wp-card">
        <div class="wp-card-header wp-card-header-row">
          <h3 class="wp-card-title">Time needed: Current &rarr; Target</h3>
          <div class="wp-split-control">
            <span class="wp-split-label">Split over:</span>
            <div class="number-wrap wp-split-spin">
              <input type="number" id="wp-split" min="1" max="7" />
              <div class="number-spin">
                <button type="button" data-delta="1">&#9650;</button>
                <button type="button" data-delta="-1">&#9660;</button>
              </div>
            </div>
            <span>days</span>
          </div>
        </div>
        <div class="wp-card-body">
          <div class="wp-result" id="wp-result"></div>
          <div class="wp-tickets" id="wp-tickets"></div>
        </div>
      </div>
    </div>
  `;

  function updateDerived() {
    saveState(state);

    const perTick = pipsPerTick(state);
    container.querySelector("#wp-rate").textContent = `${perTick} pips / tick`;

    const curAbs = absolutePips(state.current.chestIndex, state.current.tierIndex, state.current.pipInTier);
    const tgtAbs = absolutePips(state.target.chestIndex, state.target.tierIndex, state.target.pipInTier);
    const diff   = tgtAbs - curAbs;

    const resultEl = container.querySelector("#wp-result");
    if (diff <= 0) {
      resultEl.innerHTML = `<div class="wp-result-main">Target is at or before Current.</div>`;
    } else {
      const ticks           = Math.ceil(diff / perTick);
      const totalMinutesAll = ticks * 5;
      const perDayMinutes   = Math.round(totalMinutesAll / state.splitOver);
      const perDayHours     = Math.floor((perDayMinutes % (60 * 24)) / 60);
      const perDayMins      = perDayMinutes % 60;
      const perDayStr       = (perDayHours > 0 ? perDayHours + "h " : "") + perDayMins + "m";

      resultEl.innerHTML = `
        <div class="wp-result-main" data-tooltip="${ticks} ticks | ${diff} pips">${formattedTimeForPips(diff, perTick)}</div>
        <div class="wp-result-perday">${perDayStr} / day</div>
      `;
    }

    const obtained  = absoluteTickets(state.current.chestIndex, state.current.tierIndex, state.current.pipInTier);
    const targetTix = absoluteTickets(state.target.chestIndex, state.target.tierIndex, state.target.pipInTier);
    const remaining = Math.max(0, targetTix - obtained);
    container.querySelector("#wp-tickets").innerHTML = `
      <div class="wp-tickets-obtained" data-tooltip="${remaining} remaining">Obtained Tickets: ${obtained} <img src="assets/ticket.png" class="wp-ticket-icon" alt="Tickets"> / ${totalTickets()}</div>
    `;
  }

  const rankSelect = container.querySelector("#wp-rank");
  RANK_LABELS.forEach((label, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = label;
    rankSelect.appendChild(opt);
  });
  rankSelect.value = state.wvwRankIndex;
  rankSelect.addEventListener("change", () => {
    state.wvwRankIndex = Number(rankSelect.value);
    updateDerived();
  });

  const placementSelect = container.querySelector("#wp-placement");
  placementSelect.value = state.placement;
  placementSelect.addEventListener("change", () => {
    state.placement = Number(placementSelect.value);
    updateDerived();
  });

  const cmdrCb = container.querySelector("#wp-cmdr");
  cmdrCb.checked = state.commander;
  cmdrCb.addEventListener("change", () => { state.commander = cmdrCb.checked; updateDerived(); });

  const pubCmdrCb = container.querySelector("#wp-pubcmdr");
  pubCmdrCb.checked = state.publicCommander;
  pubCmdrCb.addEventListener("change", () => { state.publicCommander = pubCmdrCb.checked; updateDerived(); });

  const commitCb = container.querySelector("#wp-commit");
  commitCb.checked = state.commitment;
  commitCb.addEventListener("change", () => { state.commitment = commitCb.checked; updateDerived(); });

  const splitInput = container.querySelector("#wp-split");
  splitInput.value = state.splitOver;
  function setSplitOver(v) {
    state.splitOver = Math.min(7, Math.max(1, v));
    splitInput.value = state.splitOver;
    updateDerived();
  }
  splitInput.addEventListener("change", () => setSplitOver(parseInt(splitInput.value, 10) || 1));
  container.querySelectorAll(".wp-split-spin .number-spin button").forEach(btn => {
    btn.addEventListener("click", () => setSplitOver(state.splitOver + Number(btn.dataset.delta)));
  });

  createColumn(container.querySelector('.wp-column[data-role="current"]'), "Current", state.current, updateDerived);
  createColumn(container.querySelector('.wp-column[data-role="target"]'),  "Target",  state.target,  updateDerived);

  updateDerived();
}

import { openModal, closeModal } from "./ui.js";
import { addReminder, getReminders, removeReminder } from "./notifications.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const LABEL_W   = 178;      // px, sticky left column
const ROW_H     = 34;       // px per event row
const GROUP_H   = 26;       // px for group header rows
const FRISE_H   = 38;       // px for the time frise
const TOTAL_MIN = 1440;     // minutes in a day

const LS_KEY = "gw2_et_settings";

// Default group display order + colors (category string → group meta)
const GROUP_DEFS = [
  { id: "Core Tyria",              color: [212,112,96]  },
  { id: "Living World Season 2",   color: [230,190,60]  },
  { id: "Living World Season 3",   color: [80,200,130]  },
  { id: "Living World Season 4",   color: [230,120,50]  },
  { id: "The Icebrood Saga",       color: [80,150,220]  },
  { id: "Heart of Thorns",         color: [139,195,74]  },
  { id: "Path of Fire",            color: [192,80,172]  },
  { id: "End of Dragons",          color: [52,188,208]  },
  { id: "Secrets of the Obscure",  color: [216,160,60]  },
  { id: "Janthir Wilds",           color: [100,185,145] },
  { id: "Visions of Eternity",     color: [175,110,220] },
];

// ── Settings ──────────────────────────────────────────────────────────────────

function loadETSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

function saveETSettings(s) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

function getGroupList(rawSettings) {
  const saved = rawSettings.groups;
  if (saved && saved.length) return saved;
  return GROUP_DEFS.map(g => ({ id: g.id, visible: true }));
}

// ── Data ──────────────────────────────────────────────────────────────────────

let _cachedData = null;

async function loadData() {
  if (_cachedData) return _cachedData;
  const resp = await fetch("data/event-timer.json");
  _cachedData = await resp.json();
  return _cachedData;
}

// ── Timeline computation ──────────────────────────────────────────────────────

function computeTimeline(sequences) {
  const slots = [];
  let t = 0;

  for (const step of (sequences.partial || [])) {
    if (t >= TOTAL_MIN) break;
    slots.push({ r: step.r, start: t, end: Math.min(t + step.d, TOTAL_MIN) });
    t += step.d;
  }

  if (sequences.pattern?.length) {
    outer: while (t < TOTAL_MIN) {
      for (const step of sequences.pattern) {
        if (t >= TOTAL_MIN) break outer;
        slots.push({ r: step.r, start: t, end: Math.min(t + step.d, TOTAL_MIN) });
        t += step.d;
      }
    }
  }

  return slots;
}

// Resolve CSS rgb string from bg field (handles gradient arrays)
function bgCss(bg) {
  if (!bg || bg.length === 0) return "#555";
  const c = Array.isArray(bg[0]) ? bg[0] : bg;
  return `rgb(${c.join(",")})`;
}


function wikiUrl(link) {
  if (!link) return null;
  return `https://wiki.guildwars2.com/wiki/${link}`;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function utcNowMin() {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

function utcNowSec() {
  const now = new Date();
  return now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
}

function localNowMin() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function localOffsetMin() {
  return -new Date().getTimezoneOffset();
}

function localOffsetLabel() {
  const off  = localOffsetMin();
  const sign = off >= 0 ? "+" : "-";
  const abs  = Math.abs(off);
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

// ── Module-level state ────────────────────────────────────────────────────────

let _nowTimer = null;
let _currentEventModal = null;
let _autoScroll = false;
let _isProgrammaticScroll = false;
let _doAutoScroll = null; // closure set by renderEventTimerView

function setAutoScrollState(enabled) {
  _autoScroll = enabled;
  const btn = document.getElementById("btn-et-autoscroll");
  if (btn) btn.classList.toggle("active", enabled);
}

export function enableETAutoScroll() {
  setAutoScrollState(true);
}

// ── Main render ───────────────────────────────────────────────────────────────

export async function renderEventTimerView(container) {
  // ── Build DOM structure immediately so layout is visible ─────────────────

  container.innerHTML = `
    <div class="et-outer" id="et-outer">
      <div class="et-frise-row" id="et-frise-row">
        <div class="et-corner">
          <span class="et-utcnow" id="et-utcnow"></span>
        </div>
        <div class="et-frise-clip" id="et-frise-clip">
          <div class="et-frise" id="et-frise"></div>
        </div>
      </div>

      <div class="et-body" id="et-body">
        <div class="et-labels-clip" id="et-labels-clip">
          <div class="et-labels" id="et-labels"></div>
        </div>
        <div class="et-scroll" id="et-scroll">
          <div class="et-content" id="et-content"></div>
        </div>
      </div>

      <div class="et-nowline-layer">
        <div class="et-now-line" id="et-now-line"></div>
      </div>
    </div>
  `;

  const friseEl  = container.querySelector("#et-frise");
  const labelsEl = container.querySelector("#et-labels");
  const contentEl = container.querySelector("#et-content");
  const scrollEl = container.querySelector("#et-scroll");
  const nowLine  = container.querySelector("#et-now-line");
  const utcNowEl = container.querySelector("#et-utcnow");

  // Show exactly 2 hours in the visible scroll area.
  // Round to integer px so repeating-gradient stops land on physical pixels.
  const PX_PER_MIN = Math.round((scrollEl.clientWidth || 960) / 120);
  const TOTAL_W    = TOTAL_MIN * PX_PER_MIN;
  container.style.setProperty("--et-grid-px", (15 * PX_PER_MIN) + "px");

  // ── Load data ─────────────────────────────────────────────────────────────

  let data;
  try {
    data = await loadData();
  } catch {
    labelsEl.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:12px;">Failed to load event data.</div>`;
    return;
  }

  const settings = loadETSettings();
  const groupList = getGroupList(settings);

  // Build ordered, filtered list of groups to display
  const orderedGroups = groupList
    .filter(g => g.visible !== false)
    .map(g => {
      const def = GROUP_DEFS.find(d => d.id === g.id);
      return def ? { ...def, ...g } : null;
    })
    .filter(Boolean);

  // Bucket events by category (skip day/night cycles — shown in sidebar)
  const SKIP_KEYS = new Set(["core-dn", "eod-dn"]);
  const byCategory = {};
  for (const [key, ev] of Object.entries(data.events)) {
    if (SKIP_KEYS.has(key)) continue;
    if (!byCategory[ev.category]) byCategory[ev.category] = [];
    byCategory[ev.category].push({ key, ...ev });
  }

  // ── Build frise ──────────────────────────────────────────────────────────

  const tzOffset = localOffsetMin();

  friseEl.style.width = TOTAL_W + "px";
  for (let m = 0; m < TOTAL_MIN; m += 15) {
    const tick = document.createElement("div");
    tick.className = "et-tick";
    tick.style.left = (m * PX_PER_MIN) + "px";
    const label = minToHHMM((m + tzOffset + TOTAL_MIN) % TOTAL_MIN);
    if (m % 60 === 0) {
      tick.classList.add("et-tick-hour");
      tick.textContent = label;
    } else if (m % 30 === 0) {
      tick.classList.add("et-tick-half");
      tick.textContent = label;
    } else {
      tick.classList.add("et-tick-quarter");
      tick.textContent = label;
    }
    friseEl.appendChild(tick);
  }

  // ── Build content rows ───────────────────────────────────────────────────

  contentEl.style.width = TOTAL_W + "px";

  for (const group of orderedGroups) {
    const rows = byCategory[group.id];
    if (!rows || rows.length === 0) continue;

    const groupColor = `rgb(${group.color.join(",")})`;

    // Group header (labels side)
    const glabel = document.createElement("div");
    glabel.className = "et-group-label";
    glabel.style.height = GROUP_H + "px";
    glabel.style.borderLeft = `3px solid ${groupColor}`;
    glabel.textContent = group.id;
    labelsEl.appendChild(glabel);

    // Group header (content side)
    const gbar = document.createElement("div");
    gbar.className = "et-group-bar";
    gbar.style.height = GROUP_H + "px";
    gbar.style.borderTop = `1px solid ${groupColor}44`;
    contentEl.appendChild(gbar);

    for (const row of rows) {
      const slots = computeTimeline(row.sequences);

      // Label
      const label = document.createElement("div");
      label.className = "et-row-label";
      label.style.height = ROW_H + "px";
      label.title = row.name;
      label.textContent = row.name;
      labelsEl.appendChild(label);

      // Track
      const track = document.createElement("div");
      track.className = "et-row-track";
      track.style.height = ROW_H + "px";
      track.style.width   = TOTAL_W + "px";

      for (const slot of slots) {
        const seg = row.segments[String(slot.r)];
        if (!seg || !seg.name) continue; // skip empty/downtime segments

        const w = (slot.end - slot.start) * PX_PER_MIN;
        if (w < 2) continue;

        const block = document.createElement("div");
        block.className = "et-block";
        block.style.left       = (slot.start * PX_PER_MIN) + "px";
        block.style.width      = w + "px";
        block.style.background = bgCss(seg.bg);
        block.title = seg.name;

        const nameEl = document.createElement("span");
        nameEl.className = "et-block-name";
        nameEl.textContent = seg.name;
        block.appendChild(nameEl);

        block.addEventListener("click", () => {
          openEventModal(seg, row, group, slot);
        });

        track.appendChild(block);
      }

      contentEl.appendChild(track);
    }
  }

  // ── Scroll sync ──────────────────────────────────────────────────────────

  scrollEl.addEventListener("scroll", () => {
    friseEl.style.transform  = `translateX(-${scrollEl.scrollLeft}px)`;
    labelsEl.style.transform = `translateY(-${scrollEl.scrollTop}px)`;
    updateNowLine(false);
    if (!_isProgrammaticScroll) setAutoScrollState(false);
  }, { passive: true });

  // ── Now line ─────────────────────────────────────────────────────────────

  function updateNowLine(animated = true) {
    const nowSec = utcNowSec();
    const x = (nowSec / 60) * PX_PER_MIN;
    nowLine.style.transition = (animated && !_autoScroll) ? 'left 1s linear' : 'none';
    nowLine.style.left = (x - scrollEl.scrollLeft) + "px";
    utcNowEl.textContent = minToHHMM(localNowMin()) + " (" + localOffsetLabel() + ")";
  }

  function doAutoScroll() {
    if (!_autoScroll) return;
    const target = Math.max(0, (utcNowSec() / 60) * PX_PER_MIN - 15 * PX_PER_MIN);
    if (Math.abs(scrollEl.scrollLeft - target) < 0.5) return;
    _isProgrammaticScroll = true;
    scrollEl.scrollLeft = target;
    requestAnimationFrame(() => { _isProgrammaticScroll = false; });
  }
  _doAutoScroll = doAutoScroll;

  updateNowLine(false);
  if (_nowTimer) clearInterval(_nowTimer);
  _nowTimer = setInterval(() => { updateNowLine(true); doAutoScroll(); }, 1_000);

  // ── Scroll to current time on load ───────────────────────────────────────

  requestAnimationFrame(() => {
    _isProgrammaticScroll = true;
    scrollEl.scrollLeft = Math.max(0, utcNowMin() * PX_PER_MIN - 15 * PX_PER_MIN);
    requestAnimationFrame(() => { _isProgrammaticScroll = false; });
  });
}

// ── Event modal ───────────────────────────────────────────────────────────────

function _setRemindMode(hasReminder) {
  const row = document.querySelector(".et-remind-row");
  const btn = document.getElementById("btn-et-remind");
  if (!row || !btn) return;
  row.classList.toggle("cancel-mode", hasReminder);
  btn.textContent = hasReminder ? "Cancel reminder" : "Remind me";
  btn.classList.toggle("danger", hasReminder);
}

function openEventModal(seg, row, group, slot) {
  _currentEventModal = { seg, row, group, slot };

  document.getElementById("et-event-name").textContent = seg.name;
  document.getElementById("et-event-row").textContent  =
    group.id + " — " + row.name;
  const localStart = (slot.start + localOffsetMin() + TOTAL_MIN) % TOTAL_MIN;
  const localEnd   = (slot.end   + localOffsetMin() + TOTAL_MIN) % TOTAL_MIN;
  document.getElementById("et-event-time").textContent =
    minToHHMM(localStart) + " → " + minToHHMM(localEnd);

  const wikiLink = seg.link || row.link || null;
  const wikiBtn  = document.getElementById("et-event-wiki");
  if (wikiLink) {
    wikiBtn.href = wikiUrl(wikiLink);
    wikiBtn.classList.remove("hidden");
  } else {
    wikiBtn.classList.add("hidden");
  }

  const copyBtn = document.getElementById("et-event-copy");
  if (seg.chatlink) {
    copyBtn.classList.remove("hidden");
    copyBtn.dataset.chatlink = seg.chatlink;
  } else {
    copyBtn.classList.add("hidden");
  }

  const eventKey     = seg.name + "_" + slot.start;
  const hasReminder  = getReminders().some(r => r.eventKey === eventKey);
  _setRemindMode(hasReminder);

  const rawDiff   = slot.start - utcNowMin(); // negative = event already started
  const tooLate   = rawDiff <= 1;
  const remindRow = document.querySelector(".et-remind-row");
  const minInput  = document.getElementById("et-remind-min");
  const remindBtn = document.getElementById("btn-et-remind");

  if (tooLate && !hasReminder) {
    remindRow.classList.add("hidden");
  } else {
    remindRow.classList.remove("hidden");
    remindBtn.disabled = false;
    if (!tooLate) {
      const maxRemind = Math.min(15, rawDiff - 1);
      minInput.max = maxRemind;
      if (parseInt(minInput.value) > maxRemind) minInput.value = maxRemind;
    }
  }

  openModal("et-event-overlay");
}

export function openEventModalForReminder(r) {
  const seg   = { name: r.eventName, chatlink: r.chatlink ?? null, link: r.wikiLink ?? null };
  const row   = { name: r.rowName ?? "", link: null };
  const group = { id: r.groupId ?? "" };
  const slot  = { start: r.utcStartMin ?? 0, end: r.utcEndMin ?? (r.utcStartMin ?? 0) };
  openEventModal(seg, row, group, slot);
}

// ── Filter modal ──────────────────────────────────────────────────────────────

export function openETFilterModal() {
  const settings   = loadETSettings();
  const groupList  = getGroupList(settings);
  const body       = document.getElementById("et-filter-body");
  body.innerHTML   = "";

  function renderList(list) {
    body.innerHTML = "";
    list.forEach((g, i) => {
      const def = GROUP_DEFS.find(d => d.id === g.id);
      if (!def) return;
      const color = `rgb(${def.color.join(",")})`;

      const row = document.createElement("div");
      row.className = "et-filter-row";

      row.innerHTML = `
        <div class="et-filter-row-left">
          <label class="checkbox-label et-filter-check">
            <input type="checkbox" data-id="${g.id}" ${g.visible !== false ? "checked" : ""}>
            <span class="et-filter-dot" style="background:${color}"></span>
            <span>${g.id}</span>
          </label>
        </div>
        <div class="et-filter-row-right">
          <button class="btn small et-filter-up" data-idx="${i}" ${i === 0 ? "disabled" : ""} title="Move up">▲</button>
          <button class="btn small et-filter-down" data-idx="${i}" ${i === list.length - 1 ? "disabled" : ""} title="Move down">▼</button>
        </div>
      `;
      body.appendChild(row);
    });

    // Wire up reorder buttons
    body.querySelectorAll(".et-filter-up").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        if (idx <= 0) return;
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        renderList(list);
      });
    });
    body.querySelectorAll(".et-filter-down").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        if (idx >= list.length - 1) return;
        [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        renderList(list);
      });
    });
  }

  renderList(groupList);

  document.getElementById("btn-et-filter-done").onclick = () => {
    const checks = body.querySelectorAll("input[type='checkbox']");
    checks.forEach(cb => {
      const g = groupList.find(x => x.id === cb.dataset.id);
      if (g) g.visible = cb.checked;
    });
    const s = loadETSettings();
    s.groups = groupList;
    saveETSettings(s);
    closeModal("et-filter-overlay");

    // Re-render the timeline
    const container = document.getElementById("view-event-timer");
    if (container) renderEventTimerView(container);
  };

  document.getElementById("btn-et-filter-reset").onclick = () => {
    const s = loadETSettings();
    delete s.groups;
    saveETSettings(s);
    closeModal("et-filter-overlay");
    const container = document.getElementById("view-event-timer");
    if (container) renderEventTimerView(container);
  };

  openModal("et-filter-overlay");
}

// ── Init (wire modal close buttons) ──────────────────────────────────────────

export function initEventTimer() {
  document.getElementById("btn-et-autoscroll").addEventListener("click", () => {
    setAutoScrollState(!_autoScroll);
    if (_autoScroll && _doAutoScroll) _doAutoScroll();
  });

  document.getElementById("btn-et-event-close").addEventListener("click", () =>
    closeModal("et-event-overlay")
  );
  document.getElementById("et-event-overlay").addEventListener("click", e => {
    if (e.target.id === "et-event-overlay") closeModal("et-event-overlay");
  });

  document.getElementById("et-event-copy").addEventListener("click", e => {
    const chatlink = e.currentTarget.dataset.chatlink;
    if (!chatlink) return;
    navigator.clipboard.writeText(chatlink).then(() => {
      const orig = e.currentTarget.textContent;
      e.currentTarget.textContent = "Copied!";
      setTimeout(() => { e.currentTarget.textContent = orig; }, 2000);
    }).catch(() => {});
  });

  document.getElementById("btn-et-remind").addEventListener("click", () => {
    if (!_currentEventModal) return;
    const { seg, row, group, slot } = _currentEventModal;
    const eventKey = seg.name + "_" + slot.start;
    const existing = getReminders().find(r => r.eventKey === eventKey);

    if (existing) {
      removeReminder(existing.id);
      _setRemindMode(false);
      return;
    }

    const rawDiff = slot.start - utcNowMin();
    if (rawDiff <= 1) return;
    const minInput    = document.getElementById("et-remind-min");
    const maxRemind   = Math.min(15, rawDiff - 1);
    const reminderMin = Math.min(maxRemind, Math.max(1, parseInt(minInput.value) || 5));
    const utcFireMin  = (slot.start - reminderMin + TOTAL_MIN) % TOTAL_MIN;
    const localStart  = (slot.start + localOffsetMin() + TOTAL_MIN) % TOTAL_MIN;

    const createdAt    = Date.now();
    const d            = new Date();
    const todayStart   = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    let   fireAt       = todayStart + utcFireMin * 60_000;
    if (fireAt <= createdAt) fireAt += 86_400_000;
    const localFireMin = (utcFireMin + localOffsetMin() + TOTAL_MIN) % TOTAL_MIN;

    addReminder({
      eventKey,
      eventName:        seg.name,
      rowName:          row.name,
      groupId:          group.id,
      chatlink:         seg.chatlink || null,
      wikiLink:         seg.link || row.link || null,
      utcStartMin:      slot.start,
      utcEndMin:        slot.end,
      utcFireMin,
      timeLabel:        minToHHMM(slot.start) + " UTC / " + minToHHMM(localStart) + " local",
      minutesBefore:    reminderMin,
      createdAt,
      fireAt,
      localFireTimeStr: minToHHMM(localFireMin),
    });

    _setRemindMode(true);
  });

  document.getElementById("btn-et-filter-close").addEventListener("click", () =>
    closeModal("et-filter-overlay")
  );
  document.getElementById("et-filter-overlay").addEventListener("click", e => {
    if (e.target.id === "et-filter-overlay") closeModal("et-filter-overlay");
  });
}

export function stopETTimer() {
  if (_nowTimer) { clearInterval(_nowTimer); _nowTimer = null; }
}

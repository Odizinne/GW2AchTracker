import { loadCache, loadDailyFilter, saveDailyFilter, loadDailyCollapsed, toggleDailyCollapsed } from "./cache.js";
import { getCategories, getGroups, isFestivalGroup, getActiveFestivalCatIds } from "./browser.js";
import { openModal, closeModal, barColor, stripGw2Markup } from "./ui.js";
import { t } from "./i18n.js";
import { FRACTAL_SCALES, scaleTier } from "./fractal-scales.js";


function buildCatToGroup() {
  const map = {};
  for (const group of (getGroups() || [])) {
    for (const catId of (group.categories || [])) {
      map[catId] = group;
    }
  }
  return map;
}

function buildRow(id, ach, progressMap) {
  const entry    = progressMap?.[id] || {};
  const done     = entry.done || false;
  const progress = entry.current || 0;
  const active   = progressMap != null && (id in progressMap);
  const tiers    = ach.tiers || [];
  const maxTier  = tiers[tiers.length - 1];
  const required = maxTier?.count ?? null;
  const percent  = done ? 100 : required ? Math.min(100, Math.round((progress / required) * 1000) / 10) : null;
  const desc     = stripGw2Markup(ach.requirement || ach.description || "");
  return { id, name: ach.name, done, progress, required, percent, desc, active };
}

const _TIER_LABELS = ["Initiate", "Adept", "Expert", "Master"];

function _normName(s) {
  return s.toLowerCase().replace(/[''']/g, "").trim();
}

function _parseFractalRow(row) {
  const name = row.name;
  if (name.includes("Recommended")) {
    const scale = parseInt(name.match(/Scale (\d+)/)?.[1] ?? 0);
    if (!scale) return null;
    const tier = scaleTier(scale);
    const fractalName = FRACTAL_SCALES.find(([s]) => s === scale)?.[1] ?? "";
    return { row, isRec: true, tier, num: String(scale), displayName: fractalName };
  }
  const m = name.match(/Tier\s+(\d+)\s+(.+)/i);
  if (!m) return null;
  const tier = parseInt(m[1]);
  const norm = _normName(m[2]);
  const scales = FRACTAL_SCALES
    .filter(([s, n]) => scaleTier(s) === tier && _normName(n) === norm)
    .map(([s]) => s);
  const num = scales.length ? String(Math.min(...scales)) : null;
  return { row, isRec: false, tier, num, displayName: m[2] };
}

function _makeFractalBtn({ row, isRec, num, displayName }, showNum, cat, onOpenAch) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fractal-row" + (row.done ? " fractal-row-done" : "");

  const iconSlot = document.createElement("span");
  iconSlot.className = "fractal-row-icon-slot";
  const img = document.createElement("img");
  img.src = isRec ? "assets/fractal_rec.png" : "assets/fractal_daily.png";
  img.className = "fractal-row-icon";
  img.alt = "";
  iconSlot.appendChild(img);
  btn.appendChild(iconSlot);

  const numEl = document.createElement("span");
  numEl.className = "fractal-row-num";
  numEl.textContent = showNum ? (num ?? "") : "";
  btn.appendChild(numEl);

  const nameEl = document.createElement("span");
  nameEl.className = "fractal-row-name";
  nameEl.textContent = displayName;
  btn.appendChild(nameEl);

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "daily-item-cb";
  cb.checked = row.done;
  cb.tabIndex = -1;
  btn.appendChild(cb);

  btn.addEventListener("click", () => onOpenAch(row.id, cat));
  return btn;
}

function renderFractalTable(catId, cat, rows, onOpenAch, collapsed) {
  const compact = loadDailyFilter().compactFractals || false;

  const byTier = { 1: [], 2: [], 3: [], 4: [] };
  for (const row of rows) {
    const parsed = _parseFractalRow(row);
    if (parsed && byTier[parsed.tier]) byTier[parsed.tier].push(parsed);
  }
  for (const tierRows of Object.values(byTier)) {
    tierRows.sort((a, b) => (a.isRec ? 1 : -1) - (b.isRec ? 1 : -1));
  }

  const isCollapsed = collapsed.has(catId);
  const wrap = document.createElement("div");
  wrap.className = "fractal-table-wrap" + (isCollapsed ? " daily-col-collapsed" : "");

  const header = document.createElement("div");
  header.className = "daily-col-header";
  header.textContent = "Fractals of the Mists";
  header.addEventListener("click", () => {
    toggleDailyCollapsed(catId);
    wrap.classList.toggle("daily-col-collapsed");
  });
  wrap.appendChild(header);

  const body = document.createElement("div");
  body.className = "daily-col-body";
  const bodyInner = document.createElement("div");
  bodyInner.className = "daily-col-body-inner";
  body.appendChild(bodyInner);
  wrap.appendChild(body);

  let remaining = 0;

  if (compact) {
    const list = document.createElement("div");
    list.className = "fractal-compact-list";
    bodyInner.appendChild(list);

    // T1 daily only (no number), then all recs with number
    const compactEntries = [
      ...byTier[1].filter(e => !e.isRec),
      ...[1, 2, 3, 4].flatMap(t => byTier[t].filter(e => e.isRec)),
    ];
    for (const entry of compactEntries) {
      if (!entry.row.done) remaining++;
      list.appendChild(_makeFractalBtn(entry, entry.isRec, cat, onOpenAch));
    }
  } else {
    const grid = document.createElement("div");
    grid.className = "fractal-grid";
    bodyInner.appendChild(grid);

    for (let tier = 1; tier <= 4; tier++) {
      const cell = document.createElement("div");
      cell.className = "fractal-tier-cell";

      const tierHeader = document.createElement("div");
      tierHeader.className = "fractal-tier-header";
      tierHeader.innerHTML = `<span>T${tier}</span><span class="fractal-tier-label">${_TIER_LABELS[tier - 1]}</span>`;
      cell.appendChild(tierHeader);

      for (const entry of byTier[tier]) {
        if (!entry.row.done) remaining++;
        cell.appendChild(_makeFractalBtn(entry, true, cat, onOpenAch));
      }

      grid.appendChild(cell);
    }
  }

  return { el: wrap, remaining };
}

function buildDailyColumns(progressMap) {
  const cache = loadCache();
  const categories = getCategories();
  if (!categories) return [];

  const catToGroup = buildCatToGroup();
  const catMap = {};

  const activeFestivalCatIds = getActiveFestivalCatIds();
  const filter = loadDailyFilter();
  const hiddenCatIds = new Set(filter.hiddenCatIds || []);
  const hideFestival = filter.hideFestival || false;

  for (const [catId, cat] of Object.entries(categories)) {
    if (!cat.achievements?.length) continue;
    if (!cat.name?.toLowerCase().includes("daily")) continue;
    if (cat.name?.toLowerCase().includes("wizard")) continue;

    const group = catToGroup[catId];
    if (!group) continue;

    const isFestival = isFestivalGroup(group.name) || isFestivalGroup(cat.name);

    if (isFestival && !activeFestivalCatIds.has(Number(catId))) continue;
    if (isFestival && hideFestival) continue;
    if (!isFestival && hiddenCatIds.has(Number(catId))) continue;

    for (const id of cat.achievements) {
      const ach = cache[id];
      if (!ach) continue;
      if (!catMap[catId]) catMap[catId] = { catId: Number(catId), cat, rows: [] };
      catMap[catId].rows.push(buildRow(id, ach, progressMap));
    }
  }

  const columns = Object.values(catMap).sort((a, b) => a.cat.name.localeCompare(b.cat.name));
  for (const col of columns) {
    if (col.cat.name.toLowerCase().includes("fractal")) {
      col.rows.sort((a, b) => {
        const aRec = a.name.includes("Recommended");
        const bRec = b.name.includes("Recommended");
        if (aRec !== bRec) return aRec ? -1 : 1;
        if (aRec) {
          const sa = parseInt(a.name.match(/Scale (\d+)/)?.[1] ?? 0);
          const sb = parseInt(b.name.match(/Scale (\d+)/)?.[1] ?? 0);
          return sa - sb;
        }
        return a.name.localeCompare(b.name);
      });
    }
  }
  return columns;
}

function itemHtml(row) {
  const isBinary = row.required === null || row.required <= 1;

  if (isBinary) {
    const checkEl = `<input type="checkbox" class="daily-item-cb" ${row.done ? "checked" : ""} tabindex="-1">`;
    const descRow = row.desc
      ? `<div class="daily-item-desc-row">
           <span class="daily-item-desc">${row.desc}</span>
           ${checkEl}
         </div>`
      : `<div class="daily-item-desc-row">${checkEl}</div>`;
    return { top: `<span class="daily-item-name">${row.name}</span>`, body: descRow };
  }

  const fill  = row.done ? 100 : Math.min(100, row.percent ?? 0);
  const color = barColor(row.done ? 100 : (row.percent ?? 0));
  const desc  = row.desc ? `<div class="daily-item-desc">${row.desc}</div>` : "";
  const prog  = `
    <div class="daily-item-prog">
      <div class="daily-prog-bar"><div class="daily-prog-fill" style="width:${fill}%;background:${color}"></div></div>
      <span class="daily-prog-nums">${row.progress}/${row.required}</span>
    </div>`;
  return { top: `<span class="daily-item-name">${row.name}</span>`, body: desc + prog };
}

export function openDailyFilterModal(onClose) {
  const categories = getCategories();
  if (!categories) return;

  const catToGroup = buildCatToGroup();
  const filter = loadDailyFilter();
  const hiddenCatIds = new Set(filter.hiddenCatIds || []);
  const hideFestival = filter.hideFestival || false;

  const fractalCats = [];
  const otherCats   = [];
  let hasFestival   = false;

  for (const [catId, cat] of Object.entries(categories)) {
    if (!cat.achievements?.length) continue;
    if (!cat.name?.toLowerCase().includes("daily")) continue;
    if (cat.name?.toLowerCase().includes("wizard")) continue;
    const group = catToGroup[catId];
    if (!group) continue;
    const isFestival = isFestivalGroup(group.name) || isFestivalGroup(cat.name);
    if (isFestival) { hasFestival = true; continue; }
    if (cat.name.toLowerCase().includes("fractal")) {
      fractalCats.push({ id: Number(catId), name: cat.name });
    } else {
      otherCats.push({ id: Number(catId), name: cat.name });
    }
  }
  otherCats.sort((a, b)   => a.name.localeCompare(b.name));
  fractalCats.sort((a, b) => a.name.localeCompare(b.name));

  const body = document.getElementById("daily-filter-body");
  body.innerHTML = "";

  const _makeFilterItem = (id, labelText, checked) => {
    const label = document.createElement("label");
    label.className = "daily-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    if (id) cb.dataset.catId = id;
    cb.checked = checked;
    const span = document.createElement("span");
    span.textContent = labelText;
    label.appendChild(cb);
    label.appendChild(span);
    return { label, cb };
  };

  for (const { id, name } of otherCats) {
    const { label } = _makeFilterItem(id, name, !hiddenCatIds.has(id));
    body.appendChild(label);
  }

  // ── Fractals section ────────────────────────────────────────────────────
  if (fractalCats.length) {
    const sep = document.createElement("div");
    sep.className = "daily-filter-sep";
    body.appendChild(sep);

    const sectionLabel = document.createElement("div");
    sectionLabel.className = "daily-filter-section-label";
    sectionLabel.textContent = "Fractals of the Mists";
    body.appendChild(sectionLabel);

    for (const { id, name } of fractalCats) {
      const { label } = _makeFilterItem(id, name, !hiddenCatIds.has(id));
      body.appendChild(label);
    }

    const compactLabel = document.createElement("label");
    compactLabel.className = "daily-filter-item daily-filter-item-indent";
    const compactCb = document.createElement("input");
    compactCb.type = "checkbox";
    compactCb.id = "daily-filter-compact-fractals-cb";
    compactCb.checked = filter.compactFractals || false;
    const compactSpan = document.createElement("span");
    compactSpan.textContent = "Show compact fractal view";
    compactLabel.appendChild(compactCb);
    compactLabel.appendChild(compactSpan);
    body.appendChild(compactLabel);
  }

  if (hasFestival) {
    const sep = document.createElement("div");
    sep.className = "daily-filter-sep";
    body.appendChild(sep);

    const { label, cb } = _makeFilterItem(null, t("dailyFilterFestival"), !hideFestival);
    cb.id = "daily-filter-festival-cb";
    body.appendChild(label);
  }

  document.getElementById("btn-daily-filter-all").onclick = () => {
    body.querySelectorAll("input[data-cat-id]").forEach(cb => { cb.checked = true; });
    const festCb = document.getElementById("daily-filter-festival-cb");
    if (festCb) festCb.checked = true;
  };
  document.getElementById("btn-daily-filter-none").onclick = () => {
    body.querySelectorAll("input[data-cat-id]").forEach(cb => { cb.checked = false; });
    const festCb = document.getElementById("daily-filter-festival-cb");
    if (festCb) festCb.checked = false;
  };

  const doClose = () => {
    const newHidden = [];
    body.querySelectorAll("input[data-cat-id]").forEach(cb => {
      if (!cb.checked) newHidden.push(Number(cb.dataset.catId));
    });
    const festCb    = document.getElementById("daily-filter-festival-cb");
    const compactCb = document.getElementById("daily-filter-compact-fractals-cb");
    saveDailyFilter({
      hiddenCatIds:    newHidden,
      hideFestival:    festCb    ? !festCb.checked    : false,
      compactFractals: compactCb ? compactCb.checked  : false,
    });
    closeModal("daily-filter-overlay");
    onClose?.();
  };

  document.getElementById("btn-daily-filter-close").onclick       = doClose;
  document.getElementById("btn-daily-filter-done").onclick        = doClose;
  document.getElementById("daily-filter-overlay").onclick = e => {
    if (e.target.id === "daily-filter-overlay") doClose();
  };

  openModal("daily-filter-overlay");
}

export function renderDailyView(container, progressMap, showCompleted, onOpenAch) {
  const columns = buildDailyColumns(progressMap);
  container.innerHTML = "";

  let visibleCols = 0;
  let remaining = 0;

  if (!columns.length) {
    if (!visibleCols) container.innerHTML = `<div class="daily-empty">${t("emptyDaily")}</div>`;
    return { visibleCols, remaining };
  }

  const collapsed = loadDailyCollapsed();

  for (const { catId, cat, rows } of columns) {
    if (cat.name.toLowerCase().includes("fractal")) {
      const { el, remaining: fractalRemaining } = renderFractalTable(catId, cat, rows, onOpenAch, collapsed);
      container.appendChild(el);
      visibleCols++;
      remaining += fractalRemaining;
      continue;
    }

    const allDone = rows.every(r => r.done);
    if (allDone && !showCompleted) continue;

    const visibleRows = showCompleted ? rows : rows.filter(r => !r.done);
    if (!visibleRows.length) continue;

    visibleCols++;
    remaining += rows.filter(r => !r.done).length;

    const isCollapsed = collapsed.has(catId);
    const col = document.createElement("div");
    col.className = "daily-col" + (allDone ? " daily-col-done" : "") + (isCollapsed ? " daily-col-collapsed" : "");

    const header = document.createElement("div");
    header.className = "daily-col-header";
    header.textContent = cat.name;
    header.addEventListener("click", () => {
      toggleDailyCollapsed(catId);
      col.classList.toggle("daily-col-collapsed");
    });
    col.appendChild(header);

    const colBody = document.createElement("div");
    colBody.className = "daily-col-body";
    const colBodyInner = document.createElement("div");
    colBodyInner.className = "daily-col-body-inner";
    colBody.appendChild(colBodyInner);
    col.appendChild(colBody);

    for (const row of rows) {
      if (!showCompleted && row.done) continue;

      const { top, body } = itemHtml(row);

      const item = document.createElement("button");
      item.className = "daily-item" + (row.done ? " daily-item-done" : "");
      item.innerHTML = top + body;
      item.addEventListener("click", () => onOpenAch(row.id, cat));
      colBodyInner.appendChild(item);
    }

    container.appendChild(col);
  }

  return { visibleCols, remaining };
}

import { loadCache, loadDailyFilter, saveDailyFilter } from "./cache.js";
import { getCategories, getGroups, isFestivalGroup, getActiveFestivalCatIds } from "./browser.js";
import { openModal, closeModal, barColor, stripGw2Markup } from "./ui.js";
import { t } from "./i18n.js";


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
  const tiers    = ach.tiers || [];
  const maxTier  = tiers[tiers.length - 1];
  const required = maxTier?.count ?? null;
  const percent  = done ? 100 : required ? Math.min(100, Math.round((progress / required) * 1000) / 10) : null;
  const desc     = stripGw2Markup(ach.requirement || ach.description || "");
  return { id, name: ach.name, done, progress, required, percent, desc };
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
      if (!catMap[catId]) catMap[catId] = { cat, rows: [] };
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

function buildWizardVaultColumn(data, showCompleted) {
  const objectives = data.objectives || [];
  const allDone = objectives.every(o => o.progress_current >= o.progress_complete);

  if (allDone && !showCompleted) return null;

  let earnedAcclaim = 0;
  let totalAcclaim = 0;
  for (const obj of objectives) {
    totalAcclaim += obj.acclaim || 0;
    if (obj.progress_current >= obj.progress_complete) earnedAcclaim += obj.acclaim || 0;
  }
  const acclaimPct = totalAcclaim > 0 ? Math.min(100, Math.round((earnedAcclaim / totalAcclaim) * 100)) : 0;

  const col = document.createElement("div");
  col.className = "daily-col" + (allDone ? " daily-col-done" : "");

  const header = document.createElement("div");
  header.className = "daily-col-header wv-col-header";
  header.innerHTML = `
    <div class="wv-header-title">
      <span>Wizard's Vault</span>
      <span class="daily-prog-nums">${earnedAcclaim}/${totalAcclaim}</span>
    </div>
    <div class="wv-acclaim-bar-wrap">
      <div class="wv-acclaim-fill" style="width:${acclaimPct}%;background:${barColor(acclaimPct)}"></div>
    </div>`;
  col.appendChild(header);

  for (const obj of objectives) {
    const done = obj.progress_current >= obj.progress_complete;
    if (!showCompleted && done) continue;

    const isBinary = obj.progress_complete <= 1;
    const item = document.createElement("div");
    item.className = "daily-item" + (done ? " daily-item-done" : "");

    if (isBinary) {
      item.innerHTML = `<span class="daily-item-name">${obj.title}</span>
        <div class="daily-item-desc-row">
          <input type="checkbox" class="daily-item-cb" ${done ? "checked" : ""} tabindex="-1">
        </div>`;
    } else {
      const pct = Math.min(100, Math.round((obj.progress_current / obj.progress_complete) * 100));
      const color = barColor(done ? 100 : pct);
      item.innerHTML = `<span class="daily-item-name">${obj.title}</span>
        <div class="daily-item-prog">
          <div class="daily-prog-bar"><div class="daily-prog-fill" style="width:${done ? 100 : pct}%;background:${color}"></div></div>
          <span class="daily-prog-nums">${obj.progress_current}/${obj.progress_complete}</span>
        </div>`;
    }

    col.appendChild(item);
  }

  return col;
}

export function openDailyFilterModal(onClose) {
  const categories = getCategories();
  if (!categories) return;

  const catToGroup = buildCatToGroup();
  const filter = loadDailyFilter();
  const hiddenCatIds = new Set(filter.hiddenCatIds || []);
  const hideFestival = filter.hideFestival || false;
  const hideWizardVault = filter.hideWizardVault || false;

  const regularCats = [];
  let hasFestival = false;

  for (const [catId, cat] of Object.entries(categories)) {
    if (!cat.achievements?.length) continue;
    if (!cat.name?.toLowerCase().includes("daily")) continue;
    if (cat.name?.toLowerCase().includes("wizard")) continue;
    const group = catToGroup[catId];
    if (!group) continue;
    const isFestival = isFestivalGroup(group.name) || isFestivalGroup(cat.name);
    if (isFestival) { hasFestival = true; continue; }
    regularCats.push({ id: Number(catId), name: cat.name });
  }
  regularCats.sort((a, b) => a.name.localeCompare(b.name));

  const body = document.getElementById("daily-filter-body");
  body.innerHTML = "";

  for (const { id, name } of regularCats) {
    const label = document.createElement("label");
    label.className = "daily-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.catId = id;
    cb.checked = !hiddenCatIds.has(id);
    const span = document.createElement("span");
    span.textContent = name;
    label.appendChild(cb);
    label.appendChild(span);
    body.appendChild(label);
  }

  if (hasFestival) {
    const sep = document.createElement("div");
    sep.className = "daily-filter-sep";
    body.appendChild(sep);

    const label = document.createElement("label");
    label.className = "daily-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "daily-filter-festival-cb";
    cb.checked = !hideFestival;
    const span = document.createElement("span");
    span.textContent = t("dailyFilterFestival");
    label.appendChild(cb);
    label.appendChild(span);
    body.appendChild(label);
  }

  {
    const sep = document.createElement("div");
    sep.className = "daily-filter-sep";
    body.appendChild(sep);

    const label = document.createElement("label");
    label.className = "daily-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "daily-filter-wv-cb";
    cb.checked = !hideWizardVault;
    const span = document.createElement("span");
    span.textContent = "Wizard's Vault";
    label.appendChild(cb);
    label.appendChild(span);
    body.appendChild(label);
  }

  document.getElementById("btn-daily-filter-all").onclick = () => {
    body.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = true; });
  };
  document.getElementById("btn-daily-filter-none").onclick = () => {
    body.querySelectorAll("input[type=checkbox]").forEach(cb => { cb.checked = false; });
  };

  const doClose = () => {
    const newHidden = [];
    body.querySelectorAll("input[data-cat-id]").forEach(cb => {
      if (!cb.checked) newHidden.push(Number(cb.dataset.catId));
    });
    const festCb = document.getElementById("daily-filter-festival-cb");
    const wvCb   = document.getElementById("daily-filter-wv-cb");
    saveDailyFilter({
      hiddenCatIds:    newHidden,
      hideFestival:    festCb ? !festCb.checked : false,
      hideWizardVault: wvCb   ? !wvCb.checked  : false,
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

export function renderDailyView(container, progressMap, showCompleted, onOpenAch, wizardVaultData) {
  const columns = buildDailyColumns(progressMap);
  container.innerHTML = "";

  let visibleCols = 0;
  let remaining = 0;

  const { hideWizardVault } = loadDailyFilter();

  if (wizardVaultData && !hideWizardVault) {
    const wvCol = buildWizardVaultColumn(wizardVaultData, showCompleted);
    if (wvCol) {
      container.appendChild(wvCol);
      visibleCols++;
      for (const o of (wizardVaultData.objectives || [])) {
        if (o.progress_current < o.progress_complete) remaining++;
      }
    }
  }

  if (!columns.length) {
    if (!visibleCols) container.innerHTML = `<div class="daily-empty">${t("emptyDaily")}</div>`;
    return { visibleCols, remaining };
  }

  for (const { cat, rows } of columns) {
    const allDone = rows.every(r => r.done);
    if (allDone && !showCompleted) continue;

    const visibleRows = showCompleted ? rows : rows.filter(r => !r.done);
    if (!visibleRows.length) continue;

    visibleCols++;
    remaining += rows.filter(r => !r.done).length;

    const col = document.createElement("div");
    col.className = "daily-col" + (allDone ? " daily-col-done" : "");

    const header = document.createElement("div");
    header.className = "daily-col-header";
    header.textContent = cat.name;
    col.appendChild(header);

    for (const row of rows) {
      if (!showCompleted && row.done) continue;

      const { top, body } = itemHtml(row);

      const item = document.createElement("button");
      item.className = "daily-item" + (row.done ? " daily-item-done" : "");
      item.innerHTML = top + body;
      item.addEventListener("click", () => onOpenAch(row.id, cat));
      col.appendChild(item);
    }

    container.appendChild(col);
  }

  return { visibleCols, remaining };
}

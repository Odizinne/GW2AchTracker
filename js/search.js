import { loadCache } from "./cache.js";

let _onSelect = null; // callback(achId, achObj)

function collapse(wrap, input, results) {
  results.classList.add("hidden");
  results.innerHTML = "";
  input.value = "";
  wrap.classList.remove("expanded");
}

export function initSearch(onSelect) {
  _onSelect = onSelect;

  const wrap    = document.getElementById("global-search-wrap");
  const input   = document.getElementById("global-search-input");
  const results = document.getElementById("global-search-results");

  // Expand on click when compact
  wrap.addEventListener("click", () => {
    if (!wrap.classList.contains("expanded")) {
      wrap.classList.add("expanded");
      setTimeout(() => input.focus(), 80);
    }
  });

  // Collapse on blur if empty and focus didn't move to a result
  input.addEventListener("blur", e => {
    if (wrap.contains(e.relatedTarget)) return;
    if (!input.value.trim()) collapse(wrap, input, results);
  });

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.classList.add("hidden"); results.innerHTML = ""; return; }

    const cache = loadCache();
    const matches = [];
    for (const [id, ach] of Object.entries(cache)) {
      if (ach.name && ach.name.toLowerCase().includes(q)) {
        matches.push(ach);
        if (matches.length >= 50) break;
      }
    }

    if (!matches.length) {
      results.innerHTML = `<div class="search-empty">No results</div>`;
      results.classList.remove("hidden");
      return;
    }

    results.innerHTML = matches.map(ach =>
      `<button class="search-result-item" data-id="${ach.id}">${ach.name}</button>`
    ).join("");
    results.classList.remove("hidden");

    results.querySelectorAll(".search-result-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const ach = cache[btn.dataset.id];
        if (ach && _onSelect) _onSelect(ach);
        collapse(wrap, input, results);
      });
    });
  });

  // Close on outside click, collapse if empty
  document.addEventListener("click", e => {
    if (!wrap.contains(e.target)) {
      results.classList.add("hidden");
      if (!input.value.trim()) wrap.classList.remove("expanded");
    }
  });

  // Escape: collapse
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { input.blur(); }
  });
}
import { loadCache } from "./cache.js";

let _onSelect = null; // callback(achId, achObj)

export function initSearch(onSelect) {
  _onSelect = onSelect;

  const input   = document.getElementById("global-search-input");
  const results = document.getElementById("global-search-results");

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
        input.value = "";
        results.classList.add("hidden");
      });
    });
  });

  // Close on outside click
  document.addEventListener("click", e => {
    if (!document.getElementById("global-search-wrap").contains(e.target))
      results.classList.add("hidden");
  });

  // Close on Escape
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { results.classList.add("hidden"); input.value = ""; }
  });
}